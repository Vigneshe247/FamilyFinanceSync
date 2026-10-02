/* =========================================================================
   FamilyFinanceSync — Supabase Cloud Repository
   Direct bridge to PostgreSQL using RLS queries and atomic SECURITY DEFINER RPCs.
   (database/migrations/003_authorization_privacy_ledger.sql).
   ========================================================================= */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpenseRequest, Transaction, RoleDefinition, Family } from '../../types';
import { isPermissionKey, type PermissionKey, type RoleId } from '../../domain/permissions';
import { toRepositoryError, RepositoryError } from '../errors';
import type {
  FinanceRepository,
  NewRequestInput,
  NewTransactionInput,
  ProfilePatch,
  TransactionPatch,
  WorkspaceSnapshot,
} from '../repository';
import {
  mapAccount,
  mapCategory,
  mapFamily,
  mapMember,
  mapNotification,
  mapRequest,
  mapRole,
  mapTransaction,
} from './mappers';

type Row = Record<string, any>;
const PAGE = 300;

export class SupabaseFinanceRepository implements FinanceRepository {
  readonly mode = 'cloud' as const;
  private familyId: string | null = null;
  private names = new Map<string, string>();

  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw toRepositoryError(error);
    return data as T;
  }

  private requireFamily(): string {
    if (!this.familyId) throw new RepositoryError('unavailable', 'Workspace not loaded yet');
    return this.familyId;
  }

  async loadWorkspace(): Promise<WorkspaceSnapshot> {
    try {
      const familyId = await this.call<string>('bootstrap_family', {});
      this.familyId = familyId;

      const [
        family,
        members,
        roles,
        rolePerms,
        familyRolePerms,
        memberPerms,
        categories,
        accounts,
        txs,
        requests,
        notifications,
        myPerms,
      ] = await Promise.all([
        this.db.from('families').select('*').eq('id', familyId).maybeSingle(),
        this.db.from('family_members').select('*').eq('family_id', familyId),
        this.db.from('roles').select('*').order('sort_order'),
        this.db.from('role_permissions').select('role_id, permission_id'),
        this.db.from('family_role_permissions').select('role_id, permission_id, allowed').eq('family_id', familyId),
        this.db.from('member_permissions').select('family_member_id, permission_id, allowed'),
        this.db.from('categories').select('*').eq('family_id', familyId).order('name'),
        this.db.from('accounts').select('*').eq('family_id', familyId),
        this.db.from('transactions').select('*').eq('family_id', familyId).order('transaction_date', { ascending: false }).limit(PAGE + 1),
        this.db.from('requests').select('*').eq('family_id', familyId).order('created_at', { ascending: false }).limit(200),
        this.db.from('notifications').select('*').eq('family_id', familyId).order('created_at', { ascending: false }).limit(100),
        this.db.rpc('my_permissions', { p_family_id: familyId }),
      ]);

      const memberRows = (members.data ?? []) as Row[];
      const userIds = memberRows.map(m => String(m.user_id));
      const profiles = userIds.length
        ? await this.db.from('profiles').select('*').in('id', userIds)
        : { data: [] as Row[], error: null };

      const profileById = new Map(((profiles.data ?? []) as Row[]).map(p => [String(p.id), p]));
      this.names = new Map(
        memberRows.map(m => [
          String(m.user_id),
          String(profileById.get(String(m.user_id))?.full_name ?? 'Family member'),
        ])
      );

      const overridesByMember = new Map<string, Partial<Record<PermissionKey, boolean>>>();
      for (const r of (memberPerms.data ?? []) as Row[]) {
        const id = String(r.family_member_id);
        const perm = String(r.permission_id);
        if (isPermissionKey(perm)) {
          const map = overridesByMember.get(id) ?? {};
          map[perm] = Boolean(r.allowed);
          overridesByMember.set(id, map);
        }
      }

      const domainMembers = memberRows.map(m =>
        mapMember(m, profileById.get(String(m.user_id)), overridesByMember.get(String(m.id)))
      );

      const permsByRole = new Map<string, PermissionKey[]>();
      for (const r of (rolePerms.data ?? []) as Row[]) {
        const id = String(r.role_id);
        const perm = String(r.permission_id);
        if (isPermissionKey(perm)) {
          const arr = permsByRole.get(id) ?? [];
          arr.push(perm);
          permsByRole.set(id, arr);
        }
      }

      const domainRoles: RoleDefinition[] = ((roles.data ?? []) as Row[]).map(r =>
        mapRole(r, permsByRole.get(String(r.id)) ?? [])
      );

      const txRows = (txs.data ?? []) as Row[];
      const hasMoreTransactions = txRows.length > PAGE;
      const slicedTxs = hasMoreTransactions ? txRows.slice(0, PAGE) : txRows;

      const myPermissionKeys: PermissionKey[] = ((myPerms.data ?? []) as string[]).filter(isPermissionKey);

      return {
        family: mapFamily(family.data ?? { id: familyId }),
        members: domainMembers,
        roles: domainRoles,
        categories: ((categories.data ?? []) as Row[]).map(mapCategory),
        accounts: ((accounts.data ?? []) as Row[]).map(mapAccount),
        transactions: slicedTxs.map(mapTransaction),
        hasMoreTransactions,
        requests: ((requests.data ?? []) as Row[]).map(r =>
          mapRequest(r, this.names.get(String(r.requested_by)))
        ),
        notifications: ((notifications.data ?? []) as Row[]).map(mapNotification),
        myPermissions: myPermissionKeys,
        currentUserId: this.userId,
      };
    } catch (err) {
      throw toRepositoryError(err);
    }
  }

  async loadOlderTransactions(beforeIso: string, limit = PAGE): Promise<Transaction[]> {
    const familyId = this.requireFamily();
    const { data, error } = await this.db
      .from('transactions')
      .select('*')
      .eq('family_id', familyId)
      .lt('transaction_date', beforeIso)
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (error) throw toRepositoryError(error);
    return ((data ?? []) as Row[]).map(mapTransaction);
  }

  async createTransaction(input: NewTransactionInput): Promise<Transaction> {
    const familyId = this.requireFamily();
    const id = await this.call<string>('create_transaction', {
      p_family_id: familyId,
      p_type: input.type,
      p_amount: input.amountPaise,
      p_category_id: input.categoryId,
      p_description: input.description,
      p_transaction_date: input.transactionDate,
      p_account_id: input.accountId ?? null,
      p_custom_category: input.customCategory ?? null,
      p_payment_method: input.paymentMethod ?? 'Cash',
      p_notes: input.notes ?? null,
      p_visibility: (input.visibility === 'PERSONAL' ? 'private' : 'family'),
      p_idempotency_key: input.idempotencyKey ?? null,
    });

    const { data, error } = await this.db.from('transactions').select('*').eq('id', id).single();
    if (error) throw toRepositoryError(error);
    return mapTransaction(data);
  }

  async updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction> {
    await this.call('update_transaction', {
      p_transaction_id: id,
      p_amount: patch.amountPaise ?? null,
      p_category_id: patch.categoryId ?? null,
      p_description: patch.description ?? null,
      p_transaction_date: patch.transactionDate ?? null,
      p_payment_method: patch.paymentMethod ?? null,
      p_custom_category: patch.customCategory ?? null,
      p_notes: patch.notes ?? null,
      p_visibility: patch.visibility ? (patch.visibility === 'PERSONAL' ? 'private' : 'family') : null,
    });

    const { data, error } = await this.db.from('transactions').select('*').eq('id', id).single();
    if (error) throw toRepositoryError(error);
    return mapTransaction(data);
  }

  async voidTransaction(id: string, reason?: string): Promise<void> {
    await this.call('void_transaction', {
      p_transaction_id: id,
      p_reason: reason ?? null,
    });
  }

  async createRequest(input: NewRequestInput): Promise<ExpenseRequest> {
    const familyId = this.requireFamily();
    const id = await this.call<string>('create_request', {
      p_family_id: familyId,
      p_type: input.type,
      p_title: input.title,
      p_amount: input.amountPaise ?? null,
      p_category_id: input.categoryId ?? null,
      p_description: input.description ?? null,
      p_target_transaction_id: input.targetTransactionId ?? null,
      p_requested_permission: input.requestedPermission ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
    });

    const { data, error } = await this.db.from('requests').select('*').eq('id', id).single();
    if (error) throw toRepositoryError(error);
    return mapRequest(data, this.names.get(this.userId));
  }

  async reviewRequest(id: string, decision: 'approved' | 'rejected', comment?: string): Promise<ExpenseRequest> {
    await this.call('review_request', {
      p_request_id: id,
      p_decision: decision,
      p_comment: comment ?? null,
    });

    const { data, error } = await this.db.from('requests').select('*').eq('id', id).single();
    if (error) throw toRepositoryError(error);
    return mapRequest(data, this.names.get(String(data.requested_by)));
  }

  async cancelRequest(id: string): Promise<ExpenseRequest> {
    await this.call('cancel_request', { p_request_id: id });
    const { data, error } = await this.db.from('requests').select('*').eq('id', id).single();
    if (error) throw toRepositoryError(error);
    return mapRequest(data, this.names.get(this.userId));
  }

  async setMemberSharing(memberId: string, income: boolean, expenses: boolean): Promise<void> {
    await this.call('set_member_sharing', {
      p_member_id: memberId,
      p_share_income: income,
      p_share_expenses: expenses,
    });
  }

  async setMemberPermission(memberId: string, permission: PermissionKey, allowed: boolean | null): Promise<void> {
    await this.call('set_member_permission', {
      p_member_id: memberId,
      p_permission_id: permission,
      p_allowed: allowed,
    });
  }

  async assignMemberRole(memberId: string, roleId: RoleId): Promise<void> {
    await this.call('assign_member_role', {
      p_member_id: memberId,
      p_role_id: roleId,
    });
  }

  async removeMember(memberId: string): Promise<void> {
    await this.call('remove_member', { p_member_id: memberId });
  }

  async createInvitation(roleId: RoleId, relationship?: string, email?: string): Promise<{ id: string; code: string }> {
    const familyId = this.requireFamily();
    return this.call<{ id: string; code: string }>('create_invitation', {
      p_family_id: familyId,
      p_role_id: roleId,
      p_relationship: relationship ?? null,
      p_email: email ?? null,
    });
  }

  async acceptInvitation(code: string): Promise<{ familyId: string; memberId: string }> {
    return this.call<{ familyId: string; memberId: string }>('accept_invitation', { p_code: code });
  }

  async revokeInvitation(id: string): Promise<void> {
    await this.call('revoke_invitation', { p_invitation_id: id });
  }

  async createRole(name: string, description: string, baseRoleId?: RoleId): Promise<RoleDefinition> {
    const familyId = this.requireFamily();
    const roleId = await this.call<string>('create_role', {
      p_family_id: familyId,
      p_name: name,
      p_description: description,
      p_base_role_id: baseRoleId ?? null,
    });

    const { data, error } = await this.db.from('roles').select('*').eq('id', roleId).single();
    if (error) throw toRepositoryError(error);
    return mapRole(data, []);
  }

  async setRolePermissions(roleId: RoleId, permissions: Partial<Record<PermissionKey, boolean>>): Promise<void> {
    const familyId = this.requireFamily();
    for (const [perm, allowed] of Object.entries(permissions)) {
      await this.call('set_role_permission', {
        p_family_id: familyId,
        p_role_id: roleId,
        p_permission_id: perm,
        p_allowed: Boolean(allowed),
      });
    }
  }

  async deleteRole(roleId: RoleId): Promise<void> {
    await this.call('delete_role', { p_role_id: roleId });
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    const { error } = await this.db.from('profiles').update(patch).eq('id', this.userId);
    if (error) throw toRepositoryError(error);
  }

  async updateFamily(patch: { name?: string; currency?: string; timezone?: string }): Promise<Family> {
    const familyId = this.requireFamily();
    await this.call('update_family', {
      p_family_id: familyId,
      p_name: patch.name ?? null,
      p_currency: patch.currency ?? null,
      p_timezone: patch.timezone ?? null,
    });

    const { data, error } = await this.db.from('families').select('*').eq('id', familyId).maybeSingle();
    if (error) throw toRepositoryError(error);
    return mapFamily(data);
  }

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw toRepositoryError(error);
  }

  async markAllNotificationsRead(): Promise<void> {
    const familyId = this.requireFamily();
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('family_id', familyId)
      .eq('user_id', this.userId)
      .is('read_at', null);
    if (error) throw toRepositoryError(error);
  }
}
