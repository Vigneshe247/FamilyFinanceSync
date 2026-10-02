-- =========================================================
-- MIGRATION 013: COMPLETE PRODUCTION RELATIONAL SCHEMA
-- FamilyFinanceSync — Fintech-Grade Multi-Tenant Schema
-- Preserves: Ledger Look, Integer-Paise Precision, Supabase RLS
-- =========================================================

-- Enable required core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- 1. PROFILES TABLE (1:1 with auth.users)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    date_of_birth DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Auto-sync profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- =========================================================
-- 2. FAMILIES & FAMILY_MEMBERS ENHANCEMENTS
-- =========================================================
-- Ensure families table has all necessary production columns
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    family_code TEXT NOT NULL UNIQUE,
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS family_code TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_families_family_code ON public.families(upper(family_code));
CREATE INDEX IF NOT EXISTS idx_families_created_by ON public.families(created_by);

-- Ensure family_members table has all necessary production columns
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'removed')),
    custom_permissions JSONB DEFAULT '{}'::jsonb,
    monthly_allowance BIGINT NOT NULL DEFAULT 0,
    monthly_spending_limit BIGINT NOT NULL DEFAULT 0,
    income_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    expense_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_family_user UNIQUE (family_id, user_id)
);

ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS monthly_allowance BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS monthly_spending_limit BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS income_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS expense_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON public.family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_role ON public.family_members(role);

-- =========================================================
-- 3. CATEGORIES TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense')),
    icon VARCHAR(100),
    color VARCHAR(50),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_family_category UNIQUE (family_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_categories_family_id ON public.categories(family_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON public.categories(type);

-- =========================================================
-- 4. ACCOUNTS TABLE (Balances in Integer Paise)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'bank',
    balance BIGINT NOT NULL DEFAULT 0, -- In paise: ₹1 = 100 paise
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    account_number_mask VARCHAR(50),
    is_shared BOOLEAN NOT NULL DEFAULT TRUE,
    visibility VARCHAR(50) DEFAULT 'FAMILY_SHARED',
    owner_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_family_id ON public.accounts(family_id);

-- =========================================================
-- 5. IMPORT BATCHES TABLE (Bank Statement CSV/XLSX Audit)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_path TEXT,
    file_size BIGINT DEFAULT 0,
    total_records INT NOT NULL DEFAULT 0,
    successful_records INT NOT NULL DEFAULT 0,
    failed_records INT NOT NULL DEFAULT 0,
    duplicate_records INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'preview', 'confirmed', 'completed', 'failed', 'cancelled', 'rolled_back')),
    error_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_family_id ON public.import_batches(family_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- =========================================================
-- 6. TRANSACTIONS TABLE (Immutable Financial Ledger)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    custom_category TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'refund', 'adjustment')),
    amount BIGINT NOT NULL, -- In paise: ₹1 = 100 paise
    description TEXT NOT NULL,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method VARCHAR(100) NOT NULL DEFAULT 'upi',
    is_shared BOOLEAN NOT NULL DEFAULT TRUE,
    visibility VARCHAR(50) DEFAULT 'FAMILY_SHARED',
    status VARCHAR(50) NOT NULL DEFAULT 'cleared' CHECK (status IN ('cleared', 'pending', 'reconciled', 'voided')),
    notes TEXT,
    receipt_url TEXT,
    from_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    source VARCHAR(50) DEFAULT 'manual',
    source_file_id TEXT,
    import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
    external_reference TEXT,
    fingerprint TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_family_date ON public.transactions(family_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fingerprint ON public.transactions(family_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch ON public.transactions(import_batch_id);

-- =========================================================
-- 7. BUDGETS & BUDGET CATEGORIES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    period VARCHAR(50) NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'weekly', 'yearly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_amount BIGINT NOT NULL, -- In paise
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_family_id ON public.budgets(family_id);

CREATE TABLE IF NOT EXISTS public.budget_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    allocated_amount BIGINT NOT NULL, -- In paise
    CONSTRAINT unique_budget_category UNIQUE (budget_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_categories_budget ON public.budget_categories(budget_id);

-- =========================================================
-- 8. SPENDING LIMITS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.spending_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    period VARCHAR(50) NOT NULL DEFAULT 'monthly',
    limit_amount BIGINT NOT NULL, -- In paise
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spending_limits_family ON public.spending_limits(family_id);
CREATE INDEX IF NOT EXISTS idx_spending_limits_member ON public.spending_limits(member_id);

-- =========================================================
-- 9. SAVINGS GOALS & CONTRIBUTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    visibility VARCHAR(50) DEFAULT 'family',
    name VARCHAR(150) NOT NULL,
    description TEXT,
    target_amount BIGINT NOT NULL, -- In paise
    current_amount BIGINT NOT NULL DEFAULT 0, -- In paise
    target_date DATE NOT NULL,
    icon VARCHAR(100),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_family ON public.savings_goals(family_id);

CREATE TABLE IF NOT EXISTS public.goal_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL, -- In paise
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON public.goal_contributions(goal_id);

-- =========================================================
-- 10. REQUESTS TABLE (Allowance & Expense Approval)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL, -- In paise
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    request_type VARCHAR(50) DEFAULT 'expense_approval',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_family_status ON public.requests(family_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_requested_by ON public.requests(requested_by);

-- =========================================================
-- 11. RECURRING TRANSACTIONS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL, -- In paise
    type VARCHAR(50) NOT NULL DEFAULT 'expense',
    frequency VARCHAR(50) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    next_date DATE NOT NULL,
    description TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_family ON public.recurring_transactions(family_id);

-- =========================================================
-- 12. NOTIFICATIONS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read_at);

-- =========================================================
-- 13. AUDIT LOGS TABLE (Immutable System Action Log)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_family ON public.audit_logs(family_id, created_at DESC);

-- =========================================================
-- 14. FAMILY INVITATIONS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.family_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    family_code TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('family_head', 'admin', 'member', 'owner', 'spouse', 'child', 'grandparent', 'viewer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'declined')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_invitations_token ON public.family_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_family_invitations_email ON public.family_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_family_invitations_family ON public.family_invitations(family_id);

-- =========================================================
-- 15. ROW-LEVEL SECURITY (RLS) POLICIES
-- High-Performance (select auth.uid()) cached lookups
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- PROFILES
    DROP POLICY IF EXISTS "Users can view own profile or fellow family member profiles" ON public.profiles;
    CREATE POLICY "Users can view own profile or fellow family member profiles"
        ON public.profiles FOR SELECT
        TO authenticated
        USING (
            id = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm1
                JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
                WHERE fm1.user_id = (SELECT auth.uid())
                  AND fm2.user_id = profiles.id
                  AND fm1.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
    CREATE POLICY "Users can update own profile"
        ON public.profiles FOR UPDATE
        TO authenticated
        USING (id = (SELECT auth.uid()))
        WITH CHECK (id = (SELECT auth.uid()));

    DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
    CREATE POLICY "Users can insert own profile"
        ON public.profiles FOR INSERT
        TO authenticated
        WITH CHECK (id = (SELECT auth.uid()));

    -- CATEGORIES
    DROP POLICY IF EXISTS "Members can view family categories" ON public.categories;
    CREATE POLICY "Members can view family categories"
        ON public.categories FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = categories.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can create family categories" ON public.categories;
    CREATE POLICY "Members can create family categories"
        ON public.categories FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = categories.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can update family categories" ON public.categories;
    CREATE POLICY "Members can update family categories"
        ON public.categories FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = categories.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    -- ACCOUNTS
    DROP POLICY IF EXISTS "Members can view family accounts" ON public.accounts;
    CREATE POLICY "Members can view family accounts"
        ON public.accounts FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = accounts.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can create family accounts" ON public.accounts;
    CREATE POLICY "Members can create family accounts"
        ON public.accounts FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = accounts.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can update family accounts" ON public.accounts;
    CREATE POLICY "Members can update family accounts"
        ON public.accounts FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = accounts.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    -- TRANSACTIONS
    DROP POLICY IF EXISTS "Members can view family transactions" ON public.transactions;
    CREATE POLICY "Members can view family transactions"
        ON public.transactions FOR SELECT
        TO authenticated
        USING (
            user_id = (SELECT auth.uid())
            OR (
                is_shared = TRUE
                AND EXISTS (
                    SELECT 1 FROM public.family_members fm
                    WHERE fm.family_id = transactions.family_id
                      AND fm.user_id = (SELECT auth.uid())
                      AND fm.status = 'active'
                )
            )
        );

    DROP POLICY IF EXISTS "Members can insert transactions" ON public.transactions;
    CREATE POLICY "Members can insert transactions"
        ON public.transactions FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = transactions.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can update own or family transactions" ON public.transactions;
    CREATE POLICY "Members can update own or family transactions"
        ON public.transactions FOR UPDATE
        TO authenticated
        USING (
            user_id = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = transactions.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can delete own or family transactions" ON public.transactions;
    CREATE POLICY "Members can delete own or family transactions"
        ON public.transactions FOR DELETE
        TO authenticated
        USING (
            user_id = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = transactions.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    -- BUDGETS
    DROP POLICY IF EXISTS "Members can view family budgets" ON public.budgets;
    CREATE POLICY "Members can view family budgets"
        ON public.budgets FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = budgets.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can manage family budgets" ON public.budgets;
    CREATE POLICY "Members can manage family budgets"
        ON public.budgets FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = budgets.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = budgets.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    -- BUDGET_CATEGORIES
    DROP POLICY IF EXISTS "Members can view budget categories" ON public.budget_categories;
    CREATE POLICY "Members can view budget categories"
        ON public.budget_categories FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.budgets b
                JOIN public.family_members fm ON fm.family_id = b.family_id
                WHERE b.id = budget_categories.budget_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can manage budget categories" ON public.budget_categories;
    CREATE POLICY "Members can manage budget categories"
        ON public.budget_categories FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.budgets b
                JOIN public.family_members fm ON fm.family_id = b.family_id
                WHERE b.id = budget_categories.budget_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.budgets b
                JOIN public.family_members fm ON fm.family_id = b.family_id
                WHERE b.id = budget_categories.budget_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    -- SAVINGS GOALS
    DROP POLICY IF EXISTS "Members can view savings goals" ON public.savings_goals;
    CREATE POLICY "Members can view savings goals"
        ON public.savings_goals FOR SELECT
        TO authenticated
        USING (
            created_by = (SELECT auth.uid())
            OR (
                visibility = 'family'
                AND EXISTS (
                    SELECT 1 FROM public.family_members fm
                    WHERE fm.family_id = savings_goals.family_id
                      AND fm.user_id = (SELECT auth.uid())
                      AND fm.status = 'active'
                )
            )
        );

    DROP POLICY IF EXISTS "Members can manage savings goals" ON public.savings_goals;
    CREATE POLICY "Members can manage savings goals"
        ON public.savings_goals FOR ALL
        TO authenticated
        USING (
            created_by = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = savings_goals.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        )
        WITH CHECK (
            created_by = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = savings_goals.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    -- GOAL CONTRIBUTIONS
    DROP POLICY IF EXISTS "Members can view goal contributions" ON public.goal_contributions;
    CREATE POLICY "Members can view goal contributions"
        ON public.goal_contributions FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.savings_goals sg
                JOIN public.family_members fm ON fm.family_id = sg.family_id
                WHERE sg.id = goal_contributions.goal_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can contribute to goals" ON public.goal_contributions;
    CREATE POLICY "Members can contribute to goals"
        ON public.goal_contributions FOR INSERT
        TO authenticated
        WITH CHECK (
            user_id = (SELECT auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.savings_goals sg
                JOIN public.family_members fm ON fm.family_id = sg.family_id
                WHERE sg.id = goal_contributions.goal_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    -- REQUESTS
    DROP POLICY IF EXISTS "Members can view family requests" ON public.requests;
    CREATE POLICY "Members can view family requests"
        ON public.requests FOR SELECT
        TO authenticated
        USING (
            requested_by = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = requests.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Members can create requests" ON public.requests;
    CREATE POLICY "Members can create requests"
        ON public.requests FOR INSERT
        TO authenticated
        WITH CHECK (
            requested_by = (SELECT auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = requests.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Heads and admins can review requests" ON public.requests;
    CREATE POLICY "Heads and admins can review requests"
        ON public.requests FOR UPDATE
        TO authenticated
        USING (
            requested_by = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = requests.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    -- NOTIFICATIONS
    DROP POLICY IF EXISTS "Users can view and manage their own notifications" ON public.notifications;
    CREATE POLICY "Users can view and manage their own notifications"
        ON public.notifications FOR ALL
        TO authenticated
        USING (user_id = (SELECT auth.uid()))
        WITH CHECK (user_id = (SELECT auth.uid()));

    -- AUDIT LOGS
    DROP POLICY IF EXISTS "Members can view family audit logs" ON public.audit_logs;
    CREATE POLICY "Members can view family audit logs"
        ON public.audit_logs FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = audit_logs.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
    CREATE POLICY "Authenticated users can insert audit logs"
        ON public.audit_logs FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = audit_logs.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
        );

    -- FAMILY INVITATIONS
    DROP POLICY IF EXISTS "Members can view family invitations" ON public.family_invitations;
    CREATE POLICY "Members can view family invitations"
        ON public.family_invitations FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = family_invitations.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.status = 'active'
            )
            OR invited_email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
        );

    DROP POLICY IF EXISTS "Heads and admins can manage family invitations" ON public.family_invitations;
    CREATE POLICY "Heads and admins can manage family invitations"
        ON public.family_invitations FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = family_invitations.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = family_invitations.family_id
                  AND fm.user_id = (SELECT auth.uid())
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Token holders can view pending invitation" ON public.family_invitations;
    CREATE POLICY "Token holders can view pending invitation"
        ON public.family_invitations FOR SELECT
        TO anon, authenticated
        USING (status = 'pending' AND expires_at > NOW());
END $$;

-- =========================================================
-- 15B. ATOMIC FAMILY INVITATION RPC FUNCTIONS
-- =========================================================

-- 1. CREATE FAMILY INVITATION
CREATE OR REPLACE FUNCTION public.create_family_invitation(
    p_family_id UUID,
    p_invited_email TEXT,
    p_token_hash TEXT,
    p_expires_in_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_family_code TEXT;
    v_invitation_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Check if user is family_head, owner, or admin
    IF NOT EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = p_family_id AND user_id = v_user_id AND role IN ('family_head', 'owner', 'admin')
    ) THEN
        RAISE EXCEPTION 'Permission denied. Only Family Head or Admin can issue invitations.';
    END IF;

    -- Fetch family code
    SELECT family_code INTO v_family_code FROM public.families WHERE id = p_family_id;
    IF v_family_code IS NULL THEN
        SELECT 'FAM-' || upper(substr(md5(random()::text), 1, 6)) INTO v_family_code;
        UPDATE public.families SET family_code = v_family_code WHERE id = p_family_id;
    END IF;

    v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;

    -- Revoke existing pending invitations for this email + family
    UPDATE public.family_invitations
    SET status = 'revoked'
    WHERE family_id = p_family_id AND lower(trim(invited_email)) = lower(trim(p_invited_email)) AND status = 'pending';

    -- Insert new invitation
    INSERT INTO public.family_invitations (
        family_id, invited_by, invited_email, token_hash, family_code, role, status, expires_at
    ) VALUES (
        p_family_id, v_user_id, lower(trim(p_invited_email)), p_token_hash, v_family_code, 'member', 'pending', v_expires_at
    )
    RETURNING id INTO v_invitation_id;

    RETURN jsonb_build_object(
        'invitation_id', v_invitation_id,
        'family_id', p_family_id,
        'invited_email', lower(trim(p_invited_email)),
        'family_code', v_family_code,
        'expires_at', v_expires_at,
        'status', 'pending'
    );
END;
$$;

-- 2. GET INVITATION BY TOKEN (Publicly callable by invite token holder)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
    id UUID,
    family_id UUID,
    family_name TEXT,
    invited_email TEXT,
    family_code TEXT,
    role TEXT,
    status TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fi.id,
        fi.family_id,
        f.name AS family_name,
        fi.invited_email,
        fi.family_code,
        fi.role,
        fi.status,
        fi.expires_at,
        fi.created_at
    FROM public.family_invitations fi
    JOIN public.families f ON f.id = fi.family_id
    WHERE fi.token_hash = p_token
      AND fi.status = 'pending'
      AND fi.expires_at > NOW();
END;
$$;

-- 3. ACCEPT FAMILY INVITATION TOKEN
CREATE OR REPLACE FUNCTION public.accept_family_invitation_token(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_invitation RECORD;
    v_family RECORD;
    v_existing_member RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request. Please sign in to join family.';
    END IF;

    -- Find pending invitation
    SELECT * INTO v_invitation
    FROM public.family_invitations
    WHERE token_hash = p_token_hash;

    IF v_invitation IS NULL THEN
        RAISE EXCEPTION 'Invalid invitation token.';
    END IF;

    IF v_invitation.status = 'accepted' THEN
        RAISE EXCEPTION 'This invitation has already been used.';
    END IF;

    IF v_invitation.status = 'revoked' THEN
        RAISE EXCEPTION 'This invitation has been revoked.';
    END IF;

    IF v_invitation.expires_at < NOW() THEN
        UPDATE public.family_invitations SET status = 'expired' WHERE id = v_invitation.id;
        RAISE EXCEPTION 'This invitation link has expired.';
    END IF;

    -- Check if user is already a member
    SELECT * INTO v_existing_member
    FROM public.family_members
    WHERE family_id = v_invitation.family_id AND user_id = v_user_id;

    IF v_existing_member IS NOT NULL THEN
        UPDATE public.family_invitations SET status = 'accepted' WHERE id = v_invitation.id;
        SELECT id, name INTO v_family FROM public.families WHERE id = v_invitation.family_id;
        RETURN jsonb_build_object(
            'family_id', v_family.id,
            'name', v_family.name,
            'role', v_existing_member.role,
            'already_member', true
        );
    END IF;

    -- Add user as member
    INSERT INTO public.family_members (
        family_id, user_id, role, status
    ) VALUES (
        v_invitation.family_id, v_user_id, COALESCE(v_invitation.role, 'member'), 'active'
    );

    -- Mark invitation as accepted
    UPDATE public.family_invitations SET status = 'accepted' WHERE id = v_invitation.id;

    SELECT id, name INTO v_family FROM public.families WHERE id = v_invitation.family_id;

    RETURN jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'role', COALESCE(v_invitation.role, 'member'),
        'success', true
    );
END;
$$;

-- =========================================================
-- 16. PERMISSIONS & SCHEMA PRIVILEGES
-- =========================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- =========================================================
-- 17. REALTIME PUBLICATION CONFIGURATION
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'accounts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'savings_goals'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_goals;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'family_members'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'audit_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'budgets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.budgets;
    END IF;
END $$;
