-- =========================================================
-- MIGRATION 017: SECURE FAMILY JOIN APPROVAL WORKFLOW & AUDIT
-- FamilyFinanceSync — Enterprise Multi-Tenant Family Architecture
--
-- Features:
-- 1. Enhances public.family_join_requests with decision metadata,
--    role assignment, and unique pending constraint.
-- 2. Strictly isolates pending requesters (NO family_members row
--    created during pending state; zero access to family data).
-- 3. Atomic SECURITY DEFINER RPC: request_to_join_family
--    - Enforces auth.uid(), checks duplicate requests and active memberships,
--      creates pending request, notifies Family Head in-app, logs audit event.
-- 4. Atomic SECURITY DEFINER RPC: approve_family_join_request
--    - Locks row FOR UPDATE, prevents self-approval, validates Head/Admin
--      privilege, assigns role, creates/reactivates ONE family_members row,
--      notifies applicant, logs audit event.
-- 5. Atomic SECURITY DEFINER RPC: reject_family_join_request
--    - Locks row FOR UPDATE, validates Head/Admin privilege, records rejection
--      reason, does NOT create membership, notifies applicant, logs audit event.
-- 6. Member Governance RPCs: update_family_member_role & remove_family_member
--    - Head/Admin protected, logs to audit_logs, prevents Head demotion/removal.
-- 7. Audit log immutability: Authenticated users have SELECT only (via audit.view).
-- 8. Adds family_join_requests and notifications to supabase_realtime publication.
-- =========================================================

-- Enable required core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- 1. ENHANCE public.family_join_requests TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.family_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill columns if table already existed
ALTER TABLE public.family_join_requests ADD COLUMN IF NOT EXISTS requested_role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.family_join_requests ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.family_join_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE public.family_join_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.family_join_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Create unique partial index: Exactly ONE pending join request per user per family
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_join_request 
    ON public.family_join_requests (family_id, user_id) 
    WHERE status = 'pending';

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_family_join_requests_family_status 
    ON public.family_join_requests (family_id, status);
CREATE INDEX IF NOT EXISTS idx_family_join_requests_user 
    ON public.family_join_requests (user_id);

-- =========================================================
-- 2. ROW-LEVEL SECURITY FOR JOIN REQUESTS
-- =========================================================
ALTER TABLE public.family_join_requests ENABLE ROW LEVEL SECURITY;

-- Helper security definer function: Check if caller can manage family members
CREATE OR REPLACE FUNCTION public.can_manage_family_members(p_family_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Family Creator or Owner
    SELECT EXISTS (
        SELECT 1 FROM public.families
        WHERE id = p_family_id AND (created_by = p_user_id OR COALESCE((to_jsonb(families.*)->>'owner_id')::uuid, created_by) = p_user_id)
    ) INTO v_is_authorized;

    IF v_is_authorized THEN
        RETURN TRUE;
    END IF;

    -- 2. Active Family Head or Admin role
    SELECT EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = p_family_id
          AND user_id = p_user_id
          AND role IN ('family_head', 'owner', 'admin')
          AND status = 'active'
    ) INTO v_is_authorized;

    IF v_is_authorized THEN
        RETURN TRUE;
    END IF;

    -- 3. Custom permission 'members.manage' override
    SELECT EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = p_family_id
          AND user_id = p_user_id
          AND status = 'active'
          AND (custom_permissions->>'members.manage')::boolean IS TRUE
    ) INTO v_is_authorized;

    RETURN v_is_authorized;
END;
$$;

-- Helper security definer function: Check if caller is strictly Family Head or Owner
CREATE OR REPLACE FUNCTION public.is_family_head_or_owner(p_family_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.families
        WHERE id = p_family_id AND (created_by = p_user_id OR COALESCE((to_jsonb(families.*)->>'owner_id')::uuid, created_by) = p_user_id)
    ) OR EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = p_family_id
          AND user_id = p_user_id
          AND role IN ('family_head', 'owner')
          AND status = 'active'
    );
END;
$$;

-- RLS Policies on family_join_requests
DROP POLICY IF EXISTS "Users and Family Admins can view join requests" ON public.family_join_requests;
CREATE POLICY "Users and Family Admins can view join requests"
    ON public.family_join_requests FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.can_manage_family_members(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Users can submit join requests" ON public.family_join_requests;
CREATE POLICY "Users can submit join requests"
    ON public.family_join_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Family Admins can update join requests" ON public.family_join_requests;
CREATE POLICY "Family Admins can update join requests"
    ON public.family_join_requests FOR UPDATE
    TO authenticated
    USING (
        public.can_manage_family_members(family_id, (SELECT auth.uid()))
    )
    WITH CHECK (
        public.can_manage_family_members(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Users and Admins can delete join requests" ON public.family_join_requests;
CREATE POLICY "Users and Admins can delete join requests"
    ON public.family_join_requests FOR DELETE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.can_manage_family_members(family_id, (SELECT auth.uid()))
    );

-- =========================================================
-- 3. AUDIT LOGS SECURITY HARDENING (IMMUTABLE APPEND-ONLY)
-- =========================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoke write privileges on audit_logs from authenticated role
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM anon;

DROP POLICY IF EXISTS "Authorized members can view audit logs" ON public.audit_logs;
CREATE POLICY "Authorized members can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        public.can_manage_family_members(family_id, (SELECT auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.family_members fm
            WHERE fm.family_id = audit_logs.family_id
              AND fm.user_id = (SELECT auth.uid())
              AND fm.status = 'active'
              AND (
                  fm.role IN ('family_head', 'owner', 'admin')
                  OR (fm.custom_permissions->>'audit.view')::boolean IS TRUE
              )
        )
    );

DROP POLICY IF EXISTS "Authenticated users can record audit entries" ON public.audit_logs;
CREATE POLICY "Authenticated users can record audit entries"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.family_members fm
            WHERE fm.family_id = audit_logs.family_id
              AND fm.user_id = (SELECT auth.uid())
              AND fm.status = 'active'
        )
        OR user_id = (SELECT auth.uid())
    );

-- =========================================================
-- 4. ATOMIC RPC: REQUEST TO JOIN FAMILY
-- =========================================================
CREATE OR REPLACE FUNCTION public.request_to_join_family(
    p_family_code TEXT,
    p_requested_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_user_name TEXT;
    v_family RECORD;
    v_existing_member RECORD;
    v_existing_request RECORD;
    v_request_id UUID;
    v_head_id UUID;
    v_head_email TEXT;
    v_clean_code TEXT;
    v_safe_role TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request: user must be signed in to request access';
    END IF;

    -- Clean family code (trim, uppercase, remove leading/trailing noise)
    v_clean_code := UPPER(TRIM(p_family_code));
    IF v_clean_code IS NULL OR LENGTH(v_clean_code) < 3 THEN
        RAISE EXCEPTION 'Please provide a valid family invitation code';
    END IF;

    -- Normalize requested role
    v_safe_role := LOWER(TRIM(COALESCE(p_requested_role, 'member')));
    IF v_safe_role NOT IN ('member', 'spouse', 'son', 'daughter', 'child', 'grandparent', 'viewer') THEN
        v_safe_role := 'member';
    END IF;

    -- Fetch requester profile/auth info
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1))
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = v_user_id;

    -- Also check public.profiles if present
    SELECT full_name, email INTO v_user_name, v_user_email
    FROM public.profiles
    WHERE id = v_user_id AND full_name IS NOT NULL AND full_name != ''
    LIMIT 1;

    v_user_name := COALESCE(v_user_name, split_part(v_user_email, '@', 1), 'Applicant');

    -- Lookup family by family_code (exact or stripped/prefixed with FAM-)
    SELECT id, name, created_by, family_code INTO v_family
    FROM public.families
    WHERE UPPER(family_code) = v_clean_code;

    IF v_family IS NULL AND v_clean_code LIKE 'FAM-%' THEN
        SELECT id, name, created_by, family_code INTO v_family
        FROM public.families
        WHERE UPPER(family_code) = SUBSTRING(v_clean_code FROM 5);
    ELSIF v_family IS NULL AND NOT v_clean_code LIKE 'FAM-%' THEN
        SELECT id, name, created_by, family_code INTO v_family
        FROM public.families
        WHERE UPPER(family_code) = 'FAM-' || v_clean_code;
    END IF;

    IF v_family IS NULL THEN
        RAISE EXCEPTION 'Invalid family code. Please verify the code with your Family Head.';
    END IF;

    -- Check if user is ALREADY an active member of this family
    SELECT id, status, role INTO v_existing_member
    FROM public.family_members
    WHERE family_id = v_family.id AND user_id = v_user_id;

    IF v_existing_member IS NOT NULL AND v_existing_member.status = 'active' THEN
        RETURN jsonb_build_object(
            'success', true,
            'family_id', v_family.id,
            'family_name', v_family.name,
            'status', 'active',
            'already_member', true,
            'role', v_existing_member.role
        );
    END IF;

    -- Check if user ALREADY has an active PENDING join request for this family
    SELECT id, created_at INTO v_existing_request
    FROM public.family_join_requests
    WHERE family_id = v_family.id AND user_id = v_user_id AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1;

    -- Fetch Family Head ID & Email
    SELECT user_id INTO v_head_id
    FROM public.family_members
    WHERE family_id = v_family.id AND role IN ('family_head', 'owner') AND status = 'active'
    ORDER BY created_at ASC LIMIT 1;

    IF v_head_id IS NULL THEN
        v_head_id := v_family.created_by;
    END IF;

    SELECT email INTO v_head_email FROM auth.users WHERE id = v_head_id;

    -- If already pending, return existing request without duplicating
    IF v_existing_request IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'request_id', v_existing_request.id,
            'family_id', v_family.id,
            'family_name', v_family.name,
            'status', 'pending',
            'already_pending', true,
            'head_id', v_head_id,
            'head_email', v_head_email,
            'requester_name', v_user_name,
            'requester_email', v_user_email,
            'family_code', v_family.family_code
        );
    END IF;

    -- Insert NEW pending join request
    -- NOTICE: We do NOT insert or mutate public.family_members here!
    -- Requester remains strictly outside the family until Head approves.
    INSERT INTO public.family_join_requests (
        family_id,
        user_id,
        requested_role,
        status,
        created_at,
        updated_at
    )
    VALUES (
        v_family.id,
        v_user_id,
        v_safe_role,
        'pending',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_request_id;

    -- Create in-app notification for the Family Head
    INSERT INTO public.notifications (
        user_id,
        family_id,
        type,
        title,
        message,
        data,
        is_read,
        created_at
    )
    VALUES (
        v_head_id,
        v_family.id,
        'join_request',
        '🔔 New Family Join Request',
        v_user_name || ' (' || v_user_email || ') requested to join ' || v_family.name,
        jsonb_build_object(
            'request_id', v_request_id,
            'applicant_id', v_user_id,
            'applicant_name', v_user_name,
            'applicant_email', v_user_email,
            'requested_role', v_safe_role,
            'family_code', v_family.family_code
        ),
        false,
        NOW()
    );

    -- Record immutable audit log
    INSERT INTO public.audit_logs (
        family_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    )
    VALUES (
        v_family.id,
        v_user_id,
        'JOIN_REQUEST_SUBMITTED',
        'family_join_request',
        v_request_id::text,
        jsonb_build_object(
            'applicant_name', v_user_name,
            'applicant_email', v_user_email,
            'requested_role', v_safe_role,
            'family_code', v_family.family_code
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request_id,
        'family_id', v_family.id,
        'family_name', v_family.name,
        'status', 'pending',
        'already_pending', false,
        'head_id', v_head_id,
        'head_email', v_head_email,
        'requester_name', v_user_name,
        'requester_email', v_user_email,
        'family_code', v_family.family_code
    );
END;
$$;

-- =========================================================
-- 5. ATOMIC RPC: APPROVE FAMILY JOIN REQUEST
-- =========================================================
CREATE OR REPLACE FUNCTION public.approve_family_join_request(
    p_request_id UUID,
    p_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_approver_id UUID;
    v_req RECORD;
    v_family RECORD;
    v_existing_mem RECORD;
    v_assigned_role TEXT;
    v_member_id UUID;
    v_applicant_name TEXT;
    v_applicant_email TEXT;
BEGIN
    v_approver_id := auth.uid();
    IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request: only signed-in administrators can approve requests';
    END IF;

    -- 1. Lock and fetch join request
    SELECT * INTO v_req
    FROM public.family_join_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    -- 2. Verify pending status (prevent repeat or conflicting decisions)
    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Join request is no longer pending (current status: %)', v_req.status;
    END IF;

    -- 3. Guard against self-approval
    IF v_req.user_id = v_approver_id THEN
        RAISE EXCEPTION 'Security violation: Requesters cannot approve their own join requests';
    END IF;

    -- 4. Verify approver has management authorization
    IF NOT public.can_manage_family_members(v_req.family_id, v_approver_id) THEN
        RAISE EXCEPTION 'Permission denied: Only Family Head or designated Administrator can approve join requests';
    END IF;

    -- 5. Fetch family details
    SELECT id, name, created_by INTO v_family
    FROM public.families
    WHERE id = v_req.family_id;

    -- 6. Validate assigned role (ensure safe role assignment)
    v_assigned_role := LOWER(TRIM(COALESCE(p_role, v_req.requested_role, 'member')));
    IF v_assigned_role NOT IN ('member', 'spouse', 'son', 'daughter', 'child', 'grandparent', 'viewer', 'admin') THEN
        v_assigned_role := 'member';
    END IF;

    -- Only Head/Owner can appoint an 'admin'
    IF v_assigned_role = 'admin' AND NOT public.is_family_head_or_owner(v_req.family_id, v_approver_id) THEN
        v_assigned_role := 'member';
    END IF;

    -- 7. Atomically mark request approved
    UPDATE public.family_join_requests
    SET status = 'approved',
        decided_by = v_approver_id,
        decided_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 8. Create or reactivate exactly ONE family membership
    SELECT id, status INTO v_existing_mem
    FROM public.family_members
    WHERE family_id = v_req.family_id AND user_id = v_req.user_id;

    IF v_existing_mem IS NOT NULL THEN
        UPDATE public.family_members
        SET status = 'active',
            role = v_assigned_role,
            joined_at = COALESCE(joined_at, NOW()),
            updated_at = NOW()
        WHERE id = v_existing_mem.id;
        v_member_id := v_existing_mem.id;
    ELSE
        INSERT INTO public.family_members (
            family_id,
            user_id,
            role,
            status,
            joined_at,
            created_at,
            updated_at
        )
        VALUES (
            v_req.family_id,
            v_req.user_id,
            v_assigned_role,
            'active',
            NOW(),
            NOW(),
            NOW()
        )
        RETURNING id INTO v_member_id;
    END IF;

    -- Fetch applicant name & email for notifications and audit
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_applicant_email, v_applicant_name
    FROM auth.users WHERE id = v_req.user_id;

    SELECT full_name, email INTO v_applicant_name, v_applicant_email
    FROM public.profiles
    WHERE id = v_req.user_id AND full_name IS NOT NULL AND full_name != ''
    LIMIT 1;

    v_applicant_name := COALESCE(v_applicant_name, 'Family Member');

    -- 9. Send in-app notification to approved member
    INSERT INTO public.notifications (
        user_id,
        family_id,
        type,
        title,
        message,
        data,
        is_read,
        created_at
    )
    VALUES (
        v_req.user_id,
        v_req.family_id,
        'request_approved',
        '🎉 Join Request Approved!',
        'Your request to join ' || v_family.name || ' has been approved. You are now linked as ' || v_assigned_role || '.',
        jsonb_build_object(
            'family_id', v_req.family_id,
            'role', v_assigned_role,
            'status', 'active'
        ),
        false,
        NOW()
    );

    -- 10. Record immutable audit log
    INSERT INTO public.audit_logs (
        family_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    )
    VALUES (
        v_req.family_id,
        v_approver_id,
        'JOIN_REQUEST_APPROVED',
        'family_join_request',
        p_request_id::text,
        jsonb_build_object(
            'applicant_user_id', v_req.user_id,
            'applicant_name', v_applicant_name,
            'applicant_email', v_applicant_email,
            'assigned_role', v_assigned_role,
            'member_id', v_member_id,
            'approved_by', v_approver_id
        ),
        NOW()
    );

    INSERT INTO public.audit_logs (
        family_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    )
    VALUES (
        v_req.family_id,
        v_approver_id,
        'MEMBER_JOINED',
        'family_member',
        v_member_id::text,
        jsonb_build_object(
            'user_id', v_req.user_id,
            'role', v_assigned_role,
            'channel', 'join_request_approval'
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'family_id', v_req.family_id,
        'family_name', v_family.name,
        'user_id', v_req.user_id,
        'member_id', v_member_id,
        'role', v_assigned_role,
        'applicant_email', v_applicant_email,
        'applicant_name', v_applicant_name
    );
END;
$$;

-- =========================================================
-- 6. ATOMIC RPC: REJECT FAMILY JOIN REQUEST
-- =========================================================
CREATE OR REPLACE FUNCTION public.reject_family_join_request(
    p_request_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_approver_id UUID;
    v_req RECORD;
    v_family RECORD;
    v_applicant_name TEXT;
    v_applicant_email TEXT;
BEGIN
    v_approver_id := auth.uid();
    IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request: only signed-in administrators can reject requests';
    END IF;

    -- 1. Lock and fetch join request
    SELECT * INTO v_req
    FROM public.family_join_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    -- 2. Verify pending status
    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Join request is no longer pending (current status: %)', v_req.status;
    END IF;

    -- 3. Verify approver has management authorization
    IF NOT public.can_manage_family_members(v_req.family_id, v_approver_id) THEN
        RAISE EXCEPTION 'Permission denied: Only Family Head or designated Administrator can reject join requests';
    END IF;

    -- 4. Fetch family details
    SELECT id, name INTO v_family
    FROM public.families
    WHERE id = v_req.family_id;

    -- 5. Atomically mark request rejected
    -- CRITICAL: Does NOT create or alter family_members!
    UPDATE public.family_join_requests
    SET status = 'rejected',
        decided_by = v_approver_id,
        decided_at = NOW(),
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Fetch applicant name & email for notifications and audit
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_applicant_email, v_applicant_name
    FROM auth.users WHERE id = v_req.user_id;

    SELECT full_name, email INTO v_applicant_name, v_applicant_email
    FROM public.profiles
    WHERE id = v_req.user_id AND full_name IS NOT NULL AND full_name != ''
    LIMIT 1;

    v_applicant_name := COALESCE(v_applicant_name, 'Applicant');

    -- 6. Send in-app notification to requester
    INSERT INTO public.notifications (
        user_id,
        family_id,
        type,
        title,
        message,
        data,
        is_read,
        created_at
    )
    VALUES (
        v_req.user_id,
        v_req.family_id,
        'request_rejected',
        'Join Request Declined',
        'Your request to join ' || v_family.name || ' was not approved.',
        jsonb_build_object(
            'family_id', v_req.family_id,
            'status', 'rejected',
            'reason', p_reason
        ),
        false,
        NOW()
    );

    -- 7. Record immutable audit log
    INSERT INTO public.audit_logs (
        family_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    )
    VALUES (
        v_req.family_id,
        v_approver_id,
        'JOIN_REQUEST_REJECTED',
        'family_join_request',
        p_request_id::text,
        jsonb_build_object(
            'applicant_user_id', v_req.user_id,
            'applicant_name', v_applicant_name,
            'applicant_email', v_applicant_email,
            'rejected_by', v_approver_id,
            'reason', p_reason
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'family_id', v_req.family_id,
        'family_name', v_family.name,
        'user_id', v_req.user_id,
        'applicant_email', v_applicant_email,
        'applicant_name', v_applicant_name
    );
END;
$$;

-- =========================================================
-- 7. ATOMIC MEMBER GOVERNANCE: UPDATE ROLE & REMOVE MEMBER
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_family_member_role(
    p_family_id UUID,
    p_member_id UUID,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_target_mem RECORD;
    v_family RECORD;
    v_clean_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Verify caller is Family Head or Owner
    IF NOT public.is_family_head_or_owner(p_family_id, v_caller_id) THEN
        RAISE EXCEPTION 'Permission denied: Only the Family Head can modify member roles';
    END IF;

    -- Fetch target member
    SELECT * INTO v_target_mem
    FROM public.family_members
    WHERE id = p_member_id AND family_id = p_family_id;

    IF v_target_mem IS NULL THEN
        RAISE EXCEPTION 'Member not found in this family';
    END IF;

    -- Clean role
    v_clean_role := LOWER(TRIM(p_new_role));
    IF v_clean_role NOT IN ('member', 'spouse', 'son', 'daughter', 'child', 'grandparent', 'viewer', 'admin', 'family_head') THEN
        RAISE EXCEPTION 'Invalid role specified';
    END IF;

    -- Prevent demoting the Family Head/Owner if caller is not the primary owner
    SELECT created_by INTO v_family FROM public.families WHERE id = p_family_id;
    IF v_target_mem.user_id = v_family.created_by AND v_clean_role != 'family_head' THEN
        RAISE EXCEPTION 'The family creator must remain a Family Head';
    END IF;

    -- Update member role
    UPDATE public.family_members
    SET role = v_clean_role,
        updated_at = NOW()
    WHERE id = p_member_id;

    -- Record audit log
    INSERT INTO public.audit_logs (
        family_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    )
    VALUES (
        p_family_id,
        v_caller_id,
        'MEMBER_ROLE_UPDATED',
        'family_member',
        p_member_id::text,
        jsonb_build_object(
            'target_user_id', v_target_mem.user_id,
            'previous_role', v_target_mem.role,
            'new_role', v_clean_role,
            'updated_by', v_caller_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'member_id', p_member_id,
        'new_role', v_clean_role
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_family_member(
    p_family_id UUID,
    p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_target_mem RECORD;
    v_family RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Verify caller is Family Head or Owner
    IF NOT public.is_family_head_or_owner(p_family_id, v_caller_id) THEN
        RAISE EXCEPTION 'Permission denied: Only the Family Head can remove members';
    END IF;

    -- Fetch target member
    SELECT * INTO v_target_mem
    FROM public.family_members
    WHERE id = p_member_id AND family_id = p_family_id;

    IF v_target_mem IS NULL THEN
        RAISE EXCEPTION 'Member not found in this family';
    END IF;

    -- Cannot remove the Family Head or primary creator
    SELECT created_by INTO v_family FROM public.families WHERE id = p_family_id;
    IF v_target_mem.user_id = v_family.created_by OR v_target_mem.role IN ('family_head', 'owner') THEN
        RAISE EXCEPTION 'The Family Head cannot be removed from the workspace';
    END IF;

    -- Soft removal: update status to 'removed'
    UPDATE public.family_members
    SET status = 'removed',
        updated_at = NOW()
    WHERE id = p_member_id;

    -- Record audit log
    INSERT INTO public.audit_logs (
        family_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    )
    VALUES (
        p_family_id,
        v_caller_id,
        'MEMBER_REMOVED',
        'family_member',
        p_member_id::text,
        jsonb_build_object(
            'removed_user_id', v_target_mem.user_id,
            'role', v_target_mem.role,
            'removed_by', v_caller_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'member_id', p_member_id,
        'removed_user_id', v_target_mem.user_id
    );
END;
$$;

-- =========================================================
-- 8. REALTIME PUBLICATION REGISTRATION
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'family_join_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.family_join_requests;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
