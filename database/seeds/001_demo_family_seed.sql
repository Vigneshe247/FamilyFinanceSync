-- =========================================================
-- FAMILY FINANCE SYNC — INITIAL SYSTEM SEED DATA (Section A3 & Section E)
-- ONLY system seeds: role definitions, permission keys, default category template.
-- Zero demo users, zero demo families, zero demo transactions.
-- =========================================================

-- 1. SEED DEFAULT ROLES
INSERT INTO roles (id, name, description, is_system_role) VALUES
('FAMILY_HEAD', 'Family Head', 'Full administrative control over members, budgets, approval rules, vaults, and monitoring.', TRUE),
('CO_MANAGER', 'Co-Manager', 'Co-manages family budget, adds expenses, oversees savings goals and approves mid-tier requests.', TRUE),
('ADULT_MEMBER', 'Adult Member', 'Records personal expenses, submits spending requests, views permitted shared dashboards.', TRUE),
('CHILD', 'Child', 'Personal pocket allowance tracking, savings goals, and spending requests to parents.', TRUE),
('VIEWER', 'Viewer', 'Read-only access to basic shared reports and summaries.', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. SEED SYSTEM PERMISSIONS (Granular Capability Keys)
INSERT INTO permissions (id, description) VALUES
-- Family & Settings
('family.view', 'View family workspace details'),
('family.update', 'Update family settings & currency'),
('family.summary', 'View consolidated family summary'),
('family.settings.view', 'View family security & workspace settings'),
('family.settings.update', 'Modify family settings & policies'),

-- Members & Roles
('members.view', 'View members of the family'),
('members.invite', 'Invite new family members'),
('members.remove', 'Remove members from family'),
('members.update_role', 'Change member roles'),
('members.update_permissions', 'Override individual permissions'),

-- Transactions
('transactions.view', 'View permitted family transactions'),
('transactions.create', 'Record income or expense entries'),
('transactions.update', 'Edit existing permitted transactions'),
('transactions.delete', 'Soft-delete transactions with mandatory reason'),

-- Budgets
('budgets.view', 'View family and category budgets'),
('budgets.create', 'Create new budgets'),
('budgets.update', 'Modify allocated budget amounts'),
('budgets.delete', 'Delete family budgets'),

-- Accounts
('accounts.view', 'View family bank accounts and balances'),
('accounts.create', 'Add new payment accounts or wallets'),
('accounts.update', 'Modify account balances and details'),
('accounts.delete', 'Remove payment accounts'),

-- Requests & Approvals
('requests.view', 'View expense requests'),
('requests.create', 'Submit expense requests for approval'),
('requests.approve', 'Approve pending expense requests'),
('requests.reject', 'Reject pending expense requests'),

-- Savings Goals
('goals.view', 'View savings goals'),
('goals.create', 'Create savings goals'),
('goals.update', 'Contribute or modify savings goals'),
('goals.delete', 'Delete savings goals'),

-- Investments
('investments.view', 'View family investment holdings and performance'),
('investments.create', 'Record investment assets and SIP contributions'),
('investments.update', 'Update investment valuation and returns'),
('investments.delete', 'Remove investment records'),

-- Reports
('reports.view', 'View family financial reports & analytics'),
('reports.export', 'Export financial reports to CSV/PDF (audited)'),

-- Monitoring & Audit
('monitoring.view', 'Family Head consolidated real-time financial monitoring'),
('audit.view', 'Inspect immutable audit trail and security logs')
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description;

-- 3. SEED DEFAULT CATEGORY TEMPLATES (System Template Table)
CREATE TABLE IF NOT EXISTS category_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- income, expense, investment
    icon VARCHAR(100),
    color VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO category_templates (id, name, type, icon, color) VALUES
-- Income Templates
('tmpl-inc-salary', 'Salary', 'income', 'Briefcase', '#10B981'),
('tmpl-inc-business', 'Business', 'income', 'Building2', '#059669'),
('tmpl-inc-freelance', 'Freelance', 'income', 'Laptop', '#047857'),
('tmpl-inc-allowance', 'Allowance', 'income', 'Coins', '#34D399'),
('tmpl-inc-interest', 'Interest', 'income', 'Percent', '#6EE7B7'),
('tmpl-inc-rental', 'Rental Income', 'income', 'Home', '#A7F3D0'),
('tmpl-inc-gift', 'Gift', 'income', 'Gift', '#F59E0B'),
('tmpl-inc-returns', 'Investment Returns', 'income', 'TrendingUp', '#6366F1'),
('tmpl-inc-other', 'Other Income', 'income', 'PlusCircle', '#64748B'),

-- Expense Templates
('tmpl-exp-food', 'Food & Groceries', 'expense', 'Utensils', '#EF4444'),
('tmpl-exp-transport', 'Transport & Fuel', 'expense', 'Car', '#F97316'),
('tmpl-exp-shopping', 'Shopping & Retail', 'expense', 'ShoppingBag', '#EC4899'),
('tmpl-exp-education', 'Education & Tuition', 'expense', 'GraduationCap', '#8B5CF6'),
('tmpl-exp-healthcare', 'Healthcare & Medical', 'expense', 'HeartPulse', '#06B6D4'),
('tmpl-exp-utilities', 'Utilities & Bills', 'expense', 'Zap', '#EAB308'),
('tmpl-exp-rent', 'Rent & Housing', 'expense', 'Home', '#3B82F6'),
('tmpl-exp-entertainment', 'Entertainment & Leisure', 'expense', 'Film', '#A855F7'),
('tmpl-exp-subscriptions', 'Subscriptions', 'expense', 'CreditCard', '#6366F1'),
('tmpl-exp-travel', 'Travel & Vacation', 'expense', 'Plane', '#14B8A6'),
('tmpl-exp-personal', 'Personal Care', 'expense', 'Smile', '#F43F5E'),
('tmpl-exp-other', 'Other Expense', 'expense', 'Tag', '#94A3B8'),

-- Investment Templates
('tmpl-inv-stocks', 'Stocks & Equity', 'investment', 'TrendingUp', '#10B981'),
('tmpl-inv-mf', 'Mutual Funds & SIP', 'investment', 'PieChart', '#3B82F6'),
('tmpl-inv-fd', 'Fixed Deposit (FD)', 'investment', 'Landmark', '#F59E0B'),
('tmpl-inv-gold', 'Digital & Physical Gold', 'investment', 'Coins', '#EAB308'),
('tmpl-inv-bonds', 'Government & Corporate Bonds', 'investment', 'ShieldCheck', '#8B5CF6'),
('tmpl-inv-epf', 'EPF / PPF / NPS', 'investment', 'PiggyBank', '#06B6D4'),
('tmpl-inv-realestate', 'Real Estate', 'investment', 'Home', '#64748B')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color;
