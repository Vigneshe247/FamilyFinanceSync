-- =========================================================
-- MIGRATION 014: FIX MEMBERSHIP ROLES, SYNC & INVITATION RESILIENCE
-- Ensures:
-- 1. Any invited user who joins defaults to 'member' role.
-- 2. Family creators become 'family_head'.
-- 3. Family Head can change any member's personal role (spouse, son, daughter, child, grandparent, viewer, member, family_head).
-- 4. Fixes accept_family_invitation_token (removes obsolete role_id column reference).
-- 5. Ensures approve_family_join_request activates or creates family_members row.
-- 6. Adds atomic update_family_member_role RPC with security definer.
-- =========================================================

-- 1. DROP RESTRICTIVE ROLE CHECK CONSTRAINTS ON FAMILY_MEMBERS
ALTER TABLE public.family_members DROP CONSTRAINT IF EXISTS family_members_role_check;
ALTER TABLE public.family_members DROP CONSTRAINT IF EXISTS check_role_valid;

-- 2. ENSURE PROFILES TABLE HAS SYSTEM_ROLE COLUMN
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS system_role TEXT DEFAULT 'member';

-- 3. ENSURE RLS POLICIES PERMIT FAMILY HEAD TO MANAGE & UPDATE ROLES
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family heads and admins can update member roles" ON public.family_members;
CREATE POLICY "Family heads and admins can update member roles"
    ON public.family_members FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.family_members fm
            WHERE fm.family_id = family_members.family_id
            AND fm.user_id = auth.uid()
            AND fm.role IN ('family_head', 'owner', 'admin')
            AND fm.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM public.families f
            WHERE f.id = family_members.family_id
            AND f.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can join or admins invite members" ON public.family_members;
CREATE POLICY "Users can join or admins invite members"
    ON public.family_members FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.family_members fm
            WHERE fm.family_id = family_members.family_id
            AND fm.user_id = auth.uid()
            AND fm.role IN ('family_head', 'owner', 'admin')
            AND fm.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM public.families f
            WHERE f.id = family_members.family_id
            AND f.created_by = auth.uid()
        )
    );

-- 4. ATOMIC RPC: ACCEPT FAMILY INVITATION TOKEN (FIXED: NO role_id COLUMN)
CREATE OR REPLACE FUNCTION accept_family_invitation_token(
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
    v_member_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
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
        IF v_existing_member.status = 'active' THEN
            UPDATE public.family_invitations SET status = 'accepted' WHERE id = v_invitation.id;
            SELECT id, name INTO v_family FROM public.families WHERE id = v_invitation.family_id;
            RETURN jsonb_build_object(
                'family_id', v_family.id,
                'name', v_family.name,
                'role', v_existing_member.role,
                'already_member', true
            );
        ELSE
            UPDATE public.family_members
            SET status = 'active', role = COALESCE(v_invitation.role, 'member'), updated_at = NOW()
            WHERE id = v_existing_member.id;
            v_member_id := v_existing_member.id;
        END IF;
    ELSE
        -- Insert new membership with default 'member' role (or specified invited role)
        INSERT INTO public.family_members (family_id, user_id, role, status)
        VALUES (v_invitation.family_id, v_user_id, COALESCE(v_invitation.role, 'member'), 'active')
        RETURNING id INTO v_member_id;
    END IF;

    -- Mark invitation accepted
    UPDATE public.family_invitations SET status = 'accepted' WHERE id = v_invitation.id;

    -- Get Family Details
    SELECT id, name INTO v_family FROM public.families WHERE id = v_invitation.family_id;

    -- Audit log
    INSERT INTO public.audit_logs (family_id, user_id, action, metadata)
    VALUES (
        v_invitation.family_id,
        v_user_id,
        'INVITATION_ACCEPTED',
        jsonb_build_object('invitation_id', v_invitation.id, 'role', COALESCE(v_invitation.role, 'member'))
    );

    RETURN jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'role', COALESCE(v_invitation.role, 'member'),
        'member_id', v_member_id
    );
END;
$$;

-- 5. ATOMIC RPC: APPROVE FAMILY JOIN REQUEST (RESILIENT)
CREATE OR REPLACE FUNCTION approve_family_join_request(
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_req RECORD;
    v_head_check RECORD;
    v_family_name TEXT;
    v_existing_mem RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Fetch request
    SELECT id, family_id, user_id, status INTO v_req
    FROM public.family_join_requests
    WHERE id = p_request_id;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    -- Verify authorizer is active Family Head, Admin or family creator
    SELECT id INTO v_head_check
    FROM public.family_members
    WHERE family_id = v_req.family_id
      AND user_id = v_user_id
      AND role IN ('family_head', 'owner', 'admin')
      AND status = 'active';

    IF v_head_check IS NULL THEN
        SELECT id INTO v_head_check
        FROM public.families
        WHERE id = v_req.family_id AND (created_by = v_user_id OR owner_id = v_user_id);
    END IF;

    IF v_head_check IS NULL THEN
        RAISE EXCEPTION 'Only Family Head or Admin can approve requests';
    END IF;

    SELECT name INTO v_family_name FROM public.families WHERE id = v_req.family_id;

    -- 1. Mark request approved
    UPDATE public.family_join_requests
    SET status = 'approved', updated_at = NOW()
    WHERE id = p_request_id;

    -- 2. Upsert family_member status active with role 'member'
    SELECT id INTO v_existing_mem
    FROM public.family_members
    WHERE family_id = v_req.family_id AND user_id = v_req.user_id;

    IF v_existing_mem IS NOT NULL THEN
        UPDATE public.family_members
        SET status = 'active', updated_at = NOW()
        WHERE id = v_existing_mem.id;
    ELSE
        INSERT INTO public.family_members (family_id, user_id, role, status)
        VALUES (v_req.family_id, v_req.user_id, 'member', 'active');
    END IF;

    -- 3. Notify approved member
    INSERT INTO public.notifications (user_id, family_id, type, title, message, data)
    VALUES (
        v_req.user_id,
        v_req.family_id,
        'request_approved',
        'Request Approved!',
        'You are now an active member of ' || COALESCE(v_family_name, 'the family'),
        jsonb_build_object('family_id', v_req.family_id, 'status', 'active')
    );

    RETURN jsonb_build_object('success', true, 'family_id', v_req.family_id, 'user_id', v_req.user_id);
END;
$$;

-- 6. ATOMIC RPC: UPDATE FAMILY MEMBER ROLE (FAMILY HEAD GOVERNANCE)
CREATE OR REPLACE FUNCTION update_family_member_role(
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
    v_is_head BOOLEAN;
    v_target_user_id UUID;
    v_clean_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    v_clean_role := lower(trim(p_new_role));

    -- Verify caller is Family Head or Admin or Family creator/owner
    SELECT EXISTS (
        SELECT 1 FROM public.family_members fm
        WHERE fm.family_id = p_family_id
          AND fm.user_id = v_caller_id
          AND fm.role IN ('family_head', 'owner', 'admin')
          AND fm.status = 'active'
    ) OR EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id AND (f.created_by = v_caller_id OR f.owner_id = v_caller_id)
    ) INTO v_is_head;

    IF NOT v_is_head THEN
        RAISE EXCEPTION 'Only Family Head can change member roles';
    END IF;

    -- Update member role in family_members
    UPDATE public.family_members
    SET role = p_new_role, updated_at = NOW()
    WHERE (id = p_member_id OR user_id = p_member_id)
      AND family_id = p_family_id
    RETURNING user_id INTO v_target_user_id;

    -- If ownership transferred to family_head, update families owner_id
    IF v_clean_role IN ('family_head', 'owner') AND v_target_user_id IS NOT NULL THEN
        UPDATE public.families
        SET owner_id = v_target_user_id, updated_at = NOW()
        WHERE id = p_family_id;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (family_id, user_id, action, metadata)
    VALUES (
        p_family_id,
        v_caller_id,
        'MEMBER_ROLE_CHANGED',
        jsonb_build_object('target_member_id', p_member_id, 'target_user_id', v_target_user_id, 'new_role', p_new_role)
    );

    RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'new_role', p_new_role);
END;
$$;
