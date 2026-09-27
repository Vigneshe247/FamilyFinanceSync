/* =========================================================================
   FamilyFinanceSync — Supabase Row Mappers
   Converts database snake_case tables and RPC outputs into TypeScript domain models.
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
import { ALL_PERMISSION_KEYS, normalizeRoleId, type PermissionKey } from '../../domain/permissions';

type Row = Record<string, any>;

export function mapFamily(r: Row): Family {
  return {
    id: String(r.id),
    name: String(r.name ?? 'My Family'),
    owner_id: String(r.owner_id ?? r.created_by ?? ''),
    currency: String(r.currency ?? 'INR'),
    timezone: String(r.timezone ?? 'Asia/Kolkata'),
    created_at: String(r.created_at ?? new Date().toISOString()),
    updated_at: String(r.updated_at ?? new Date().toISOString()),
  };
}

export function mapMember(
  r: Row,
  profile?: Row | null,
  overrides?: Partial<Record<PermissionKey, boolean>>
): FamilyMember {
  const name = String(profile?.full_name ?? profile?.name ?? 'Family Member');
  const role = normalizeRoleId(r.role_id ?? r.role);

  return {
    id: String(r.id),
    family_id: String(r.family_id),
    user_id: String(r.user_id),
    role: role as any,
    status: (r.status ?? 'active') as any,
    income_sharing_enabled: r.share_income ?? r.income_sharing_enabled ?? false,
    expense_sharing_enabled: r.share_expenses ?? r.expense_sharing_enabled ?? false,
    monthly_allowance: Number(r.monthly_allowance ?? 0),
    monthly_spending_limit: Number(r.monthly_spending_limit ?? 0),
    custom_permissions: overrides ?? (r.custom_permissions as any) ?? {},
    joined_at: String(r.joined_at ?? r.created_at ?? new Date().toISOString()),
    created_at: String(r.created_at ?? new Date().toISOString()),
    user: {
      id: String(r.user_id),
      name,
      email: String(profile?.email ?? ''),
      avatar_url: profile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
      phone: profile?.phone ?? '',
      date_of_birth: profile?.date_of_birth ?? '',
      gender: profile?.gender ?? '',
      location: profile?.location ?? '',
      bio: profile?.bio ?? '',
      created_at: String(profile?.created_at ?? r.created_at ?? new Date().toISOString()),
      updated_at: String(profile?.updated_at ?? r.updated_at ?? new Date().toISOString()),
    },
  };
}

export function mapAccount(r: Row): Account {
  return {
    id: String(r.id),
    family_id: String(r.family_id),
    name: String(r.name),
    type: (r.type ?? 'bank') as any,
    balance: Number(r.balance ?? 0),
    currency: String(r.currency ?? 'INR'),
    account_number_mask: r.account_number_mask ? String(r.account_number_mask) : undefined,
    is_shared: Boolean(r.is_shared ?? true),
    owner_member_id: r.owner_user_id ? String(r.owner_user_id) : undefined,
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

export function mapCategory(r: Row): Category {
  return {
    id: String(r.id),
    family_id: String(r.family_id),
    name: String(r.name),
    type: (r.type ?? 'expense') as any,
    icon: String(r.icon ?? 'tag'),
    color: String(r.color ?? '#6366F1'),
    is_default: Boolean(r.is_default ?? false),
  };
}

export function mapTransaction(r: Row): Transaction {
  return {
    id: String(r.id),
    family_id: String(r.family_id),
    user_id: String(r.user_id),
    account_id: String(r.account_id ?? ''),
    category_id: String(r.category_id ?? ''),
    custom_category: r.custom_category ?? null,
    type: (r.type ?? 'expense') as any,
    amount: Number(r.amount ?? 0), // Integer paise
    description: String(r.description ?? ''),
    transaction_date: String(r.transaction_date ?? new Date().toISOString()),
    payment_method: String(r.payment_method ?? 'Cash'),
    notes: r.notes ?? '',
    is_shared: (r.visibility ?? (r.is_shared ? 'family' : 'private')) === 'family',
    visibility: (r.visibility === 'family' ? 'FAMILY_SHARED' : 'PERSONAL') as any,
    idempotency_key: r.idempotency_key ? String(r.idempotency_key) : undefined,
    status: (r.status ?? 'cleared') as any,
    created_at: String(r.created_at ?? new Date().toISOString()),
    updated_at: String(r.updated_at ?? new Date().toISOString()),
  };
}

export function mapRequest(r: Row, creatorName?: string): ExpenseRequest {
  return {
    id: String(r.id),
    family_id: String(r.family_id),
    requested_by: String(r.requested_by ?? r.member_id ?? ''),
    requester_name: creatorName ?? 'Family Member',
    member_id: String(r.requested_by ?? r.member_id ?? ''),
    member_name: creatorName ?? 'Family Member',
    amount: Number(r.amount ?? 0),
    category_id: String(r.category_id ?? ''),
    title: String(r.title ?? r.description ?? 'Expense Request'),
    description: String(r.description ?? r.title ?? ''),
    status: (r.status ?? 'pending') as any,
    request_type: (r.request_type ?? 'expense') as any,
    review_comment: r.review_comment ?? undefined,
    reviewed_by: r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewed_at: r.reviewed_at ? String(r.reviewed_at) : undefined,
    created_at: String(r.created_at ?? new Date().toISOString()),
    updated_at: String(r.updated_at ?? new Date().toISOString()),
  };
}

export function mapNotification(r: Row): NotificationItem {
  return {
    id: String(r.id),
    family_id: String(r.family_id),
    user_id: String(r.user_id),
    type: (r.type ?? 'info') as any,
    title: String(r.title ?? 'Notification'),
    message: String(r.message ?? ''),
    read_at: r.read_at ? String(r.read_at) : undefined,
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

export function mapRole(r: Row, permissions: PermissionKey[]): RoleDefinition {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ''),
    is_system_role: Boolean(r.is_system_role ?? false),
    is_custom: !Boolean(r.is_system_role ?? false),
    default_permissions: permissions,
  };
}
