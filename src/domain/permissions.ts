/* =========================================================================
   FamilyFinanceSync — Canonical Authorization Vocabulary & Policy Engine
   ONE vocabulary shared by UI, API contracts and the database
   (database/migrations/003_authorization_privacy_ledger.sql, section 2).
   
   The frontend uses this to shape the UI. The database enforces it.
   ========================================================================= */

export const PERMISSIONS = [
  { key: 'family.view', group: 'Family', description: 'View family workspace' },
  { key: 'family.update', group: 'Family', description: 'Update family settings' },
  { key: 'members.view', group: 'Members', description: 'View family members list' },
  { key: 'members.view_finances', group: 'Members', description: 'View shared financial summaries of other members' },
  { key: 'members.invite', group: 'Members', description: 'Invite family members' },
  { key: 'members.remove', group: 'Members', description: 'Remove family members' },
  { key: 'members.update_role', group: 'Members', description: "Change a member's role" },
  { key: 'roles.view', group: 'Roles & Permissions', description: 'View roles' },
  { key: 'roles.manage', group: 'Roles & Permissions', description: 'Create, edit and delete custom roles' },
  { key: 'permissions.view', group: 'Roles & Permissions', description: 'View permission configuration' },
  { key: 'permissions.update', group: 'Roles & Permissions', description: 'Change role and member permissions' },
  { key: 'transactions.create_income', group: 'Transactions', description: 'Record own income' },
  { key: 'transactions.create_expense', group: 'Transactions', description: 'Record own expenses' },
  { key: 'transactions.view_own', group: 'Transactions', description: 'View own transactions' },
  { key: 'transactions.view_family', group: 'Transactions', description: "View other members' shared transactions" },
  { key: 'transactions.update_own', group: 'Transactions', description: 'Edit own transactions' },
  { key: 'transactions.update_any', group: 'Transactions', description: 'Edit any visible family transaction' },
  { key: 'transactions.delete_own', group: 'Transactions', description: 'Void own transactions' },
  { key: 'transactions.delete_any', group: 'Transactions', description: 'Void any visible family transaction' },
  { key: 'family_finance.view', group: 'Family Finance', description: 'View family financial summary' },
  { key: 'accounts.view', group: 'Accounts', description: 'View shared accounts' },
  { key: 'accounts.manage', group: 'Accounts', description: 'Create and manage accounts' },
  { key: 'budgets.view', group: 'Budgets', description: 'View budgets' },
  { key: 'budgets.manage', group: 'Budgets', description: 'Create and manage budgets' },
  { key: 'goals.view', group: 'Goals', description: 'View savings goals' },
  { key: 'goals.manage', group: 'Goals', description: 'Create and manage savings goals' },
  { key: 'requests.create', group: 'Requests', description: 'Send requests to the family head' },
  { key: 'requests.view', group: 'Requests', description: 'View own requests' },
  { key: 'requests.approve', group: 'Requests', description: 'Approve requests' },
  { key: 'requests.reject', group: 'Requests', description: 'Reject requests' },
  { key: 'notifications.view', group: 'Notifications', description: 'Receive notifications' },
  { key: 'reports.view', group: 'Reports', description: 'View reports' },
  { key: 'reports.export', group: 'Reports', description: 'Export reports' },
  { key: 'audit.view', group: 'Internal', description: 'View internal audit log' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map(p => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(value);
}

/* ------------------------------- Roles ---------------------------------- */

export type SystemRoleId = 'FAMILY_HEAD' | 'SPOUSE' | 'SON' | 'DAUGHTER' | 'GRANDPARENT' | 'VIEWER';
export type RoleId = SystemRoleId | (string & {});

const MEMBER_BASE: PermissionKey[] = [
  'family.view',
  'members.view',
  'transactions.create_income',
  'transactions.create_expense',
  'transactions.view_own',
  'transactions.update_own',
  'requests.create',
  'requests.view',
  'notifications.view',
];

/** Must match the role_permissions seed in migration 003. */
export const SYSTEM_ROLE_DEFAULTS: Record<SystemRoleId, { name: string; description: string; permissions: PermissionKey[] }> = {
  FAMILY_HEAD: { name: 'Family Head', description: 'Full family management access.', permissions: [...ALL_PERMISSION_KEYS] },
  SPOUSE: {
    name: 'Spouse',
    description: 'Own finances; more access can be granted by the Family Head.',
    permissions: [...MEMBER_BASE, 'budgets.view', 'goals.view', 'accounts.view', 'transactions.delete_own'],
  },
  SON: { name: 'Son', description: 'Own income, expenses and requests.', permissions: [...MEMBER_BASE] },
  DAUGHTER: { name: 'Daughter', description: 'Own income, expenses and requests.', permissions: [...MEMBER_BASE] },
  GRANDPARENT: { name: 'Grand Parent', description: 'Own income, expenses and requests.', permissions: [...MEMBER_BASE, 'budgets.view'] },
  VIEWER: {
    name: 'Viewer',
    description: 'View-only access to permitted family information.',
    permissions: ['family.view', 'members.view', 'notifications.view', 'requests.create', 'requests.view'],
  },
};

export const SYSTEM_ROLE_IDS = Object.keys(SYSTEM_ROLE_DEFAULTS) as SystemRoleId[];

/** Maps legacy role spellings to canonical IDs. */
export function normalizeRoleId(raw: string | null | undefined): RoleId {
  const value = (raw ?? '').trim();
  if (!value) return 'VIEWER';
  if (value.startsWith('C_') || value.startsWith('custom-') || value.startsWith('role-custom')) return value;
  const r = value.toLowerCase();
  if (r.includes('head')) return 'FAMILY_HEAD';
  if (r.includes('spouse') || r.includes('co_manager') || r.includes('comanager') || r.includes('adult')) return 'SPOUSE';
  if (r.includes('daughter')) return 'DAUGHTER';
  if (r === 'son' || r.includes('role-son') || r === 'child' || r.includes('child')) return r.includes('daughter') ? 'DAUGHTER' : 'SON';
  if (r.includes('grand')) return 'GRANDPARENT';
  if (r.includes('viewer')) return 'VIEWER';
  return value;
}

export function roleDisplayName(roleId: RoleId, customName?: string): string {
  if (customName) return customName;
  const canonical = normalizeRoleId(roleId);
  if (canonical in SYSTEM_ROLE_DEFAULTS) {
    return SYSTEM_ROLE_DEFAULTS[canonical as SystemRoleId].name;
  }
  return roleId;
}

/* -------------------------- Policy Engine ------------------------------- */

export interface PermissionContext {
  roleId: RoleId;
  isOwner: boolean;
  /** Family-scoped overrides of a role's permissions. */
  familyRoleOverrides?: Record<string, any>;
  /** Custom role permissions. */
  customRolePermissions?: Record<string, any>;
  /** Member-scoped overrides. */
  memberOverrides?: Partial<Record<PermissionKey, boolean>> | any;
}

/**
 * Evaluates an effective permission following the exact hierarchy enforced in SQL:
 * 1. Family Owner -> ALWAYS TRUE (prevents family lockout)
 * 2. Member Override (`member_permissions`)
 * 3. Family Role Override (`family_role_permissions`)
 * 4. System Role Default (`role_permissions`)
 */
export function evaluatePermission(ctx: PermissionContext, permission: PermissionKey): boolean {
  // 1. Owner has full authority
  if (ctx.isOwner) return true;

  // 2. Member-specific override
  if (ctx.memberOverrides && typeof ctx.memberOverrides[permission] === 'boolean') {
    return ctx.memberOverrides[permission]!;
  }

  // 3. Family-scoped role override
  const canonicalRole = normalizeRoleId(ctx.roleId);
  const roleOverride = ctx.familyRoleOverrides?.[canonicalRole] ?? ctx.familyRoleOverrides?.[ctx.roleId];
  if (roleOverride && typeof roleOverride[permission] === 'boolean') {
    return roleOverride[permission]!;
  }

  // 4. Custom role permissions
  const custom = ctx.customRolePermissions?.[ctx.roleId];
  if (custom) {
    if (Array.isArray(custom)) return custom.includes(permission);
    if (typeof custom[permission] === 'boolean') return custom[permission]!;
  }

  // 5. System role defaults
  if (canonicalRole in SYSTEM_ROLE_DEFAULTS) {
    return SYSTEM_ROLE_DEFAULTS[canonicalRole as SystemRoleId].permissions.includes(permission);
  }

  return false;
}

/**
 * Mapping between legacy camelCase permission names and canonical dot-notation keys.
 */
export const LEGACY_PERMISSION_MAP: Record<string, PermissionKey> = {
  addExpense: 'transactions.create_expense',
  addIncome: 'transactions.create_income',
  viewOwnTransactions: 'transactions.view_own',
  editOwnTransaction: 'transactions.update_own',
  editAnyTransaction: 'transactions.update_any',
  deleteOwnTransaction: 'transactions.delete_own',
  deleteAnyTransaction: 'transactions.delete_any',
  viewDashboard: 'family.view',
  viewFamilyIncome: 'transactions.view_family',
  viewFamilyExpenses: 'transactions.view_family',
  viewOtherMembers: 'members.view_finances',
  viewFamilySummary: 'family_finance.view',
  viewAccounts: 'accounts.view',
  manageAccounts: 'accounts.manage',
  viewBudget: 'budgets.view',
  manageBudget: 'budgets.manage',
  viewReports: 'reports.view',
  exportReports: 'reports.export',
  viewMembers: 'members.view',
  inviteMembers: 'members.invite',
  removeMembers: 'members.remove',
  manageRoles: 'roles.manage',
  managePermissions: 'permissions.update',
  manageFamilySettings: 'family.update',
  sendRequest: 'requests.create',
  receiveNotifications: 'notifications.view',
};

export function resolvePermissionKey(name: string): PermissionKey {
  if (isPermissionKey(name)) return name;
  return LEGACY_PERMISSION_MAP[name] ?? 'family.view';
}
