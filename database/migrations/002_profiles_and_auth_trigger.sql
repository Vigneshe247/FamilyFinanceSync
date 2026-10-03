-- =========================================================
-- [DEPRECATED - DO NOT APPLY TO SUPABASE]
-- MIGRATION 002: Profiles & Firebase Auth Trigger (Obsolete)
-- REASON: References 'firebase_uid' which does not exist in the
-- Supabase architecture, and trigger is superseded by 003 and 012.
-- =========================================================

-- 1. CREATE PROFILES TABLE (Separation from auth.users, Step 10 & 11)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    firebase_uid VARCHAR(128) UNIQUE, -- Preserves Firebase UID mapping (Step 12)
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for legacy Firebase UID lookups
CREATE INDEX IF NOT EXISTS idx_profiles_firebase_uid ON public.profiles(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. AUTOMATIC PROFILE CREATION TRIGGER FUNCTION
-- Best practice: SECURITY DEFINER with fixed search_path to prevent privilege escalation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_firebase_uid VARCHAR(128);
    v_full_name TEXT;
    v_avatar_url TEXT;
BEGIN
    -- Extract Firebase UID if imported via firebase-to-supabase or custom claims
    v_firebase_uid := COALESCE(
        NEW.raw_user_meta_data->'fbuser'->>'localId',
        NEW.raw_user_meta_data->'fbuser'->>'uid',
        NEW.raw_user_meta_data->>'firebase_uid',
        NULL
    );

    -- Extract Display Name
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->'fbuser'->>'displayName',
        split_part(NEW.email, '@', 1)
    );

    -- Extract Avatar URL
    v_avatar_url := COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->'fbuser'->>'photoUrl',
        NULL
    );

    INSERT INTO public.profiles (
        id,
        firebase_uid,
        full_name,
        email,
        phone,
        avatar_url,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        v_firebase_uid,
        v_full_name,
        NEW.email,
        NEW.phone,
        v_avatar_url,
        NEW.created_at,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        firebase_uid = EXCLUDED.firebase_uid,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- 3. TRIGGER REGISTRATION ON auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 4. ENABLE ROW LEVEL SECURITY ON PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile or profiles of members within shared families
CREATE POLICY profiles_select_policy ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR id IN (
            SELECT fm.user_id 
            FROM public.family_members fm
            WHERE fm.family_id IN (
                SELECT my_fm.family_id 
                FROM public.family_members my_fm 
                WHERE my_fm.user_id = (SELECT auth.uid())
            )
        )
    );

-- Policy: Users can update their own profile
CREATE POLICY profiles_update_policy ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));
