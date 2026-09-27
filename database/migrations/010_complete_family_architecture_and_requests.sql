-- =========================================================
-- MIGRATION 010: PRODUCTION FAMILY JOIN REQUESTS, NOTIFICATIONS & RPC WORKFLOW
-- Specification: Enterprise Multi-Tenant Family Architecture (Phases 1-6)
-- =========================================================

-- 1. FAMILY JOIN REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.family_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast status & family lookups
CREATE INDEX IF NOT EXISTS idx_join_requests_family_id ON public.family_join_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_user_id ON public.family_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON public.family_join_requests(status);

-- 2. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- 3. ENABLE RLS
ALTER TABLE public.family_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES FOR JOIN REQUESTS & NOTIFICATIONS
DO $$
BEGIN
    -- JOIN REQUESTS: Users can view their own requests, Family Heads/Admins can view family requests
    DROP POLICY IF EXISTS "Users and Family Heads can view join requests" ON public.family_join_requests;
    CREATE POLICY "Users and Family Heads can view join requests"
        ON public.family_join_requests FOR SELECT
        TO authenticated
        USING (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = family_join_requests.family_id
                  AND fm.user_id = auth.uid()
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    DROP POLICY IF EXISTS "Users can insert join requests" ON public.family_join_requests;
    CREATE POLICY "Users can insert join requests"
        ON public.family_join_requests FOR INSERT
        TO authenticated
        WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Family Heads can update join requests" ON public.family_join_requests;
    CREATE POLICY "Family Heads can update join requests"
        ON public.family_join_requests FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.family_members fm
                WHERE fm.family_id = family_join_requests.family_id
                  AND fm.user_id = auth.uid()
                  AND fm.role IN ('family_head', 'admin')
                  AND fm.status = 'active'
            )
        );

    -- NOTIFICATIONS: Users can read & update their own notifications
    DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
    CREATE POLICY "Users can view their notifications"
        ON public.notifications FOR SELECT
        TO authenticated
        USING (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
    CREATE POLICY "Users can update their notifications"
        ON public.notifications FOR UPDATE
        TO authenticated
        USING (user_id = auth.uid());
END $$;

-- 5. ATOMIC RPC: REQUEST_TO_JOIN_FAMILY
CREATE OR REPLACE FUNCTION request_to_join_family(
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
    v_request_id UUID;
    v_head_id UUID;
    v_head_email TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = v_user_id;

    -- Lookup family by code
    SELECT id, name, created_by, family_code INTO v_family
    FROM public.families
    WHERE upper(family_code) = upper(trim(p_family_code));

    IF v_family IS NULL THEN
        RAISE EXCEPTION 'Invalid family code. Please check the code with your Family Head.';
    END IF;

    -- Check if user is already an active member
    SELECT id, status, role INTO v_existing_member
    FROM public.family_members
    WHERE family_id = v_family.id AND user_id = v_user_id;

    IF v_existing_member IS NOT NULL AND v_existing_member.status = 'active' THEN
        RETURN jsonb_build_object(
            'family_id', v_family.id,
            'name', v_family.name,
            'status', 'active',
            'already_member', true
        );
    END IF;

    -- Upsert join request
    INSERT INTO public.family_join_requests (family_id, user_id, status)
    VALUES (v_family.id, v_user_id, 'pending')
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_request_id
    FROM public.family_join_requests
    WHERE family_id = v_family.id AND user_id = v_user_id AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1;

    -- Upsert family membership with pending status
    IF v_existing_member IS NOT NULL THEN
        UPDATE public.family_members
        SET status = 'pending', updated_at = NOW()
        WHERE id = v_existing_member.id;
    ELSE
        INSERT INTO public.family_members (family_id, user_id, role, status)
        VALUES (v_family.id, v_user_id, 'member', 'pending');
    END IF;

    -- Fetch Family Head ID & Email
    v_head_id := v_family.created_by;
    SELECT email INTO v_head_email FROM auth.users WHERE id = v_head_id;

    -- Send In-App Notification to Family Head
    INSERT INTO public.notifications (user_id, family_id, type, title, message, data)
    VALUES (
        v_head_id,
        v_family.id,
        'family_request',
        '🔔 New Join Request',
        v_user_name || ' (' || v_user_email || ') requested to join ' || v_family.name,
        jsonb_build_object(
            'request_id', v_request_id,
            'applicant_id', v_user_id,
            'applicant_name', v_user_name,
            'applicant_email', v_user_email,
            'family_code', v_family.family_code
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request_id,
        'family_id', v_family.id,
        'family_name', v_family.name,
        'status', 'pending',
        'head_id', v_head_id,
        'head_email', v_head_email,
        'requester_name', v_user_name,
        'requester_email', v_user_email,
        'family_code', v_family.family_code
    );
END;
$$;

-- 6. ATOMIC RPC: APPROVE_FAMILY_JOIN_REQUEST
CREATE OR REPLACE FUNCTION approve_family_join_request(
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_req RECORD;
    v_head_check RECORD;
    v_family_name TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Fetch request
    SELECT id, family_id, user_id, status INTO v_req
    FROM public.family_join_requests
    WHERE id = p_request_id;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    -- Verify authorizer is active Family Head or Admin
    SELECT id INTO v_head_check
    FROM public.family_members
    WHERE family_id = v_req.family_id
      AND user_id = v_user_id
      AND role IN ('family_head', 'admin')
      AND status = 'active';

    IF v_head_check IS NULL THEN
        RAISE EXCEPTION 'Only Family Head or Admin can approve requests';
    END IF;

    SELECT name INTO v_family_name FROM public.families WHERE id = v_req.family_id;

    -- 1. Mark request approved
    UPDATE public.family_join_requests
    SET status = 'approved', updated_at = NOW()
    WHERE id = p_request_id;

    -- 2. Mark family_member status active
    UPDATE public.family_members
    SET status = 'active', updated_at = NOW()
    WHERE family_id = v_req.family_id AND user_id = v_req.user_id;

    -- 3. Notify approved member
    INSERT INTO public.notifications (user_id, family_id, type, title, message, data)
    VALUES (
        v_req.user_id,
        v_req.family_id,
        'request_approved',
        '✓ Request Approved!',
        'You are now an active member of ' || COALESCE(v_family_name, 'the family'),
        jsonb_build_object('family_id', v_req.family_id, 'status', 'active')
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'family_id', v_req.family_id,
        'user_id', v_req.user_id,
        'status', 'approved'
    );
END;
$$;

-- 7. ATOMIC RPC: REJECT_FAMILY_JOIN_REQUEST
CREATE OR REPLACE FUNCTION reject_family_join_request(
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_req RECORD;
    v_head_check RECORD;
    v_family_name TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    SELECT id, family_id, user_id, status INTO v_req
    FROM public.family_join_requests
    WHERE id = p_request_id;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    SELECT id INTO v_head_check
    FROM public.family_members
    WHERE family_id = v_req.family_id
      AND user_id = v_user_id
      AND role IN ('family_head', 'admin')
      AND status = 'active';

    IF v_head_check IS NULL THEN
        RAISE EXCEPTION 'Only Family Head or Admin can reject requests';
    END IF;

    SELECT name INTO v_family_name FROM public.families WHERE id = v_req.family_id;

    UPDATE public.family_join_requests
    SET status = 'rejected', updated_at = NOW()
    WHERE id = p_request_id;

    UPDATE public.family_members
    SET status = 'removed', updated_at = NOW()
    WHERE family_id = v_req.family_id AND user_id = v_req.user_id;

    INSERT INTO public.notifications (user_id, family_id, type, title, message, data)
    VALUES (
        v_req.user_id,
        v_req.family_id,
        'request_rejected',
        'Request Decision',
        'Your request to join ' || COALESCE(v_family_name, 'the family') || ' was declined.',
        jsonb_build_object('family_id', v_req.family_id, 'status', 'rejected')
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'status', 'rejected'
    );
END;
$$;

-- 8. REALTIME PUBLICATIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'family_join_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.family_join_requests;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
