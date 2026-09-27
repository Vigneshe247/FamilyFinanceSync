-- =========================================================
-- MIGRATION 009: FAMILY CODE JOIN APPROVAL & REALTIME EMAIL WORKFLOW
-- Specification: Multi-Device Family Join Approval Architecture
-- =========================================================

-- 1. UPDATE JOIN_FAMILY_BY_CODE RPC (Requires Family Head Approval)
CREATE OR REPLACE FUNCTION join_family_by_code(
    p_family_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_user_name TEXT;
    v_family RECORD;
    v_existing_member RECORD;
    v_member_id UUID;
    v_head_email TEXT;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Fetch requesting user identity
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = v_user_id;

    -- Locate family by unique code
    SELECT id, name, created_by, family_code INTO v_family
    FROM public.families
    WHERE upper(family_code) = upper(trim(p_family_code));

    IF v_family IS NULL THEN
        RAISE EXCEPTION 'Invalid family code. Please check your invitation code.';
    END IF;

    -- Check existing membership
    SELECT id, status, role INTO v_existing_member
    FROM public.family_members
    WHERE family_id = v_family.id AND user_id = v_user_id;

    IF v_existing_member IS NOT NULL THEN
        IF v_existing_member.status = 'active' THEN
            RETURN jsonb_build_object(
                'family_id', v_family.id,
                'name', v_family.name,
                'role', v_existing_member.role,
                'status', 'active',
                'already_member', true
            );
        ELSE
            UPDATE public.family_members
            SET status = 'pending', updated_at = NOW()
            WHERE id = v_existing_member.id;
            v_member_id := v_existing_member.id;
        END IF;
    ELSE
        -- Insert new member record with PENDING status
        INSERT INTO public.family_members (family_id, user_id, role, status)
        VALUES (v_family.id, v_user_id, 'member', 'pending')
        RETURNING id INTO v_member_id;
    END IF;

    -- Get Family Head email for notifications
    SELECT email INTO v_head_email
    FROM auth.users WHERE id = v_family.created_by;

    RETURN jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'role', 'member',
        'status', 'pending',
        'member_id', v_member_id,
        'head_email', v_head_email,
        'requester_email', v_user_email,
        'requester_name', v_user_name,
        'family_code', v_family.family_code
    );
END;
$$;

-- 2. APPROVE MEMBER JOIN REQUEST RPC (Family Head / Admin Only)
CREATE OR REPLACE FUNCTION approve_family_member(
    p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_target_member RECORD;
    v_head_member RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Target member lookup
    SELECT id, family_id, user_id, status INTO v_target_member
    FROM public.family_members
    WHERE id = p_member_id;

    IF v_target_member IS NULL THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    -- Verify authorizing user is active Family Head or Admin
    SELECT id INTO v_head_member
    FROM public.family_members
    WHERE family_id = v_target_member.family_id
      AND user_id = v_user_id
      AND role IN ('family_head', 'admin')
      AND status = 'active';

    IF v_head_member IS NULL THEN
        RAISE EXCEPTION 'Only Family Head or Admin can approve family members';
    END IF;

    -- Approve member status
    UPDATE public.family_members
    SET status = 'active', updated_at = NOW()
    WHERE id = p_member_id;

    RETURN jsonb_build_object(
        'success', true,
        'member_id', p_member_id,
        'status', 'active'
    );
END;
$$;

-- 3. ENABLE REALTIME PUBLICATION FOR MEMBERSHIPS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND tablename = 'family_members'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Fallback if publication permissions vary
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
