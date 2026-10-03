-- =========================================================================
-- FAMILY FINANCE SYNC — 003 AUTHORIZATION, FINANCIAL PRIVACY & LEDGER
--
-- Runs after 000_production_schema.sql (and optionally 002). Idempotent.
--
-- What this migration does
--   1. Canonical permission vocabulary (same keys used by the frontend).
--   2. Roles as data: system roles + per-family custom roles, per-family
--      role-permission overrides, per-member overrides.
--   3. Financial privacy: per-member sharing flags + per-transaction
--      visibility. Family membership alone never grants financial visibility.
--   4. Replaces EVERY RLS policy on app tables. Clients may read what they
--      are authorized to read; all writes to sensitive tables go through
--      SECURITY DEFINER functions (RPCs) that re-check authorization.
--   5. Ledger consistency: account balances are maintained by a trigger
--      inside the same database transaction (no browser read-modify-write).
--   6. Idempotent transaction/request creation (idempotency_key).
--   7. Server-side notifications + audit log for sensitive operations.
--   8. Realtime: targeted Broadcast to private per-user topics
--      (user:{uid}) instead of family-wide postgres_changes.
--
-- Frontend permission checks are UX only. This file is the enforcement.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------------
-- 0. Private schema for helpers that must not be exposed through the API
-- -------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- -------------------------------------------------------------------------
-- 1. Schema changes
-- -------------------------------------------------------------------------

-- 1.1 Profiles: personal fields only (auth lives in auth.users)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_len CHECK (bio IS NULL OR length(bio) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_name_len CHECK (length(full_name) <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1.2 Roles become per-family capable
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_roles_family ON public.roles(family_id);

-- Per-family overrides of a role's permissions (system or custom role)
CREATE TABLE IF NOT EXISTS public.family_role_permissions (
  family_id     UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  role_id       VARCHAR(50) NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id VARCHAR(100) NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  allowed       BOOLEAN NOT NULL,
  updated_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (family_id, role_id, permission_id)
);

-- 1.3 Membership: relationship, sharing, soft removal
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS relationship TEXT,
  ADD COLUMN IF NOT EXISTS share_income BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS share_expenses BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sharing_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES auth.users(id);

DO $$ BEGIN
  ALTER TABLE public.family_members ADD CONSTRAINT family_members_status_chk
    CHECK (status IN ('active','pending','suspended','removed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1.4 Accounts: owner + opening balance (balance becomes ledger-derived)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS opening_balance BIGINT NOT NULL DEFAULT 0;

-- 1.5 Transactions: ledger fields
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS custom_category TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'family',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT;

ALTER TABLE public.transactions ALTER COLUMN account_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN
  RAISE WARNING 'transactions contain non-positive amounts; constraint transactions_amount_positive not added';
END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_visibility_chk CHECK (visibility IN ('private','family'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_chk
    CHECK (type IN ('income','expense','transfer','refund','adjustment'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_chk
    CHECK (status IN ('cleared','pending','reconciled','voided'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Legacy rows: is_shared=false meant private
UPDATE public.transactions SET visibility = 'private' WHERE is_shared = FALSE AND visibility = 'family';
UPDATE public.transactions SET created_by = user_id WHERE created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_idempotency
  ON public.transactions(family_id, created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_family_user_date
  ON public.transactions(family_id, user_id, transaction_date DESC);

-- 1.6 Requests: typed requests (not only expense requests)
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS target_transaction_id UUID REFERENCES public.transactions(id),
  ADD COLUMN IF NOT EXISTS requested_permission VARCHAR(100),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS resulting_transaction_id UUID REFERENCES public.transactions(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.requests ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE public.requests ALTER COLUMN category_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.requests ADD CONSTRAINT requests_type_chk CHECK (request_type IN
    ('expense','permission','expense_correction','income_correction','add_member','remove_member','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.requests ADD CONSTRAINT requests_status_chk CHECK (status IN ('pending','approved','rejected','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.requests ADD CONSTRAINT requests_amount_chk CHECK (amount IS NULL OR amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_requests_idempotency
  ON public.requests(family_id, requested_by, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 1.7 Notifications: link to entity
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- 1.8 Invitations
CREATE TABLE IF NOT EXISTS public.family_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  role_id      VARCHAR(50) NOT NULL REFERENCES public.roles(id),
  relationship TEXT,
  email        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  accepted_by  UUID REFERENCES auth.users(id),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2. Canonical permission vocabulary + system roles + defaults
--    (Must match src/domain/permissions.ts)
-- -------------------------------------------------------------------------
INSERT INTO public.permissions (id, description) VALUES
  ('family.view',                'View family workspace'),
  ('family.update',              'Update family settings'),
  ('members.view',               'View family members list'),
  ('members.view_finances',      'View shared financial summaries of other members'),
  ('members.invite',             'Invite family members'),
  ('members.remove',             'Remove family members'),
  ('members.update_role',        'Change a member''s role'),
  ('roles.view',                 'View roles'),
  ('roles.manage',               'Create, edit and delete custom roles'),
  ('permissions.view',           'View permission configuration'),
  ('permissions.update',         'Change role and member permissions'),
  ('transactions.create_income', 'Record own income'),
  ('transactions.create_expense','Record own expenses'),
  ('transactions.view_own',      'View own transactions'),
  ('transactions.view_family',   'View other members'' shared transactions'),
  ('transactions.update_own',    'Edit own transactions'),
  ('transactions.update_any',    'Edit any visible family transaction'),
  ('transactions.delete_own',    'Void own transactions'),
  ('transactions.delete_any',    'Void any visible family transaction'),
  ('family_finance.view',        'View family financial summary'),
  ('accounts.view',              'View shared accounts'),
  ('accounts.manage',            'Create and manage accounts'),
  ('budgets.view',               'View budgets'),
  ('budgets.manage',             'Create and manage budgets'),
  ('goals.view',                 'View savings goals'),
  ('goals.manage',               'Create and manage savings goals'),
  ('requests.create',            'Send requests to the family head'),
  ('requests.view',              'View own requests'),
  ('requests.approve',           'Approve requests'),
  ('requests.reject',            'Reject requests'),
  ('notifications.view',         'Receive notifications'),
  ('reports.view',               'View reports'),
  ('reports.export',             'Export reports'),
  ('audit.view',                 'View internal audit log')
ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.roles (id, name, description, is_system_role, family_id, sort_order) VALUES
  ('FAMILY_HEAD', 'Family Head',  'Full family management access.', TRUE, NULL, 10),
  ('SPOUSE',      'Spouse',       'Own finances; more access can be granted by the Family Head.', TRUE, NULL, 20),
  ('SON',         'Son',          'Own income, expenses and requests.', TRUE, NULL, 30),
  ('DAUGHTER',    'Daughter',     'Own income, expenses and requests.', TRUE, NULL, 40),
  ('GRANDPARENT', 'Grand Parent', 'Own income, expenses and requests.', TRUE, NULL, 50),
  ('VIEWER',      'Viewer',       'View-only access to permitted family information.', TRUE, NULL, 60),
  ('CHILD',       'Child (legacy)', 'Legacy role; equivalent to Son/Daughter.', TRUE, NULL, 90)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
  is_system_role = TRUE, family_id = NULL, sort_order = EXCLUDED.sort_order;

-- Reset system-role defaults to the canonical matrix
DELETE FROM public.role_permissions
 WHERE role_id IN ('FAMILY_HEAD','SPOUSE','SON','DAUGHTER','GRANDPARENT','VIEWER','CHILD','CO_MANAGER','ADULT_MEMBER');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'FAMILY_HEAD', id FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.role_id, p.perm
FROM (VALUES ('SPOUSE'),('SON'),('DAUGHTER'),('GRANDPARENT'),('CHILD')) AS r(role_id)
CROSS JOIN (VALUES
  ('family.view'),('members.view'),('transactions.create_income'),('transactions.create_expense'),
  ('transactions.view_own'),('transactions.update_own'),('requests.create'),('requests.view'),
  ('notifications.view')) AS p(perm)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id) VALUES
  ('SPOUSE','budgets.view'),('SPOUSE','goals.view'),('SPOUSE','accounts.view'),('SPOUSE','transactions.delete_own'),
  ('GRANDPARENT','budgets.view'),
  ('VIEWER','family.view'),('VIEWER','members.view'),('VIEWER','notifications.view'),('VIEWER','requests.create'),('VIEWER','requests.view')
ON CONFLICT DO NOTHING;

-- Legacy role ids from older seeds map onto new defaults
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT legacy.id, rp.permission_id
FROM (VALUES ('CO_MANAGER','SPOUSE'),('ADULT_MEMBER','SPOUSE')) AS legacy(id, maps_to)
JOIN public.roles r ON r.id = legacy.id
JOIN public.role_permissions rp ON rp.role_id = legacy.maps_to
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------------
-- 3. Authorization helpers (SECURITY DEFINER: bypass RLS, no recursion)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.active_member(p_family_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS public.family_members
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT fm.* FROM public.family_members fm
   WHERE fm.family_id = p_family_id AND fm.user_id = p_user_id AND fm.status = 'active'
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_family_member(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_members fm
                  WHERE fm.family_id = p_family_id AND fm.user_id = auth.uid() AND fm.status = 'active')
$$;

-- Effective permission = member override ?? family role override ?? role default.
-- The family owner always has every permission (prevents lock-out).
CREATE OR REPLACE FUNCTION app_private.member_has_permission(p_family_id UUID, p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_member public.family_members;
  v_allowed BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO v_member FROM public.family_members fm
   WHERE fm.family_id = p_family_id AND fm.user_id = p_user_id AND fm.status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.families f WHERE f.id = p_family_id AND f.owner_id = p_user_id) THEN
    RETURN TRUE;
  END IF;

  SELECT mp.allowed INTO v_allowed FROM public.member_permissions mp
   WHERE mp.family_member_id = v_member.id AND mp.permission_id = p_permission;
  IF FOUND THEN RETURN v_allowed; END IF;

  SELECT frp.allowed INTO v_allowed FROM public.family_role_permissions frp
   WHERE frp.family_id = p_family_id AND frp.role_id = v_member.role_id AND frp.permission_id = p_permission;
  IF FOUND THEN RETURN v_allowed; END IF;

  RETURN EXISTS (SELECT 1 FROM public.role_permissions rp
                  WHERE rp.role_id = v_member.role_id AND rp.permission_id = p_permission);
END $$;

CREATE OR REPLACE FUNCTION public.has_family_permission(p_family_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.member_has_permission(p_family_id, auth.uid(), p_permission)
$$;

-- All effective permissions of the caller in a family (used by the frontend for UX)
CREATE OR REPLACE FUNCTION public.my_permissions(p_family_id UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}')
    FROM public.permissions p
   WHERE app_private.member_has_permission(p_family_id, auth.uid(), p.id)
$$;

CREATE OR REPLACE FUNCTION app_private.require_permission(p_family_id UUID, p_permission TEXT)
RETURNS public.family_members
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_member public.family_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  v_member := app_private.active_member(p_family_id, auth.uid());
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Not an active member of this family' USING ERRCODE = '42501';
  END IF;
  IF p_permission IS NOT NULL AND NOT app_private.member_has_permission(p_family_id, auth.uid(), p_permission) THEN
    RAISE EXCEPTION 'Missing permission: %', p_permission USING ERRCODE = '42501';
  END IF;
  RETURN v_member;
END $$;

-- Can p_viewer see a transaction with these attributes?
--   * own rows: need transactions.view_own
--   * others:   need transactions.view_family AND row visibility = 'family'
--               AND the owner shares that type (income/expense) with the family
CREATE OR REPLACE FUNCTION app_private.can_view_transaction(
  p_family_id UUID, p_owner UUID, p_type TEXT, p_visibility TEXT, p_viewer UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner public.family_members;
BEGIN
  IF p_viewer IS NULL THEN RETURN FALSE; END IF;
  -- API callers may only ask about themselves (prevents probing other members' visibility)
  IF p_viewer IS DISTINCT FROM auth.uid() AND current_user IN ('anon','authenticated') THEN RETURN FALSE; END IF;
  IF p_owner = p_viewer THEN
    RETURN app_private.member_has_permission(p_family_id, p_viewer, 'transactions.view_own');
  END IF;
  IF p_visibility <> 'family' THEN RETURN FALSE; END IF;
  IF NOT app_private.member_has_permission(p_family_id, p_viewer, 'transactions.view_family') THEN
    RETURN FALSE;
  END IF;
  SELECT * INTO v_owner FROM public.family_members fm
   WHERE fm.family_id = p_family_id AND fm.user_id = p_owner LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN CASE
    WHEN p_type IN ('income','refund') THEN v_owner.share_income
    WHEN p_type IN ('expense','adjustment','transfer') THEN v_owner.share_expenses
    ELSE FALSE END;
END $$;

-- Users that may see a given transaction (used for targeted realtime fan-out)
CREATE OR REPLACE FUNCTION app_private.transaction_audience(p_tx public.transactions)
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(array_agg(fm.user_id), '{}')
    FROM public.family_members fm
   WHERE fm.family_id = p_tx.family_id AND fm.status = 'active'
     AND app_private.can_view_transaction(p_tx.family_id, p_tx.user_id, p_tx.type, p_tx.visibility, fm.user_id)
$$;

CREATE OR REPLACE FUNCTION app_private.users_with_permission(p_family_id UUID, p_permission TEXT)
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(array_agg(fm.user_id), '{}')
    FROM public.family_members fm
   WHERE fm.family_id = p_family_id AND fm.status = 'active'
     AND app_private.member_has_permission(p_family_id, fm.user_id, p_permission)
$$;

-- -------------------------------------------------------------------------
-- 4. Events: audit, notifications, targeted realtime
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.audit(p_family_id UUID, p_action TEXT, p_entity_type TEXT, p_entity_id TEXT, p_metadata JSONB DEFAULT '{}')
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.audit_logs (family_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_family_id, auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'))
$$;

-- Sends one event to each recipient's private topic "user:{uid}".
-- Envelope: {id, type, occurred_at, aggregate_id, version, payload}
-- No-op when Supabase Realtime broadcast is unavailable (e.g. local tests without the shim).
CREATE OR REPLACE FUNCTION app_private.emit(p_recipients UUID[], p_type TEXT, p_aggregate_id UUID, p_version INT, p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID;
  v_envelope JSONB;
BEGIN
  IF p_recipients IS NULL OR to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN;
  END IF;
  v_envelope := jsonb_build_object(
    'id', gen_random_uuid(),
    'type', p_type,
    'occurred_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'aggregate_id', p_aggregate_id,
    'version', p_version,
    'payload', COALESCE(p_payload, '{}'::jsonb));
  FOR v_uid IN SELECT DISTINCT u FROM unnest(p_recipients) AS u WHERE u IS NOT NULL LOOP
    EXECUTE 'SELECT realtime.send($1, $2, $3, true)' USING v_envelope, p_type, 'user:' || v_uid::text;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app_private.notify(p_recipients UUID[], p_family_id UUID, p_type TEXT, p_title TEXT, p_message TEXT, p_entity_type TEXT, p_entity_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID; v_id UUID;
BEGIN
  FOR v_uid IN SELECT DISTINCT u FROM unnest(p_recipients) AS u WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid() LOOP
    IF NOT app_private.member_has_permission(p_family_id, v_uid, 'notifications.view') THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, family_id, type, title, message, entity_type, entity_id)
    VALUES (v_uid, p_family_id, p_type, left(p_title, 255), p_message, p_entity_type, p_entity_id)
    RETURNING id INTO v_id;
    PERFORM app_private.emit(ARRAY[v_uid], 'notification.created', v_id, 1,
      jsonb_build_object('id', v_id, 'type', p_type, 'title', p_title, 'message', p_message,
                         'entity_type', p_entity_type, 'entity_id', p_entity_id, 'family_id', p_family_id));
  END LOOP;
END $$;

-- Transaction row → client-safe JSON (never includes other users' private data;
-- only sent to users in transaction_audience)
CREATE OR REPLACE FUNCTION app_private.tx_json(p_tx public.transactions)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_jsonb(p_tx) - 'idempotency_key'
$$;

-- -------------------------------------------------------------------------
-- 5. Ledger integrity: balances maintained atomically by trigger
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.tx_effect(p_type TEXT, p_amount BIGINT, p_status TEXT)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_status = 'voided' THEN 0
    WHEN p_type IN ('income','refund') THEN p_amount
    WHEN p_type IN ('expense') THEN -p_amount
    ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION app_private.trg_transactions_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.account_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.accounts SET balance = balance - app_private.tx_effect(OLD.type, OLD.amount, OLD.status)
     WHERE id = OLD.account_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.account_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.accounts SET balance = balance + app_private.tx_effect(NEW.type, NEW.amount, NEW.status)
     WHERE id = NEW.account_id;
  END IF;
  RETURN NULL;
END $$;

-- Backfill opening_balance so that balance = opening_balance + ledger (run before trigger exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_balance') THEN
    UPDATE public.accounts a SET opening_balance = a.balance - COALESCE((
      SELECT SUM(app_private.tx_effect(t.type, t.amount, t.status)) FROM public.transactions t
       WHERE t.account_id = a.id AND t.deleted_at IS NULL), 0);
  END IF;
END $$;

DROP TRIGGER IF EXISTS transactions_balance ON public.transactions;
CREATE TRIGGER transactions_balance
  AFTER INSERT OR UPDATE OF amount, type, status, account_id, deleted_at OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_transactions_balance();

CREATE OR REPLACE FUNCTION public.reconcile_account_balance(p_account_id UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_acc public.accounts; v_balance BIGINT;
BEGIN
  SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.require_permission(v_acc.family_id, 'accounts.manage');
  SELECT v_acc.opening_balance + COALESCE(SUM(app_private.tx_effect(t.type, t.amount, t.status)), 0)
    INTO v_balance FROM public.transactions t WHERE t.account_id = p_account_id AND t.deleted_at IS NULL;
  UPDATE public.accounts SET balance = v_balance WHERE id = p_account_id;
  RETURN v_balance;
END $$;

-- -------------------------------------------------------------------------
-- 6. RLS — drop every existing policy on app tables, then recreate
-- -------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN (
              'profiles','families','roles','permissions','role_permissions','family_role_permissions',
              'family_members','member_permissions','categories','accounts','transactions','budgets',
              'budget_categories','spending_limits','savings_goals','goal_contributions','requests',
              'recurring_transactions','notifications','audit_logs','family_invitations')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','families','roles','permissions','role_permissions','family_role_permissions',
    'family_members','member_permissions','categories','accounts','transactions','budgets','budget_categories',
    'spending_limits','savings_goals','goal_contributions','requests','recurring_transactions','notifications',
    'audit_logs','family_invitations']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Baseline: API roles get no write access; specific grants below.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- profiles: own row + active co-members; only personal columns editable
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM public.family_members mine
      JOIN public.family_members theirs ON theirs.family_id = mine.family_id
     WHERE mine.user_id = (SELECT auth.uid()) AND mine.status = 'active'
       AND theirs.user_id = profiles.id AND theirs.status = 'active'));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
GRANT UPDATE (full_name, phone, avatar_url, date_of_birth, gender, location, bio, updated_at) ON public.profiles TO authenticated;

-- family_members has to be readable without recursion: use SECURITY DEFINER helper
CREATE POLICY family_members_select ON public.family_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR public.has_family_permission(family_id, 'members.view'));

CREATE POLICY families_select ON public.families FOR SELECT TO authenticated
  USING (public.is_family_member(id));

CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
  USING (family_id IS NULL OR public.is_family_member(family_id));
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY family_role_permissions_select ON public.family_role_permissions FOR SELECT TO authenticated
  USING (public.has_family_permission(family_id, 'permissions.view'));
CREATE POLICY member_permissions_select ON public.member_permissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = member_permissions.family_member_id
                  AND (fm.user_id = (SELECT auth.uid()) OR public.has_family_permission(fm.family_id, 'permissions.view'))));

CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
  USING (public.is_family_member(family_id));

CREATE POLICY accounts_select ON public.accounts FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid())
         OR (is_shared AND public.has_family_permission(family_id, 'accounts.view')));

CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND app_private.can_view_transaction(family_id, user_id, type, visibility, (SELECT auth.uid())));

CREATE POLICY budgets_select ON public.budgets FOR SELECT TO authenticated
  USING (public.has_family_permission(family_id, 'budgets.view'));
CREATE POLICY budget_categories_select ON public.budget_categories FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND public.has_family_permission(b.family_id, 'budgets.view')));
CREATE POLICY spending_limits_select ON public.spending_limits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = member_id AND fm.user_id = (SELECT auth.uid()))
         OR public.has_family_permission(family_id, 'budgets.manage'));
CREATE POLICY savings_goals_select ON public.savings_goals FOR SELECT TO authenticated
  USING (public.has_family_permission(family_id, 'goals.view'));
CREATE POLICY goal_contributions_select ON public.goal_contributions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_goals g WHERE g.id = goal_id AND public.has_family_permission(g.family_id, 'goals.view')));
CREATE POLICY recurring_select ON public.recurring_transactions FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.has_family_permission(family_id, 'budgets.manage'));

CREATE POLICY requests_select ON public.requests FOR SELECT TO authenticated
  USING ((requested_by = (SELECT auth.uid()) AND public.is_family_member(family_id))
         OR public.has_family_permission(family_id, 'requests.approve')
         OR public.has_family_permission(family_id, 'requests.reject'));

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT DELETE ON public.notifications TO authenticated;

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_family_permission(family_id, 'audit.view'));

CREATE POLICY invitations_select ON public.family_invitations FOR SELECT TO authenticated
  USING (public.has_family_permission(family_id, 'members.invite'));

-- Budgets / goals / accounts / categories: simple manager writes via RLS
-- (non-ledger data; balances are NOT client-writable)
DO $$
DECLARE spec RECORD;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
      ('budgets','budgets.manage'),('savings_goals','goals.manage'),
      ('spending_limits','budgets.manage'),('recurring_transactions','budgets.manage'),
      ('categories','family.update')) AS s(tbl, perm)
  LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', spec.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_family_permission(family_id, %L))',
                   spec.tbl || '_insert', spec.tbl, spec.perm);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_family_permission(family_id, %L)) WITH CHECK (public.has_family_permission(family_id, %L))',
                   spec.tbl || '_update', spec.tbl, spec.perm, spec.perm);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_family_permission(family_id, %L))',
                   spec.tbl || '_delete', spec.tbl, spec.perm);
  END LOOP;
END $$;

GRANT INSERT, UPDATE, DELETE ON public.budget_categories TO authenticated;
CREATE POLICY budget_categories_write ON public.budget_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND public.has_family_permission(b.family_id, 'budgets.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND public.has_family_permission(b.family_id, 'budgets.manage')));

GRANT INSERT, UPDATE (name, type, account_number_mask, is_shared, owner_user_id, opening_balance), DELETE ON public.accounts TO authenticated;
CREATE POLICY accounts_insert ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_family_permission(family_id, 'accounts.manage') AND balance = opening_balance);
CREATE POLICY accounts_update ON public.accounts FOR UPDATE TO authenticated
  USING (public.has_family_permission(family_id, 'accounts.manage'))
  WITH CHECK (public.has_family_permission(family_id, 'accounts.manage'));
CREATE POLICY accounts_delete ON public.accounts FOR DELETE TO authenticated
  USING (public.has_family_permission(family_id, 'accounts.manage'));

-- -------------------------------------------------------------------------
-- 7. RPCs — the only write path for ledger, membership, roles, requests
-- -------------------------------------------------------------------------

-- 7.1 Create the caller's family (first login). Idempotent.
CREATE OR REPLACE FUNCTION public.bootstrap_family(p_family_name TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := auth.uid(); v_family UUID; v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT fm.family_id INTO v_family FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' ORDER BY fm.joined_at LIMIT 1;
  IF FOUND THEN RETURN v_family; END IF;

  SELECT COALESCE(NULLIF(trim(p_family_name), ''), NULLIF(p.full_name, '') || '''s Family', 'My Family')
    INTO v_name FROM public.profiles p WHERE p.id = v_uid;
  v_name := left(COALESCE(v_name, 'My Family'), 120);

  INSERT INTO public.families (name, owner_id) VALUES (v_name, v_uid) RETURNING id INTO v_family;
  INSERT INTO public.family_members (family_id, user_id, role_id, status, relationship, share_income, share_expenses)
  VALUES (v_family, v_uid, 'FAMILY_HEAD', 'active', 'Family Head', TRUE, TRUE);

  INSERT INTO public.categories (family_id, name, type, is_default)
  SELECT v_family, c.name, c.type, TRUE FROM (VALUES
    ('Food','expense'),('Groceries','expense'),('Transportation','expense'),('Education','expense'),
    ('Healthcare','expense'),('Shopping','expense'),('Entertainment','expense'),('Bills','expense'),
    ('Rent','expense'),('Utilities','expense'),('Travel','expense'),('Family','expense'),
    ('Personal','expense'),('Investment','expense'),('Other','expense'),
    ('Salary','income'),('Freelance','income'),('Business','income'),('Allowance','income'),
    ('Scholarship','income'),('Investment','income'),('Gift','income'),('Pension','income'),('Other','income')
  ) AS c(name, type);

  INSERT INTO public.accounts (family_id, name, type, balance, opening_balance, is_shared, owner_user_id)
  VALUES (v_family, 'Cash', 'cash', 0, 0, TRUE, v_uid);

  PERFORM app_private.audit(v_family, 'family.created', 'family', v_family::text);
  RETURN v_family;
END $$;

-- 7.2 Create a transaction (income/expense) for the caller. Idempotent.
CREATE OR REPLACE FUNCTION public.create_transaction(
  p_family_id UUID,
  p_type TEXT,
  p_amount BIGINT,
  p_category_id UUID,
  p_description TEXT,
  p_transaction_date TIMESTAMPTZ DEFAULT NOW(),
  p_payment_method TEXT DEFAULT 'cash',
  p_custom_category TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT 'family',
  p_account_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cat public.categories;
  v_acc public.accounts;
  v_tx public.transactions;
  v_member public.family_members;
BEGIN
  IF p_type NOT IN ('income','expense') THEN
    RAISE EXCEPTION 'type must be income or expense' USING ERRCODE = '22023';
  END IF;
  v_member := app_private.require_permission(p_family_id,
    CASE p_type WHEN 'income' THEN 'transactions.create_income' ELSE 'transactions.create_expense' END);

  -- Idempotent replay: return the original row
  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) > 100 THEN RAISE EXCEPTION 'idempotency key too long' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_tx FROM public.transactions
     WHERE family_id = p_family_id AND created_by = v_uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_tx; END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000000 THEN  -- max ₹1,00,00,00,000
    RAISE EXCEPTION 'amount must be a positive number of paise' USING ERRCODE = '22023';
  END IF;
  IF p_visibility NOT IN ('private','family') THEN
    RAISE EXCEPTION 'visibility must be private or family' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 OR length(p_description) > 200 THEN
    RAISE EXCEPTION 'description is required (max 200 chars)' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'notes too long' USING ERRCODE = '22023';
  END IF;
  IF p_transaction_date > NOW() + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'transaction date cannot be in the future' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cat FROM public.categories WHERE id = p_category_id AND family_id = p_family_id;
  IF NOT FOUND OR v_cat.type <> p_type THEN
    RAISE EXCEPTION 'category does not belong to this family or type' USING ERRCODE = '22023';
  END IF;
  IF v_cat.name = 'Other' AND (p_custom_category IS NULL OR length(trim(p_custom_category)) = 0) THEN
    RAISE EXCEPTION 'custom category is required when category is Other' USING ERRCODE = '22023';
  END IF;
  IF p_custom_category IS NOT NULL AND length(p_custom_category) > 60 THEN
    RAISE EXCEPTION 'custom category too long' USING ERRCODE = '22023';
  END IF;

  IF p_account_id IS NOT NULL THEN
    SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id AND family_id = p_family_id;
    IF NOT FOUND OR NOT (v_acc.owner_user_id = v_uid OR (v_acc.is_shared AND
        app_private.member_has_permission(p_family_id, v_uid, 'accounts.view'))) THEN
      RAISE EXCEPTION 'account not available' USING ERRCODE = '42501';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.transactions (family_id, user_id, created_by, account_id, category_id, type, amount,
      description, transaction_date, payment_method, is_shared, visibility, custom_category, notes,
      idempotency_key, status)
    VALUES (p_family_id, v_uid, v_uid, p_account_id, p_category_id, p_type, p_amount,
      trim(p_description), COALESCE(p_transaction_date, NOW()), left(COALESCE(p_payment_method, 'cash'), 50),
      p_visibility = 'family', p_visibility, NULLIF(trim(p_custom_category), ''), p_notes,
      p_idempotency_key, 'cleared')
    RETURNING * INTO v_tx;
  EXCEPTION WHEN unique_violation THEN
    -- concurrent retry with the same key won the race
    SELECT * INTO v_tx FROM public.transactions
     WHERE family_id = p_family_id AND created_by = v_uid AND idempotency_key = p_idempotency_key;
    RETURN v_tx;
  END;

  PERFORM app_private.emit(app_private.transaction_audience(v_tx), 'transaction.created', v_tx.id, v_tx.version, app_private.tx_json(v_tx));
  PERFORM app_private.notify(
    ARRAY(SELECT u FROM unnest(app_private.transaction_audience(v_tx)) u
           WHERE app_private.member_has_permission(p_family_id, u, 'transactions.view_family')),
    p_family_id, CASE p_type WHEN 'income' THEN 'income_added' ELSE 'expense_added' END,
    CASE p_type WHEN 'income' THEN 'New income recorded' ELSE 'New expense recorded' END,
    (SELECT COALESCE(p.full_name, 'A member') FROM public.profiles p WHERE p.id = v_uid) || ' recorded ' || p_type,
    'transaction', v_tx.id);
  RETURN v_tx;
END $$;

-- 7.3 Update a transaction (optimistic concurrency via version)
CREATE OR REPLACE FUNCTION public.update_transaction(
  p_transaction_id UUID, p_expected_version INT,
  p_amount BIGINT DEFAULT NULL, p_category_id UUID DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_transaction_date TIMESTAMPTZ DEFAULT NULL, p_payment_method TEXT DEFAULT NULL,
  p_custom_category TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_visibility TEXT DEFAULT NULL)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := auth.uid(); v_tx public.transactions; v_old public.transactions; v_cat public.categories;
BEGIN
  SELECT * INTO v_old FROM public.transactions WHERE id = p_transaction_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002'; END IF;
  IF v_old.user_id = v_uid THEN
    PERFORM app_private.require_permission(v_old.family_id, 'transactions.update_own');
  ELSE
    PERFORM app_private.require_permission(v_old.family_id, 'transactions.update_any');
    IF NOT app_private.can_view_transaction(v_old.family_id, v_old.user_id, v_old.type, v_old.visibility, v_uid) THEN
      RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF v_old.version <> p_expected_version THEN
    RAISE EXCEPTION 'Transaction was changed by someone else (version %)', v_old.version USING ERRCODE = '40001';
  END IF;
  IF p_amount IS NOT NULL AND (p_amount <= 0 OR p_amount > 100000000000) THEN
    RAISE EXCEPTION 'amount must be a positive number of paise' USING ERRCODE = '22023';
  END IF;
  IF p_visibility IS NOT NULL AND p_visibility NOT IN ('private','family') THEN
    RAISE EXCEPTION 'invalid visibility' USING ERRCODE = '22023';
  END IF;
  IF p_category_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM public.categories WHERE id = p_category_id AND family_id = v_old.family_id;
    IF NOT FOUND OR v_cat.type <> v_old.type THEN RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023'; END IF;
  END IF;

  UPDATE public.transactions SET
    amount = COALESCE(p_amount, amount),
    category_id = COALESCE(p_category_id, category_id),
    description = COALESCE(NULLIF(trim(p_description), ''), description),
    transaction_date = COALESCE(p_transaction_date, transaction_date),
    payment_method = COALESCE(p_payment_method, payment_method),
    custom_category = COALESCE(p_custom_category, custom_category),
    notes = COALESCE(p_notes, notes),
    visibility = COALESCE(p_visibility, visibility),
    is_shared = COALESCE(p_visibility, visibility) = 'family',
    version = version + 1,
    updated_at = NOW()
  WHERE id = p_transaction_id RETURNING * INTO v_tx;

  -- Audience may shrink (e.g. made private): tell old audience it was removed from their view
  PERFORM app_private.emit(
    ARRAY(SELECT u FROM unnest(app_private.transaction_audience(v_old)) u
          EXCEPT SELECT u FROM unnest(app_private.transaction_audience(v_tx)) u),
    'transaction.deleted', v_tx.id, v_tx.version, jsonb_build_object('id', v_tx.id, 'family_id', v_tx.family_id));
  PERFORM app_private.emit(app_private.transaction_audience(v_tx), 'transaction.updated', v_tx.id, v_tx.version, app_private.tx_json(v_tx));
  PERFORM app_private.audit(v_tx.family_id, 'transaction.updated', 'transaction', v_tx.id::text,
    jsonb_build_object('by_owner', v_old.user_id = v_uid, 'old_amount', v_old.amount, 'new_amount', v_tx.amount));
  RETURN v_tx;
END $$;

-- 7.4 Void (soft-delete) a transaction. History is retained.
CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := auth.uid(); v_old public.transactions; v_tx public.transactions;
BEGIN
  SELECT * INTO v_old FROM public.transactions WHERE id = p_transaction_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002'; END IF;
  IF v_old.user_id = v_uid THEN
    PERFORM app_private.require_permission(v_old.family_id, 'transactions.delete_own');
  ELSE
    PERFORM app_private.require_permission(v_old.family_id, 'transactions.delete_any');
    IF NOT app_private.can_view_transaction(v_old.family_id, v_old.user_id, v_old.type, v_old.visibility, v_uid) THEN
      RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  UPDATE public.transactions SET status = 'voided', voided_reason = left(p_reason, 300),
         deleted_at = NOW(), version = version + 1, updated_at = NOW()
   WHERE id = p_transaction_id RETURNING * INTO v_tx;
  PERFORM app_private.emit(app_private.transaction_audience(v_old), 'transaction.deleted', v_tx.id, v_tx.version,
    jsonb_build_object('id', v_tx.id, 'family_id', v_tx.family_id));
  PERFORM app_private.audit(v_tx.family_id, 'transaction.voided', 'transaction', v_tx.id::text,
    jsonb_build_object('reason', p_reason, 'amount', v_old.amount, 'owner', v_old.user_id));
  RETURN v_tx;
END $$;

-- 7.5 Requests
CREATE OR REPLACE FUNCTION public.create_request(
  p_family_id UUID, p_request_type TEXT, p_title TEXT, p_message TEXT DEFAULT NULL,
  p_amount BIGINT DEFAULT NULL, p_category_id UUID DEFAULT NULL,
  p_target_transaction_id UUID DEFAULT NULL, p_requested_permission TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL)
RETURNS public.requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := auth.uid(); v_req public.requests; v_tx public.transactions;
BEGIN
  PERFORM app_private.require_permission(p_family_id, 'requests.create');
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_req FROM public.requests
     WHERE family_id = p_family_id AND requested_by = v_uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_req; END IF;
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'title is required (max 200 chars)' USING ERRCODE = '22023';
  END IF;
  IF p_message IS NOT NULL AND length(p_message) > 2000 THEN
    RAISE EXCEPTION 'message too long' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NOT NULL AND (p_amount <= 0 OR p_amount > 100000000000) THEN
    RAISE EXCEPTION 'amount must be a positive number of paise' USING ERRCODE = '22023';
  END IF;
  IF p_request_type = 'expense' AND (p_amount IS NULL OR p_category_id IS NULL) THEN
    RAISE EXCEPTION 'expense requests need amount and category' USING ERRCODE = '22023';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND family_id = p_family_id) THEN
    RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
  END IF;
  IF p_request_type = 'permission' AND (p_requested_permission IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = p_requested_permission)) THEN
    RAISE EXCEPTION 'permission requests need a valid permission' USING ERRCODE = '22023';
  END IF;
  IF p_target_transaction_id IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.transactions WHERE id = p_target_transaction_id AND family_id = p_family_id;
    IF NOT FOUND OR NOT app_private.can_view_transaction(p_family_id, v_tx.user_id, v_tx.type, v_tx.visibility, v_uid) THEN
      RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.requests (family_id, requested_by, request_type, title, description, amount, category_id,
    target_transaction_id, requested_permission, idempotency_key, status)
  VALUES (p_family_id, v_uid, p_request_type, trim(p_title), p_message, p_amount, p_category_id,
    p_target_transaction_id, p_requested_permission, p_idempotency_key, 'pending')
  RETURNING * INTO v_req;

  PERFORM app_private.emit(array_append(app_private.users_with_permission(p_family_id, 'requests.approve'), v_uid),
    'request.created', v_req.id, 1, to_jsonb(v_req) - 'idempotency_key');
  PERFORM app_private.notify(app_private.users_with_permission(p_family_id, 'requests.approve'), p_family_id,
    'request_created', 'New request: ' || v_req.title,
    (SELECT COALESCE(p.full_name, 'A member') FROM public.profiles p WHERE p.id = v_uid) || ' sent a ' || replace(p_request_type, '_', ' ') || ' request',
    'request', v_req.id);
  RETURN v_req;
END $$;

CREATE OR REPLACE FUNCTION public.review_request(p_request_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS public.requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := auth.uid(); v_req public.requests; v_tx_id UUID;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_req FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.require_permission(v_req.family_id,
    CASE p_decision WHEN 'approved' THEN 'requests.approve' ELSE 'requests.reject' END);
  IF v_req.requested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot review your own request' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is already %', v_req.status USING ERRCODE = '55000';
  END IF;

  -- Approved expense request becomes a ledger entry for the requester (atomic with the approval)
  IF p_decision = 'approved' AND v_req.request_type = 'expense' THEN
    INSERT INTO public.transactions (family_id, user_id, created_by, category_id, type, amount, description,
      payment_method, visibility, is_shared, idempotency_key, status)
    VALUES (v_req.family_id, v_req.requested_by, v_uid, v_req.category_id, 'expense', v_req.amount,
      v_req.title, 'approved_request', 'family', TRUE, 'request:' || v_req.id::text, 'cleared')
    RETURNING id INTO v_tx_id;
  END IF;

  UPDATE public.requests SET status = p_decision, reviewed_by = v_uid, reviewed_at = NOW(),
         review_comment = left(p_comment, 1000), resulting_transaction_id = v_tx_id, updated_at = NOW()
   WHERE id = p_request_id RETURNING * INTO v_req;

  PERFORM app_private.emit(array_append(app_private.users_with_permission(v_req.family_id, 'requests.approve'), v_req.requested_by),
    'request.' || p_decision, v_req.id, 2, to_jsonb(v_req) - 'idempotency_key');
  PERFORM app_private.notify(ARRAY[v_req.requested_by], v_req.family_id, 'request_' || p_decision,
    'Request ' || p_decision, '"' || v_req.title || '" was ' || p_decision, 'request', v_req.id);
  PERFORM app_private.audit(v_req.family_id, 'request.' || p_decision, 'request', v_req.id::text,
    jsonb_build_object('type', v_req.request_type, 'transaction_id', v_tx_id));
  IF v_tx_id IS NOT NULL THEN
    PERFORM app_private.emit(app_private.transaction_audience(t), 'transaction.created', t.id, t.version, app_private.tx_json(t))
       FROM public.transactions t WHERE t.id = v_tx_id;
  END IF;
  RETURN v_req;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_request(p_request_id UUID)
RETURNS public.requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_req public.requests;
BEGIN
  UPDATE public.requests SET status = 'cancelled', updated_at = NOW()
   WHERE id = p_request_id AND requested_by = auth.uid() AND status = 'pending'
  RETURNING * INTO v_req;
  IF NOT FOUND THEN RAISE EXCEPTION 'No pending request of yours with that id' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.emit(array_append(app_private.users_with_permission(v_req.family_id, 'requests.approve'), v_req.requested_by),
    'request.cancelled', v_req.id, 2, to_jsonb(v_req) - 'idempotency_key');
  RETURN v_req;
END $$;

-- 7.6 Members
CREATE OR REPLACE FUNCTION app_private.member_for_update(p_member_id UUID)
RETURNS public.family_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_members;
BEGIN
  SELECT * INTO v FROM public.family_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.assign_member_role(p_member_id UUID, p_role_id TEXT, p_relationship TEXT DEFAULT NULL)
RETURNS public.family_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_members; v_owner UUID; v_role public.roles;
BEGIN
  v := app_private.member_for_update(p_member_id);
  PERFORM app_private.require_permission(v.family_id, 'members.update_role');
  SELECT owner_id INTO v_owner FROM public.families WHERE id = v.family_id;
  IF v.user_id = v_owner THEN RAISE EXCEPTION 'The family owner''s role cannot be changed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id AND (family_id IS NULL OR family_id = v.family_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023'; END IF;
  IF p_role_id = 'FAMILY_HEAD' AND auth.uid() <> v_owner THEN
    RAISE EXCEPTION 'Only the family owner can assign Family Head' USING ERRCODE = '42501';
  END IF;
  UPDATE public.family_members SET role_id = p_role_id, relationship = COALESCE(p_relationship, relationship)
   WHERE id = p_member_id RETURNING * INTO v;
  PERFORM app_private.audit(v.family_id, 'member.role_changed', 'family_member', v.id::text, jsonb_build_object('role', p_role_id));
  PERFORM app_private.notify(ARRAY[v.user_id], v.family_id, 'permission_changed', 'Your role changed',
    'Your role is now ' || v_role.name, 'family_member', v.id);
  PERFORM app_private.emit(app_private.users_with_permission(v.family_id, 'members.view') || v.user_id,
    'member.updated', v.id, NULL, jsonb_build_object('id', v.id, 'family_id', v.family_id, 'user_id', v.user_id, 'role_id', v.role_id));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.set_member_sharing(p_member_id UUID, p_share_income BOOLEAN, p_share_expenses BOOLEAN, p_locked BOOLEAN DEFAULT NULL)
RETURNS public.family_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_members; v_is_manager BOOLEAN;
BEGIN
  v := app_private.member_for_update(p_member_id);
  PERFORM app_private.require_permission(v.family_id, NULL);
  v_is_manager := app_private.member_has_permission(v.family_id, auth.uid(), 'permissions.update');
  -- Adults control their own sharing unless the Family Head locked it (e.g. for minors).
  IF NOT v_is_manager AND (v.user_id <> auth.uid() OR v.sharing_locked OR p_locked IS NOT NULL) THEN
    RAISE EXCEPTION 'Not allowed to change sharing for this member' USING ERRCODE = '42501';
  END IF;
  UPDATE public.family_members SET share_income = COALESCE(p_share_income, share_income),
         share_expenses = COALESCE(p_share_expenses, share_expenses),
         sharing_locked = COALESCE(p_locked, sharing_locked)
   WHERE id = p_member_id RETURNING * INTO v;
  PERFORM app_private.audit(v.family_id, 'member.sharing_changed', 'family_member', v.id::text,
    jsonb_build_object('share_income', v.share_income, 'share_expenses', v.share_expenses, 'locked', v.sharing_locked));
  -- Visibility changed: clients must refetch (events alone cannot reconstruct newly visible history)
  PERFORM app_private.emit(ARRAY(SELECT fm.user_id FROM public.family_members fm WHERE fm.family_id = v.family_id AND fm.status = 'active'),
    'visibility.changed', v.id, NULL, jsonb_build_object('family_id', v.family_id, 'member_id', v.id));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.set_member_permission(p_member_id UUID, p_permission TEXT, p_allowed BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_members;
BEGIN
  v := app_private.member_for_update(p_member_id);
  PERFORM app_private.require_permission(v.family_id, 'permissions.update');
  IF v.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own permissions' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = p_permission) THEN
    RAISE EXCEPTION 'Unknown permission' USING ERRCODE = '22023';
  END IF;
  IF p_allowed IS NULL THEN
    DELETE FROM public.member_permissions WHERE family_member_id = p_member_id AND permission_id = p_permission;
  ELSE
    INSERT INTO public.member_permissions (family_member_id, permission_id, allowed) VALUES (p_member_id, p_permission, p_allowed)
    ON CONFLICT (family_member_id, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed;
  END IF;
  PERFORM app_private.audit(v.family_id, 'member.permission_changed', 'family_member', v.id::text,
    jsonb_build_object('permission', p_permission, 'allowed', p_allowed));
  PERFORM app_private.notify(ARRAY[v.user_id], v.family_id, 'permission_changed', 'Your permissions changed',
    p_permission || CASE WHEN p_allowed THEN ' granted' WHEN NOT p_allowed THEN ' revoked' ELSE ' reset to role default' END,
    'family_member', v.id);
  PERFORM app_private.emit(ARRAY[v.user_id], 'permission.changed', v.id, NULL, jsonb_build_object('family_id', v.family_id));
END $$;

CREATE OR REPLACE FUNCTION public.remove_member(p_member_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS public.family_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_members; v_owner UUID; v_audience UUID[];
BEGIN
  v := app_private.member_for_update(p_member_id);
  PERFORM app_private.require_permission(v.family_id, 'members.remove');
  SELECT owner_id INTO v_owner FROM public.families WHERE id = v.family_id;
  IF v.user_id = v_owner THEN RAISE EXCEPTION 'The family owner cannot be removed' USING ERRCODE = '42501'; END IF;
  IF v.status = 'removed' THEN RETURN v; END IF;
  v_audience := ARRAY(SELECT fm.user_id FROM public.family_members fm WHERE fm.family_id = v.family_id AND fm.status = 'active');
  -- Soft removal: financial history is retained; access ends immediately.
  UPDATE public.family_members SET status = 'removed', removed_at = NOW(), removed_by = auth.uid()
   WHERE id = p_member_id RETURNING * INTO v;
  PERFORM app_private.audit(v.family_id, 'member.removed', 'family_member', v.id::text, jsonb_build_object('reason', p_reason));
  PERFORM app_private.notify(app_private.users_with_permission(v.family_id, 'members.view'), v.family_id, 'member_removed',
    'Member removed', (SELECT COALESCE(p.full_name, 'A member') FROM public.profiles p WHERE p.id = v.user_id) || ' was removed from the family',
    'family_member', v.id);
  PERFORM app_private.emit(v_audience, 'member.removed', v.id, NULL, jsonb_build_object('id', v.id, 'family_id', v.family_id, 'user_id', v.user_id));
  RETURN v;
END $$;

-- 7.7 Invitations
CREATE OR REPLACE FUNCTION public.create_invitation(p_family_id UUID, p_role_id TEXT, p_relationship TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL)
RETURNS public.family_invitations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_invitations; v_owner UUID;
BEGIN
  PERFORM app_private.require_permission(p_family_id, 'members.invite');
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id AND (family_id IS NULL OR family_id = p_family_id)) THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;
  SELECT owner_id INTO v_owner FROM public.families WHERE id = p_family_id;
  IF p_role_id = 'FAMILY_HEAD' AND auth.uid() <> v_owner THEN
    RAISE EXCEPTION 'Only the family owner can invite a Family Head' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.family_invitations (family_id, code, role_id, relationship, email, created_by)
  VALUES (p_family_id, encode(public.extensions_safe_random(), 'hex'), p_role_id, p_relationship, lower(p_email), auth.uid())
  RETURNING * INTO v;
  PERFORM app_private.audit(p_family_id, 'invitation.created', 'invitation', v.id::text, jsonb_build_object('role', p_role_id));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_invitations; v_uid UUID := auth.uid(); v_email TEXT; v_member_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v FROM public.family_invitations WHERE code = p_code FOR UPDATE;
  IF NOT FOUND OR v.status <> 'pending' OR v.expires_at < NOW() THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = '22023';
  END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v.email IS NOT NULL AND v.email <> v_email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.family_members (family_id, user_id, role_id, status, relationship)
  VALUES (v.family_id, v_uid, v.role_id, 'active', v.relationship)
  ON CONFLICT (family_id, user_id) DO UPDATE SET status = 'active', role_id = EXCLUDED.role_id,
     relationship = EXCLUDED.relationship, removed_at = NULL, removed_by = NULL
  RETURNING id INTO v_member_id;
  UPDATE public.family_invitations SET status = 'accepted', accepted_by = v_uid WHERE id = v.id;
  PERFORM app_private.audit(v.family_id, 'member.joined', 'family_member', v_member_id::text);
  PERFORM app_private.notify(app_private.users_with_permission(v.family_id, 'members.view'), v.family_id, 'member_joined',
    'New family member', (SELECT COALESCE(p.full_name, 'Someone') FROM public.profiles p WHERE p.id = v_uid) || ' joined the family',
    'family_member', v_member_id);
  PERFORM app_private.emit(app_private.users_with_permission(v.family_id, 'members.view'), 'member.joined', v_member_id, NULL,
    jsonb_build_object('id', v_member_id, 'family_id', v.family_id, 'user_id', v_uid));
  RETURN v.family_id;
END $$;

-- 7.8 Roles
CREATE OR REPLACE FUNCTION public.create_role(p_family_id UUID, p_name TEXT, p_description TEXT, p_permissions TEXT[])
RETURNS public.roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.roles; v_bad TEXT;
BEGIN
  PERFORM app_private.require_permission(p_family_id, 'roles.manage');
  IF p_name IS NULL OR length(trim(p_name)) = 0 OR length(p_name) > 60 THEN
    RAISE EXCEPTION 'role name is required (max 60 chars)' USING ERRCODE = '22023';
  END IF;
  SELECT x INTO v_bad FROM unnest(COALESCE(p_permissions, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = x) LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Unknown permission %', v_bad USING ERRCODE = '22023'; END IF;
  -- A custom role can never carry management powers the creator does not have.
  SELECT x INTO v_bad FROM unnest(COALESCE(p_permissions, '{}')) x
   WHERE NOT app_private.member_has_permission(p_family_id, auth.uid(), x) LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'You cannot grant %', v_bad USING ERRCODE = '42501'; END IF;

  INSERT INTO public.roles (id, name, description, is_system_role, family_id)
  VALUES ('C_' || replace(gen_random_uuid()::text, '-', ''), trim(p_name), p_description, FALSE, p_family_id)
  RETURNING * INTO v;
  INSERT INTO public.family_role_permissions (family_id, role_id, permission_id, allowed, updated_by)
  SELECT p_family_id, v.id, p.id, p.id = ANY(COALESCE(p_permissions, '{}')), auth.uid() FROM public.permissions p;
  PERFORM app_private.audit(p_family_id, 'role.created', 'role', v.id, jsonb_build_object('name', v.name, 'permissions', p_permissions));
  RETURN v;
END $$;

-- Sets the full permission set of a role within one family (system or custom role)
CREATE OR REPLACE FUNCTION public.set_role_permissions(p_family_id UUID, p_role_id TEXT, p_permissions TEXT[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_bad TEXT; v_caller public.family_members;
BEGIN
  v_caller := app_private.require_permission(p_family_id, 'permissions.update');
  IF p_role_id = 'FAMILY_HEAD' THEN RAISE EXCEPTION 'Family Head permissions cannot be reduced' USING ERRCODE = '42501'; END IF;
  IF p_role_id = v_caller.role_id THEN RAISE EXCEPTION 'You cannot change your own role''s permissions' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id AND (family_id IS NULL OR family_id = p_family_id)) THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;
  SELECT x INTO v_bad FROM unnest(COALESCE(p_permissions, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = x) LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Unknown permission %', v_bad USING ERRCODE = '22023'; END IF;
  SELECT x INTO v_bad FROM unnest(COALESCE(p_permissions, '{}')) x
   WHERE NOT app_private.member_has_permission(p_family_id, auth.uid(), x) LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'You cannot grant %', v_bad USING ERRCODE = '42501'; END IF;

  INSERT INTO public.family_role_permissions (family_id, role_id, permission_id, allowed, updated_by, updated_at)
  SELECT p_family_id, p_role_id, p.id, p.id = ANY(COALESCE(p_permissions, '{}')), auth.uid(), NOW() FROM public.permissions p
  ON CONFLICT (family_id, role_id, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = NOW();
  PERFORM app_private.audit(p_family_id, 'role.permissions_changed', 'role', p_role_id, jsonb_build_object('permissions', p_permissions));
  PERFORM app_private.emit(ARRAY(SELECT fm.user_id FROM public.family_members fm WHERE fm.family_id = p_family_id AND fm.role_id = p_role_id AND fm.status = 'active'),
    'permission.changed', NULL, NULL, jsonb_build_object('family_id', p_family_id, 'role_id', p_role_id));
END $$;

CREATE OR REPLACE FUNCTION public.delete_role(p_family_id UUID, p_role_id TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_permission(p_family_id, 'roles.manage');
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id AND family_id = p_family_id AND NOT is_system_role) THEN
    RAISE EXCEPTION 'Only custom roles of this family can be deleted' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.family_members WHERE role_id = p_role_id AND status = 'active') THEN
    RAISE EXCEPTION 'Role is still assigned to members' USING ERRCODE = '55000';
  END IF;
  DELETE FROM public.roles WHERE id = p_role_id;
  PERFORM app_private.audit(p_family_id, 'role.deleted', 'role', p_role_id);
END $$;

-- 7.8b Family settings & invitations housekeeping
CREATE OR REPLACE FUNCTION public.update_family(p_family_id UUID, p_name TEXT)
RETURNS public.families
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.families;
BEGIN
  PERFORM app_private.require_permission(p_family_id, 'family.update');
  IF p_name IS NULL OR length(trim(p_name)) = 0 OR length(p_name) > 120 THEN
    RAISE EXCEPTION 'family name is required (max 120 chars)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.families SET name = trim(p_name), updated_at = NOW() WHERE id = p_family_id RETURNING * INTO v;
  PERFORM app_private.audit(p_family_id, 'family.renamed', 'family', p_family_id::text, jsonb_build_object('name', v.name));
  PERFORM app_private.emit(ARRAY(SELECT fm.user_id FROM public.family_members fm WHERE fm.family_id = p_family_id AND fm.status = 'active'),
    'member.updated', p_family_id, NULL, jsonb_build_object('family_id', p_family_id));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.family_invitations;
BEGIN
  SELECT * INTO v FROM public.family_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.require_permission(v.family_id, 'members.invite');
  UPDATE public.family_invitations SET status = 'revoked' WHERE id = p_invitation_id AND status = 'pending';
  PERFORM app_private.audit(v.family_id, 'invitation.revoked', 'invitation', v.id::text);
END $$;

-- 7.9 Read models (views run with caller's rights → RLS applies)
CREATE OR REPLACE VIEW public.v_member_monthly_summary WITH (security_invoker = true) AS
SELECT t.family_id, t.user_id,
       date_trunc('month', t.transaction_date AT TIME ZONE 'Asia/Kolkata')::date AS month,
       SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END)::bigint AS income_paise,
       SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END)::bigint AS expense_paise,
       COUNT(*) AS transaction_count
  FROM public.transactions t
 WHERE t.status <> 'voided'
 GROUP BY 1, 2, 3;
GRANT SELECT ON public.v_member_monthly_summary TO authenticated;

-- random bytes helper (pgcrypto may live in "extensions" on Supabase)
CREATE OR REPLACE FUNCTION public.extensions_safe_random() RETURNS BYTEA
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL THEN
    RETURN extensions.gen_random_bytes(16);
  END IF;
  RETURN public.gen_random_bytes(16);
END $$;

-- -------------------------------------------------------------------------
-- 8. Function privileges: nothing callable by anon; helpers not exposed
-- -------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_view_transaction(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.is_family_member(uuid)','public.has_family_permission(uuid,text)','public.my_permissions(uuid)',
    'public.bootstrap_family(text)',
    'public.create_transaction(uuid,text,bigint,uuid,text,timestamptz,text,text,text,text,uuid,text)',
    'public.update_transaction(uuid,integer,bigint,uuid,text,timestamptz,text,text,text,text)',
    'public.void_transaction(uuid,text)',
    'public.create_request(uuid,text,text,text,bigint,uuid,uuid,text,text)',
    'public.review_request(uuid,text,text)','public.cancel_request(uuid)',
    'public.assign_member_role(uuid,text,text)','public.set_member_sharing(uuid,boolean,boolean,boolean)',
    'public.set_member_permission(uuid,text,boolean)','public.remove_member(uuid,text)',
    'public.create_invitation(uuid,text,text,text)','public.accept_invitation(text)',
    'public.create_role(uuid,text,text,text[])','public.set_role_permissions(uuid,text,text[])',
    'public.delete_role(uuid,text)','public.reconcile_account_balance(uuid)',
    'public.update_family(uuid,text)','public.revoke_invitation(uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.extensions_safe_random() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------
-- 9. Profile trigger: create on signup only; never clobber edited fields
--    (002 fired on every auth.users UPDATE and overwrote full_name)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profiles (id, full_name, email, phone, avatar_url, created_at, updated_at)
    VALUES (NEW.id,
            left(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''), 120),
            NEW.email, NEW.phone, NEW.raw_user_meta_data->>'avatar_url', COALESCE(NEW.created_at, NOW()), NOW())
    ON CONFLICT (id) DO NOTHING;
  ELSIF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles SET email = NEW.email, updated_at = NOW() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------------------------
-- 10. Realtime: stop family-wide postgres_changes; authorize private topics
-- -------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions','requests','notifications','audit_logs','accounts','savings_goals'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Private broadcast channels: a user may only join "user:{their uid}".
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS ffs_user_topic_receive ON realtime.messages';
    EXECUTE $p$CREATE POLICY ffs_user_topic_receive ON realtime.messages FOR SELECT TO authenticated
             USING (realtime.messages.extension = 'broadcast'
                    AND (SELECT realtime.topic()) = 'user:' || (SELECT auth.uid())::text)$p$;
    -- No client INSERT policy: clients cannot broadcast on these topics.
  END IF;
END $$;
