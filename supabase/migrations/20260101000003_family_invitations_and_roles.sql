-- =========================================================
-- MIGRATION 005: FAMILY INVITATIONS & ROLE ENHANCEMENT
-- Specification: Dedicated family_invitations table, token verification RPC,
-- family_head role alignment, and secure invitation RLS policies.
-- =========================================================

-- 1. FAMILY_INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.family_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    family_code TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('family_head', 'admin', 'member', 'owner')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast token lookups & email filtering
CREATE INDEX IF NOT EXISTS idx_family_invitations_token_hash ON public.family_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_family_invitations_email ON public.family_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_family_invitations_family_id ON public.family_invitations(family_id);

-- Enable RLS on family_invitations
ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for family_invitations
DO $$
BEGIN
    DROP POLICY IF EXISTS "Members can view family invitations" ON public.family_invitations;
    CREATE POLICY "Members can view family invitations"
        ON public.family_invitations FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members
                WHERE family_members.family_id = family_invitations.family_id
                AND family_members.user_id = auth.uid()
            )
            OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        );

    DROP POLICY IF EXISTS "Family heads and admins can create invitations" ON public.family_invitations;
    CREATE POLICY "Family heads and admins can create invitations"
        ON public.family_invitations FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.family_members
                WHERE family_members.family_id = family_invitations.family_id
                AND family_members.user_id = auth.uid()
                AND family_members.role IN ('family_head', 'owner', 'admin')
            )
        );

    DROP POLICY IF EXISTS "Family heads and admins can update invitations" ON public.family_invitations;
    CREATE POLICY "Family heads and admins can update invitations"
        ON public.family_invitations FOR UPDATE
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members
                WHERE family_members.family_id = family_invitations.family_id
                AND family_members.user_id = auth.uid()
                AND family_members.role IN ('family_head', 'owner', 'admin')
            )
        );
END $$;

-- 2. UPDATE RPC: CREATE_FAMILY_WITH_OWNER TO USE 'family_head' ROLE
CREATE OR REPLACE FUNCTION create_family_with_owner(
    p_name TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_family_id UUID;
    v_invite_code TEXT;
    v_member_id UUID;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    IF trim(p_name) = '' THEN
        RAISE EXCEPTION 'Family name cannot be empty';
    END IF;

    -- Generate unique invite code
    v_invite_code := generate_secure_invite_code();

    -- Insert Family
    INSERT INTO public.families (name, description, owner_id, created_by, invite_code)
    VALUES (p_name, p_description, v_user_id, v_user_id, v_invite_code)
    RETURNING id INTO v_family_id;

    -- Insert Family Head Membership (role = 'family_head')
    INSERT INTO public.family_members (family_id, user_id, role_id, role, status)
    VALUES (v_family_id, v_user_id, 'FAMILY_HEAD', 'family_head', 'active')
    RETURNING id INTO v_member_id;

    -- Insert Default Starter Accounts
    INSERT INTO public.accounts (family_id, name, type, balance, currency, is_shared)
    VALUES 
        (v_family_id, 'Main Bank Account', 'bank', 5000000, 'INR', true),
        (v_family_id, 'Cash In Hand', 'cash', 1000000, 'INR', true);

    -- Insert Default Starter Categories
    INSERT INTO public.categories (family_id, name, type, color, is_default)
    VALUES
        (v_family_id, 'Salary', 'income', '#16A34A', true),
        (v_family_id, 'Food & Dining', 'expense', '#E5A11E', true),
        (v_family_id, 'Groceries', 'expense', '#3E8BF5', true),
        (v_family_id, 'Utilities & Bills', 'expense', '#9B51E0', true),
        (v_family_id, 'Transportation', 'expense', '#EC4899', true);

    -- Log Action
    INSERT INTO public.audit_logs (family_id, user_id, action, metadata)
    VALUES (v_family_id, v_user_id, 'FAMILY_CREATED', jsonb_build_object('family_name', p_name, 'invite_code', v_invite_code, 'role', 'family_head'));

    SELECT jsonb_build_object(
        'family_id', v_family_id,
        'name', p_name,
        'description', p_description,
        'invite_code', v_invite_code,
        'member_id', v_member_id,
        'role', 'family_head'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 3. RPC: CREATE FAMILY INVITATION TOKEN
CREATE OR REPLACE FUNCTION create_family_invitation(
    p_family_id UUID,
    p_invited_email TEXT,
    p_token_hash TEXT,
    p_expires_in_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    SELECT invite_code INTO v_family_code FROM public.families WHERE id = p_family_id;
    IF v_family_code IS NULL THEN
        RAISE EXCEPTION 'Family record not found';
    END IF;

    v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;

    -- Revoke existing pending invitations for this email + family
    UPDATE public.family_invitations
    SET status = 'revoked'
    WHERE family_id = p_family_id AND invited_email = lower(trim(p_invited_email)) AND status = 'pending';

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

-- 4. RPC: ACCEPT FAMILY INVITATION TOKEN
CREATE OR REPLACE FUNCTION accept_family_invitation_token(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
            -- Mark invitation as accepted
            UPDATE public.family_invitations SET status = 'accepted' WHERE id = v_invitation.id;
            SELECT id, name INTO v_family FROM public.families WHERE id = v_invitation.family_id;
            RETURN jsonb_build_object(
                'family_id', v_family.id,
                'name', v_family.name,
                'role', v_existing_member.role,
                'already_member', true
            );
        ELSE
            -- Reactivate membership
            UPDATE public.family_members
            SET status = 'active', role = v_invitation.role, updated_at = NOW()
            WHERE id = v_existing_member.id;
            v_member_id := v_existing_member.id;
        END IF;
    ELSE
        -- Insert new membership
        INSERT INTO public.family_members (family_id, user_id, role_id, role, status)
        VALUES (v_invitation.family_id, v_user_id, 'MEMBER', v_invitation.role, 'active')
        RETURNING id INTO v_member_id;
    END IF;

    -- Update invitation status
    UPDATE public.family_invitations SET status = 'accepted' WHERE id = v_invitation.id;

    -- Get Family Details
    SELECT id, name INTO v_family FROM public.families WHERE id = v_invitation.family_id;

    -- Audit log
    INSERT INTO public.audit_logs (family_id, user_id, action, metadata)
    VALUES (v_invitation.family_id, v_user_id, 'INVITATION_ACCEPTED', jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role));

    RETURN jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'role', v_invitation.role,
        'member_id', v_member_id
    );
END;
$$;
