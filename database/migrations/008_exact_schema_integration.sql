-- =========================================================
-- MIGRATION 008: EXACT PRODUCTION FAMILIES & FAMILY_MEMBERS SCHEMA INTEGRATION
-- =========================================================

-- 1. PUBLIC.FAMILIES TABLE
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    family_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist if table already had previous variations
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS family_code TEXT;

-- 2. PUBLIC.FAMILY_MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('family_head', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_family_user UNIQUE (family_id, user_id)
);

-- 3. INDEXES FOR FAST JOINS & LOOKUPS
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON public.family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_families_family_code ON public.families(family_code);
CREATE INDEX IF NOT EXISTS idx_families_created_by ON public.families(created_by);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- FAMILIES POLICIES
    DROP POLICY IF EXISTS "Members can view their family" ON public.families;
    CREATE POLICY "Members can view their family"
        ON public.families FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = families.id
                AND fm.user_id = auth.uid()
                AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Authenticated users can create family" ON public.families;
    CREATE POLICY "Authenticated users can create family"
        ON public.families FOR INSERT
        TO authenticated
        WITH CHECK (created_by = auth.uid());

    DROP POLICY IF EXISTS "Family heads and admins can update family" ON public.families;
    CREATE POLICY "Family heads and admins can update family"
        ON public.families FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = families.id
                AND fm.user_id = auth.uid()
                AND fm.role IN ('family_head', 'admin')
                AND fm.status = 'active'
            )
        );

    -- FAMILY_MEMBERS POLICIES
    DROP POLICY IF EXISTS "Members can view family members" ON public.family_members;
    CREATE POLICY "Members can view family members"
        ON public.family_members FOR SELECT
        TO authenticated
        USING (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = family_members.family_id
                AND fm.user_id = auth.uid()
                AND fm.status = 'active'
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
                AND fm.role IN ('family_head', 'admin')
                AND fm.status = 'active'
            )
        );

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
                AND fm.role IN ('family_head', 'admin')
                AND fm.status = 'active'
            )
        );
END $$;

-- 5. ATOMIC RPC FUNCTION: CREATE_FAMILY
CREATE OR REPLACE FUNCTION create_family(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_family_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_family_id UUID;
    v_code TEXT;
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

    v_code := COALESCE(p_family_code, 'FAM-' || upper(substring(md5(random()::text) from 1 for 4)) || '-' || upper(substring(md5(random()::text) from 1 for 4)));

    -- Insert into public.families (conforming exactly to schema)
    INSERT INTO public.families (name, description, created_by, family_code)
    VALUES (p_name, p_description, v_user_id, v_code)
    RETURNING id INTO v_family_id;

    -- Insert into public.family_members (role = 'family_head')
    INSERT INTO public.family_members (family_id, user_id, role, status)
    VALUES (v_family_id, v_user_id, 'family_head', 'active')
    RETURNING id INTO v_member_id;

    SELECT jsonb_build_object(
        'family_id', v_family_id,
        'name', p_name,
        'description', p_description,
        'family_code', v_code,
        'member_id', v_member_id,
        'role', 'family_head'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 6. ATOMIC RPC FUNCTION: JOIN_FAMILY_BY_CODE
CREATE OR REPLACE FUNCTION join_family_by_code(
    p_family_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_family RECORD;
    v_existing_member RECORD;
    v_member_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Find family by family_code
    SELECT id, name, family_code INTO v_family
    FROM public.families
    WHERE upper(family_code) = upper(trim(p_family_code));

    IF v_family IS NULL THEN
        RAISE EXCEPTION 'Family not found. Please check your invitation code.';
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
                'already_member', true
            );
        ELSE
            UPDATE public.family_members
            SET status = 'active', updated_at = NOW()
            WHERE id = v_existing_member.id;
            v_member_id := v_existing_member.id;
        END IF;
    ELSE
        INSERT INTO public.family_members (family_id, user_id, role, status)
        VALUES (v_family.id, v_user_id, 'member', 'active')
        RETURNING id INTO v_member_id;
    END IF;

    RETURN jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'role', 'member',
        'member_id', v_member_id
    );
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
