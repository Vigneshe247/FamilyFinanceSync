-- =========================================================
-- Migration 016: Complete RLS Policies, Functions, and Permissions
-- Eliminates recursion, enables import_batches, families, and recurring_transactions
-- =========================================================

-- 1. Helper security definer functions to prevent RLS recursion
CREATE OR REPLACE FUNCTION public.is_family_member(p_family_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = p_family_id AND user_id = p_user_id AND status = 'active'
    ) OR EXISTS (
        SELECT 1 FROM public.families
        WHERE id = p_family_id AND created_by = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(p_family_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = p_family_id 
          AND user_id = p_user_id 
          AND role IN ('family_head', 'owner', 'admin') 
          AND status = 'active'
    ) OR EXISTS (
        SELECT 1 FROM public.families
        WHERE id = p_family_id AND created_by = p_user_id
    );
$$;

-- 2. family_members RLS policies (SELECT, INSERT, UPDATE, DELETE)
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view family members" ON public.family_members;
CREATE POLICY "Members can view family members"
    ON public.family_members FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_family_member(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Users can join or admins invite members" ON public.family_members;
CREATE POLICY "Users can join or admins invite members"
    ON public.family_members FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Family heads and admins can update member roles" ON public.family_members;
CREATE POLICY "Family heads and admins can update member roles"
    ON public.family_members FOR UPDATE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Family heads and admins can remove members" ON public.family_members;
CREATE POLICY "Family heads and admins can remove members"
    ON public.family_members FOR DELETE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

-- 3. families RLS policies (SELECT, INSERT, UPDATE)
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their families" ON public.families;
CREATE POLICY "Members can view their families"
    ON public.families FOR SELECT
    TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.is_family_member(id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Authenticated users can create families" ON public.families;
CREATE POLICY "Authenticated users can create families"
    ON public.families FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Heads and admins can update families" ON public.families;
CREATE POLICY "Heads and admins can update families"
    ON public.families FOR UPDATE
    TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.is_family_admin(id, (SELECT auth.uid()))
    );

-- 4. import_batches RLS policies (SELECT, INSERT, UPDATE, DELETE)
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view import batches" ON public.import_batches;
CREATE POLICY "Members can view import batches"
    ON public.import_batches FOR SELECT
    TO authenticated
    USING (
        uploaded_by = (SELECT auth.uid())
        OR public.is_family_member(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Members can insert import batches" ON public.import_batches;
CREATE POLICY "Members can insert import batches"
    ON public.import_batches FOR INSERT
    TO authenticated
    WITH CHECK (
        uploaded_by = (SELECT auth.uid())
        AND public.is_family_member(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Users or admins can update import batches" ON public.import_batches;
CREATE POLICY "Users or admins can update import batches"
    ON public.import_batches FOR UPDATE
    TO authenticated
    USING (
        uploaded_by = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Users or admins can delete import batches" ON public.import_batches;
CREATE POLICY "Users or admins can delete import batches"
    ON public.import_batches FOR DELETE
    TO authenticated
    USING (
        uploaded_by = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

-- 5. recurring_transactions RLS policies
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Members can view recurring transactions"
    ON public.recurring_transactions FOR SELECT
    TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.is_family_member(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Members can manage recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Members can manage recurring transactions"
    ON public.recurring_transactions FOR ALL
    TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    )
    WITH CHECK (
        created_by = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

-- 6. spending_limits RLS policies
ALTER TABLE public.spending_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view spending limits" ON public.spending_limits;
CREATE POLICY "Members can view spending limits"
    ON public.spending_limits FOR SELECT
    TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.is_family_member(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Admins can manage spending limits" ON public.spending_limits;
CREATE POLICY "Admins can manage spending limits"
    ON public.spending_limits FOR ALL
    TO authenticated
    USING (
        public.is_family_admin(family_id, (SELECT auth.uid()))
    )
    WITH CHECK (
        public.is_family_admin(family_id, (SELECT auth.uid()))
    );

-- 7. transactions RLS policies update (support personal + family shared, faster with is_family_member)
DROP POLICY IF EXISTS "Members can view family transactions" ON public.transactions;
CREATE POLICY "Members can view family transactions"
    ON public.transactions FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR (is_shared = TRUE AND public.is_family_member(family_id, (SELECT auth.uid())))
    );

DROP POLICY IF EXISTS "Members can insert transactions" ON public.transactions;
CREATE POLICY "Members can insert transactions"
    ON public.transactions FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.is_family_member(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Members can update own or family transactions" ON public.transactions;
CREATE POLICY "Members can update own or family transactions"
    ON public.transactions FOR UPDATE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Members can delete own or family transactions" ON public.transactions;
CREATE POLICY "Members can delete own or family transactions"
    ON public.transactions FOR DELETE
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_family_admin(family_id, (SELECT auth.uid()))
    );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
