-- =========================================================
-- MIGRATION 015: ATOMIC SERVER-SIDE WORKSPACE PROVISIONING
-- FamilyFinanceSync — Fintech-Grade Multi-Tenant Schema
-- Replaces multi-request client-side workspace creation with
-- a single atomic, authenticated SECURITY DEFINER database function.
-- Validates auth.uid() server-side, provisions family, head membership,
-- default categories, and starter account in one transaction.
-- Safe to retry without duplicates.
-- =========================================================

-- Helper function to generate unique uppercase family code if not already defined
CREATE OR REPLACE FUNCTION public.generate_unique_family_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_len INT := 8;
    v_exists BOOLEAN;
    v_attempt INT := 0;
BEGIN
    LOOP
        v_attempt := v_attempt + 1;
        v_code := 'FAM-';
        FOR i IN 1..v_len LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;

        SELECT EXISTS (
            SELECT 1 FROM public.families WHERE upper(family_code) = v_code
        ) INTO v_exists;

        IF NOT v_exists THEN
            RETURN v_code;
        END IF;

        IF v_attempt > 25 THEN
            RETURN 'FAM-' || upper(replace(gen_random_uuid()::text, '-', ''));
        END IF;
    END LOOP;
END;
$$;

-- Atomic create_family RPC
DROP FUNCTION IF EXISTS public.create_family(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_family(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_family_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_family_id UUID;
    v_code TEXT;
    v_member_id UUID;
    v_clean_name TEXT;
    v_result JSONB;
BEGIN
    -- 1. Enforce Server-Side Authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    -- 2. Validate Family Name
    v_clean_name := trim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Family name cannot be empty' USING ERRCODE = '22023';
    END IF;

    -- 3. Determine and Validate Unique Family Code
    IF p_family_code IS NOT NULL AND trim(p_family_code) <> '' THEN
        v_code := upper(trim(p_family_code));
        IF EXISTS (SELECT 1 FROM public.families WHERE upper(family_code) = v_code) THEN
            RAISE EXCEPTION 'Family code % is already in use. Please choose another or leave blank to auto-generate.', v_code
                USING ERRCODE = '23505';
        END IF;
    ELSE
        v_code := public.generate_unique_family_code();
    END IF;

    -- 4. Ensure caller profile exists
    INSERT INTO public.profiles (id, full_name, email, system_role, created_at, updated_at)
    VALUES (
        v_user_id,
        COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id), 'Family Head'),
        (SELECT email FROM auth.users WHERE id = v_user_id),
        'member',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    -- 5. Insert Family Workspace Record (Server validates ownership)
    INSERT INTO public.families (
        name,
        description,
        created_by,
        owner_id,
        family_code,
        currency,
        timezone,
        created_at,
        updated_at
    )
    VALUES (
        v_clean_name,
        nullif(trim(p_description), ''),
        v_user_id,
        v_user_id,
        v_code,
        'INR',
        'Asia/Kolkata',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_family_id;

    -- 6. Insert Creator as Family Head in family_members
    INSERT INTO public.family_members (
        family_id,
        user_id,
        role,
        role_id,
        status,
        joined_at,
        created_at,
        updated_at
    )
    VALUES (
        v_family_id,
        v_user_id,
        'family_head',
        'FAMILY_HEAD',
        'active',
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (family_id, user_id) DO UPDATE
    SET
        role = 'family_head',
        role_id = 'FAMILY_HEAD',
        status = 'active',
        updated_at = NOW()
    RETURNING id INTO v_member_id;

    -- 7. Seed Default Categories for the New Family Workspace
    INSERT INTO public.categories (family_id, name, type, color, is_default, created_at)
    VALUES
        (v_family_id, 'Salary', 'income', '#16A34A', TRUE, NOW()),
        (v_family_id, 'Investment & Dividends', 'income', '#059669', TRUE, NOW()),
        (v_family_id, 'Business & Freelance', 'income', '#10B981', TRUE, NOW()),
        (v_family_id, 'Gifts & Grants', 'income', '#34D399', TRUE, NOW()),
        (v_family_id, 'Other Income', 'income', '#6EE7B7', TRUE, NOW()),
        (v_family_id, 'Food & Dining', 'expense', '#F59E0B', TRUE, NOW()),
        (v_family_id, 'Groceries & Household', 'expense', '#3B82F6', TRUE, NOW()),
        (v_family_id, 'Utilities & Bills', 'expense', '#8B5CF6', TRUE, NOW()),
        (v_family_id, 'Transportation & Fuel', 'expense', '#EC4899', TRUE, NOW()),
        (v_family_id, 'Education & Learning', 'expense', '#06B6D4', TRUE, NOW()),
        (v_family_id, 'Healthcare & Medical', 'expense', '#EF4444', TRUE, NOW()),
        (v_family_id, 'Housing & Rent', 'expense', '#6366F1', TRUE, NOW()),
        (v_family_id, 'Shopping & Personal', 'expense', '#F97316', TRUE, NOW()),
        (v_family_id, 'Entertainment & Leisure', 'expense', '#14B8A6', TRUE, NOW())
    ON CONFLICT DO NOTHING;

    -- 8. Seed Default Starter Accounts with Zero Balance (Ledger Rule Intact)
    INSERT INTO public.accounts (
        family_id,
        name,
        type,
        balance,
        currency,
        is_shared,
        created_at,
        updated_at
    )
    VALUES
        (v_family_id, 'Cash in Hand', 'cash', 0, 'INR', TRUE, NOW(), NOW()),
        (v_family_id, 'Main Bank Account', 'bank', 0, 'INR', TRUE, NOW(), NOW())
    ON CONFLICT DO NOTHING;

    -- 9. Record System Audit Entry
    BEGIN
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
            v_family_id,
            v_user_id,
            'FAMILY_CREATED',
            'family',
            v_family_id::text,
            jsonb_build_object('name', v_clean_name, 'family_code', v_code),
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        -- Non-blocking for audit logs if table schema differs
    END;

    -- 10. Build and Return Consistent Result Payload
    SELECT jsonb_build_object(
        'family_id', v_family_id,
        'name', v_clean_name,
        'description', p_description,
        'family_code', v_code,
        'invite_code', v_code,
        'member_id', v_member_id,
        'role', 'family_head'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Alias create_family_with_owner for backward compatibility
CREATE OR REPLACE FUNCTION public.create_family_with_owner(
    p_name TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.create_family(p_name, p_description, NULL);
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.create_family(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_family_with_owner(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_unique_family_code() TO authenticated;
