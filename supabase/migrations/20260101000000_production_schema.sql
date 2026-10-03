-- =========================================================
-- FAMILY FINANCE SYNC — CONSOLIDATED PRODUCTION DATABASE SCHEMA
-- Specification: Multi-Tenant PostgreSQL, Row-Level Security,
-- Realtime Pub/Sub Publication, Integer Paise Precision
-- =========================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE (Linked 1:1 with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. FAMILIES TABLE (Multi-Tenant Root Workspace)
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ROLES TABLE (System & Custom Roles)
CREATE TABLE IF NOT EXISTS public.roles (
    id VARCHAR(50) PRIMARY KEY, -- e.g. FAMILY_HEAD, SPOUSE, CHILD, GRANDPARENT, VIEWER
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.permissions (
    id VARCHAR(100) PRIMARY KEY,
    description TEXT NOT NULL
);

-- 5. ROLE_PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id VARCHAR(50) NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. FAMILY_MEMBERS TABLE (User <-> Family Membership)
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id VARCHAR(50) NOT NULL REFERENCES public.roles(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, pending, suspended
    monthly_allowance BIGINT NOT NULL DEFAULT 0, -- In paise (e.g., ₹5,000 = 500,000 paise)
    monthly_spending_limit BIGINT NOT NULL DEFAULT 0, -- In paise
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_family_user UNIQUE (family_id, user_id)
);

-- 7. MEMBER_PERMISSIONS TABLE (Family Head Custom Overrides)
CREATE TABLE IF NOT EXISTS public.member_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    allowed BOOLEAN NOT NULL,
    CONSTRAINT unique_member_perm UNIQUE (family_member_id, permission_id)
);

-- 8. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- income, expense
    icon VARCHAR(100),
    color VARCHAR(50),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(50) NOT NULL, -- cash, bank, upi, credit_card, debit_card, savings, investment
    balance BIGINT NOT NULL DEFAULT 0, -- In paise
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    account_number_mask VARCHAR(50),
    is_shared BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. TRANSACTIONS TABLE (Primary Source of Financial Truth)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    type VARCHAR(50) NOT NULL, -- income, expense, transfer, refund, adjustment
    amount BIGINT NOT NULL, -- In paise
    description TEXT NOT NULL,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method VARCHAR(100) NOT NULL,
    is_shared BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'cleared', -- cleared, pending, voided
    receipt_url TEXT,
    from_account_id UUID REFERENCES public.accounts(id),
    to_account_id UUID REFERENCES public.accounts(id),
    created_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. BUDGETS TABLE
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    period VARCHAR(50) NOT NULL DEFAULT 'monthly', -- monthly, weekly
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_amount BIGINT NOT NULL, -- In paise
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. BUDGET_CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.budget_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    allocated_amount BIGINT NOT NULL, -- In paise
    CONSTRAINT unique_budget_category UNIQUE (budget_id, category_id)
);

-- 13. SPENDING_LIMITS TABLE
CREATE TABLE IF NOT EXISTS public.spending_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    period VARCHAR(50) NOT NULL DEFAULT 'monthly',
    limit_amount BIGINT NOT NULL, -- In paise
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. SAVINGS_GOALS TABLE
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    target_amount BIGINT NOT NULL, -- In paise
    current_amount BIGINT NOT NULL DEFAULT 0, -- In paise
    target_date DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- in_progress, completed, paused
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. GOAL_CONTRIBUTIONS TABLE
CREATE TABLE IF NOT EXISTS public.goal_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount BIGINT NOT NULL, -- In paise
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. REQUESTS TABLE (Executive Approval Workflow)
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    amount BIGINT NOT NULL, -- In paise
    category_id UUID NOT NULL REFERENCES public.categories(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. RECURRING_TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    category_id UUID NOT NULL REFERENCES public.categories(id),
    account_id UUID NOT NULL REFERENCES public.accounts(id),
    amount BIGINT NOT NULL, -- In paise
    type VARCHAR(50) NOT NULL DEFAULT 'expense',
    frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
    next_date DATE NOT NULL,
    description TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. AUDIT_LOGS TABLE (Immutable System Action Log)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- INDEXES FOR SCALE & QUERY OPTIMIZATION (Section 25)
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_transactions_family_date ON public.transactions(family_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON public.family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_budgets_family ON public.budgets(family_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_family ON public.savings_goals(family_id);
CREATE INDEX IF NOT EXISTS idx_requests_family_status ON public.requests(family_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_family ON public.audit_logs(family_id, created_at DESC);

-- =========================================================
-- SEED SYSTEM ROLES & PERMISSIONS
-- =========================================================
INSERT INTO public.roles (id, name, description, is_system_role) VALUES
('FAMILY_HEAD', 'Family Head', 'Full administrative authority and monitoring across all family assets.', TRUE),
('SPOUSE', 'Spouse / Co-Manager', 'Co-manages family budget, adds transactions, views shared vaults and goals.', TRUE),
('CHILD', 'Child / Dependent', 'Personal allowance tracking, savings goals, and spending requests to parents.', TRUE),
('GRANDPARENT', 'Grandparent', 'Personal transactions and permitted family financial overviews.', TRUE),
('VIEWER', 'Viewer', 'Strictly read-only access to permitted summaries and reports.', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.permissions (id, description) VALUES
('family.view', 'View family workspace details'),
('family.update', 'Update family settings & currency'),
('members.view', 'View members of the family'),
('members.invite', 'Invite new family members'),
('members.remove', 'Remove members from family'),
('members.update_role', 'Change member roles'),
('members.update_permissions', 'Override individual permissions'),
('transactions.view', 'View permitted family transactions'),
('transactions.create', 'Record income or expense'),
('transactions.update', 'Edit existing transactions'),
('transactions.delete', 'Remove transactions'),
('budgets.view', 'View family and category budgets'),
('budgets.create', 'Create new budgets'),
('budgets.update', 'Modify allocated budget amounts'),
('budgets.delete', 'Delete family budgets'),
('accounts.view', 'View family bank accounts and balances'),
('accounts.create', 'Add new payment accounts'),
('requests.view', 'View expense requests'),
('requests.create', 'Submit expense requests for approval'),
('requests.approve', 'Approve pending expense requests'),
('requests.reject', 'Reject pending expense requests'),
('goals.view', 'View savings goals'),
('goals.create', 'Create savings goals'),
('goals.update', 'Contribute or modify savings goals'),
('reports.view', 'View family financial reports & analytics'),
('reports.export', 'Export financial reports to CSV/PDF'),
('audit.view', 'Inspect audit trail and security logs')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policy
DROP POLICY IF EXISTS profiles_access_policy ON public.profiles;
CREATE POLICY profiles_access_policy ON public.profiles
    FOR ALL TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR id IN (
            SELECT fm.user_id FROM public.family_members fm WHERE fm.family_id IN (
                SELECT my_fm.family_id FROM public.family_members my_fm WHERE my_fm.user_id = (SELECT auth.uid())
            )
        )
    )
    WITH CHECK (id = (SELECT auth.uid()));

-- 2. Families Policy (Tenants only access families they belong to)
DROP POLICY IF EXISTS families_tenant_isolation ON public.families;
CREATE POLICY families_tenant_isolation ON public.families
    FOR ALL TO authenticated
    USING (
        id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
        OR owner_id = (SELECT auth.uid())
    )
    WITH CHECK (owner_id = (SELECT auth.uid()));

-- 3. Family Members Policy
DROP POLICY IF EXISTS family_members_tenant_isolation ON public.family_members;
CREATE POLICY family_members_tenant_isolation ON public.family_members
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
        OR user_id = (SELECT auth.uid())
    );

-- 4. Transactions Policy
DROP POLICY IF EXISTS transactions_tenant_isolation ON public.transactions;
CREATE POLICY transactions_tenant_isolation ON public.transactions
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 5. Accounts Policy
DROP POLICY IF EXISTS accounts_tenant_isolation ON public.accounts;
CREATE POLICY accounts_tenant_isolation ON public.accounts
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 6. Categories Policy
DROP POLICY IF EXISTS categories_tenant_isolation ON public.categories;
CREATE POLICY categories_tenant_isolation ON public.categories
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 7. Budgets Policy
DROP POLICY IF EXISTS budgets_tenant_isolation ON public.budgets;
CREATE POLICY budgets_tenant_isolation ON public.budgets
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 8. Requests Policy
DROP POLICY IF EXISTS requests_tenant_isolation ON public.requests;
CREATE POLICY requests_tenant_isolation ON public.requests
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 9. Savings Goals Policy
DROP POLICY IF EXISTS savings_goals_tenant_isolation ON public.savings_goals;
CREATE POLICY savings_goals_tenant_isolation ON public.savings_goals
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 10. Audit Logs Policy
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON public.audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON public.audit_logs
    FOR ALL TO authenticated
    USING (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT fm.family_id FROM public.family_members fm WHERE fm.user_id = (SELECT auth.uid())
        )
    );

-- 11. Notifications Policy
DROP POLICY IF EXISTS notifications_user_isolation ON public.notifications;
CREATE POLICY notifications_user_isolation ON public.notifications
    FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- =========================================================
-- SUPABASE REALTIME PUBLICATION
-- Enable real-time replication for multi-dashboard instant updates
-- =========================================================
DO $$
BEGIN
    -- Add tables to supabase_realtime publication if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'audit_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    END IF;
END $$;
