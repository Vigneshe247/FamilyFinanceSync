-- =========================================================
-- MIGRATION 006: CREATE_FAMILY RPC & CONSOLIDATED TABLES
-- Specification: Defines create_family(p_name, p_description, p_family_code)
-- =========================================================

-- 1. Ensure public.families has invite_code and family_code
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES auth.users(id),
    invite_code TEXT UNIQUE,
    family_code TEXT UNIQUE,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS family_code TEXT;

-- 2. Ensure public.family_members table
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id VARCHAR(50) NOT NULL DEFAULT 'FAMILY_HEAD',
    role TEXT NOT NULL DEFAULT 'family_head',
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_family_user') THEN
        ALTER TABLE public.family_members ADD CONSTRAINT unique_family_user UNIQUE (family_id, user_id);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- 3. CREATE_FAMILY RPC
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

    -- Insert Family
    INSERT INTO public.families (name, description, owner_id, created_by, invite_code, family_code)
    VALUES (p_name, p_description, v_user_id, v_user_id, v_code, v_code)
    RETURNING id INTO v_family_id;

    -- Insert Family Head Membership (role = 'family_head')
    INSERT INTO public.family_members (family_id, user_id, role_id, role, status)
    VALUES (v_family_id, v_user_id, 'FAMILY_HEAD', 'family_head', 'active')
    RETURNING id INTO v_member_id;

    SELECT jsonb_build_object(
        'family_id', v_family_id,
        'name', p_name,
        'description', p_description,
        'family_code', v_code,
        'invite_code', v_code,
        'member_id', v_member_id,
        'role', 'family_head'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Alias create_family_with_owner to create_family for backwards compatibility
CREATE OR REPLACE FUNCTION create_family_with_owner(
    p_name TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN create_family(p_name, p_description, NULL);
END;
$$;
