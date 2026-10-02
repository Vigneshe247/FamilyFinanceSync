-- =========================================================
-- MIGRATION 011: COMPREHENSIVE FAMILY FILE IMPORTS, SESSION & SECURITY ARCHITECTURE
-- Specification: Enterprise Multi-Tenant Import Pipeline, Collision-Safe Codes,
-- Import Batches, Rollback RPC, and Storage Isolation
-- =========================================================

-- 1. IMPORT BATCHES TABLE (Audit Trail for File Imports)
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

-- Index for fast family batch queries
CREATE INDEX IF NOT EXISTS idx_import_batches_family_id ON public.import_batches(family_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_uploaded_by ON public.import_batches(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- 2. TRANSACTIONS ENHANCEMENTS FOR HISTORICAL FILE IMPORTS
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_file_id TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_reference TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Indexes for duplicate detection and batch lookups
CREATE INDEX IF NOT EXISTS idx_transactions_family_fingerprint ON public.transactions(family_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch ON public.transactions(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON public.transactions(source);

-- 3. ENABLE RLS ON IMPORT_BATCHES
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Family members can view import batches" ON public.import_batches;
    CREATE POLICY "Family members can view import batches"
        ON public.import_batches FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = import_batches.family_id
                  AND fm.user_id = auth.uid()
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Family members can insert import batches" ON public.import_batches;
    CREATE POLICY "Family members can insert import batches"
        ON public.import_batches FOR INSERT
        TO authenticated
        WITH CHECK (
            uploaded_by = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = import_batches.family_id
                  AND fm.user_id = auth.uid()
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Family heads, admins, and uploaders can update batches" ON public.import_batches;
    CREATE POLICY "Family heads, admins, and uploaders can update batches"
        ON public.import_batches FOR UPDATE
        TO authenticated
        USING (
            uploaded_by = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = import_batches.family_id
                  AND fm.user_id = auth.uid()
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Family heads and admins can delete import batches" ON public.import_batches;
    CREATE POLICY "Family heads and admins can delete import batches"
        ON public.import_batches FOR DELETE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = import_batches.family_id
                  AND fm.user_id = auth.uid()
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );
END $$;

-- 4. COLLISION-SAFE UNIQUE FAMILY CODE GENERATOR
CREATE OR REPLACE FUNCTION generate_unique_family_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Exclude confusing characters: 0, O, 1, I
    chars CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_code TEXT;
    v_attempts INT := 0;
    i INT;
BEGIN
    LOOP
        v_attempts := v_attempts + 1;
        v_code := 'FAM-';
        FOR i IN 1..6 LOOP
            v_code := v_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;

        -- Ensure uniqueness in families table
        IF NOT EXISTS (SELECT 1 FROM public.families WHERE upper(family_code) = v_code) THEN
            RETURN v_code;
        END IF;

        -- Emergency fallback with random md5 slice if 50 collisions occur
        IF v_attempts > 50 THEN
            RETURN 'FAM-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        END IF;
    END LOOP;
END;
$$;

-- 5. UPDATED ATOMIC CREATE_FAMILY RPC
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

    -- Generate collision-safe family code if not provided
    IF p_family_code IS NOT NULL AND trim(p_family_code) <> '' THEN
        v_code := upper(trim(p_family_code));
        -- Check if specified code is taken
        IF EXISTS (SELECT 1 FROM public.families WHERE upper(family_code) = v_code) THEN
            RAISE EXCEPTION 'Family code % is already taken. Please try another or leave empty to auto-generate.', v_code;
        END IF;
    ELSE
        v_code := generate_unique_family_code();
    END IF;

    -- Insert into public.families
    INSERT INTO public.families (name, description, created_by, owner_id, family_code)
    VALUES (trim(p_name), p_description, v_user_id, v_user_id, v_code)
    RETURNING id INTO v_family_id;

    -- Insert into public.family_members (Creator becomes Family Head)
    INSERT INTO public.family_members (family_id, user_id, role, role_id, status)
    VALUES (v_family_id, v_user_id, 'family_head', 'FAMILY_HEAD', 'active')
    RETURNING id INTO v_member_id;

    -- Return full result payload
    SELECT jsonb_build_object(
        'family_id', v_family_id,
        'name', trim(p_name),
        'description', p_description,
        'family_code', v_code,
        'member_id', v_member_id,
        'role', 'family_head'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 6. UPDATED ATOMIC JOIN_FAMILY_BY_CODE RPC
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
    v_clean_code TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    v_clean_code := upper(trim(p_family_code));
    IF v_clean_code = '' THEN
        RAISE EXCEPTION 'Please enter a valid family invitation code.';
    END IF;

    -- Case-insensitive lookup by family_code
    SELECT id, name, family_code INTO v_family
    FROM public.families
    WHERE upper(family_code) = v_clean_code;

    IF v_family IS NULL THEN
        RAISE EXCEPTION 'Family not found. Please check your family code.';
    END IF;

    -- Check if user is already a member
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
            -- Reactivate membership
            UPDATE public.family_members
            SET status = 'active', updated_at = NOW()
            WHERE id = v_existing_member.id;
            v_member_id := v_existing_member.id;
        END IF;
    ELSE
        -- Insert active member record
        INSERT INTO public.family_members (family_id, user_id, role, role_id, status)
        VALUES (v_family.id, v_user_id, 'member', 'ADULT_MEMBER', 'active')
        RETURNING id INTO v_member_id;
    END IF;

    RETURN jsonb_build_object(
        'family_id', v_family.id,
        'name', v_family.name,
        'role', 'member',
        'member_id', v_member_id,
        'family_code', v_family.family_code
    );
END;
$$;

-- 7. IMPORT BATCH ROLLBACK RPC (Undo Import)
CREATE OR REPLACE FUNCTION rollback_import_batch(
    p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_batch RECORD;
    v_deleted_count INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Find the batch
    SELECT * INTO v_batch
    FROM public.import_batches
    WHERE id = p_batch_id;

    IF v_batch IS NULL THEN
        RAISE EXCEPTION 'Import batch not found';
    END IF;

    -- Verify authorization: must be batch uploader OR family head/admin
    IF v_batch.uploaded_by <> v_user_id AND NOT EXISTS (
        SELECT 1 FROM public.family_members fm
        WHERE fm.family_id = v_batch.family_id
          AND fm.user_id = v_user_id
          AND fm.role IN ('family_head', 'admin')
          AND fm.status = 'active'
    ) THEN
        RAISE EXCEPTION 'You do not have permission to roll back this import batch.';
    END IF;

    -- Delete transactions strictly belonging to this batch
    DELETE FROM public.transactions
    WHERE import_batch_id = p_batch_id
      AND family_id = v_batch.family_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Update batch status to rolled_back
    UPDATE public.import_batches
    SET status = 'rolled_back',
        updated_at = NOW()
    WHERE id = p_batch_id;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'family_id', v_batch.family_id,
        'deleted_transactions', v_deleted_count,
        'status', 'rolled_back'
    );
END;
$$;

-- 8. STORAGE BUCKET: family-files
INSERT INTO storage.buckets (id, name, public)
VALUES ('family-files', 'family-files', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 9. STORAGE POLICIES FOR family-files BUCKET
DO $$
BEGIN
    DROP POLICY IF EXISTS "Family members can upload family files" ON storage.objects;
    CREATE POLICY "Family members can upload family files"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'family-files'
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id::text = (storage.foldername(name))[1]
                  AND fm.user_id = auth.uid()
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Family members can view family files" ON storage.objects;
    CREATE POLICY "Family members can view family files"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'family-files'
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id::text = (storage.foldername(name))[1]
                  AND fm.user_id = auth.uid()
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Users can delete family files they uploaded" ON storage.objects;
    CREATE POLICY "Users can delete family files they uploaded"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'family-files'
            AND (
                owner_id = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM public.family_members fm
                    WHERE fm.family_id::text = (storage.foldername(name))[1]
                      AND fm.user_id = auth.uid()
                      AND fm.role IN ('family_head', 'admin')
                      AND fm.status = 'active'
                )
            )
        );
END $$;

-- 10. REALTIME PUBLICATION
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.import_batches;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
