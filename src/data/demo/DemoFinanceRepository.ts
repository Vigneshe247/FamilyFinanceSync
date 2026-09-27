/* =========================================================================
   FamilyFinanceSync — Demo Repository
   Same contract as the cloud repository, backed by in-browser demo data.
   Applies the exact same validation, permission and financial privacy rules
   so demo mode mirrors the real production application.
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
} from '../../types';
import {
  ALL_PERMISSION_KEYS,
  evaluatePermission,
  type PermissionContext,
  type PermissionKey,
  type RoleId,
} from '../../domain/permissions';
import { isTransactionVisible, sharingMap } from '../../domain/finance';
import { RepositoryError } from '../errors';
import type {
  FinanceRepository,
  NewRequestInput,
  NewTransactionInput,
  ProfilePatch,
  TransactionPatch,
  WorkspaceSnapshot,
} from '../repository';
import {
  DEMO_FAMILY,
  DEMO_MEMBERS,
  DEMO_CATEGORIES,
  DEMO_ACCOUNTS,
  DEMO_TRANSACTIONS,
  DEMO_REQUESTS,
  DEMO_NOTIFICATIONS,
  ROLE_DEFINITIONS,
} from '../seedData';

export interface DemoState {
  family: Family;
  members: FamilyMember[];
  roles: RoleDefinition[];
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  requests: ExpenseRequest[];
  notifications: NotificationItem[];
}

export interface DemoStoreAccess {
  read: () => DemoState;
  write: (next: Partial<DemoState>) => void;
  currentUserId: () => string;
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export function demoPermissionContext(
  state: Pick<DemoState, 'family' | 'members' | 'roles'>,
  userId: string
): PermissionContext | null {
  const member = state.members.find(m => m.user_id === userId && m.status === 'active');
  if (!member) return null;
  const roleTable = Object.fromEntries(state.roles.map(r => [r.id, r.default_permissions]));
  return {
    roleId: member.role,
    isOwner: state.family.owner_id === userId,
    familyRoleOverrides: roleTable,
    customRolePermissions: roleTable,
    memberOverrides: member.custom_permissions ?? {},
  };
}

export class DemoFinanceRepository implements FinanceRepository {
  readonly mode = 'demo' as const;

  constructor(private readonly store: DemoStoreAccess) {}

  private me(): string {
    return this.store.currentUserId();
  }

  private can(permission: PermissionKey, userId = this.me()): boolean {
    const ctx = demoPermissionContext(this.store.read(), userId);
    return ctx ? evaluatePermission(ctx, permission) : false;
  }

  private memberOf(userId: string): FamilyMember | undefined {
    return this.store.read().members.find(m => m.user_id === userId);
  }

  async loadWorkspace(): Promise<WorkspaceSnapshot> {
    const s = this.store.read();
    const me = this.me();
    const myPerms = ALL_PERMISSION_KEYS.filter(p => this.can(p, me));

    const canViewOwn = this.can('transactions.view_own', me);
    const canViewFamily = this.can('transactions.view_family', me);
    const shares = sharingMap(s.members);

    const visibleTxs = s.transactions.filter(t =>
      isTransactionVisible(t, {
        viewerUserId: me,
        canViewOwn,
        canViewFamily,
        sharing: shares,
      })
    );

    return {
      family: s.family,
      members: s.members,
      roles: s.roles,
      categories: s.categories,
      accounts: s.accounts,
      transactions: visibleTxs,
      hasMoreTransactions: false,
      requests: s.requests.filter(r => r.member_id === me || this.can('requests.approve', me)),
      notifications: s.notifications.filter(n => n.user_id === me),
      myPermissions: myPerms,
      currentUserId: me,
    };
  }

  async loadOlderTransactions(): Promise<Transaction[]> {
    return [];
  }

  async createTransaction(input: NewTransactionInput): Promise<Transaction> {
    const me = this.me();
    const requiredPerm = input.type === 'income' ? 'transactions.create_income' : 'transactions.create_expense';
    if (!this.can(requiredPerm)) {
      throw new RepositoryError('forbidden', `You lack the '${requiredPerm}' permission.`);
    }

    if (!input.amountPaise || input.amountPaise <= 0) {
      throw new RepositoryError('validation', 'Amount must be greater than zero.');
    }

    const s = this.store.read();
    const txId = uid('tx');
    const newTx: Transaction = {
      id: txId,
      family_id: s.family.id,
      user_id: me,
      account_id: input.accountId || '',
      category_id: input.categoryId,
      custom_category: input.customCategory ?? null,
      type: input.type,
      amount: Math.round(input.amountPaise),
      description: input.description.trim(),
      transaction_date: input.transactionDate,
      payment_method: input.paymentMethod || 'Cash',
      paymentMethod: input.paymentMethod || 'Cash',
      notes: input.notes || '',
      is_shared: (input.visibility === 'PERSONAL' ? false : true),
      visibility: input.visibility as any,
      idempotency_key: input.idempotencyKey,
      status: 'cleared',
      created_at: now(),
      updated_at: now(),
    };

    // Atomic ledger balance update
    let updatedAccounts = s.accounts;
    if (input.accountId) {
      const delta = input.type === 'income' ? input.amountPaise : -input.amountPaise;
      updatedAccounts = s.accounts.map(acc =>
        acc.id === input.accountId ? { ...acc, balance: acc.balance + delta } : acc
      );
    }

    this.store.write({
      transactions: [newTx, ...s.transactions],
      accounts: updatedAccounts,
    });

    return newTx;
  }

  async updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction> {
    const s = this.store.read();
    const existing = s.transactions.find(t => t.id === id);
    if (!existing) throw new RepositoryError('not_found', 'Transaction not found');

    const me = this.me();
    const isOwn = existing.user_id === me;
    const required = isOwn ? 'transactions.update_own' : 'transactions.update_any';
    if (!this.can(required)) {
      throw new RepositoryError('forbidden', `You lack the '${required}' permission.`);
    }

    const updated: Transaction = {
      ...existing,
      amount: patch.amountPaise !== undefined ? Math.round(patch.amountPaise) : existing.amount,
      category_id: patch.categoryId ?? existing.category_id,
      description: patch.description ?? existing.description,
      transaction_date: patch.transactionDate ?? existing.transaction_date,
      paymentMethod: patch.paymentMethod ?? existing.paymentMethod,
      custom_category: patch.customCategory !== undefined ? patch.customCategory : existing.custom_category,
      notes: patch.notes !== undefined ? (patch.notes ?? '') : existing.notes,
      visibility: patch.visibility !== undefined ? (patch.visibility as any) : existing.visibility,
      updated_at: now(),
    };

    this.store.write({
      transactions: s.transactions.map(t => (t.id === id ? updated : t)),
    });

    return updated;
  }

  async voidTransaction(id: string, reason?: string): Promise<void> {
    const s = this.store.read();
    const existing = s.transactions.find(t => t.id === id);
    if (!existing) return;

    const me = this.me();
    const isOwn = existing.user_id === me;
    const required = isOwn ? 'transactions.delete_own' : 'transactions.delete_any';
    if (!this.can(required)) {
      throw new RepositoryError('forbidden', `You lack the '${required}' permission.`);
    }

    // Reverse account balance if voided
    let updatedAccounts = s.accounts;
    if (existing.account_id && existing.status !== 'voided') {
      const reverseDelta = existing.type === 'income' ? -existing.amount : existing.amount;
      updatedAccounts = s.accounts.map(acc =>
        acc.id === existing.account_id ? { ...acc, balance: acc.balance + reverseDelta } : acc
      );
    }

    this.store.write({
      transactions: s.transactions.map(t =>
        t.id === id ? { ...t, status: 'voided' as const, voided_reason: reason } : t
      ),
      accounts: updatedAccounts,
    });
  }

  async createRequest(input: NewRequestInput): Promise<ExpenseRequest> {
    if (!this.can('requests.create')) {
      throw new RepositoryError('forbidden', "You lack permission 'requests.create'.");
    }

    const s = this.store.read();
    const me = this.me();
    const req: ExpenseRequest = {
      id: uid('req'),
      family_id: s.family.id,
      requested_by: me,
      requester_name: this.memberOf(me)?.user.name ?? 'Member',
      member_id: me,
      member_name: this.memberOf(me)?.user.name ?? 'Member',
      amount: input.amountPaise ? Math.round(input.amountPaise) : 0,
      category_id: input.categoryId ?? '',
      title: input.title ?? input.description ?? 'Expense Request',
      description: input.description ?? input.title ?? 'Expense Request',
      status: 'pending',
      request_type: (input.type as any) || 'expense',
      created_at: now(),
      updated_at: now(),
    };

    // Generate notification for family head
    const notif: NotificationItem = {
      id: uid('notif'),
      family_id: s.family.id,
      user_id: s.family.owner_id,
      type: 'request',
      title: 'New Family Request',
      message: `${req.member_name} submitted a request: "${input.title}"`,
      created_at: now(),
    };

    this.store.write({
      requests: [req, ...s.requests],
      notifications: [notif, ...s.notifications],
    });

    return req;
  }

  async reviewRequest(id: string, decision: 'approved' | 'rejected', comment?: string): Promise<ExpenseRequest> {
    const required = decision === 'approved' ? 'requests.approve' : 'requests.reject';
    if (!this.can(required)) {
      throw new RepositoryError('forbidden', `You lack the '${required}' permission.`);
    }

    const s = this.store.read();
    const existing = s.requests.find(r => r.id === id);
    if (!existing) throw new RepositoryError('not_found', 'Request not found');

    if (existing.member_id === this.me()) {
      throw new RepositoryError('forbidden', 'You cannot review your own request.');
    }

    const reviewed: ExpenseRequest = {
      ...existing,
      status: decision,
      review_comment: comment,
      reviewed_by: this.me(),
      reviewed_at: now(),
      updated_at: now(),
    };

    const notif: NotificationItem = {
      id: uid('notif'),
      family_id: s.family.id,
      user_id: existing.member_id || existing.requested_by || s.family.owner_id,
      type: 'request',
      title: `Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your request "${existing.description}" was ${decision} by ${this.memberOf(this.me())?.user.name ?? 'the reviewer'}.`,
      created_at: now(),
    };

    this.store.write({
      requests: s.requests.map(r => (r.id === id ? reviewed : r)),
      notifications: [notif, ...s.notifications],
    });

    return reviewed;
  }

  async cancelRequest(id: string): Promise<ExpenseRequest> {
    const s = this.store.read();
    const existing = s.requests.find(r => r.id === id);
    if (!existing) throw new RepositoryError('not_found', 'Request not found');
    if (existing.member_id !== this.me()) {
      throw new RepositoryError('forbidden', 'You can only cancel your own request.');
    }

    const cancelled: ExpenseRequest = {
      ...existing,
      status: 'rejected',
      updated_at: now(),
    };

    this.store.write({
      requests: s.requests.map(r => (r.id === id ? cancelled : r)),
    });

    return cancelled;
  }

  async setMemberSharing(memberId: string, income: boolean, expenses: boolean): Promise<void> {
    const s = this.store.read();
    this.store.write({
      members: s.members.map(m =>
        m.id === memberId
          ? { ...m, income_sharing_enabled: income, expense_sharing_enabled: expenses }
          : m
      ),
    });
  }

  async setMemberPermission(memberId: string, permission: PermissionKey, allowed: boolean | null): Promise<void> {
    if (!this.can('permissions.update')) {
      throw new RepositoryError('forbidden', "You lack permission 'permissions.update'.");
    }

    const s = this.store.read();
    this.store.write({
      members: s.members.map(m => {
        if (m.id !== memberId) return m;
        const current = { ...(m.custom_permissions ?? {}) };
        if (allowed === null) {
          delete current[permission];
        } else {
          current[permission] = allowed;
        }
        return { ...m, custom_permissions: current };
      }),
    });
  }

  async assignMemberRole(memberId: string, roleId: RoleId): Promise<void> {
    if (!this.can('members.update_role')) {
      throw new RepositoryError('forbidden', "You lack permission 'members.update_role'.");
    }

    const s = this.store.read();
    this.store.write({
      members: s.members.map(m => (m.id === memberId ? { ...m, role: roleId as any } : m)),
    });
  }

  async removeMember(memberId: string): Promise<void> {
    if (!this.can('members.remove')) {
      throw new RepositoryError('forbidden', "You lack permission 'members.remove'.");
    }

    const s = this.store.read();
    this.store.write({
      members: s.members.map(m => (m.id === memberId ? { ...m, status: 'suspended' as const } : m)),
    });
  }

  async createInvitation(roleId: RoleId, relationship?: string, email?: string): Promise<{ id: string; code: string }> {
    const id = uid('inv');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return { id, code };
  }

  async acceptInvitation(code: string): Promise<{ familyId: string; memberId: string }> {
    const s = this.store.read();
    return { familyId: s.family.id, memberId: uid('mem') };
  }

  async revokeInvitation(): Promise<void> {}

  async createRole(name: string, description: string, baseRoleId?: RoleId): Promise<RoleDefinition> {
    const s = this.store.read();
    const id = `custom-${name.toLowerCase().replace(/\s+/g, '-')}`;
    const newRole: RoleDefinition = {
      id,
      name,
      description,
      is_custom: true,
      default_permissions: ['family.view', 'transactions.view_own'],
    };
    this.store.write({ roles: [...s.roles, newRole] });
    return newRole;
  }

  async setRolePermissions(roleId: RoleId, permissions: Partial<Record<PermissionKey, boolean>>): Promise<void> {
    const s = this.store.read();
    this.store.write({
      roles: s.roles.map(r => {
        if (r.id !== roleId) return r;
        const currentSet = new Set(r.default_permissions);
        for (const [perm, allowed] of Object.entries(permissions)) {
          if (allowed) currentSet.add(perm as PermissionKey);
          else currentSet.delete(perm as PermissionKey);
        }
        return { ...r, default_permissions: Array.from(currentSet) };
      }),
    });
  }

  async deleteRole(roleId: RoleId): Promise<void> {
    const s = this.store.read();
    this.store.write({ roles: s.roles.filter(r => r.id !== roleId) });
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    const s = this.store.read();
    const me = this.me();
    this.store.write({
      members: s.members.map(m => {
        if (m.user_id !== me) return m;
        return {
          ...m,
          user: {
            ...m.user,
            name: patch.full_name ?? m.user.name,
            phone: patch.phone ?? m.user.phone,
            avatar_url: patch.avatar_url ?? m.user.avatar_url,
            date_of_birth: patch.date_of_birth ?? m.user.date_of_birth,
            gender: patch.gender ?? m.user.gender,
            location: patch.location ?? m.user.location,
            bio: patch.bio ?? m.user.bio,
          },
        };
      }),
    });
  }

  async updateFamily(patch: { name?: string; currency?: string; timezone?: string }): Promise<Family> {
    const s = this.store.read();
    const updated: Family = {
      ...s.family,
      name: patch.name ?? s.family.name,
      currency: patch.currency ?? s.family.currency,
      timezone: patch.timezone ?? s.family.timezone,
      updated_at: now(),
    };
    this.store.write({ family: updated });
    return updated;
  }

  async markNotificationRead(id: string): Promise<void> {
    const s = this.store.read();
    this.store.write({
      notifications: s.notifications.map(n => (n.id === id ? { ...n, read_at: now() } : n)),
    });
  }

  async markAllNotificationsRead(): Promise<void> {
    const s = this.store.read();
    const me = this.me();
    this.store.write({
      notifications: s.notifications.map(n => (n.user_id === me ? { ...n, read_at: now() } : n)),
    });
  }
}
