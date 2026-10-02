/* =========================================================================
   FamilyFinanceSync — Phase 1 Domain Logic & Financial Rules Test Suite
   Verifies:
   1. Currency utilities & Integer-Paise Arithmetic (No IEEE 754 float drift)
   2. Calendar & Timezone scoping (Asia/Kolkata)
   3. Canonical Permission Engine (Owner guarantees, role defaults, overrides)
   4. Financial Visibility & Privacy Matrix (PostgreSQL RLS parity)
   5. Approval Threshold Rules Engine (Section E limits)
   ========================================================================= */

import { formatPaise, paiseToRupees, rupeesToPaise } from '../utils/currency';
import {
  parseRupeesToPaise,
  monthKey,
  shiftMonth,
  isTransactionVisible,
  sharingMap,
  summarizeFamilyPeriod,
  getApprovalRequirement,
  canRoleApprove,
  VisibilityInput,
} from '../domain/finance';
import {
  evaluatePermission,
  normalizeRoleId,
  roleDisplayName,
  ALL_PERMISSION_KEYS,
  PermissionContext,
} from '../domain/permissions';
import { checkPermission } from '../utils/permissions';
import { Transaction, FamilyMember } from '../types';

export interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  message?: string;
}

export function runDomainLogicTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  function test(category: string, name: string, fn: () => void) {
    try {
      fn();
      results.push({ category, name, passed: true });
    } catch (err: any) {
      results.push({ category, name, passed: false, message: err?.message || String(err) });
    }
  }

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  function assertEqual(actual: any, expected: any, msg: string) {
    if (actual !== expected) {
      throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 1. CURRENCY & INTEGER-PAISE MATH
  // -------------------------------------------------------------------------
  test('CURRENCY', 'paiseToRupees correctly divides by 100', () => {
    assertEqual(paiseToRupees(100), 1, '100 paise = 1 INR');
    assertEqual(paiseToRupees(5025), 50.25, '5025 paise = 50.25 INR');
    assertEqual(paiseToRupees(0), 0, '0 paise = 0 INR');
    assertEqual(paiseToRupees(200000), 2000, '200,000 paise = 2,000 INR');
  });

  test('CURRENCY', 'rupeesToPaise converts numbers and strings safely', () => {
    assertEqual(rupeesToPaise(1), 100, '1 INR = 100 paise');
    assertEqual(rupeesToPaise(50.25), 5025, '50.25 INR = 5025 paise');
    assertEqual(rupeesToPaise('123.45'), 12345, 'String "123.45" = 12345 paise');
    assertEqual(rupeesToPaise('invalid'), 0, 'Invalid string = 0 paise');
    assertEqual(rupeesToPaise(''), 0, 'Empty string = 0 paise');
  });

  test('CURRENCY', 'parseRupeesToPaise prevents IEEE 754 floating point drift', () => {
    // 19.99 * 100 in JavaScript is 1998.9999999999998
    assertEqual(parseRupeesToPaise('19.99'), 1999, 'Parsed string avoids float drift');
    assertEqual(parseRupeesToPaise('1,23,456.78'), 12345678, 'Handles Indian comma formats');
    assertEqual(parseRupeesToPaise('500'), 50000, '500 INR = 50,000 paise');
    assertEqual(parseRupeesToPaise('0.5'), 50, '0.5 INR = 50 paise');
    assertEqual(parseRupeesToPaise(-100), 0, 'Negative numbers yield 0');
  });

  test('CURRENCY', 'formatPaise formats human-readable INR strings', () => {
    const formattedZero = formatPaise(0);
    assert(formattedZero.includes('0'), 'Zero amount formatted');

    const formattedLakh = formatPaise(10500000); // ₹1,05,000
    assert(formattedLakh.includes('1,05,000'), 'Formats lakhs with Indian thousands separators');

    const formattedPaisa = formatPaise(5025); // ₹50.25
    assert(formattedPaisa.includes('50.25'), 'Formats paise fraction when non-zero');
  });

  // -------------------------------------------------------------------------
  // 2. CALENDAR & TIMEZONE SCOPING
  // -------------------------------------------------------------------------
  test('TIMEZONE', 'monthKey returns YYYY-MM in Asia/Kolkata timezone', () => {
    const d = new Date('2026-09-15T12:00:00Z');
    const key = monthKey(d);
    assertEqual(key, '2026-09', 'Formats year and month correctly');
  });

  test('TIMEZONE', 'shiftMonth safely handles year boundary transitions', () => {
    assertEqual(shiftMonth('2026-01', -1), '2025-12', 'Rolls back to previous year');
    assertEqual(shiftMonth('2026-12', 1), '2027-01', 'Rolls forward to next year');
    assertEqual(shiftMonth('2026-06', -6), '2025-12', 'Multi-month back shift');
  });

  // -------------------------------------------------------------------------
  // 3. ROLE-BASED ACCESS CONTROL & PERMISSION ENGINE
  // -------------------------------------------------------------------------
  test('RBAC', 'Family Owner has permanent authority (prevents lockout)', () => {
    const ownerCtx: PermissionContext = {
      roleId: 'VIEWER', // Even if assigned a viewer role
      isOwner: true,
    };
    for (const key of ALL_PERMISSION_KEYS) {
      assert(evaluatePermission(ownerCtx, key), `Owner must have ${key}`);
    }
  });

  test('RBAC', 'Family Head has all default permissions', () => {
    const headCtx: PermissionContext = {
      roleId: 'FAMILY_HEAD',
      isOwner: false,
    };
    assert(evaluatePermission(headCtx, 'family.update'), 'Head can update family settings');
    assert(evaluatePermission(headCtx, 'members.invite'), 'Head can invite members');
    assert(evaluatePermission(headCtx, 'roles.manage'), 'Head can manage roles');
    assert(evaluatePermission(headCtx, 'budgets.manage'), 'Head can manage budgets');
    assert(evaluatePermission(headCtx, 'reports.export'), 'Head can export reports');
  });

  test('RBAC', 'Co-Manager / Spouse cannot manage roles or edit family settings by default', () => {
    const spouseCtx: PermissionContext = {
      roleId: 'SPOUSE',
      isOwner: false,
    };
    assert(evaluatePermission(spouseCtx, 'transactions.create_expense'), 'Spouse can log expense');
    assert(evaluatePermission(spouseCtx, 'transactions.view_own'), 'Spouse can view own transactions');
    assert(evaluatePermission(spouseCtx, 'budgets.view'), 'Spouse can view budget');
    assert(!evaluatePermission(spouseCtx, 'roles.manage'), 'Spouse cannot manage roles');
    assert(!evaluatePermission(spouseCtx, 'family.update'), 'Spouse cannot edit family settings');
  });

  test('RBAC', 'Child cannot manage budgets, view family reports, or manage members', () => {
    const childCtx: PermissionContext = {
      roleId: 'SON',
      isOwner: false,
    };
    assert(evaluatePermission(childCtx, 'transactions.create_expense'), 'Child can record own spending');
    assert(evaluatePermission(childCtx, 'requests.create'), 'Child can submit requests');
    assert(!evaluatePermission(childCtx, 'budgets.manage'), 'Child cannot manage budgets');
    assert(!evaluatePermission(childCtx, 'reports.view'), 'Child cannot view family reports');
    assert(!evaluatePermission(childCtx, 'members.invite'), 'Child cannot invite members');
  });

  test('RBAC', 'Viewer is strictly read-only and cannot mutate ledger', () => {
    const viewerCtx: PermissionContext = {
      roleId: 'VIEWER',
      isOwner: false,
    };
    assert(evaluatePermission(viewerCtx, 'family.view'), 'Viewer can view family workspace');
    assert(!evaluatePermission(viewerCtx, 'transactions.create_expense'), 'Viewer cannot add expense');
    assert(!evaluatePermission(viewerCtx, 'transactions.create_income'), 'Viewer cannot add income');
    assert(!evaluatePermission(viewerCtx, 'budgets.manage'), 'Viewer cannot manage budget');
  });

  test('RBAC', 'Member-level overrides supersede role defaults', () => {
    const childWithReportOverride: PermissionContext = {
      roleId: 'SON',
      isOwner: false,
      memberOverrides: {
        'reports.view': true,
        'transactions.create_expense': false,
      },
    };
    assert(evaluatePermission(childWithReportOverride, 'reports.view'), 'Granted override allows report view');
    assert(!evaluatePermission(childWithReportOverride, 'transactions.create_expense'), 'Revoked override blocks spending');
  });

  test('RBAC', 'Legacy camelCase checkPermission correctly resolves roles and overrides', () => {
    assert(checkPermission('family_head', 'viewDashboard'), 'Head views dashboard');
    assert(checkPermission('family_head', 'manageRoles'), 'Head manages roles');
    assert(!checkPermission('child', 'manageRoles'), 'Child cannot manage roles');
    assert(!checkPermission('viewer', 'addExpense'), 'Viewer cannot add expense');
    assert(checkPermission('viewer', 'addExpense', { addExpense: true }), 'Override enables addExpense');
  });

  // -------------------------------------------------------------------------
  // 4. FINANCIAL PRIVACY & VISIBILITY MATRIX (Section F2)
  // -------------------------------------------------------------------------
  test('PRIVACY', 'Viewer always sees own transactions even if flagged private', () => {
    const myPrivateTx: Transaction = {
      id: 'tx-1',
      family_id: 'fam-1',
      user_id: 'user-me',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 150000,
      description: 'Personal Medicine',
      payment_method: 'upi',
      transaction_date: '2026-09-10',
      status: 'cleared',
      visibility: 'private',
      is_shared: false,
      created_at: '2026-09-10',
      updated_at: '2026-09-10',
    };

    const input: VisibilityInput = {
      viewerUserId: 'user-me',
      canViewOwn: true,
      canViewFamily: false,
      sharing: new Map(),
    };

    assert(isTransactionVisible(myPrivateTx, input), 'Owner sees their own private transaction');
  });

  test('PRIVACY', 'Other family members cannot view private transactions', () => {
    const privateTx: Transaction = {
      id: 'tx-2',
      family_id: 'fam-1',
      user_id: 'user-spouse',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 250000,
      description: 'Private Gift',
      payment_method: 'upi',
      transaction_date: '2026-09-10',
      status: 'cleared',
      visibility: 'private',
      is_shared: false,
      created_at: '2026-09-10',
      updated_at: '2026-09-10',
    };

    const input: VisibilityInput = {
      viewerUserId: 'user-head',
      canViewOwn: true,
      canViewFamily: true,
      sharing: new Map([['user-spouse', { income: true, expenses: true }]]),
    };

    assert(!isTransactionVisible(privateTx, input), 'Private transaction must remain hidden from other members');
  });

  test('PRIVACY', 'Family shared transaction respects member privacy switches', () => {
    const sharedExpenseTx: Transaction = {
      id: 'tx-3',
      family_id: 'fam-1',
      user_id: 'user-member',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 45000,
      description: 'Groceries',
      payment_method: 'upi',
      transaction_date: '2026-09-10',
      status: 'cleared',
      visibility: 'family',
      is_shared: true,
      created_at: '2026-09-10',
      updated_at: '2026-09-10',
    };

    const sharedIncomeTx: Transaction = {
      ...sharedExpenseTx,
      id: 'tx-4',
      type: 'income',
      description: 'Freelance Payout',
    };

    // Case A: Member enabled expenses but disabled income sharing
    const inputExpensesOnly: VisibilityInput = {
      viewerUserId: 'user-head',
      canViewOwn: true,
      canViewFamily: true,
      sharing: new Map([['user-member', { income: false, expenses: true }]]),
    };

    assert(isTransactionVisible(sharedExpenseTx, inputExpensesOnly), 'Visible when expense sharing is enabled');
    assert(!isTransactionVisible(sharedIncomeTx, inputExpensesOnly), 'Hidden when income sharing is disabled');

    // Case B: Member disabled both
    const inputDisabled: VisibilityInput = {
      viewerUserId: 'user-head',
      canViewOwn: true,
      canViewFamily: true,
      sharing: new Map([['user-member', { income: false, expenses: false }]]),
    };

    assert(!isTransactionVisible(sharedExpenseTx, inputDisabled), 'Hidden when expense sharing disabled');
    assert(!isTransactionVisible(sharedIncomeTx, inputDisabled), 'Hidden when income sharing disabled');
  });

  test('PRIVACY', 'summarizeFamilyPeriod returns null (not ₹0) for unshared categories', () => {
    const mockMembers: FamilyMember[] = [
      {
        id: 'mem-1',
        family_id: 'fam-1',
        user_id: 'user-1',
        user: { id: 'user-1', name: 'Member One', email: 'one@example.com', created_at: '2026-01-01', updated_at: '2026-01-01' },
        role: 'FAMILY_HEAD',
        status: 'active',
        joined_at: '2026-01-01',
        created_at: '2026-01-01',
        income_sharing_enabled: true,
        expense_sharing_enabled: true,
      },
      {
        id: 'mem-2',
        family_id: 'fam-1',
        user_id: 'user-2',
        user: { id: 'user-2', name: 'Member Two', email: 'two@example.com', created_at: '2026-01-01', updated_at: '2026-01-01' },
        role: 'MEMBER',
        status: 'active',
        joined_at: '2026-01-01',
        created_at: '2026-01-01',
        income_sharing_enabled: false, // Unshared income!
        expense_sharing_enabled: true,
      },
    ];

    const mockTxs: Transaction[] = [
      {
        id: 'tx-10',
        family_id: 'fam-1',
        user_id: 'user-2',
        account_id: 'acc-1',
        category_id: 'cat-inc',
        type: 'income',
        amount: 8000000,
        description: 'Salary',
        payment_method: 'bank_transfer',
        transaction_date: '2026-09-02',
        status: 'cleared',
        visibility: 'family',
        is_shared: true,
        created_at: '2026-09-02',
        updated_at: '2026-09-02',
      },
      {
        id: 'tx-11',
        family_id: 'fam-1',
        user_id: 'user-2',
        account_id: 'acc-1',
        category_id: 'cat-exp',
        type: 'expense',
        amount: 120000,
        description: 'Books',
        payment_method: 'upi',
        transaction_date: '2026-09-03',
        status: 'cleared',
        visibility: 'family',
        is_shared: true,
        created_at: '2026-09-03',
        updated_at: '2026-09-03',
      },
    ];

    // Viewer is user-1 (Head) inspecting user-2
    const summary = summarizeFamilyPeriod(mockTxs, mockMembers, '2026-09', 'user-1');
    const member2Row = summary.rows.find(r => r.member.user_id === 'user-2');

    assert(Boolean(member2Row), 'Found member 2 row');
    assertEqual(member2Row?.incomePaise, null, 'Unshared income returns null (never ₹0)');
    assertEqual(member2Row?.expensePaise, 120000, 'Shared expense returns 120,000 paise');
  });

  // -------------------------------------------------------------------------
  // 5. APPROVAL THRESHOLD RULES ENGINE (Section E)
  // -------------------------------------------------------------------------
  test('APPROVAL', 'getApprovalRequirement categorizes amounts according to Section E defaults', () => {
    // Adult auto-approved under Rs 500 (50,000 paise)
    assertEqual(getApprovalRequirement(30000, false), 'auto', 'Rs 300 adult is auto-approved');
    assertEqual(getApprovalRequirement(50000, false), 'auto', 'Rs 500 adult is auto-approved');

    // Adult Rs 500 to Rs 2,000 (50,001 to 200,000 paise) requires Co-Manager or Head
    assertEqual(getApprovalRequirement(50100, false), 'co_manager_or_head', 'Rs 501 requires co-manager or head');
    assertEqual(getApprovalRequirement(200000, false), 'co_manager_or_head', 'Rs 2,000 requires co-manager or head');

    // Adult > Rs 2,000 (> 200,000 paise) requires Head only
    assertEqual(getApprovalRequirement(200100, false), 'head_only', 'Rs 2,001 requires head only');
    assertEqual(getApprovalRequirement(1000000, false), 'head_only', 'Rs 10,000 requires head only');

    // Child always requires approval regardless of amount (threshold = 0)
    assertEqual(getApprovalRequirement(10000, true), 'co_manager_or_head', 'Child Rs 100 requires review');
    assertEqual(getApprovalRequirement(250000, true), 'head_only', 'Child Rs 2,500 requires head review');
  });

  test('APPROVAL', 'canRoleApprove validates authorization ceilings per role', () => {
    // Family Head can approve any amount
    assert(canRoleApprove('FAMILY_HEAD', 50000), 'Head approves Rs 500');
    assert(canRoleApprove('FAMILY_HEAD', 200000), 'Head approves Rs 2,000');
    assert(canRoleApprove('FAMILY_HEAD', 50000000), 'Head approves Rs 5,00,000');

    // Owner flag overrides role
    assert(canRoleApprove('VIEWER', 1000000, true), 'Owner flag approves any amount');

    // Co-Manager / Spouse can approve up to Rs 2,000 (200,000 paise)
    assert(canRoleApprove('CO_MANAGER', 100000), 'Co-Manager approves Rs 1,000');
    assert(canRoleApprove('CO_MANAGER', 200000), 'Co-Manager approves Rs 2,000');
    assert(canRoleApprove('spouse', 200000), 'Spouse role alias approves Rs 2,000');
    assert(!canRoleApprove('CO_MANAGER', 200100), 'Co-Manager CANNOT approve Rs 2,001');
    assert(!canRoleApprove('CO_MANAGER', 500000), 'Co-Manager CANNOT approve Rs 5,000');

    // Child, Adult Member, Viewer cannot approve
    assert(!canRoleApprove('CHILD', 10000), 'Child cannot approve requests');
    assert(!canRoleApprove('MEMBER', 10000), 'Standard member cannot approve requests');
    assert(!canRoleApprove('VIEWER', 10000), 'Viewer cannot approve requests');
  });

  return results;
}
