/* =========================================================
   FAMILY FINANCE SYNC — DOMAIN DATA CONTRACTS & TYPE SCHEMAS
   ========================================================= */

export type FamilyRole =
  | 'family_head'
  | 'spouse'
  | 'son'
  | 'daughter'
  | 'child'
  | 'grandparent'
  | 'viewer'
  | string;

export type SystemRoleType = 
  | 'FAMILY_HEAD' 
  | 'CO_MANAGER' 
  | 'ADULT_MEMBER' 
  | 'CHILD' 
  | 'VIEWER'
  | 'SON'
  | 'DAUGHTER'
  | 'GRANDPARENT'
  | FamilyRole;

// The Standard Permissions organized into 5 clean groups (Section 18)
export interface RolePermissions {
  // Financial
  addExpense: boolean;
  addIncome: boolean;
  viewOwnTransactions: boolean;
  editOwnTransaction: boolean;
  editAnyTransaction?: boolean;
  deleteOwnTransaction?: boolean;
  deleteAnyTransaction?: boolean;

  // Family
  viewDashboard: boolean;
  viewFamilyIncome: boolean;
  viewFamilyExpenses: boolean;
  viewOtherMembers?: boolean;
  viewFamilySummary?: boolean;

  // Management
  viewAccounts: boolean;
  manageAccounts: boolean;
  viewBudget: boolean;
  manageBudget: boolean;
  viewReports: boolean;
  exportReports: boolean;
  viewMembers: boolean;
  inviteMembers: boolean;
  removeMembers: boolean;
  manageRoles: boolean;
  managePermissions: boolean;
  manageFamilySettings: boolean;

  // Requests
  sendRequest?: boolean;

  // Notifications
  receiveNotifications?: boolean;
}

export type PermissionKey =
  | 'family.view'
  | 'family.update'
  | 'family.summary'
  | 'members.view'
  | 'members.view_finances'
  | 'members.invite'
  | 'members.remove'
  | 'members.update_role'
  | 'members.update_permissions'
  | 'roles.view'
  | 'roles.manage'
  | 'permissions.view'
  | 'permissions.update'
  | 'transactions.create_income'
  | 'transactions.create_expense'
  | 'transactions.view'
  | 'transactions.view_own'
  | 'transactions.view_family'
  | 'transactions.create'
  | 'transactions.update'
  | 'transactions.update_own'
  | 'transactions.update_any'
  | 'transactions.delete'
  | 'transactions.delete_own'
  | 'transactions.delete_any'
  | 'family_finance.view'
  | 'budgets.view'
  | 'budgets.manage'
  | 'budgets.create'
  | 'budgets.update'
  | 'budgets.delete'
  | 'accounts.view'
  | 'accounts.manage'
  | 'accounts.create'
  | 'accounts.update'
  | 'accounts.delete'
  | 'requests.view'
  | 'requests.create'
  | 'requests.approve'
  | 'requests.reject'
  | 'goals.view'
  | 'goals.manage'
  | 'goals.create'
  | 'goals.update'
  | 'goals.delete'
  | 'reports.view'
  | 'reports.export'
  | 'audit.view'
  | 'notifications.view'
  | 'notifications.receive'
  | keyof RolePermissions
  | (string & {});

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  location?: string;
  bio?: string;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  name: string;
  owner_id: string;
  created_by?: string;
  currency: string; // Default: 'INR'
  timezone: string;
  invite_code?: string;
  family_code?: string;
  description?: string;
  country?: string;
  created_at: string;
  updated_at: string;
}

export type FamilyMembershipRole = 'owner' | 'admin' | 'member' | 'viewer' | SystemRoleType;

export interface FamilyMembership {
  family_id: string;
  family_name: string;
  role: FamilyMembershipRole;
  status: 'active' | 'pending' | 'invited' | 'removed';
  member_count: number;
  invite_code?: string;
  family_code?: string;
  description?: string;
  currency?: string;
  joined_at?: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  user: User;
  role: SystemRoleType;
  status: 'active' | 'pending' | 'suspended';
  joined_at: string;
  created_at: string;
  income_sharing_enabled?: boolean;
  expense_sharing_enabled?: boolean;
  custom_permissions?: Partial<Record<PermissionKey, boolean>>;
  monthly_allowance?: number; // In paise
  monthly_spending_limit?: number; // In paise
}

export interface RoleDefinition {
  id: string;
  name: string;
  title?: string;
  description: string;
  is_system_role?: boolean;
  is_custom?: boolean;
  default_permissions: PermissionKey[];
  permissions?: Record<string, boolean | number | undefined>;
}

export interface Category {
  id: string;
  family_id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
  is_default: boolean;
}

export type AccountType = 
  | 'cash' 
  | 'bank' 
  | 'savings' 
  | 'credit_card' 
  | 'debit_card' 
  | 'upi_wallet' 
  | 'digital_wallet' 
  | 'investment' 
  | 'loan'
  | 'wallet';

export type VisibilityClassification =
  | 'PERSONAL'
  | 'FAMILY_SHARED'
  | 'FAMILY_HEAD_ONLY'
  | 'MEMBER_SPECIFIC'
  | 'PENDING_APPROVAL';

export interface FamilyInvitation {
  id: string;
  family_id: string;
  invite_code: string;
  invite_link: string;
  invited_role: SystemRoleType;
  email?: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'DECLINED';
  created_by: string;
  created_at: string;
  expires_at: string;
}

export interface AllowanceConfig {
  id: string;
  family_id: string;
  member_id: string;
  member_name: string;
  period: 'weekly' | 'monthly';
  base_allowance: number; // in paise
  savings_percentage: number; // e.g. 20 for 20%
  auto_disburse: boolean;
  bonus_balance: number; // in paise
  next_disbursement_date: string;
  created_at: string;
}

export interface Account {
  id: string;
  family_id: string;
  name: string;
  type: AccountType;
  balance: number; // In paise
  currency: string;
  account_number_mask?: string;
  is_shared: boolean;
  visibility?: VisibilityClassification;
  owner_member_id?: string;
  created_at: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment';

export type VisibilitySetting = 'private' | 'family';

export interface Transaction {
  id: string;
  family_id: string | null;
  user_id: string;
  account_id: string;
  category_id: string;
  custom_category?: string | null;
  type: TransactionType;
  amount: number; // In paise
  description: string;
  transaction_date: string;
  payment_method: string;
  paymentMethod?: string;
  notes?: string;
  is_shared: boolean;
  visibility?: VisibilityClassification | string;
  internal_transfer_type?: 'member_transfer' | 'allowance' | 'standard';
  idempotency_key?: string;
  voided_reason?: string;
  status: 'cleared' | 'pending' | 'reconciled' | 'voided';
  receipt_url?: string;
  from_account_id?: string;
  to_account_id?: string;
  source?: 'manual' | 'import' | 'recurring' | string;
  source_file_id?: string;
  import_batch_id?: string;
  fingerprint?: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category_id: string;
  allocated_amount: number; // In paise
}

export interface Budget {
  id: string;
  family_id: string;
  name: string;
  period: 'monthly' | 'weekly';
  start_date: string;
  end_date: string;
  total_amount: number; // In paise
  created_by: string;
  categories: BudgetCategory[];
  alert_thresholds?: number[]; // e.g. [70, 80, 90, 100]
  created_at: string;
  updated_at: string;
}

export interface SpendingLimit {
  id: string;
  family_id: string;
  member_id: string;
  category_id?: string; // Optional: specific category limit or overall
  period: 'monthly' | 'weekly';
  limit_amount: number; // In paise
  created_by: string;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  family_id: string | null;
  visibility?: 'private' | 'family';
  name: string;
  description: string;
  target_amount: number; // In paise
  current_amount: number; // In paise
  target_date: string;
  created_by: string;
  status: 'in_progress' | 'completed' | 'paused';
  icon?: string;
  created_at: string;
  updated_at: string;
}

export type RequestType =
  | 'permission_request'
  | 'expense_approval'
  | 'expense_correction'
  | 'income_correction'
  | 'add_member'
  | 'add_family_member'
  | 'remove_member'
  | 'remove_family_member'
  | 'custom_request';

export interface ExpenseRequest {
  id: string;
  family_id: string;
  requested_by: string;
  requester_name: string;
  member_id?: string;
  member_name?: string;
  amount: number; // In paise
  category_id: string;
  title: string;
  description: string;
  request_type?: RequestType;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by?: string;
  reviewer_name?: string;
  reviewed_at?: string;
  review_comment?: string;
  created_at: string;
  updated_at?: string;
}

export interface RecurringTransaction {
  id: string;
  family_id: string;
  created_by: string;
  category_id: string;
  amount: number; // In paise
  type: 'income' | 'expense';
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_date: string;
  description: string;
  active: boolean;
  account_id: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  family_id: string;
  type: 'budget_alert' | 'request_created' | 'request_resolved' | 'recurring_due' | 'goal_milestone' | 'member_activity' | 'request' | 'info' | (string & {});
  title: string;
  message: string;
  read_at?: string | null;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  family_id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ApprovalRule {
  id: string;
  family_id: string;
  name: string;
  min_amount: number; // In paise
  max_amount: number; // In paise
  required_role: SystemRoleType;
  auto_approved: boolean;
  applies_to_children_only: boolean;
}

export type LoanType = 'personal' | 'education' | 'home' | 'vehicle' | 'credit_card' | 'borrowed' | 'lent';

export interface LoanItem {
  id: string;
  family_id: string | null;
  visibility?: 'private' | 'family';
  user_id?: string;
  name: string;
  type: LoanType;
  lender_or_borrower: string;
  principal_amount: number; // in paise
  interest_rate: number; // e.g. 8.5
  monthly_emi: number; // in paise
  due_day_of_month: number;
  remaining_balance: number; // in paise
  total_paid: number; // in paise
  completion_date: string;
  status: 'active' | 'closed';
  created_at: string;
}

export type InvestmentType = 'mutual_fund' | 'stock' | 'fixed_deposit' | 'gold' | 'bond' | 'ppf' | 'nps' | 'crypto';

export interface InvestmentAsset {
  id: string;
  family_id: string;
  name: string;
  type: InvestmentType;
  institution: string;
  invested_amount: number; // in paise
  current_value: number; // in paise
  units?: number;
  purchase_date: string;
  notes?: string;
}

export interface SplitShare {
  member_id: string;
  member_name: string;
  amount: number; // in paise
  settled: boolean;
  settled_at?: string;
}

export interface SharedExpenseSplit {
  id: string;
  family_id: string;
  title: string;
  total_amount: number; // in paise
  paid_by_member_id: string;
  paid_by_member_name: string;
  category_id: string;
  date: string;
  split_type: 'equal' | 'custom';
  shares: SplitShare[];
  created_at: string;
}
