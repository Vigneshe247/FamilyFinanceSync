/* =========================================================================
   FinanceRepository — The authoritative persistence boundary for FamilyFinanceSync.
   SupabaseFinanceRepository (Cloud: atomic RPCs + PostgreSQL RLS).
   ========================================================================= */

import type {
  Account,
  Category,
  ExpenseRequest,
  Family,
  FamilyMember,
  NotificationItem,
  RoleDefinition,
  Transaction,
  VisibilityClassification,
} from '../types';
import type { PermissionKey, RoleId } from '../domain/permissions';

export interface WorkspaceSnapshot {
  family: Family;
  members: FamilyMember[];
  roles: RoleDefinition[];
  categories: Category[];
  accounts: Account[];
  /** Only rows the current user may see (filtered by database RLS in cloud mode). */
  transactions: Transaction[];
  hasMoreTransactions: boolean;
  requests: ExpenseRequest[];
  notifications: NotificationItem[];
  /** Effective permissions of current user for UI shaping. */
  myPermissions: PermissionKey[];
  currentUserId: string;
}

export interface NewTransactionInput {
  type: 'income' | 'expense' | 'transfer';
  amountPaise: number;
  categoryId: string;
  customCategory?: string | null;
  description: string;
  transactionDate: string;
  paymentMethod?: string;
  notes?: string | null;
  visibility?: VisibilityClassification | string;
  accountId?: string | null;
  idempotencyKey?: string;
}

export interface TransactionPatch {
  amountPaise?: number;
  categoryId?: string;
  description?: string;
  transactionDate?: string;
  paymentMethod?: string;
  customCategory?: string | null;
  notes?: string | null;
  visibility?: VisibilityClassification | string;
}

export interface NewRequestInput {
  type: string;
  title: string;
  description?: string;
  amountPaise?: number | null;
  categoryId?: string | null;
  targetTransactionId?: string | null;
  requestedPermission?: PermissionKey | null;
  idempotencyKey?: string;
}

export interface ProfilePatch {
  full_name?: string;
  phone?: string;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  location?: string | null;
  bio?: string | null;
}

export interface FinanceRepository {
  readonly mode: 'cloud' | 'demo';

  loadWorkspace(): Promise<WorkspaceSnapshot>;
  loadOlderTransactions(beforeIso: string, limit?: number): Promise<Transaction[]>;

  createTransaction(input: NewTransactionInput): Promise<Transaction>;
  updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction>;
  voidTransaction(id: string, reason?: string): Promise<void>;

  createRequest(input: NewRequestInput): Promise<ExpenseRequest>;
  reviewRequest(id: string, decision: 'approved' | 'rejected', comment?: string): Promise<ExpenseRequest>;
  cancelRequest(id: string): Promise<ExpenseRequest>;

  setMemberSharing(memberId: string, income: boolean, expenses: boolean): Promise<void>;
  setMemberPermission(memberId: string, permission: PermissionKey, allowed: boolean | null): Promise<void>;
  assignMemberRole(memberId: string, roleId: RoleId): Promise<void>;
  removeMember(memberId: string): Promise<void>;

  createInvitation(roleId: RoleId, relationship?: string, email?: string): Promise<{ id: string; code: string }>;
  acceptInvitation(code: string): Promise<{ familyId: string; memberId: string }>;
  revokeInvitation(id: string): Promise<void>;

  createRole(name: string, description: string, baseRoleId?: RoleId): Promise<RoleDefinition>;
  setRolePermissions(roleId: RoleId, permissions: Partial<Record<PermissionKey, boolean>>): Promise<void>;
  deleteRole(roleId: RoleId): Promise<void>;

  updateProfile(patch: ProfilePatch): Promise<void>;
  updateFamily(patch: { name?: string; currency?: string; timezone?: string }): Promise<Family>;

  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
}
