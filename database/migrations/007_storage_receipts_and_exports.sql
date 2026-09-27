-- =========================================================
-- MIGRATION 007: STORAGE BUCKETS, RECEIPTS RLS & EXPORTS ARCHITECTURE
-- Specification: Private 'receipts' and 'exports' buckets,
-- Family-based folder RLS policies, receipt_path column
-- =========================================================

-- 1. ADD RECEIPT_PATH COLUMN TO TRANSACTIONS TABLE
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_path TEXT;

-- 2. CREATE STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('receipts', 'receipts', false),
    ('exports', 'exports', false),
    ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 3. STORAGE POLICIES FOR RECEIPTS BUCKET
DO $$
BEGIN
    -- Insert Policy: Family members can upload to their family folder
    DROP POLICY IF EXISTS "Family members can upload receipts" ON storage.objects;
    CREATE POLICY "Family members can upload receipts"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'receipts'
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id::text = (storage.foldername(name))[1]
                AND fm.user_id = auth.uid()
                AND fm.status = 'active'
            )
        );

    -- Select Policy: Family members can view/download receipts from their family folder
    DROP POLICY IF EXISTS "Family members can view receipts" ON storage.objects;
    CREATE POLICY "Family members can view receipts"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'receipts'
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id::text = (storage.foldername(name))[1]
                AND fm.user_id = auth.uid()
                AND fm.status = 'active'
            )
        );

    -- Delete Policy: Users can delete their own uploaded receipts
    DROP POLICY IF EXISTS "Users can delete their uploaded receipts" ON storage.objects;
    CREATE POLICY "Users can delete their uploaded receipts"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'receipts'
            AND owner_id = auth.uid()::text
        );

    -- 4. STORAGE POLICIES FOR EXPORTS BUCKET
    DROP POLICY IF EXISTS "Family members can upload exports" ON storage.objects;
    CREATE POLICY "Family members can upload exports"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'exports'
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id::text = (storage.foldername(name))[1]
                AND fm.user_id = auth.uid()
                AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Family members can view exports" ON storage.objects;
    CREATE POLICY "Family members can view exports"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'exports'
            AND EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id::text = (storage.foldername(name))[1]
                AND fm.user_id = auth.uid()
                AND fm.status = 'active'
            )
        );
END $$;
