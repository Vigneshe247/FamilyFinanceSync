/* =========================================================
   SYSTEM DEFINITIONS & CONSTANTS (Section E & G)
   Clean system metadata: Roles, Permissions, Categories, Thresholds.
   Zero Demo Data.
   ========================================================= */

import { PermissionKey, RoleDefinition, Category } from '../types';

export const SYSTEM_PERMISSIONS: { key: PermissionKey; description: string; group: string }[] = [
  // Family & Workspace
  { key: 'family.view', description: 'View family workspace details', group: 'Family' },
  { key: 'family.update', description: 'Update family settings & currency', group: 'Family' },
  { key: 'family.summary', description: 'View consolidated family summary', group: 'Family' },
  { key: 'family.settings.view', description: 'View family security & workspace settings', group: 'Family' },
  { key: 'family.settings.update', description: 'Modify family settings & policies', group: 'Family' },

  // Members & Roles
  { key: 'members.view', description: 'View members of the family', group: 'Members' },
  { key: 'members.invite', description: 'Invite new family members or manage family code', group: 'Members' },
  { key: 'members.remove', description: 'Remove members from family', group: 'Members' },
  { key: 'members.update_role', description: 'Change member roles', group: 'Members' },
  { key: 'members.update_permissions', description: 'Override individual member permissions', group: 'Members' },

  // Transactions
  { key: 'transactions.view', description: 'View permitted family transactions', group: 'Transactions' },
  { key: 'transactions.create', description: 'Record income or expense entries', group: 'Transactions' },
  { key: 'transactions.update', description: 'Edit existing permitted transactions', group: 'Transactions' },
  { key: 'transactions.delete', description: 'Soft-delete transactions with reason', group: 'Transactions' },

  // Budgets
  { key: 'budgets.view', description: 'View family and category budgets', group: 'Budgets' },
  { key: 'budgets.create', description: 'Create new category and period budgets', group: 'Budgets' },
  { key: 'budgets.update', description: 'Modify allocated budget amounts', group: 'Budgets' },
  { key: 'budgets.delete', description: 'Remove family budgets', group: 'Budgets' },

  // Accounts
  { key: 'accounts.view', description: 'View family bank accounts and balances', group: 'Accounts' },
  { key: 'accounts.create', description: 'Add new payment accounts or wallets', group: 'Accounts' },
  { key: 'accounts.update', description: 'Edit payment account metadata and balance', group: 'Accounts' },
  { key: 'accounts.delete', description: 'Archive or remove payment accounts', group: 'Accounts' },

  // Requests & Approvals
  { key: 'requests.view', description: 'View spending and reimbursement requests', group: 'Requests' },
  { key: 'requests.create', description: 'Submit expense requests for approval', group: 'Requests' },
  { key: 'requests.approve', description: 'Approve pending expense requests', group: 'Requests' },
  { key: 'requests.reject', description: 'Reject pending expense requests with reason', group: 'Requests' },

  // Savings Goals
  { key: 'goals.view', description: 'View family and personal savings goals', group: 'Goals' },
  { key: 'goals.create', description: 'Create new savings goals', group: 'Goals' },
  { key: 'goals.update', description: 'Contribute to or modify savings goals', group: 'Goals' },
  { key: 'goals.delete', description: 'Delete savings goals', group: 'Goals' },

  // Investments
  { key: 'investments.view', description: 'View holdings and investment assets', group: 'Investments' },
  { key: 'investments.create', description: 'Record new investments or SIPs', group: 'Investments' },
  { key: 'investments.update', description: 'Update investment valuation and returns', group: 'Investments' },
  { key: 'investments.delete', description: 'Remove investment assets', group: 'Investments' },

  // Reports & Analytics
  { key: 'reports.view', description: 'View family financial reports & analytics', group: 'Reports' },
  { key: 'reports.export', description: 'Export financial reports to CSV/PDF (audited)', group: 'Reports' },

  // Monitoring & Audit
  { key: 'monitoring.view', description: 'Consolidated Family Head financial monitoring view', group: 'Monitoring' },
  { key: 'audit.view', description: 'Inspect immutable audit trail and security logs', group: 'Audit' },
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'FAMILY_HEAD',
    name: 'FAMILY_HEAD',
    title: 'Family Head',
    description: 'Complete administrative control over members, budgets, approval rules, accounts, monitoring and audit logs.',
    is_system_role: true,
    default_permissions: SYSTEM_PERMISSIONS.map(p => p.key),
  },
  {
    id: 'CO_MANAGER',
    name: 'CO_MANAGER',
    title: 'Co-Manager / Spouse',
    description: 'Co-manages family finances, reviews requests up to threshold, records income/expenses, oversees budgets.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'family.summary',
      'members.view',
      'members.invite',
      'transactions.view',
      'transactions.create',
      'transactions.update',
      'budgets.view',
      'budgets.update',
      'accounts.view',
      'accounts.create',
      'accounts.update',
      'requests.view',
      'requests.create',
      'requests.approve',
      'requests.reject',
      'goals.view',
      'goals.create',
      'goals.update',
      'investments.view',
      'investments.create',
      'investments.update',
      'reports.view',
    ],
  },
  {
    id: 'ADULT_MEMBER',
    name: 'ADULT_MEMBER',
    title: 'Adult Member',
    description: 'Enters personal income and expenses, views shared family ledger, manages personal budget and requests.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'family.summary',
      'members.view',
      'transactions.view',
      'transactions.create',
      'transactions.update',
      'budgets.view',
      'accounts.view',
      'accounts.create',
      'requests.view',
      'requests.create',
      'goals.view',
      'goals.create',
      'goals.update',
      'investments.view',
      'investments.create',
      'reports.view',
    ],
  },
  {
    id: 'CHILD',
    name: 'CHILD',
    title: 'Child',
    description: 'Tracks personal allowance, records supervised spending, views personal savings goals, submits spending requests.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'transactions.create',
      'requests.view',
      'requests.create',
      'goals.view',
      'goals.create',
      'goals.update',
    ],
  },
  {
    id: 'VIEWER',
    name: 'VIEWER',
    title: 'Viewer',
    description: 'Read-only access to basic shared reports and summaries.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'family.summary',
      'reports.view',
    ],
  },
];

export const SYSTEM_CATEGORY_TEMPLATES: Omit<Category, 'id' | 'family_id'>[] = [
  // Income Categories
  { name: 'Salary', type: 'income', icon: 'Briefcase', color: '#10B981', is_default: true },
  { name: 'Business', type: 'income', icon: 'Building2', color: '#059669', is_default: true },
  { name: 'Freelance', type: 'income', icon: 'Laptop', color: '#047857', is_default: true },
  { name: 'Allowance', type: 'income', icon: 'Coins', color: '#34D399', is_default: true },
  { name: 'Interest', type: 'income', icon: 'Percent', color: '#6EE7B7', is_default: true },
  { name: 'Rental Income', type: 'income', icon: 'Home', color: '#A7F3D0', is_default: true },
  { name: 'Gift', type: 'income', icon: 'Gift', color: '#F59E0B', is_default: true },
  { name: 'Investment Returns', type: 'income', icon: 'TrendingUp', color: '#6366F1', is_default: true },
  { name: 'Other Income', type: 'income', icon: 'PlusCircle', color: '#64748B', is_default: true },

  // Expense Categories
  { name: 'Food & Groceries', type: 'expense', icon: 'Utensils', color: '#EF4444', is_default: true },
  { name: 'Transport & Fuel', type: 'expense', icon: 'Car', color: '#F97316', is_default: true },
  { name: 'Shopping & Retail', type: 'expense', icon: 'ShoppingBag', color: '#EC4899', is_default: true },
  { name: 'Education & Tuition', type: 'expense', icon: 'GraduationCap', color: '#8B5CF6', is_default: true },
  { name: 'Healthcare & Medical', type: 'expense', icon: 'HeartPulse', color: '#06B6D4', is_default: true },
  { name: 'Utilities & Bills', type: 'expense', icon: 'Zap', color: '#EAB308', is_default: true },
  { name: 'Rent & Housing', type: 'expense', icon: 'Home', color: '#3B82F6', is_default: true },
  { name: 'Entertainment & Leisure', type: 'expense', icon: 'Film', color: '#A855F7', is_default: true },
  { name: 'Subscriptions', type: 'expense', icon: 'CreditCard', color: '#6366F1', is_default: true },
  { name: 'Travel & Vacation', type: 'expense', icon: 'Plane', color: '#14B8A6', is_default: true },
  { name: 'Personal Care', type: 'expense', icon: 'Smile', color: '#F43F5E', is_default: true },
  { name: 'Other Expense', type: 'expense', icon: 'Tag', color: '#94A3B8', is_default: true },
];

export const DEFAULT_APPROVAL_THRESHOLDS = {
  ADULT_AUTO_APPROVE_MAX_PAISE: 50000,       // Rs 500 (under 500 is auto-approved)
  CO_MANAGER_APPROVAL_MAX_PAISE: 200000,    // Rs 2,000 (500 to 2,000 co-manager or head)
  CHILD_AUTO_APPROVE_MAX_PAISE: 0,          // Rs 0 (child always requires approval)
};
