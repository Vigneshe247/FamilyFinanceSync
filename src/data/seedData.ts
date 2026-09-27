/* =========================================================
   INITIAL DEMO FAMILY SEED DATA (Section 40)
   ========================================================= */

import {
  Family,
  FamilyMember,
  FamilyMembership,
  RoleDefinition,
  Category,
  Account,
  Transaction,
  Budget,
  SavingsGoal,
  ExpenseRequest,
  RecurringTransaction,
  NotificationItem,
  AuditLogItem,
  ApprovalRule,
  PermissionKey,
  LoanItem,
  InvestmentAsset,
  SharedExpenseSplit,
} from '../types';

export const SYSTEM_PERMISSIONS: { key: PermissionKey; description: string; group: string }[] = [
  { key: 'family.view', description: 'View family workspace details', group: 'Family' },
  { key: 'family.update', description: 'Update family settings & currency', group: 'Family' },
  { key: 'members.view', description: 'View members of the family', group: 'Members' },
  { key: 'members.invite', description: 'Invite new family members', group: 'Members' },
  { key: 'members.remove', description: 'Remove members from family', group: 'Members' },
  { key: 'members.update_role', description: 'Change member roles', group: 'Members' },
  { key: 'members.update_permissions', description: 'Override individual permissions', group: 'Members' },
  { key: 'transactions.view', description: 'View permitted family transactions', group: 'Transactions' },
  { key: 'transactions.create', description: 'Record income or expense', group: 'Transactions' },
  { key: 'transactions.update', description: 'Edit existing transactions', group: 'Transactions' },
  { key: 'transactions.delete', description: 'Remove transactions', group: 'Transactions' },
  { key: 'budgets.view', description: 'View family and category budgets', group: 'Budgets' },
  { key: 'budgets.create', description: 'Create new budgets', group: 'Budgets' },
  { key: 'budgets.update', description: 'Modify allocated budget amounts', group: 'Budgets' },
  { key: 'budgets.delete', description: 'Delete family budgets', group: 'Budgets' },
  { key: 'accounts.view', description: 'View family bank accounts and balances', group: 'Accounts' },
  { key: 'accounts.create', description: 'Add new payment accounts', group: 'Accounts' },
  { key: 'accounts.update', description: 'Edit account balances and details', group: 'Accounts' },
  { key: 'accounts.delete', description: 'Remove payment accounts', group: 'Accounts' },
  { key: 'requests.view', description: 'View expense requests', group: 'Requests' },
  { key: 'requests.create', description: 'Submit expense requests for approval', group: 'Requests' },
  { key: 'requests.approve', description: 'Approve pending expense requests', group: 'Requests' },
  { key: 'requests.reject', description: 'Reject pending expense requests', group: 'Requests' },
  { key: 'goals.view', description: 'View savings goals', group: 'Goals' },
  { key: 'goals.create', description: 'Create and edit savings goals', group: 'Goals' },
  { key: 'goals.update', description: 'Contribute or modify savings goals', group: 'Goals' },
  { key: 'goals.delete', description: 'Delete savings goals', group: 'Goals' },
  { key: 'reports.view', description: 'View family financial reports & analytics', group: 'Reports' },
  { key: 'reports.export', description: 'Export financial reports to CSV/PDF', group: 'Reports' },
  { key: 'audit.view', description: 'Inspect audit trail and security logs', group: 'Audit' },
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'role-head',
    name: 'family_head',
    title: 'Family Head',
    description: 'Complete administrative control over members, budgets, approval rules, accounts, and audit logs.',
    is_system_role: true,
    default_permissions: SYSTEM_PERMISSIONS.map(p => p.key),
  },
  {
    id: 'role-head-upper',
    name: 'FAMILY_HEAD',
    title: 'Family Head',
    description: 'Complete administrative control over members, budgets, approval rules, accounts, and audit logs.',
    is_system_role: true,
    default_permissions: SYSTEM_PERMISSIONS.map(p => p.key),
  },
  {
    id: 'role-co-manager',
    name: 'CO_MANAGER',
    title: 'Co-Manager / Spouse',
    description: 'Co-manages family finances, reviews requests, records shared income/expenses, and views reports.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'family.update',
      'members.view',
      'members.invite',
      'transactions.view',
      'transactions.create',
      'transactions.update',
      'budgets.view',
      'budgets.update',
      'accounts.view',
      'accounts.update',
      'requests.view',
      'requests.create',
      'requests.approve',
      'requests.reject',
      'goals.view',
      'goals.create',
      'goals.update',
      'reports.view',
      'reports.export',
    ],
  },
  {
    id: 'role-spouse',
    name: 'spouse',
    title: 'Spouse',
    description: 'Co-manages family finances, records shared income/expenses, views reports.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'members.view',
      'transactions.view',
      'transactions.create',
      'transactions.update',
      'budgets.view',
      'accounts.view',
      'requests.view',
      'requests.create',
      'requests.approve',
      'requests.reject',
      'goals.view',
      'goals.create',
      'goals.update',
      'reports.view',
      'reports.export',
    ],
  },
  {
    id: 'role-adult-member',
    name: 'ADULT_MEMBER',
    title: 'Adult Member',
    description: 'Active adult family member who can log shared & personal expenses, view budgets and reports.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'members.view',
      'transactions.view',
      'transactions.create',
      'transactions.update',
      'budgets.view',
      'accounts.view',
      'requests.view',
      'requests.create',
      'goals.view',
      'goals.create',
      'goals.update',
      'reports.view',
    ],
  },
  {
    id: 'role-son',
    name: 'son',
    title: 'Son',
    description: 'Personal allowance tracking, manual spending & income records, and expense requests to Family Head.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'transactions.create',
      'requests.view',
      'requests.create',
      'goals.view',
      'notifications.receive',
    ],
  },
  {
    id: 'role-daughter',
    name: 'daughter',
    title: 'Daughter',
    description: 'Personal allowance tracking, manual spending & income records, and expense requests to Family Head.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'transactions.create',
      'requests.view',
      'requests.create',
      'goals.view',
      'notifications.receive',
    ],
  },
  {
    id: 'role-child-upper',
    name: 'CHILD',
    title: 'Child',
    description: 'Allowance tracking, personal spending records, and expense requests to parents.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'transactions.create',
      'requests.view',
      'requests.create',
      'goals.view',
      'notifications.receive',
    ],
  },
  {
    id: 'role-child',
    name: 'child',
    title: 'Child',
    description: 'Personal allowance view, personal spending records, and allowance requests to parents.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'transactions.create',
      'requests.view',
      'requests.create',
      'goals.view',
      'notifications.receive',
    ],
  },
  {
    id: 'role-grandparent',
    name: 'grandparent',
    title: 'Grand Parents',
    description: 'Permitted family financial overview and personal transaction records.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'members.view',
      'transactions.view',
      'transactions.create',
      'budgets.view',
      'accounts.view',
      'reports.view',
    ],
  },
  {
    id: 'role-viewer',
    name: 'viewer',
    title: 'Viewer',
    description: 'Strictly view-only access across permitted family records. All mutations disabled.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'budgets.view',
      'reports.view',
    ],
  },
  {
    id: 'role-viewer-upper',
    name: 'VIEWER',
    title: 'Viewer',
    description: 'Strictly view-only access across permitted family records. All mutations disabled.',
    is_system_role: true,
    default_permissions: [
      'family.view',
      'transactions.view',
      'budgets.view',
      'reports.view',
    ],
  },
];

export const DEMO_FAMILIES: Family[] = [];

export const DEMO_FAMILY: Family = {
  id: '',
  name: 'Family Workspace',
  owner_id: '',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export interface DemoUserOption {
  id: string;
  name: string;
  roleName: string;
  email: string;
  avatar_url: string;
  defaultFamilyId: string;
}

export const DEMO_USERS: DemoUserOption[] = [];

export const USER_LINKED_FAMILIES: Record<string, FamilyMembership[]> = {};

export const DEMO_MEMBERS: FamilyMember[] = [];

export const DEMO_CATEGORIES: Category[] = [
  // Predefined Expense Categories (Section 12)
  { id: 'cat-food', family_id: 'fam-demo-001', name: 'Food', type: 'expense', icon: 'Utensils', color: '#C0751A', is_default: true },
  { id: 'cat-groceries', family_id: 'fam-demo-001', name: 'Groceries', type: 'expense', icon: 'ShoppingBag', color: '#16A34A', is_default: true },
  { id: 'cat-transport', family_id: 'fam-demo-001', name: 'Transportation', type: 'expense', icon: 'Car', color: '#2B6CB0', is_default: true },
  { id: 'cat-education', family_id: 'fam-demo-001', name: 'Education', type: 'expense', icon: 'GraduationCap', color: '#6B46C1', is_default: true },
  { id: 'cat-healthcare', family_id: 'fam-demo-001', name: 'Healthcare', type: 'expense', icon: 'HeartPulse', color: '#E53E3E', is_default: true },
  { id: 'cat-shopping', family_id: 'fam-demo-001', name: 'Shopping', type: 'expense', icon: 'ShoppingBag', color: '#D53F8C', is_default: true },
  { id: 'cat-entertainment', family_id: 'fam-demo-001', name: 'Entertainment', type: 'expense', icon: 'Tv', color: '#E5A11E', is_default: true },
  { id: 'cat-bills', family_id: 'fam-demo-001', name: 'Bills', type: 'expense', icon: 'FileText', color: '#D97706', is_default: true },
  { id: 'cat-rent', family_id: 'fam-demo-001', name: 'Rent', type: 'expense', icon: 'Home', color: '#9C3B34', is_default: true },
  { id: 'cat-utilities', family_id: 'fam-demo-001', name: 'Utilities', type: 'expense', icon: 'Zap', color: '#0284C7', is_default: true },
  { id: 'cat-travel', family_id: 'fam-demo-001', name: 'Travel', type: 'expense', icon: 'Compass', color: '#0D9488', is_default: true },
  { id: 'cat-family', family_id: 'fam-demo-001', name: 'Family', type: 'expense', icon: 'Users', color: '#4F46E5', is_default: true },
  { id: 'cat-personal', family_id: 'fam-demo-001', name: 'Personal', type: 'expense', icon: 'User', color: '#7C3AED', is_default: true },
  { id: 'cat-investment', family_id: 'fam-demo-001', name: 'Investment', type: 'expense', icon: 'TrendingUp', color: '#059669', is_default: true },
  { id: 'cat-other-expense', family_id: 'fam-demo-001', name: 'Other', type: 'expense', icon: 'HelpCircle', color: '#64748B', is_default: true },

  // Predefined Income Sources (Section 10)
  { id: 'cat-salary', family_id: 'fam-demo-001', name: 'Salary', type: 'income', icon: 'Briefcase', color: '#16A34A', is_default: true },
  { id: 'cat-freelance', family_id: 'fam-demo-001', name: 'Freelance', type: 'income', icon: 'Laptop', color: '#2563EB', is_default: true },
  { id: 'cat-business', family_id: 'fam-demo-001', name: 'Business', type: 'income', icon: 'Building2', color: '#7C3AED', is_default: true },
  { id: 'cat-allowance', family_id: 'fam-demo-001', name: 'Allowance', type: 'income', icon: 'Gift', color: '#DB2777', is_default: true },
  { id: 'cat-scholarship', family_id: 'fam-demo-001', name: 'Scholarship', type: 'income', icon: 'Award', color: '#D97706', is_default: true },
  { id: 'cat-investment-inc', family_id: 'fam-demo-001', name: 'Investment', type: 'income', icon: 'TrendingUp', color: '#059669', is_default: true },
  { id: 'cat-gift', family_id: 'fam-demo-001', name: 'Gift', type: 'income', icon: 'Heart', color: '#EA580C', is_default: true },
  { id: 'cat-pension', family_id: 'fam-demo-001', name: 'Pension', type: 'income', icon: 'Shield', color: '#0891B2', is_default: true },
  { id: 'cat-other-income', family_id: 'fam-demo-001', name: 'Other', type: 'income', icon: 'PlusCircle', color: '#64748B', is_default: true },
];

export const DEMO_ACCOUNTS: Account[] = [
  // Vignesh Family Accounts
  {
    id: 'acc-hdfc',
    family_id: 'fam-demo-001',
    name: 'HDFC Family Savings',
    type: 'bank',
    balance: 14500000, // ₹1,45,000
    currency: 'INR',
    account_number_mask: '•••• 4821',
    is_shared: true,
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'acc-sbi',
    family_id: 'fam-demo-001',
    name: 'SBI Secondary Operating',
    type: 'bank',
    balance: 8200000, // ₹82,000
    currency: 'INR',
    account_number_mask: '•••• 9104',
    is_shared: true,
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'acc-cash',
    family_id: 'fam-demo-001',
    name: 'Family Cash Vault',
    type: 'cash',
    balance: 1850000, // ₹18,500
    currency: 'INR',
    is_shared: true,
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'acc-anu-wallet',
    family_id: 'fam-demo-001',
    name: "Anu's Pocket Wallet",
    type: 'wallet',
    balance: 175000, // ₹1,750
    currency: 'INR',
    is_shared: false,
    created_at: '2026-01-10T14:00:00Z',
  },

  // Extended Family Accounts
  {
    id: 'acc-ext-bank',
    family_id: 'fam-extended',
    name: 'Canara Ancestral Trust Bank',
    type: 'bank',
    balance: 38000000, // ₹3,80,000
    currency: 'INR',
    account_number_mask: '•••• 7712',
    is_shared: true,
    created_at: '2026-02-15T10:00:00Z',
  },

  // Personal Finance Accounts
  {
    id: 'acc-pers-kotak',
    family_id: 'fam-personal',
    name: 'Kotak Solo Freelance & Wealth',
    type: 'bank',
    balance: 12500000, // ₹1,25,000
    currency: 'INR',
    account_number_mask: '•••• 3390',
    is_shared: false,
    created_at: '2026-03-01T12:00:00Z',
  },
];

export const DEMO_BUDGET: Budget = {
  id: 'bgt-sep-2026',
  family_id: 'fam-demo-001',
  name: 'September 2026 Family Budget',
  period: 'monthly',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  total_amount: 8500000, // ₹85,000
  created_by: 'user-arun',
  alert_thresholds: [70, 80, 90, 100],
  categories: [
    { id: 'bc-1', budget_id: 'bgt-sep-2026', category_id: 'cat-housing', allocated_amount: 2000000 }, // ₹20,000
    { id: 'bc-2', budget_id: 'bgt-sep-2026', category_id: 'cat-food', allocated_amount: 1800000 },    // ₹18,000 (spent ₹15,200)
    { id: 'bc-3', budget_id: 'bgt-sep-2026', category_id: 'cat-transport', allocated_amount: 1000000 }, // ₹10,000 (spent ₹8,500)
    { id: 'bc-4', budget_id: 'bgt-sep-2026', category_id: 'cat-education', allocated_amount: 1000000 }, // ₹10,000 (spent ₹7,000)
    { id: 'bc-5', budget_id: 'bgt-sep-2026', category_id: 'cat-entertainment', allocated_amount: 500000 }, // ₹5,000 (spent ₹3,000)
    { id: 'bc-6', budget_id: 'bgt-sep-2026', category_id: 'cat-utilities', allocated_amount: 700000 },   // ₹7,000
    { id: 'bc-7', budget_id: 'bgt-sep-2026', category_id: 'cat-savings', allocated_amount: 1500000 },    // ₹15,000
  ],
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-18T10:00:00Z',
};

export const DEMO_TRANSACTIONS: Transaction[] = [
  // Father (Raj Kumar)
  {
    id: 'tx-001',
    family_id: 'fam-demo-001',
    user_id: 'user-raj',
    account_id: 'acc-hdfc',
    category_id: 'cat-salary',
    type: 'income',
    amount: 4000000, // ₹40,000
    description: 'Monthly Salary Credit',
    transaction_date: '2026-09-01T10:00:00Z',
    payment_method: 'Direct Bank Transfer',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'tx-002',
    family_id: 'fam-demo-001',
    user_id: 'user-raj',
    account_id: 'acc-hdfc',
    category_id: 'cat-investment-inc',
    type: 'income',
    amount: 2500000, // ₹25,000
    description: 'Mutual Fund Dividend & FD Interest',
    transaction_date: '2026-09-03T11:00:00Z',
    payment_method: 'Net Banking',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-03T11:00:00Z',
    updated_at: '2026-09-03T11:00:00Z',
  },
  {
    id: 'tx-003',
    family_id: 'fam-demo-001',
    user_id: 'user-raj',
    account_id: 'acc-hdfc',
    category_id: 'cat-rent',
    type: 'expense',
    amount: 2000000, // ₹20,000
    description: 'Monthly Apartment Rent',
    transaction_date: '2026-09-02T11:00:00Z',
    payment_method: 'Net Banking NEFT',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-02T11:00:00Z',
    updated_at: '2026-09-02T11:00:00Z',
  },
  {
    id: 'tx-004',
    family_id: 'fam-demo-001',
    user_id: 'user-raj',
    account_id: 'acc-hdfc',
    category_id: 'cat-bills',
    type: 'expense',
    amount: 800000, // ₹8,000
    description: 'Electricity, Gas & Water Bills',
    transaction_date: '2026-09-04T12:00:00Z',
    payment_method: 'UPI',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-04T12:00:00Z',
    updated_at: '2026-09-04T12:00:00Z',
  },

  // Mother (Priya Kumar)
  {
    id: 'tx-005',
    family_id: 'fam-demo-001',
    user_id: 'user-priya',
    account_id: 'acc-sbi',
    category_id: 'cat-freelance',
    type: 'income',
    amount: 2000000, // ₹20,000
    description: 'Consulting & Freelance Design Work',
    transaction_date: '2026-09-02T14:00:00Z',
    payment_method: 'Bank Transfer',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-02T14:00:00Z',
    updated_at: '2026-09-02T14:00:00Z',
  },
  {
    id: 'tx-006',
    family_id: 'fam-demo-001',
    user_id: 'user-priya',
    account_id: 'acc-sbi',
    category_id: 'cat-groceries',
    type: 'expense',
    amount: 250000, // ₹2,500
    description: 'Weekly Organic Vegetables & Dairy',
    transaction_date: '2026-09-03T15:30:00Z',
    payment_method: 'UPI',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-03T15:30:00Z',
    updated_at: '2026-09-03T15:30:00Z',
  },
  {
    id: 'tx-007',
    family_id: 'fam-demo-001',
    user_id: 'user-priya',
    account_id: 'acc-hdfc',
    category_id: 'cat-food',
    type: 'expense',
    amount: 1250000, // ₹12,500
    description: 'Monthly Family Grocery Run & Supermarket',
    transaction_date: '2026-09-05T14:30:00Z',
    payment_method: 'HDFC Debit Card',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-05T14:30:00Z',
    updated_at: '2026-09-05T14:30:00Z',
  },
  {
    id: 'tx-008',
    family_id: 'fam-demo-001',
    user_id: 'user-priya',
    account_id: 'acc-cash',
    category_id: 'cat-transport',
    type: 'expense',
    amount: 500000, // ₹5,000
    description: 'Auto & Cab Commute Expenses',
    transaction_date: '2026-09-08T09:15:00Z',
    payment_method: 'Cash',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-08T09:15:00Z',
    updated_at: '2026-09-08T09:15:00Z',
  },

  // Son (Vignesh E): Monthly Allowance ₹5,000, Spent ₹2,350, Remaining ₹2,650
  {
    id: 'tx-009',
    family_id: 'fam-demo-001',
    user_id: 'user-vignesh',
    account_id: 'acc-anu-wallet',
    category_id: 'cat-food',
    type: 'expense',
    amount: 25000, // ₹250
    description: 'Lunch with College Friends',
    transaction_date: '2026-09-04T13:00:00Z',
    payment_method: 'UPI',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-04T13:00:00Z',
    updated_at: '2026-09-04T13:00:00Z',
  },
  {
    id: 'tx-010',
    family_id: 'fam-demo-001',
    user_id: 'user-vignesh',
    account_id: 'acc-anu-wallet',
    category_id: 'cat-transport',
    type: 'expense',
    amount: 8000, // ₹80
    description: 'College Bus Pass Recharge',
    transaction_date: '2026-09-04T17:00:00Z',
    payment_method: 'Cash',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-04T17:00:00Z',
    updated_at: '2026-09-04T17:00:00Z',
  },
  {
    id: 'tx-011',
    family_id: 'fam-demo-001',
    user_id: 'user-vignesh',
    account_id: 'acc-anu-wallet',
    category_id: 'cat-education',
    type: 'expense',
    amount: 120000, // ₹1,200
    description: 'Computer Science Textbooks & Study Materials',
    transaction_date: '2026-09-05T16:00:00Z',
    payment_method: 'UPI',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-05T16:00:00Z',
    updated_at: '2026-09-05T16:00:00Z',
  },
  {
    id: 'tx-012',
    family_id: 'fam-demo-001',
    user_id: 'user-vignesh',
    account_id: 'acc-anu-wallet',
    category_id: 'cat-shopping',
    type: 'expense',
    amount: 82000, // ₹820
    description: 'Casual Shirt & Notebook Stationery',
    transaction_date: '2026-09-06T18:00:00Z',
    payment_method: 'UPI',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-06T18:00:00Z',
    updated_at: '2026-09-06T18:00:00Z',
  },

  // Daughter (Ananya Kumar)
  {
    id: 'tx-013',
    family_id: 'fam-demo-001',
    user_id: 'user-ananya',
    account_id: 'acc-anu-wallet',
    category_id: 'cat-education',
    type: 'expense',
    amount: 120000, // ₹1,200
    description: 'School Science Project Kit',
    transaction_date: '2026-09-05T15:00:00Z',
    payment_method: 'UPI',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-05T15:00:00Z',
    updated_at: '2026-09-05T15:00:00Z',
  },
  {
    id: 'tx-014',
    family_id: 'fam-demo-001',
    user_id: 'user-ananya',
    account_id: 'acc-anu-wallet',
    category_id: 'cat-food',
    type: 'expense',
    amount: 30000, // ₹300
    description: 'Snacks & Ice Cream with Classmates',
    transaction_date: '2026-09-07T16:30:00Z',
    payment_method: 'Cash',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-07T16:30:00Z',
    updated_at: '2026-09-07T16:30:00Z',
  },

  // Grandparent (Lakshmi Kumar)
  {
    id: 'tx-015',
    family_id: 'fam-demo-001',
    user_id: 'user-lakshmi',
    account_id: 'acc-sbi',
    category_id: 'cat-pension',
    type: 'income',
    amount: 1500000, // ₹15,000
    description: 'Monthly Senior Pension Deposit',
    transaction_date: '2026-09-01T09:00:00Z',
    payment_method: 'Bank Transfer',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-01T09:00:00Z',
  },
  {
    id: 'tx-016',
    family_id: 'fam-demo-001',
    user_id: 'user-lakshmi',
    account_id: 'acc-cash',
    category_id: 'cat-healthcare',
    type: 'expense',
    amount: 300000, // ₹3,000
    description: 'Monthly Prescription Medications & Health Check',
    transaction_date: '2026-09-05T10:30:00Z',
    payment_method: 'Cash',
    is_shared: true,
    status: 'cleared',
    created_at: '2026-09-05T10:30:00Z',
    updated_at: '2026-09-05T10:30:00Z',
  },
];

export const DEMO_SAVINGS_GOALS: SavingsGoal[] = [
  {
    id: 'goal-edu',
    family_id: 'fam-demo-001',
    name: 'Education Fund',
    description: 'Long-term higher education fund for college and specialized coaching.',
    target_amount: 20000000, // ₹200,000
    current_amount: 12000000, // ₹120,000 (60% achieved)
    target_date: '2027-12-31',
    created_by: 'user-arun',
    status: 'in_progress',
    icon: 'GraduationCap',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
  },
  {
    id: 'goal-emer',
    family_id: 'fam-demo-001',
    name: 'Emergency Fund',
    description: '6-month contingency cushion in high-yield fixed deposits.',
    target_amount: 30000000, // ₹300,000
    current_amount: 21500000, // ₹215,000
    target_date: '2027-06-30',
    created_by: 'user-arun',
    status: 'in_progress',
    icon: 'ShieldCheck',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'goal-vac',
    family_id: 'fam-demo-001',
    name: 'Annual Vacation',
    description: 'Family holiday trip to Ladakh and Himachal.',
    target_amount: 8000000, // ₹80,000
    current_amount: 4500000, // ₹45,000
    target_date: '2027-05-15',
    created_by: 'user-priya',
    status: 'in_progress',
    icon: 'Plane',
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-08-20T10:00:00Z',
  },
];

export const DEMO_REQUESTS: ExpenseRequest[] = [
  {
    id: 'req-001',
    family_id: 'fam-demo-001',
    requested_by: 'user-vignesh',
    requester_name: 'Vignesh E (Son)',
    amount: 0,
    category_id: 'cat-education',
    title: 'Permission request: View Family Summary',
    description: 'I need permission to view the family monthly summary for college finance project.',
    request_type: 'permission_request',
    status: 'pending',
    created_at: '2026-09-22T08:30:00Z',
  },
  {
    id: 'req-002',
    family_id: 'fam-demo-001',
    requested_by: 'user-vignesh',
    requester_name: 'Vignesh E (Son)',
    amount: 25000, // ₹250
    category_id: 'cat-food',
    title: 'Expense correction: College Canteen Lunch',
    description: 'Entered ₹250 instead of ₹230 for canteen lunch, please approve adjustment.',
    request_type: 'expense_correction',
    status: 'pending',
    created_at: '2026-09-21T14:15:00Z',
  },
  {
    id: 'req-003',
    family_id: 'fam-demo-001',
    requested_by: 'user-ananya',
    requester_name: 'Ananya Kumar (Daughter)',
    amount: 120000, // ₹1,200
    category_id: 'cat-education',
    title: 'Science Olympiad Registration Fee',
    description: 'National science olympiad registration and preparatory workbook fee.',
    request_type: 'custom_request',
    status: 'approved',
    reviewed_by: 'user-raj',
    reviewer_name: 'Father (Raj Kumar)',
    reviewed_at: '2026-09-20T16:00:00Z',
    review_comment: 'Approved! Best of luck for the olympiad preparation.',
    created_at: '2026-09-20T10:00:00Z',
  },
];

export const DEMO_RECURRING: RecurringTransaction[] = [
  {
    id: 'rec-rent',
    family_id: 'fam-demo-001',
    created_by: 'user-arun',
    category_id: 'cat-housing',
    amount: 2000000, // ₹20,000
    type: 'expense',
    frequency: 'monthly',
    next_date: '2026-10-02',
    description: 'Apartment Monthly Rent',
    active: true,
    account_id: 'acc-hdfc',
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'rec-electricity',
    family_id: 'fam-demo-001',
    created_by: 'user-priya',
    category_id: 'cat-utilities',
    amount: 250000, // ₹2,500
    type: 'expense',
    frequency: 'monthly',
    next_date: '2026-09-24',
    description: 'State Power Electricity Bill',
    active: true,
    account_id: 'acc-hdfc',
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'rec-wifi',
    family_id: 'fam-demo-001',
    created_by: 'user-arun',
    category_id: 'cat-utilities',
    amount: 120000, // ₹1,200
    type: 'expense',
    frequency: 'monthly',
    next_date: '2026-09-28',
    description: 'Fiber Internet 300 Mbps',
    active: true,
    account_id: 'acc-hdfc',
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'rec-school',
    family_id: 'fam-demo-001',
    created_by: 'user-arun',
    category_id: 'cat-education',
    amount: 600000, // ₹6,000
    type: 'expense',
    frequency: 'monthly',
    next_date: '2026-10-05',
    description: 'School Bus & Tuition Fee',
    active: true,
    account_id: 'acc-hdfc',
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    id: 'rec-emi',
    family_id: 'fam-demo-001',
    created_by: 'user-arun',
    category_id: 'cat-housing',
    amount: 1500000, // ₹15,000
    type: 'expense',
    frequency: 'monthly',
    next_date: '2026-10-10',
    description: 'Home Renovation Loan EMI',
    active: true,
    account_id: 'acc-sbi',
    created_at: '2026-01-01T09:00:00Z',
  },
];

export const DEMO_APPROVAL_RULES: ApprovalRule[] = [
  {
    id: 'rule-auto',
    family_id: 'fam-demo-001',
    name: 'Micro Expenses Auto-Approval',
    min_amount: 0,
    max_amount: 50000, // Under ₹500
    required_role: 'ADULT_MEMBER',
    auto_approved: true,
    applies_to_children_only: false,
  },
  {
    id: 'rule-medium',
    family_id: 'fam-demo-001',
    name: 'Mid-Tier Family Purchases',
    min_amount: 50000, // ₹500
    max_amount: 200000, // ₹2,000
    required_role: 'CO_MANAGER',
    auto_approved: false,
    applies_to_children_only: false,
  },
  {
    id: 'rule-high',
    family_id: 'fam-demo-001',
    name: 'Major Outlays & Assets',
    min_amount: 200000, // > ₹2,000
    max_amount: 999999999,
    required_role: 'FAMILY_HEAD',
    auto_approved: false,
    applies_to_children_only: false,
  },
  {
    id: 'rule-child-all',
    family_id: 'fam-demo-001',
    name: 'Child Expense Strict Verification',
    min_amount: 0,
    max_amount: 999999999,
    required_role: 'CO_MANAGER',
    auto_approved: false,
    applies_to_children_only: true,
  },
];

export const DEMO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    user_id: 'user-raj',
    family_id: 'fam-demo-001',
    type: 'request_created',
    title: 'New request from Vignesh',
    message: 'Permission request: View Family Summary',
    read_at: null,
    created_at: '2026-09-22T08:30:00Z',
  },
  {
    id: 'notif-2',
    user_id: 'user-raj',
    family_id: 'fam-demo-001',
    type: 'member_activity',
    title: 'New expense added by Son',
    message: 'Vignesh recorded ₹250 for Food (Lunch)',
    read_at: null,
    created_at: '2026-09-22T13:00:00Z',
  },
  {
    id: 'notif-3',
    user_id: 'user-raj',
    family_id: 'fam-demo-001',
    type: 'request_created',
    title: 'Permission request from Daughter',
    message: 'Ananya requested Olympiad fee approval (₹1,200)',
    read_at: null,
    created_at: '2026-09-20T10:00:00Z',
  },
  {
    id: 'notif-4',
    user_id: 'user-vignesh',
    family_id: 'fam-demo-001',
    type: 'request_resolved',
    title: 'Request approved',
    message: 'Father approved your book allowance adjustment.',
    read_at: '2026-09-21T18:00:00Z',
    created_at: '2026-09-21T16:00:00Z',
  },
];

export const DEMO_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'aud-001',
    family_id: 'fam-demo-001',
    user_id: 'user-arun',
    user_name: 'Arun (Family Head)',
    action: 'SPENDING_LIMIT_UPDATED',
    entity_type: 'member',
    entity_id: 'mem-rahul',
    metadata: { details: "Family Head updated Rahul's monthly spending limit to ₹15,000." },
    created_at: '2026-09-18T05:00:00Z',
  },
  {
    id: 'aud-002',
    family_id: 'fam-demo-001',
    user_id: 'user-anu',
    user_name: 'Anu (Child)',
    action: 'REQUEST_SUBMITTED',
    entity_type: 'request',
    entity_id: 'req-001',
    metadata: { details: 'Anu submitted ₹2,500 request for "New School Bag".' },
    created_at: '2026-09-18T04:50:00Z',
  },
  {
    id: 'aud-003',
    family_id: 'fam-demo-001',
    user_id: 'user-priya',
    user_name: 'Priya (Co-Manager)',
    action: 'REQUEST_APPROVED',
    entity_type: 'request',
    entity_id: 'req-003',
    metadata: { details: 'Priya approved ₹800 request for Planetarium Ticket.' },
    created_at: '2026-09-16T15:30:00Z',
  },
  {
    id: 'aud-004',
    family_id: 'fam-demo-001',
    user_id: 'user-arun',
    user_name: 'Arun (Family Head)',
    action: 'BUDGET_UPDATED',
    entity_type: 'budget',
    entity_id: 'bgt-sep-2026',
    metadata: { details: 'Monthly Food & Groceries budget changed from ₹12,000 to ₹18,000.' },
    created_at: '2026-09-01T03:45:00Z',
  },
  {
    id: 'aud-005',
    family_id: 'fam-demo-001',
    user_id: 'user-arun',
    user_name: 'Arun (Family Head)',
    action: 'ROLE_PERMISSION_UPDATED',
    entity_type: 'role',
    entity_id: 'role-comanager',
    metadata: { details: 'Family Head granted reports.export permission to Co-Manager.' },
    created_at: '2026-08-28T08:15:00Z',
  },
];

export const DEMO_LOANS: LoanItem[] = [
  {
    id: 'loan-001',
    family_id: 'fam-demo-001',
    name: 'HDFC Home Improvement Loan',
    type: 'home',
    lender_or_borrower: 'HDFC Bank',
    principal_amount: 50000000, // ₹5,00,000
    interest_rate: 8.75,
    monthly_emi: 1450000, // ₹14,500
    due_day_of_month: 5,
    remaining_balance: 32000000, // ₹3,20,000
    total_paid: 18000000, // ₹1,80,000
    completion_date: '2028-11-05',
    status: 'active',
    created_at: '2024-11-05T00:00:00Z',
  },
  {
    id: 'loan-002',
    family_id: 'fam-demo-001',
    name: 'Electric Vehicle Loan (Tata Nexon EV)',
    type: 'vehicle',
    lender_or_borrower: 'SBI Auto Loans',
    principal_amount: 80000000, // ₹8,00,000
    interest_rate: 7.9,
    monthly_emi: 1820000, // ₹18,200
    due_day_of_month: 10,
    remaining_balance: 44000000, // ₹4,40,000
    total_paid: 36000000, // ₹3,60,000
    completion_date: '2027-04-10',
    status: 'active',
    created_at: '2023-04-10T00:00:00Z',
  },
  {
    id: 'loan-003',
    family_id: 'fam-demo-001',
    name: 'Education Laptop No-Cost EMI (Rahul)',
    type: 'education',
    lender_or_borrower: 'Bajaj Finserv Consumer',
    principal_amount: 7500000, // ₹75,000
    interest_rate: 0,
    monthly_emi: 1250000, // ₹12,500
    due_day_of_month: 15,
    remaining_balance: 2500000, // ₹25,000
    total_paid: 5000000, // ₹50,000
    completion_date: '2026-11-15',
    status: 'active',
    created_at: '2026-05-15T00:00:00Z',
  },
];

export const DEMO_INVESTMENTS: InvestmentAsset[] = [
  {
    id: 'inv-001',
    family_id: 'fam-demo-001',
    name: 'Mirae Asset Large & Midcap Fund',
    type: 'mutual_fund',
    institution: 'Zerodha Coin',
    invested_amount: 35000000, // ₹3,50,000
    current_value: 44800000, // ₹4,48,000 (+28%)
    purchase_date: '2023-01-15',
    notes: 'Monthly SIP of ₹10,000',
  },
  {
    id: 'inv-002',
    family_id: 'fam-demo-001',
    name: 'Parag Parikh Flexi Cap Fund',
    type: 'mutual_fund',
    institution: 'Groww',
    invested_amount: 25000000, // ₹2,50,000
    current_value: 33500000, // ₹3,35,000 (+34%)
    purchase_date: '2023-03-20',
    notes: 'Long term family wealth corpus',
  },
  {
    id: 'inv-003',
    family_id: 'fam-demo-001',
    name: 'Sovereign Gold Bonds (SGB 2024)',
    type: 'gold',
    institution: 'RBI / HDFC Sec',
    invested_amount: 20000000, // ₹2,00,000
    current_value: 26800000, // ₹2,68,000 (+34%)
    units: 32,
    purchase_date: '2024-02-12',
    notes: '2.5% semi-annual interest payout',
  },
  {
    id: 'inv-004',
    family_id: 'fam-demo-001',
    name: 'HDFC Cumulative Tax Saver FD',
    type: 'fixed_deposit',
    institution: 'HDFC Bank',
    invested_amount: 15000000, // ₹1,50,000
    current_value: 16250000, // ₹1,62,500
    purchase_date: '2025-06-01',
    notes: '7.25% fixed return for 3 years',
  },
  {
    id: 'inv-005',
    family_id: 'fam-demo-001',
    name: 'Public Provident Fund (PPF Arun)',
    type: 'ppf',
    institution: 'State Bank of India',
    invested_amount: 45000000, // ₹4,50,000
    current_value: 52000000, // ₹5,20,000
    purchase_date: '2022-04-05',
    notes: 'Tax-free compounding (7.1%)',
  },
];

export const DEMO_SHARED_EXPENSES: SharedExpenseSplit[] = [
  {
    id: 'split-001',
    family_id: 'fam-demo-001',
    title: 'Electricity & Utility Bill (September)',
    total_amount: 300000, // ₹3,000
    paid_by_member_id: 'mem-arun',
    paid_by_member_name: 'Arun',
    category_id: 'cat-utilities',
    date: '2026-09-10',
    split_type: 'equal',
    shares: [
      { member_id: 'mem-arun', member_name: 'Arun (Father)', amount: 100000, settled: true, settled_at: '2026-09-10T10:00:00Z' },
      { member_id: 'mem-priya', member_name: 'Priya (Mother)', amount: 100000, settled: true, settled_at: '2026-09-12T14:30:00Z' },
      { member_id: 'mem-rahul', member_name: 'Rahul (You)', amount: 100000, settled: false },
    ],
    created_at: '2026-09-10T09:00:00Z',
  },
  {
    id: 'split-002',
    family_id: 'fam-demo-001',
    title: 'High-Speed Fiber Broadband Bill',
    total_amount: 150000, // ₹1,500
    paid_by_member_id: 'mem-priya',
    paid_by_member_name: 'Priya',
    category_id: 'cat-utilities',
    date: '2026-09-08',
    split_type: 'equal',
    shares: [
      { member_id: 'mem-arun', member_name: 'Arun', amount: 50000, settled: true, settled_at: '2026-09-09T11:00:00Z' },
      { member_id: 'mem-priya', member_name: 'Priya', amount: 50000, settled: true, settled_at: '2026-09-08T10:00:00Z' },
      { member_id: 'mem-rahul', member_name: 'Rahul', amount: 50000, settled: false },
    ],
    created_at: '2026-09-08T10:00:00Z',
  },
  {
    id: 'split-003',
    family_id: 'fam-demo-001',
    title: 'Organic Grocery Supermarket Bulk Haul',
    total_amount: 600000, // ₹6,000
    paid_by_member_id: 'mem-arun',
    paid_by_member_name: 'Arun',
    category_id: 'cat-groceries',
    date: '2026-09-14',
    split_type: 'custom',
    shares: [
      { member_id: 'mem-arun', member_name: 'Arun', amount: 350000, settled: true, settled_at: '2026-09-14T12:00:00Z' },
      { member_id: 'mem-priya', member_name: 'Priya', amount: 250000, settled: true, settled_at: '2026-09-15T09:00:00Z' },
    ],
    created_at: '2026-09-14T11:30:00Z',
  },
];
