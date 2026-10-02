/* =========================================================
   FAMILY FINANCE SYNC — PURE FINANCIAL DOMAIN & PRIVACY ENGINE
   (Domain layer: pure functions, no React, no I/O)
   Specification: Integer Paise Arithmetic, Timezone Scoping,
   and Financial Privacy Isolation.
   ========================================================= */

import { Transaction, Account, Budget, FamilyMember, Category } from '../types';
import { DEFAULT_APPROVAL_THRESHOLDS } from '../constants/systemData';
import { normalizeRoleId } from './permissions';

export const FAMILY_TIMEZONE = 'Asia/Kolkata';

export interface FamilyFinancialSummary {
  totalIncomePaise: number;
  totalExpensePaise: number;
  currentBalancePaise: number;
  totalSavingsPaise: number;
  savingsRatePercentage: number;
  monthlyExpensePaise: number;
  monthlyIncomePaise: number;
  activeTransactionCount: number;
}

export interface MemberFinancialMetrics {
  memberId: string;
  userId: string;
  name: string;
  role: string;
  totalIncomePaise: number;
  totalExpensePaise: number;
  monthExpensePaise: number;
  monthIncomePaise: number;
  transactionCount: number;
  topCategoryId: string | null;
  topCategoryName: string;
  allowancePaise: number;
  remainingAllowancePaise: number;
  spendingLimitPaise: number;
  limitUtilizationPercentage: number;
  lastActivityDate: string | null;
}

export interface CategorySpendingMetric {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalSpentPaise: number;
  allocatedBudgetPaise: number;
  utilizationPercentage: number;
  thresholdStatus: 'safe' | 'warning' | 'critical' | 'exceeded';
}

export interface CategoryTotal {
  key: string;
  categoryId: string | null;
  name: string;
  color: string;
  amountPaise: number;
}

export interface PeriodSummary {
  month: string;
  incomePaise: number;
  expensePaise: number;
  balancePaise: number;
  transactionCount: number;
  categories: CategoryTotal[];
  topCategory: CategoryTotal | null;
}

/* -------------------- Money & Currency Math -------------------- */

export const MAX_AMOUNT_PAISE = 100_000_000_000; // ₹100 Crore cap

/**
 * Parses user rupee input string safely into integer paise.
 * Uses string splitting to prevent IEEE 754 floating point imprecision.
 */
export function parseRupeesToPaise(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return 0;
    return Math.round(input * 100);
  }
  const clean = input.trim().replace(/,/g, '');
  if (!clean || clean === '.') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return 0;

  const [rupees, paise = ''] = clean.split('.');
  const r = parseInt(rupees, 10);
  const p = parseInt(paise.padEnd(2, '0').slice(0, 2), 10);
  return r * 100 + p;
}

/* -------------------- Calendar & Date Scoping ------------------- */

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FAMILY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
});

/**
 * Returns "YYYY-MM" in the family timezone (Asia/Kolkata).
 */
export function monthKey(date: string | Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'invalid';
  const parts = monthFormatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value ?? '0000';
  const m = parts.find(p => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function isCounted(tx: Transaction): boolean {
  return tx.status !== 'voided' && (tx.type === 'income' || tx.type === 'expense');
}

export function filterCurrentMonthTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  const current = monthKey(now);
  return transactions.filter(tx => tx.status !== 'voided' && monthKey(tx.transaction_date) === current);
}

export function filterMemberTransactions(transactions: Transaction[], userId: string): Transaction[] {
  return transactions.filter(tx => tx.user_id === userId && tx.status !== 'voided');
}

/* ------------------ Summary & Metrics Calculation ----------------- */

export function calculateFamilySummary(
  transactions: Transaction[],
  accounts: Account[]
): FamilyFinancialSummary {
  const validTransactions = transactions.filter(tx => tx.status !== 'voided');

  let totalIncomePaise = 0;
  let totalExpensePaise = 0;

  validTransactions.forEach(tx => {
    if (tx.type === 'transfer') return;
    if (tx.type === 'income' || tx.type === 'refund') {
      totalIncomePaise += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpensePaise += tx.amount;
    }
  });

  const accountBalancePaise = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const currentBalancePaise = accounts.length > 0 ? accountBalancePaise : totalIncomePaise - totalExpensePaise;

  const totalSavingsPaise = Math.max(0, totalIncomePaise - totalExpensePaise);
  const savingsRatePercentage = totalIncomePaise > 0
    ? Math.round((totalSavingsPaise / totalIncomePaise) * 1000) / 10
    : 0;

  const monthTx = filterCurrentMonthTransactions(transactions);
  let monthlyIncomePaise = 0;
  let monthlyExpensePaise = 0;

  monthTx.forEach(tx => {
    if (tx.type === 'transfer') return;
    if (tx.type === 'income') monthlyIncomePaise += tx.amount;
    if (tx.type === 'expense') monthlyExpensePaise += tx.amount;
  });

  return {
    totalIncomePaise,
    totalExpensePaise,
    currentBalancePaise,
    totalSavingsPaise,
    savingsRatePercentage,
    monthlyExpensePaise,
    monthlyIncomePaise,
    activeTransactionCount: validTransactions.length,
  };
}

export function summarizePeriod(transactions: Transaction[], categories: Category[], month: string): PeriodSummary {
  let incomePaise = 0;
  let expensePaise = 0;
  let transactionCount = 0;
  const byCategory = new Map<string, CategoryTotal>();

  for (const tx of transactions) {
    if (!isCounted(tx) || monthKey(tx.transaction_date) !== month) continue;
    transactionCount += 1;
    if (tx.type === 'income') {
      incomePaise += tx.amount;
      continue;
    }
    expensePaise += tx.amount;
    const cat = categories.find(c => c.id === tx.category_id);
    const key = tx.custom_category ? `custom:${tx.custom_category.toLowerCase()}` : (tx.category_id ?? 'uncategorized');
    const existing = byCategory.get(key) ?? {
      key,
      categoryId: tx.category_id ?? null,
      name: tx.custom_category ? `Other → ${tx.custom_category}` : (cat?.name ?? 'Other'),
      color: cat?.color || '#6B7280',
      amountPaise: 0,
    };
    existing.amountPaise += tx.amount;
    byCategory.set(key, existing);
  }

  const cats = [...byCategory.values()].sort((a, b) => b.amountPaise - a.amountPaise);
  return {
    month,
    incomePaise,
    expensePaise,
    balancePaise: incomePaise - expensePaise,
    transactionCount,
    categories: cats,
    topCategory: cats[0] ?? null,
  };
}

export function monthlyTrend(transactions: Transaction[], endMonth: string, months = 6): { month: string; incomePaise: number; expensePaise: number }[] {
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(endMonth, i - (months - 1)));
  const rows = new Map(keys.map(k => [k, { month: k, incomePaise: 0, expensePaise: 0 }]));

  for (const tx of transactions) {
    if (!isCounted(tx)) continue;
    const row = rows.get(monthKey(tx.transaction_date));
    if (!row) continue;
    if (tx.type === 'income') row.incomePaise += tx.amount;
    else row.expensePaise += tx.amount;
  }
  return keys.map(k => rows.get(k)!);
}

export function calculateBudgetMetrics(
  transactions: Transaction[],
  budget: Budget | null,
  categories: Category[]
): CategorySpendingMetric[] {
  const monthTx = filterCurrentMonthTransactions(transactions).filter(tx => tx.type === 'expense');

  const categorySpentMap = new Map<string, number>();
  monthTx.forEach(tx => {
    categorySpentMap.set(tx.category_id, (categorySpentMap.get(tx.category_id) || 0) + tx.amount);
  });

  const categoryBudgetMap = new Map<string, number>();
  if (budget && budget.categories) {
    budget.categories.forEach(bc => {
      categoryBudgetMap.set(bc.category_id, bc.allocated_amount);
    });
  }

  return categories.filter(c => c.type === 'expense').map(cat => {
    const totalSpentPaise = categorySpentMap.get(cat.id) || 0;
    const allocatedBudgetPaise = categoryBudgetMap.get(cat.id) || 0;

    let utilizationPercentage = 0;
    let thresholdStatus: CategorySpendingMetric['thresholdStatus'] = 'safe';

    if (allocatedBudgetPaise > 0) {
      utilizationPercentage = Math.round((totalSpentPaise / allocatedBudgetPaise) * 100);
      if (utilizationPercentage >= 100) {
        thresholdStatus = 'exceeded';
      } else if (utilizationPercentage >= 90) {
        thresholdStatus = 'critical';
      } else if (utilizationPercentage >= 75) {
        thresholdStatus = 'warning';
      }
    }

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color || '#16A34A',
      totalSpentPaise,
      allocatedBudgetPaise,
      utilizationPercentage,
      thresholdStatus,
    };
  });
}

export function calculateMemberMetrics(
  member: FamilyMember,
  transactions: Transaction[],
  categories: Category[]
): MemberFinancialMetrics {
  const memberTx = filterMemberTransactions(transactions, member.user_id);
  const monthTx = filterCurrentMonthTransactions(memberTx);

  let totalIncomePaise = 0;
  let totalExpensePaise = 0;
  let monthIncomePaise = 0;
  let monthExpensePaise = 0;
  const categoryCountMap = new Map<string, number>();

  memberTx.forEach(tx => {
    if (tx.type === 'transfer') return;
    if (tx.type === 'income') totalIncomePaise += tx.amount;
    if (tx.type === 'expense') {
      totalExpensePaise += tx.amount;
      categoryCountMap.set(tx.category_id, (categoryCountMap.get(tx.category_id) || 0) + tx.amount);
    }
  });

  monthTx.forEach(tx => {
    if (tx.type === 'transfer') return;
    if (tx.type === 'income') monthIncomePaise += tx.amount;
    if (tx.type === 'expense') monthExpensePaise += tx.amount;
  });

  let topCategoryId: string | null = null;
  let maxSpent = 0;
  categoryCountMap.forEach((spent, catId) => {
    if (spent > maxSpent) {
      maxSpent = spent;
      topCategoryId = catId;
    }
  });

  const topCategoryObj = categories.find(c => c.id === topCategoryId);
  const topCategoryName = topCategoryObj ? topCategoryObj.name : 'General';

  const allowancePaise = member.monthly_allowance || 0;
  const remainingAllowancePaise = Math.max(0, allowancePaise - monthExpensePaise);
  const spendingLimitPaise = member.monthly_spending_limit || allowancePaise || 0;
  const limitUtilizationPercentage = spendingLimitPaise > 0
    ? Math.min(100, Math.round((monthExpensePaise / spendingLimitPaise) * 100))
    : 0;

  const sortedTx = [...memberTx].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  const lastActivityDate = sortedTx.length > 0 ? sortedTx[0].transaction_date : null;

  return {
    memberId: member.id,
    userId: member.user_id,
    name: member.user?.name || 'Member',
    role: member.role,
    totalIncomePaise,
    totalExpensePaise,
    monthIncomePaise,
    monthExpensePaise,
    transactionCount: memberTx.length,
    topCategoryId,
    topCategoryName,
    allowancePaise,
    remainingAllowancePaise,
    spendingLimitPaise,
    limitUtilizationPercentage,
    lastActivityDate,
  };
}

/* -------------------- Financial Privacy Engine -------------------- */

export interface VisibilityInput {
  viewerUserId: string;
  canViewOwn: boolean;
  canViewFamily: boolean;
  /** Sharing flags of each transaction owner, keyed by user ID. */
  sharing: Map<string, { income: boolean; expenses: boolean }>;
}

/**
 * Strict evaluation of whether a transaction is visible to the viewer.
 * Direct TypeScript mirror of PostgreSQL function `app_private.can_view_transaction()`.
 */
export function isTransactionVisible(tx: Transaction, input: VisibilityInput): boolean {
  if (tx.user_id === input.viewerUserId) return input.canViewOwn;
  if (!input.canViewFamily) return false;

  const vis = tx.visibility ?? (tx.is_shared ? 'family' : 'private');
  if (vis !== 'family' && vis !== 'FAMILY_SHARED') return false;

  const share = input.sharing.get(tx.user_id);
  if (!share) return false;

  if (tx.type === 'income' || tx.type === 'refund') return share.income;
  return share.expenses;
}

export function sharingMap(members: FamilyMember[]): Map<string, { income: boolean; expenses: boolean }> {
  return new Map(
    members.map(m => [
      m.user_id,
      {
        income: m.income_sharing_enabled === true,
        expenses: m.expense_sharing_enabled === true,
      },
    ])
  );
}

export interface MemberPeriodRow {
  member: FamilyMember;
  incomePaise: number | null;
  expensePaise: number | null;
  transactionCount: number;
}

/**
 * Family totals from transactions the viewer is permitted to see.
 * Unshared data returns `null` ("Not shared" in the UI), NEVER ₹0.
 */
export function summarizeFamilyPeriod(
  visibleTransactions: Transaction[],
  members: FamilyMember[],
  month: string,
  viewerUserId: string
): {
  incomePaise: number;
  expensePaise: number;
  balancePaise: number;
  activeMembers: number;
  rows: MemberPeriodRow[];
} {
  const active = members.filter(m => m.status === 'active');
  const rows: MemberPeriodRow[] = active.map(member => {
    const isOwn = member.user_id === viewerUserId;
    const txs = visibleTransactions.filter(
      t => t.user_id === member.user_id && isCounted(t) && monthKey(t.transaction_date) === month
    );
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    return {
      member,
      incomePaise: isOwn || member.income_sharing_enabled ? income : null,
      expensePaise: isOwn || member.expense_sharing_enabled ? expense : null,
      transactionCount: txs.length,
    };
  });

  const incomePaise = rows.reduce((s, r) => s + (r.incomePaise ?? 0), 0);
  const expensePaise = rows.reduce((s, r) => s + (r.expensePaise ?? 0), 0);

  return {
    incomePaise,
    expensePaise,
    balancePaise: incomePaise - expensePaise,
    activeMembers: active.length,
    rows,
  };
}

/* -------------------- Approval Rules Engine (Section E) -------------------- */

export type ApprovalRequirement = 'auto' | 'co_manager_or_head' | 'head_only';

/**
 * Determines approval requirements based on amount and member status (Section E).
 * - Child: Rs 0 (always requires approval)
 * - Adult <= Rs 500 (50,000 paise): Auto-approved
 * - Adult Rs 500 - Rs 2,000 (50,001 - 200,000 paise): Co-Manager or Head
 * - Adult > Rs 2,000 (> 200,000 paise): Head only
 */
export function getApprovalRequirement(amountPaise: number, isChild = false): ApprovalRequirement {
  if (isChild) {
    return amountPaise <= DEFAULT_APPROVAL_THRESHOLDS.CO_MANAGER_APPROVAL_MAX_PAISE
      ? 'co_manager_or_head'
      : 'head_only';
  }
  if (amountPaise <= DEFAULT_APPROVAL_THRESHOLDS.ADULT_AUTO_APPROVE_MAX_PAISE) {
    return 'auto';
  }
  if (amountPaise <= DEFAULT_APPROVAL_THRESHOLDS.CO_MANAGER_APPROVAL_MAX_PAISE) {
    return 'co_manager_or_head';
  }
  return 'head_only';
}

/**
 * Checks whether a given role is authorized to approve an expense request of a given amount.
 */
export function canRoleApprove(role: string, amountPaise: number, isOwner = false): boolean {
  if (isOwner) return true;
  const canonical = normalizeRoleId(role);
  if (canonical === 'FAMILY_HEAD') return true;
  if (canonical === 'SPOUSE' || role === 'CO_MANAGER') {
    return amountPaise <= DEFAULT_APPROVAL_THRESHOLDS.CO_MANAGER_APPROVAL_MAX_PAISE;
  }
  return false;
}
