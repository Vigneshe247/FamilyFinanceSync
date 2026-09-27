-- =========================================================
-- MIGRATION 004: AUTHENTICATION + FAMILY MEMBERSHIP ARCHITECTURE
-- Specification: Decoupled User Accounts & Family Memberships,
-- Secure Non-predictable Invite Codes, RLS & Atomic RPC Functions
-- =========================================================

-- 1. PROFILES TABLE ENHANCEMENT
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS system_role TEXT NOT NULL DEFAULT 'member';

-- Populate auth_user_id if null
UPDATE public.profiles SET auth_user_id = id WHERE auth_user_id IS NULL;

-- 2. FAMILIES TABLE ENHANCEMENT
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Update created_by to match owner_id if null
UPDATE public.families SET created_by = owner_id WHERE created_by IS NULL;

-- Unique constraint on invite_code
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'families_invite_code_key') THEN
        ALTER TABLE public.families ADD CONSTRAINT families_invite_code_key UNIQUE (invite_code);
    END IF;
END $$;

-- 3. FAMILY_MEMBERS TABLE ENHANCEMENT
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure UNIQUE(family_id, user_id) constraint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_family_user') THEN
        ALTER TABLE public.family_members ADD CONSTRAINT unique_family_user UNIQUE (family_id, user_id);
    END IF;
END $$;

-- 4. AUDIT_LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    action TEXT NOT NULL,
    target_user_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SECURE INVITATION CODE GENERATOR FUNCTION
CREATE OR REPLACE FUNCTION generate_secure_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := 'FAM-';
    i INTEGER;
BEGIN
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    result := result || '-';
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- 6. ATOMIC RPC: CREATE FAMILY WITH OWNER
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

    -- Insert Owner Membership
    INSERT INTO public.family_members (family_id, user_id, role_id, role, status)
    VALUES (v_family_id, v_user_id, 'FAMILY_HEAD', 'owner', 'active')
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
    VALUES (v_family_id, v_user_id, 'FAMILY_CREATED', jsonb_build_object('family_name', p_name, 'invite_code', v_invite_code));

    SELECT jsonb_build_object(
        'family_id', v_family_id,
        'name', p_name,
        'description', p_description,
        'invite_code', v_invite_code,
        'member_id', v_member_id,
        'role', 'owner'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 7. ATOMIC RPC: JOIN FAMILY BY INVITATION CODE
CREATE OR REPLACE FUNCTION join_family_by_code(
    p_invite_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_family record;
    v_member_id UUID;
    v_clean_code TEXT;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    v_clean_code := upper(trim(p_invite_code));
    IF v_clean_code = '' THEN
        RAISE EXCEPTION 'Invalid invitation code';
    END IF;

    -- Find family
    SELECT * INTO v_family FROM public.families WHERE upper(invite_code) = v_clean_code;
    IF v_family IS NULL THEN
        RAISE EXCEPTION 'Family not found. Please check your invitation code.';
    END IF;

    -- Check if already member
    IF EXISTS (SELECT 1 FROM public.family_members WHERE family_id = v_family.id AND user_id = v_user_id) THEN
        RAISE EXCEPTION 'You are already a member of this family.';
    END IF;

    -- Insert Membership as 'member'
    INSERT INTO public.family_members (family_id, user_id, role_id, role, status)
    VALUES (v_family.id, v_user_id, 'ADULT_MEMBER', 'member', 'active')
    RETURNING id INTO v_member_id;

    -- Audit Log
    INSERT INTO public.audit_logs (family_id, user_id, action, metadata)
    VALUES (v_family.id, v_user_id, 'MEMBER_JOINED', jsonb_build_object('family_name', v_family.name));

    SELECT jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'member_id', v_member_id,
        'role', 'member'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 8. ATOMIC RPC: REGENERATE INVITATION CODE
CREATE OR REPLACE FUNCTION regenerate_family_invite_code(
    p_family_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_new_code TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Check user role in family
    SELECT role INTO v_user_role FROM public.family_members WHERE family_id = p_family_id AND user_id = v_user_id AND status = 'active';
    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only an owner or admin can regenerate invitation codes.';
    END IF;

    v_new_code := generate_secure_invite_code();

    UPDATE public.families
    SET invite_code = v_new_code, updated_at = NOW()
    WHERE id = p_family_id;

    INSERT INTO public.audit_logs (family_id, user_id, action, metadata)
    VALUES (p_family_id, v_user_id, 'INVITE_REGENERATED', jsonb_build_object('new_code', v_new_code));

    RETURN v_new_code;
END;
$$;

-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view profiles in their families" ON public.profiles;
CREATE POLICY "Users can view profiles in their families" ON public.profiles
    FOR SELECT USING (
        id = auth.uid() OR
        id IN (
            SELECT fm.user_id FROM public.family_members fm WHERE fm.family_id IN (
                SELECT my_fm.family_id FROM public.family_members my_fm WHERE my_fm.user_id = auth.uid() AND my_fm.status = 'active'
            )
        )
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (id = auth.uid());

-- Families Policies
DROP POLICY IF EXISTS "Members can view their families" ON public.families;
CREATE POLICY "Members can view their families" ON public.families
    FOR SELECT USING (
        id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid() AND status = 'active')
    );

DROP POLICY IF EXISTS "Owners can update their families" ON public.families;
CREATE POLICY "Owners can update their families" ON public.families
    FOR UPDATE USING (
        id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active')
    );

-- Family Members Policies
DROP POLICY IF EXISTS "Members can view co-members" ON public.family_members;
CREATE POLICY "Members can view co-members" ON public.family_members
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid() AND status = 'active')
    );

DROP POLICY IF EXISTS "Owners/Admins can manage family members" ON public.family_members;
CREATE POLICY "Owners/Admins can manage family members" ON public.family_members
    FOR ALL USING (
        family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active')
    );

-- Audit Logs Policies
DROP POLICY IF EXISTS "Members can view family audit logs" ON public.audit_logs;
CREATE POLICY "Members can view family audit logs" ON public.audit_logs
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid() AND status = 'active')
    );
