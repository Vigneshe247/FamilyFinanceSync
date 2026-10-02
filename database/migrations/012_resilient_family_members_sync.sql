-- =========================================================
-- MIGRATION 012: RESILIENT FAMILY MEMBERS SYNC & REALTIME PUB
-- Fixes family member visibility between Family Head and joined members
-- =========================================================

-- 1. Ensure required columns on families table
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS family_code TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create index on family_code for fast O(1) lookup during join
CREATE INDEX IF NOT EXISTS idx_families_family_code ON public.families(upper(family_code));

-- 2. Ensure required columns on family_members table
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Create index on family_id and user_id
CREATE INDEX IF NOT EXISTS idx_family_members_fam_user ON public.family_members(family_id, user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_status ON public.family_members(status);

-- 3. Row-Level Security: Ensure members can view all co-members in their family workspace
DO $$
BEGIN
    ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

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

    DROP POLICY IF EXISTS "Users can join family members" ON public.family_members;
    CREATE POLICY "Users can join family members"
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
        );

    DROP POLICY IF EXISTS "Family heads can manage members" ON public.family_members;
    CREATE POLICY "Family heads can manage members"
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
        );
END $$;

-- 4. Enable Supabase Realtime for family_members and families
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'family_members') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'families') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.families;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
