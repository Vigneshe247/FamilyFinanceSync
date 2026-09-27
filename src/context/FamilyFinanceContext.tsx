/* =========================================================
   FAMILY FINANCE SYNC — REACTIVE STATE STORE & RBAC ENGINE
   ========================================================= */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
  SystemRoleType,
  LoanItem,
  InvestmentAsset,
  SharedExpenseSplit,
  FamilyInvitation,
  AllowanceConfig,
  VisibilityClassification,
} from '../types';
import { useAuth } from './AuthContext';
import { supabaseDataService } from '../services/supabaseDataService';
import { calculateFamilySummary, FamilyFinancialSummary } from '../utils/financialEngine';
import { getFamilyChannel } from '../lib/realtime/domain/familyRealtime';
import {
  DEMO_FAMILY,
  DEMO_FAMILIES,
  DEMO_MEMBERS,
  DEMO_USERS,
  USER_LINKED_FAMILIES,
  DemoUserOption,
  ROLE_DEFINITIONS,
  DEMO_CATEGORIES,
  DEMO_ACCOUNTS,
  DEMO_BUDGET,
  DEMO_TRANSACTIONS,
  DEMO_SAVINGS_GOALS,
  DEMO_REQUESTS,
  DEMO_RECURRING,
  DEMO_APPROVAL_RULES,
  DEMO_NOTIFICATIONS,
  DEMO_AUDIT_LOGS,
  DEMO_LOANS,
  DEMO_INVESTMENTS,
  DEMO_SHARED_EXPENSES,
  SYSTEM_PERMISSIONS,
} from '../data/seedData';
import { normalizeRole } from '../utils/permissions';

interface FamilyFinanceContextType {
  // Privacy & Linked Family Architecture (Section 1-37)
  allFamilies: Family[];
  activeFamily: Family;
  linkedFamilies: FamilyMembership[];
  activeUserId: string;
  demoUsers: DemoUserOption[];
  switchDemoUser: (userId: string) => void;
  switchActiveFamily: (familyId: string) => void;
  createFamily: (name: string, description?: string, currency?: string, country?: string) => Family;
  joinFamily: (inviteCode: string) => { success: boolean; message: string; family?: Family };
  updateTransactionVisibility: (txId: string, newVisibility: 'private' | 'family', targetFamilyId?: string) => void;
  authorizedTransactions: Transaction[];
  familyTransactions: Transaction[];
  privateTransactions: Transaction[];
  privateSummary: {
    privateIncome: number;
    privateExpenses: number;
    privateSavings: number;
    privateTransactions: Transaction[];
  };
  activeFamilyMembers: FamilyMember[];
  familyGoals: SavingsGoal[];
  privateGoals: SavingsGoal[];
  familyLoans: LoanItem[];
  privateLoans: LoanItem[];

  family: Family;
  members: FamilyMember[];
  currentMember: FamilyMember;
  roles: RoleDefinition[];
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  summary: FamilyFinancialSummary;
  budget: Budget;
  savingsGoals: SavingsGoal[];
  requests: ExpenseRequest[];
  recurring: RecurringTransaction[];
  approvalRules: ApprovalRule[];
  notifications: NotificationItem[];
  auditLogs: AuditLogItem[];
  loans: LoanItem[];
  investments: InvestmentAsset[];
  sharedExpenses: SharedExpenseSplit[];
  invitations: FamilyInvitation[];
  allowances: AllowanceConfig[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  switchMember: (memberId: string) => void;
  hasPermission: (perm: PermissionKey) => boolean;
  canApproveRequestAmount: (amountPaise: number) => boolean;

  // Actions
  addTransaction: (tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'family_id'> & { family_id?: string | null }) => Transaction;
  deleteTransaction: (id: string) => void;
  transferFunds: (fromAccountId: string, toAccountId: string, amountPaise: number, description: string) => void;
  transferBetweenMembers: (fromMemberId: string, toMemberId: string, amountPaise: number, note: string) => void;
  disburseAllowance: (memberId: string, amountPaise: number) => void;
  addAccount: (acc: Omit<Account, 'id' | 'created_at' | 'family_id'>) => void;
  deleteAccount: (id: string) => void;
  createRequest: (req: { title: string; amount: number; category_id: string; description: string; request_type?: ExpenseRequest['request_type'] }) => ExpenseRequest;
  approveRequest: (requestId: string, reviewComment?: string) => void;
  rejectRequest: (requestId: string, reviewComment?: string) => void;
  contributeToGoal: (goalId: string, amountPaise: number) => void;
  createGoal: (goal: Omit<SavingsGoal, 'id' | 'family_id' | 'created_at' | 'updated_at' | 'current_amount'>) => void;
  updateBudgetCategory: (categoryId: string, amountPaise: number) => void;
  updateMemberLimit: (memberId: string, limitPaise: number) => void;
  updateMemberRole: (memberId: string, newRole: SystemRoleType) => void;
  toggleMemberPermission: (memberId: string, perm: PermissionKey, allowed: boolean) => void;
  grantAllMemberPermissions: (memberId: string) => void;
  revokeAllMemberPermissions: (memberId: string) => void;
  resetMemberPermissions: (memberId: string) => void;
  savePermissionsToBackend: (changedMemberIds: string[]) => Promise<{ success: boolean; error?: string }>;
  inviteMember: (name: string, email: string, role: SystemRoleType, allowance?: number) => void;
  createInvitation: (role: SystemRoleType, email?: string) => FamilyInvitation;
  revokeInvitation: (invitationId: string) => void;
  removeMember: (memberId: string) => void;
  createRole: (roleName: string, description: string) => RoleDefinition;
  updateMemberSharing: (memberId: string, incomeSharing: boolean, expenseSharing: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addLoan: (loan: Omit<LoanItem, 'id' | 'family_id' | 'created_at' | 'total_paid'>) => void;
  recordEmiPayment: (loanId: string, amountPaise: number) => void;
  deleteLoan: (id: string) => void;
  addInvestment: (inv: Omit<InvestmentAsset, 'id' | 'family_id'>) => void;
  updateInvestmentValue: (id: string, currentValuePaise: number) => void;
  deleteInvestment: (id: string) => void;
  addSharedExpense: (split: Omit<SharedExpenseSplit, 'id' | 'family_id' | 'created_at'>) => void;
  settleSplitShare: (splitId: string, memberId: string) => void;
  markRecurringPaid: (id: string) => void;
  updateUserProfile: (
    name: string,
    email: string,
    avatarUrl?: string,
    extra?: {
      phone?: string;
      date_of_birth?: string;
      gender?: string;
      location?: string;
      bio?: string;
    }
  ) => void;
  updateFamilyName: (newName: string) => void;
  resetToDemoDefaults: () => void;
  bulkImportFamilyData: (data: {
    members?: Partial<FamilyMember>[];
    accounts?: Partial<Account>[];
    transactions?: Partial<Transaction>[];
    savingsGoals?: Partial<SavingsGoal>[];
  }) => void;
  createFamilyWorkspace: (familyName: string, currency?: string, timezone?: string) => FamilyMember;
  lookupInvitation: (inviteCodeOrLink: string) => { found: boolean; invitation?: FamilyInvitation; familyName: string; inviterName: string; assignedRole: SystemRoleType } | null;
  acceptInvitation: (inviteCodeOrLink: string, userName: string, userEmail: string) => FamilyMember;
  loadDemoFamilyWorkspace: () => void;
  isDemoMode: boolean;
}

const FamilyFinanceContext = createContext<FamilyFinanceContextType | undefined>(undefined);

const STORAGE_PREFIX = 'ffs_demo_privacy_v1_';

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export const FamilyFinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('ffs_theme') as 'light' | 'dark') || 'light';
  });

  const { user, memberships, isAuthenticated } = useAuth();

  const [family, setFamily] = useState<Family>(() => loadStorage('family', DEMO_FAMILY));
  const [members, setMembers] = useState<FamilyMember[]>(() => {
    const loaded = loadStorage<FamilyMember[]>('members', DEMO_MEMBERS);
    return loaded && loaded.length > 0 ? loaded : DEMO_MEMBERS;
  });
  const [currentMemberId, setCurrentMemberId] = useState<string>(() => loadStorage('active_member_id', 'mem-vignesh'));
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => loadStorage('is_demo_mode', true));

  const checkReadOnly = useCallback((): boolean => {
    return false;
  }, []);

  const [categories] = useState<Category[]>(() => loadStorage('categories', DEMO_CATEGORIES));
  const [roles, setRoles] = useState<RoleDefinition[]>(() => loadStorage('roles', ROLE_DEFINITIONS));
  const [accounts, setAccounts] = useState<Account[]>(() => loadStorage('accounts', DEMO_ACCOUNTS));
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadStorage('transactions', DEMO_TRANSACTIONS));
  const [budget, setBudget] = useState<Budget>(() => loadStorage('budget', DEMO_BUDGET));
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(() => loadStorage('savings_goals', DEMO_SAVINGS_GOALS));
  const [requests, setRequests] = useState<ExpenseRequest[]>(() => loadStorage('requests', DEMO_REQUESTS));
  const [recurring, setRecurring] = useState<RecurringTransaction[]>(() => loadStorage('recurring', DEMO_RECURRING));
  const [approvalRules] = useState<ApprovalRule[]>(() => loadStorage('approval_rules', DEMO_APPROVAL_RULES));
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => loadStorage('notifications', DEMO_NOTIFICATIONS));
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => loadStorage('audit_logs', DEMO_AUDIT_LOGS));
  const [loans, setLoans] = useState<LoanItem[]>(() => loadStorage('loans', DEMO_LOANS));
  const [investments, setInvestments] = useState<InvestmentAsset[]>(() => loadStorage('investments', DEMO_INVESTMENTS));
  const [sharedExpenses, setSharedExpenses] = useState<SharedExpenseSplit[]>(() => loadStorage('shared_expenses', DEMO_SHARED_EXPENSES));
  const [invitations, setInvitations] = useState<FamilyInvitation[]>(() => loadStorage('invitations', []));
  const [allowances, setAllowances] = useState<AllowanceConfig[]>(() => loadStorage('allowances', []));

  // Privacy & Linked Family State
  const [allFamilies, setAllFamilies] = useState<Family[]>(() => loadStorage('all_families', DEMO_FAMILIES));
  const [activeUserId, setActiveUserId] = useState<string>(() => loadStorage('active_demo_user_id', 'user-vignesh'));
  const [linkedFamiliesMap, setLinkedFamiliesMap] = useState<Record<string, FamilyMembership[]>>(() => loadStorage('linked_families_map', USER_LINKED_FAMILIES));

  // Sync real user session and active family when logged in
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      setActiveUserId(user.id);
      saveStorage('active_demo_user_id', user.id);

      if (memberships && memberships.length > 0) {
        setIsDemoMode(false);
        saveStorage('is_demo_mode', false);

        // Purge legacy demo members from localStorage cache
        try {
          const cachedMems = loadStorage<any[]>('members', []);
          const cleanMems = cachedMems.filter(m => !m.id?.startsWith('mem-') && !m.user_id?.startsWith('user-') && m.family_id !== 'fam-demo-001');
          saveStorage('members', cleanMems);
          setMembers(cleanMems);
        } catch (e) {
          console.warn('Failed to purge cached demo members:', e);
        }

        const primaryMem = memberships[0];
        if (primaryMem && primaryMem.family_id) {
          const syncedFam: Family = {
            id: primaryMem.family_id,
            name: primaryMem.family_name,
            description: primaryMem.description || 'Family Workspace',
            currency: 'INR',
            country: 'India',
            owner_id: user.id,
            timezone: 'Asia/Kolkata',
            created_at: primaryMem.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          setFamily(syncedFam);
          saveStorage('family', syncedFam);
        }
      }
    }
  }, [user, memberships, isAuthenticated]);

  useEffect(() => saveStorage('all_families', allFamilies), [allFamilies]);
  useEffect(() => saveStorage('active_demo_user_id', activeUserId), [activeUserId]);
  useEffect(() => saveStorage('linked_families_map', linkedFamiliesMap), [linkedFamiliesMap]);

  const activeFamily = family || allFamilies?.[0] || DEMO_FAMILIES[0];
  const linkedFamilies = linkedFamiliesMap[activeUserId] || [
    {
      family_id: family.id,
      family_name: family.name,
      role: 'member',
      status: 'active',
      member_count: 1,
      description: family.description,
      currency: family.currency,
    }
  ];

  // Scoped Data Collections
  const activeFamilyMembers = React.useMemo(() => {
    const list = members.filter(m => {
      if (m.family_id !== family.id) return false;
      if (!isDemoMode && (m.id.startsWith('mem-') || m.user_id.startsWith('user-') || m.family_id === 'fam-demo-001')) {
        return false;
      }
      return true;
    });

    if (list.length === 0 && user && !isDemoMode) {
      const userRole = (memberships?.[0]?.role as SystemRoleType) || 'family_head';
      const now = new Date().toISOString();
      return [{
        id: user.id,
        family_id: family.id,
        user_id: user.id,
        role: userRole,
        status: 'active' as const,
        joined_at: user.created_at || now,
        created_at: user.created_at || now,
        custom_permissions: {},
        user: {
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member User',
          email: user.email || '',
          avatar_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email || 'user'}`,
          created_at: user.created_at || now,
          updated_at: user.updated_at || now,
        }
      }];
    }

    return list;
  }, [members, family.id, isDemoMode, user, memberships]);

  // Authorized Transactions for active user
  const authorizedTransactions = React.useMemo(() => {
    return transactions.filter(tx => {
      if (!isDemoMode && (tx.id.startsWith('tx-') || (tx.family_id && tx.family_id.startsWith('fam-demo')))) return false;
      if (tx.user_id === activeUserId) return true;
      if (tx.family_id === family.id && (tx.visibility === 'family' || tx.visibility === 'FAMILY_SHARED' || tx.is_shared)) return true;
      return false;
    });
  }, [transactions, activeUserId, family.id, isDemoMode]);

  // Family Transactions: ONLY shared family transactions for active family
  const familyTransactions = React.useMemo(() => {
    return transactions.filter(tx => {
      if (!isDemoMode && (tx.id.startsWith('tx-') || (tx.family_id && tx.family_id.startsWith('fam-demo')))) return false;
      return tx.family_id === family.id && (tx.visibility === 'family' || tx.visibility === 'FAMILY_SHARED' || (tx.is_shared && tx.visibility !== 'private'));
    });
  }, [transactions, family.id, isDemoMode]);

  // Private Transactions: ONLY created by active user and marked private
  const privateTransactions = React.useMemo(() => {
    return transactions.filter(tx => {
      if (!isDemoMode && (tx.id.startsWith('tx-') || (tx.family_id && tx.family_id.startsWith('fam-demo')))) return false;
      return tx.user_id === activeUserId && (tx.visibility === 'private' || tx.visibility === 'PERSONAL' || tx.family_id === null || !tx.is_shared);
    });
  }, [transactions, activeUserId, isDemoMode]);

  // Private Summary calculations (Section 5)
  const privateSummary = React.useMemo(() => {
    let privateIncome = 0;
    let privateExpenses = 0;
    privateTransactions.forEach(tx => {
      if (tx.status === 'voided') return;
      if (tx.type === 'income' || tx.type === 'refund') {
        privateIncome += tx.amount;
      } else if (tx.type === 'expense') {
        privateExpenses += tx.amount;
      }
    });
    return {
      privateIncome,
      privateExpenses,
      privateSavings: Math.max(0, privateIncome - privateExpenses),
      privateTransactions,
    };
  }, [privateTransactions]);

  // Family Goals vs Private Goals
  const familyGoals = React.useMemo(() => {
    return savingsGoals.filter(g => {
      if (!isDemoMode && (g.id.startsWith('goal-') || (g.family_id && g.family_id.startsWith('fam-demo')))) return false;
      return g.family_id === family.id && (g.visibility === 'family' || !g.visibility);
    });
  }, [savingsGoals, family.id, isDemoMode]);

  const privateGoals = React.useMemo(() => {
    return savingsGoals.filter(g => {
      if (!isDemoMode && (g.id.startsWith('goal-') || (g.family_id && g.family_id.startsWith('fam-demo')))) return false;
      return g.created_by === activeUserId && (g.visibility === 'private' || g.family_id === null);
    });
  }, [savingsGoals, activeUserId, isDemoMode]);

  // Family Loans vs Private Loans
  const familyLoans = React.useMemo(() => {
    return loans.filter(l => {
      if (!isDemoMode && (l.id.startsWith('loan-') || (l.family_id && l.family_id.startsWith('fam-demo')))) return false;
      return l.family_id === family.id && (l.visibility === 'family' || !l.visibility);
    });
  }, [loans, family.id, isDemoMode]);

  const privateLoans = React.useMemo(() => {
    return loans.filter(l => {
      if (!isDemoMode && (l.id.startsWith('loan-') || (l.family_id && l.family_id.startsWith('fam-demo')))) return false;
      return (l.user_id === activeUserId || !l.family_id) && (l.visibility === 'private' || l.family_id === null);
    });
  }, [loans, activeUserId, isDemoMode]);

  const activeInvestments = React.useMemo(() => {
    return investments.filter(i => {
      if (!isDemoMode && (i.id.startsWith('inv-') || (i.family_id && i.family_id.startsWith('fam-demo')))) return false;
      return i.family_id === family.id;
    });
  }, [investments, family.id, isDemoMode]);

  const activeLoansList = React.useMemo(() => {
    return loans.filter(l => {
      if (!isDemoMode && (l.id.startsWith('loan-') || (l.family_id && l.family_id.startsWith('fam-demo')))) return false;
      return l.family_id === family.id;
    });
  }, [loans, family.id, isDemoMode]);

  const activeSavingsGoalsList = React.useMemo(() => {
    return savingsGoals.filter(g => {
      if (!isDemoMode && (g.id.startsWith('goal-') || (g.family_id && g.family_id.startsWith('fam-demo')))) return false;
      return g.family_id === family.id;
    });
  }, [savingsGoals, family.id, isDemoMode]);

  const activeAccountsList = React.useMemo(() => {
    return accounts.filter(a => {
      if (!isDemoMode && (a.id.startsWith('acc-') || (a.family_id && a.family_id.startsWith('fam-demo')))) return false;
      return a.family_id === family.id;
    });
  }, [accounts, family.id, isDemoMode]);

  const activeRequestsList = React.useMemo(() => {
    return requests.filter(r => {
      if (!isDemoMode && (r.id.startsWith('req-') || (r.family_id && r.family_id.startsWith('fam-demo')))) return false;
      return r.family_id === family.id;
    });
  }, [requests, family.id, isDemoMode]);

  const activeRecurringList = React.useMemo(() => {
    return recurring.filter(r => {
      if (!isDemoMode && (r.id.startsWith('rec-') || (r.family_id && r.family_id.startsWith('fam-demo')))) return false;
      return r.family_id === family.id;
    });
  }, [recurring, family.id, isDemoMode]);

  const activeAuditLogsList = React.useMemo(() => {
    return auditLogs.filter(a => {
      if (!isDemoMode && (a.id.startsWith('aud-') || (a.family_id && a.family_id.startsWith('fam-demo')))) return false;
      return a.family_id === family.id;
    });
  }, [auditLogs, family.id, isDemoMode]);

  const activeSharedExpensesList = React.useMemo(() => {
    return sharedExpenses.filter(s => {
      if (!isDemoMode && (s.id.startsWith('se-') || (s.family_id && s.family_id.startsWith('fam-demo')))) return false;
      return s.family_id === family.id;
    });
  }, [sharedExpenses, family.id, isDemoMode]);

  const activeBudgetObj = React.useMemo(() => {
    if (!isDemoMode && (budget.id.startsWith('bgt-') || (budget.family_id && budget.family_id.startsWith('fam-demo')))) {
      return {
        id: `bgt-${family.id}`,
        family_id: family.id,
        name: `${family.name} Budget`,
        period: 'monthly' as const,
        start_date: new Date().toISOString().slice(0, 7) + '-01',
        end_date: new Date().toISOString().slice(0, 7) + '-30',
        total_amount: 0,
        created_by: activeUserId,
        alert_thresholds: [70, 80, 90, 100],
        categories: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return budget;
  }, [budget, family.id, family.name, isDemoMode, activeUserId]);

  // Centralized Financial Aggregation Engine (Sections 2, 11, 21, 26, 46)
  const summary = React.useMemo(() => {
    return calculateFamilySummary(familyTransactions, activeAccountsList);
  }, [familyTransactions, activeAccountsList]);

  // Supabase Real-Time Channel Subscription (Sections 8, 10, 36)
  useEffect(() => {
    if (!family.id || isDemoMode || family.id === 'fam-demo-001') return;

    // 1. Initial fetch from Supabase
    supabaseDataService.fetchFamilyWorkspace(family.id).then(data => {
      if (data) {
        if (data.members && data.members.length > 0) {
          const fetchedMembers: FamilyMember[] = data.members.map((m: any) => {
            const now = new Date().toISOString();
            return {
              id: m.id || m.user_id,
              family_id: m.family_id,
              user_id: m.user_id,
              role: m.role || 'member',
              status: (m.status as 'active' | 'pending' | 'suspended') || 'active',
              joined_at: m.joined_at || now,
              created_at: m.created_at || now,
              custom_permissions: m.custom_permissions || {},
              user: {
                id: m.user_id,
                name: m.profiles?.full_name || m.profiles?.first_name || m.profiles?.email?.split('@')[0] || 'Family Member',
                email: m.profiles?.email || '',
                avatar_url: m.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`,
                created_at: m.profiles?.created_at || now,
                updated_at: m.profiles?.updated_at || now,
              }
            };
          });
          setMembers(fetchedMembers);
        }
        if (data.transactions && data.transactions.length > 0) {
          setTransactions(data.transactions);
        }
        if (data.accounts && data.accounts.length > 0) {
          setAccounts(data.accounts);
        }
        if (data.requests && data.requests.length > 0) {
          setRequests(data.requests);
        }
        if (data.auditLogs && data.auditLogs.length > 0) {
          setAuditLogs(data.auditLogs);
        }
      }
    });

    // 2. Realtime listener on channel family:{familyId}
    const unsubscribe = supabaseDataService.subscribeToFamilyRealtime(
      family.id,
      (table, eventType, newRow, oldRow) => {
        if (table === 'transactions') {
          if (eventType === 'INSERT' && newRow) {
            setTransactions(prev => (prev.some(t => t.id === newRow.id) ? prev : [newRow, ...prev]));
          } else if (eventType === 'DELETE' && oldRow) {
            setTransactions(prev => prev.filter(t => t.id !== oldRow.id));
          } else if (eventType === 'UPDATE' && newRow) {
            setTransactions(prev => prev.map(t => (t.id === newRow.id ? newRow : t)));
          }
        } else if (table === 'requests') {
          if (eventType === 'INSERT' && newRow) {
            setRequests(prev => (prev.some(r => r.id === newRow.id) ? prev : [newRow, ...prev]));
          } else if (eventType === 'UPDATE' && newRow) {
            setRequests(prev => prev.map(r => (r.id === newRow.id ? newRow : r)));
          }
        } else if (table === 'audit_logs') {
          if (eventType === 'INSERT' && newRow) {
            setAuditLogs(prev => (prev.some(a => a.id === newRow.id) ? prev : [newRow, ...prev]));
          }
        } else if (table === 'accounts') {
          if (eventType === 'UPDATE' && newRow) {
            setAccounts(prev => prev.map(a => (a.id === newRow.id ? newRow : a)));
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [family.id, isDemoMode]);

  // Sync state changes to storage
  useEffect(() => saveStorage('family', family), [family]);
  useEffect(() => saveStorage('members', members), [members]);
  useEffect(() => saveStorage('roles', roles), [roles]);
  useEffect(() => saveStorage('active_member_id', currentMemberId), [currentMemberId]);
  useEffect(() => saveStorage('accounts', accounts), [accounts]);
  useEffect(() => saveStorage('transactions', transactions), [transactions]);
  useEffect(() => saveStorage('budget', budget), [budget]);
  useEffect(() => saveStorage('savings_goals', savingsGoals), [savingsGoals]);
  useEffect(() => saveStorage('requests', requests), [requests]);
  useEffect(() => saveStorage('recurring', recurring), [recurring]);
  useEffect(() => saveStorage('notifications', notifications), [notifications]);
  useEffect(() => saveStorage('audit_logs', auditLogs), [auditLogs]);
  useEffect(() => saveStorage('loans', loans), [loans]);
  useEffect(() => saveStorage('investments', investments), [investments]);
  useEffect(() => saveStorage('shared_expenses', sharedExpenses), [sharedExpenses]);
  useEffect(() => saveStorage('invitations', invitations), [invitations]);
  useEffect(() => saveStorage('allowances', allowances), [allowances]);

  // Apply theme to html element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ffs_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const currentMember = React.useMemo(() => {
    if (!isDemoMode && user) {
      const userRole = (memberships?.[0]?.role as SystemRoleType) || 'family_head';
      const now = new Date().toISOString();
      return {
        id: user.id,
        family_id: family?.id || 'default-family',
        user_id: user.id,
        role: userRole,
        status: 'active' as const,
        joined_at: user.created_at || now,
        created_at: user.created_at || now,
        custom_permissions: {},
        user: {
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member User',
          email: user.email || '',
          avatar_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email || 'user'}`,
          created_at: user.created_at || now,
          updated_at: user.updated_at || now,
        }
      };
    }
    return members.find(m => m.id === currentMemberId) || activeFamilyMembers[0] || members[0] || DEMO_MEMBERS[0];
  }, [isDemoMode, user, memberships, family?.id, members, currentMemberId, activeFamilyMembers]);

  const switchMember = useCallback((memberId: string) => {
    const found = members.find(m => m.id === memberId);
    if (found) {
      setCurrentMemberId(found.id);
    }
  }, [members]);

  // Append audit event
  const logAudit = useCallback((action: string, entity_type: string, entity_id?: string, metadata?: Record<string, unknown>) => {
    const userId = currentMember?.user_id || 'system';
    const userName = currentMember?.user?.name
      ? `${currentMember.user.name} (${(currentMember.role || 'user').replace('_', ' ')})`
      : 'System';
    const newLog: AuditLogItem = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      family_id: family?.id || 'default-family',
      user_id: userId,
      user_name: userName,
      action,
      entity_type,
      entity_id,
      metadata,
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [newLog, ...prev]);
  }, [family?.id, currentMember]);

  // Add notification
  const addNotification = useCallback((userId: string, type: NotificationItem['type'], title: string, message: string) => {
    const notif: NotificationItem = {
      id: `notif-${Date.now()}`,
      family_id: family.id,
      user_id: userId,
      type,
      title,
      message,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setNotifications(prev => [notif, ...prev]);
  }, [family.id]);

  // Dynamic RBAC Permission Check
  const hasPermission = useCallback((perm: PermissionKey): boolean => {
    if (!currentMember) return false;
    const normRole = normalizeRole(currentMember.role || 'viewer');
    if (normRole === 'family_head' || currentMember.role === 'FAMILY_HEAD') return true;

    const customPerms = (currentMember.custom_permissions || {}) as Record<string, boolean>;
    if (customPerms[perm] !== undefined) {
      return Boolean(customPerms[perm]);
    }

    // Role default permissions
    const roleDef = roles.find(r => 
      r.id === currentMember.role ||
      r.name.toLowerCase() === (currentMember.role || '').toLowerCase() ||
      normalizeRole(r.name) === normRole
    );
    return roleDef ? (roleDef.default_permissions?.includes(perm) ?? false) : false;
  }, [currentMember, roles]);

  // Check if member can approve an amount based on Approval Rules Engine
  const canApproveRequestAmount = useCallback((amountPaise: number): boolean => {
    if (!currentMember) return false;
    if (currentMember.role === 'FAMILY_HEAD') return true;
    if (currentMember.role === 'CO_MANAGER') {
      // Co-manager can approve up to ₹2,000 (200,000 paise)
      return amountPaise <= 200000;
    }
    return false;
  }, [currentMember?.role]);

  // Action: Add Transaction
  const addTransaction = useCallback((txData: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'family_id'> & { family_id?: string | null; visibility?: string }): Transaction => {
    if (checkReadOnly()) {
      return {
        ...txData,
        id: `demo-blocked-${Date.now()}`,
        family_id: family.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Transaction;
    }

    const isPrivate = txData.visibility === 'private';
    const newTx: Transaction = {
      ...txData,
      id: `tx-${Date.now()}`,
      family_id: isPrivate ? null : (txData.family_id || family.id),
      visibility: txData.visibility || 'private',
      is_shared: !isPrivate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setTransactions(prev => [newTx, ...prev]);

    // Update account balance
    setAccounts(prev => prev.map(acc => {
      if (acc.id === txData.account_id) {
        const delta = txData.type === 'income' ? txData.amount : -txData.amount;
        return { ...acc, balance: acc.balance + delta };
      }
      return acc;
    }));

    // Record audit
    logAudit('TRANSACTION_CREATED', 'transaction', newTx.id, {
      type: newTx.type,
      amount: newTx.amount,
      description: newTx.description,
    });

    // Supabase PostgreSQL sync
    if (!isDemoMode && family.id && !family.id.startsWith('fam-demo')) {
      supabaseDataService.createTransaction({
        ...txData,
        family_id: family.id,
      }).catch(err => console.warn('Supabase createTransaction deferred:', err));
    }

    // Realtime domain event publication
    try {
      getFamilyChannel(family.id).publish('transaction.created', {
        id: newTx.id,
        user_id: newTx.user_id,
        type: newTx.type,
        amount: newTx.amount,
        category_id: newTx.category_id,
        custom_category: newTx.custom_category,
        description: newTx.description,
        date: newTx.transaction_date,
      });
    } catch (err) {
      console.warn('Realtime publish warning:', err);
    }

    // Notify Family Head if another member added expense/income
    const head = members.find(m => m.role === 'FAMILY_HEAD' || m.role === 'family_head');
    if (head && head.user_id !== txData.user_id) {
      addNotification(
        head.user_id,
        'member_activity',
        `New ${txData.type === 'income' ? 'Income' : 'Expense'} from ${currentMember?.user?.name || 'Member'}`,
        `${currentMember?.user?.name || 'A member'} recorded ${newTx.description || 'a transaction'} for ₹${(newTx.amount / 100).toLocaleString('en-IN')}.`
      );
    }

    return newTx;
  }, [family.id, logAudit, checkReadOnly, isDemoMode, members, currentMember, addNotification]);

  // Action: Delete Transaction
  const deleteTransaction = useCallback((id: string) => {
    if (checkReadOnly()) return;
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    setTransactions(prev => prev.filter(t => t.id !== id));

    // Reverse account balance
    setAccounts(prev => prev.map(acc => {
      if (acc.id === tx.account_id) {
        const delta = tx.type === 'income' ? -tx.amount : tx.amount;
        return { ...acc, balance: acc.balance + delta };
      }
      return acc;
    }));

    logAudit('TRANSACTION_DELETED', 'transaction', id, {
      description: tx.description,
      amount: tx.amount,
    });

    // Supabase PostgreSQL delete
    if (!isDemoMode && family.id && !family.id.startsWith('fam-demo')) {
      supabaseDataService.deleteTransaction(
        id,
        tx.account_id,
        tx.amount,
        tx.type,
        family.id,
        currentMember.user_id
      ).catch(err => console.warn('Supabase deleteTransaction deferred:', err));
    }
  }, [transactions, logAudit, checkReadOnly, isDemoMode, family?.id, currentMember?.user_id]);

  // Action: Create Request
  const createRequest = useCallback((reqData: { title: string; amount: number; category_id: string; description: string; request_type?: ExpenseRequest['request_type'] }): ExpenseRequest => {
    // Check if auto-approved rule triggers (e.g. adult member < ₹500, but NOT child)
    const isChild = currentMember?.role === 'CHILD' || currentMember?.role === 'son' || currentMember?.role === 'daughter';
    const isAutoApproved = !isChild && reqData.amount <= 50000;

    const newReq: ExpenseRequest = {
      id: `req-${Date.now()}`,
      family_id: family?.id || 'default-family',
      requested_by: currentMember?.user_id || 'system',
      requester_name: currentMember?.user?.name || 'Member',
      amount: reqData.amount,
      category_id: reqData.category_id,
      title: reqData.title,
      description: reqData.description,
      request_type: reqData.request_type || 'permission_request',
      status: isAutoApproved ? 'approved' : 'pending',
      reviewed_by: isAutoApproved ? 'system' : undefined,
      reviewer_name: isAutoApproved ? 'Auto-Approval Rule' : undefined,
      reviewed_at: isAutoApproved ? new Date().toISOString() : undefined,
      review_comment: isAutoApproved ? 'Automatically approved under ₹500 rule' : undefined,
      created_at: new Date().toISOString(),
    };

    setRequests(prev => [newReq, ...prev]);

    // Realtime publication
    try {
      getFamilyChannel(family.id).publish('request.created', {
        id: newReq.id,
        requested_by: newReq.requested_by,
        title: newReq.title,
        amount: newReq.amount,
        request_type: newReq.request_type,
      });
    } catch (err) {
      console.warn('Realtime publish warning:', err);
    }

    // If auto-approved, also create transaction
    if (isAutoApproved) {
      addTransaction({
        user_id: currentMember.user_id,
        account_id: accounts[0]?.id || 'acc-hdfc',
        category_id: reqData.category_id,
        type: 'expense',
        amount: reqData.amount,
        description: `Approved Request: ${reqData.title}`,
        transaction_date: new Date().toISOString(),
        payment_method: 'Auto Approved Request',
        is_shared: true,
        status: 'cleared',
      });
    }

    logAudit('REQUEST_SUBMITTED', 'request', newReq.id, {
      title: newReq.title,
      amount: newReq.amount,
      auto_approved: isAutoApproved,
    });

    // Notify Family Head
    const head = members.find(m => m.role === 'FAMILY_HEAD');
    if (head && head.user_id !== currentMember?.user_id) {
      addNotification(
        head.user_id,
        'request_created',
        `New Request from ${currentMember?.user?.name || 'Member'}`,
        `${currentMember?.user?.name || 'A member'} submitted a request for "${newReq.title}" (${(newReq.amount / 100).toLocaleString('en-IN')}).`
      );
    }

    // Supabase PostgreSQL request
    if (!isDemoMode && family.id && !family.id.startsWith('fam-demo')) {
      supabaseDataService.createExpenseRequest({
        family_id: family.id,
        requested_by: currentMember.user_id,
        amount: reqData.amount,
        category_id: reqData.category_id,
        title: reqData.title,
        description: reqData.description,
      }).catch(err => console.warn('Supabase createExpenseRequest deferred:', err));
    }

    return newReq;
  }, [currentMember, family.id, accounts, addTransaction, logAudit, members, addNotification, isDemoMode]);

  // Action: Approve Request
  const approveRequest = useCallback((requestId: string, reviewComment?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return;

    const now = new Date().toISOString();
    setRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'approved',
          reviewed_by: currentMember.user_id,
          reviewer_name: currentMember.user.name,
          reviewed_at: now,
          review_comment: reviewComment || 'Approved by reviewer',
        };
      }
      return r;
    }));

    // Generate transaction automatically
    addTransaction({
      user_id: req.requested_by,
      account_id: accounts[0]?.id || 'acc-hdfc',
      category_id: req.category_id,
      type: 'expense',
      amount: req.amount,
      description: `Approved Request: ${req.title}`,
      transaction_date: now,
      payment_method: 'Family Request Approval',
      is_shared: true,
      status: 'cleared',
    });

    logAudit('REQUEST_APPROVED', 'request', requestId, {
      requester: req.requester_name,
      amount: req.amount,
      comment: reviewComment,
    });

    // Supabase PostgreSQL approval
    if (!isDemoMode && family?.id && !family.id.startsWith('fam-demo')) {
      supabaseDataService.reviewExpenseRequest(requestId, 'approved', currentMember?.user_id || 'system', reviewComment);
    }

    // Notify requester
    addNotification(
      req.requested_by,
      'request_resolved',
      `Request Approved: ${req.title}`,
      `Your request for ₹${(req.amount / 100).toLocaleString('en-IN')} was approved by ${currentMember?.user?.name || 'Family Head'}.`
    );

    try {
      getFamilyChannel(family?.id || '').publish('request.approved', {
        id: requestId,
        reviewed_by: currentMember?.user_id,
        reviewer_name: currentMember?.user?.name || 'Family Head',
      });
    } catch (err) {
      console.warn('Realtime publish warning:', err);
    }
  }, [requests, currentMember, addTransaction, accounts, logAudit, addNotification, family?.id, isDemoMode]);

  // Action: Reject Request
  const rejectRequest = useCallback((requestId: string, reviewComment?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return;

    setRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'rejected',
          reviewed_by: currentMember?.user_id || 'system',
          reviewer_name: currentMember?.user?.name || 'Family Head',
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment || 'Request declined',
        };
      }
      return r;
    }));

    logAudit('REQUEST_REJECTED', 'request', requestId, {
      requester: req.requester_name,
      amount: req.amount,
      comment: reviewComment,
    });

    addNotification(
      req.requested_by,
      'request_resolved',
      `Request Declined: ${req.title}`,
      `Your request for ₹${(req.amount / 100).toLocaleString('en-IN')} was rejected by ${currentMember?.user?.name || 'Family Head'}. Reason: ${reviewComment || 'Not approved'}.`
    );

    try {
      getFamilyChannel(family?.id || '').publish('request.rejected', {
        id: requestId,
        reviewed_by: currentMember?.user_id,
        reviewer_name: currentMember?.user?.name || 'Family Head',
      });
    } catch (err) {
      console.warn('Realtime publish warning:', err);
    }
  }, [requests, currentMember, logAudit, addNotification, family?.id]);

  // Action: Contribute to Goal
  const contributeToGoal = useCallback((goalId: string, amountPaise: number) => {
    setSavingsGoals(prev => prev.map(goal => {
      if (goal.id === goalId) {
        const updatedAmount = Math.min(goal.target_amount, goal.current_amount + amountPaise);
        return {
          ...goal,
          current_amount: updatedAmount,
          status: updatedAmount >= goal.target_amount ? 'completed' : goal.status,
          updated_at: new Date().toISOString(),
        };
      }
      return goal;
    }));

    logAudit('GOAL_CONTRIBUTION', 'savings_goal', goalId, { amount: amountPaise });
  }, [logAudit]);

  // Action: Create Goal
  const createGoal = useCallback((goalData: Omit<SavingsGoal, 'id' | 'family_id' | 'created_at' | 'updated_at' | 'current_amount'>) => {
    const newGoal: SavingsGoal = {
      ...goalData,
      id: `goal-${Date.now()}`,
      family_id: family.id,
      current_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSavingsGoals(prev => [...prev, newGoal]);
    logAudit('GOAL_CREATED', 'savings_goal', newGoal.id, { name: newGoal.name, target: newGoal.target_amount });
  }, [family.id, logAudit]);

  // Action: Update Budget Category
  const updateBudgetCategory = useCallback((categoryId: string, amountPaise: number) => {
    if (checkReadOnly()) return;
    setBudget(prev => {
      let found = false;
      const updatedCats = prev.categories.map(c => {
        if (c.category_id === categoryId) {
          found = true;
          return { ...c, allocated_amount: amountPaise };
        }
        return c;
      });

      if (!found) {
        updatedCats.push({
          id: `bc-${Date.now()}`,
          budget_id: prev.id,
          category_id: categoryId,
          allocated_amount: amountPaise,
        });
      }

      const newTotal = updatedCats.reduce((sum, c) => sum + c.allocated_amount, 0);

      return {
        ...prev,
        total_amount: newTotal,
        categories: updatedCats,
        updated_at: new Date().toISOString(),
      };
    });

    logAudit('BUDGET_CATEGORY_UPDATED', 'budget', categoryId, { amount: amountPaise });
  }, [logAudit, checkReadOnly]);

  // Action: Update Member Limit
  const updateMemberLimit = useCallback((memberId: string, limitPaise: number) => {
    if (checkReadOnly()) return;
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return { ...m, monthly_spending_limit: limitPaise };
      }
      return m;
    }));
    logAudit('MEMBER_LIMIT_UPDATED', 'member', memberId, { limit: limitPaise });
  }, [logAudit, checkReadOnly]);

  // Action: Update Member Role & Transfer Ownership
  const updateMemberRole = useCallback((memberId: string, newRole: SystemRoleType) => {
    if (checkReadOnly()) return;
    const target = members.find(m => m.id === memberId);
    if (!target) return;

    const headCount = members.filter(m => m.role === 'FAMILY_HEAD' || m.role === 'family_head').length;
    const isTargetHead = target.role === 'FAMILY_HEAD' || target.role === 'family_head';
    const isNewHead = newRole === 'FAMILY_HEAD' || newRole === 'family_head';

    if (isTargetHead && !isNewHead && headCount <= 1) {
      alert('Cannot demote the only Family Head. Promote another member to Family Head first to transfer ownership.');
      return;
    }

    setMembers(prev => {
      const updated = prev.map(m => {
        if (m.id === memberId) {
          return { ...m, role: newRole };
        }
        return m;
      });
      saveStorage('members', updated);
      return updated;
    });

    if (isNewHead && target.user_id) {
      setFamily(prev => {
        const updatedFamily = { ...prev, owner_id: target.user_id, updated_at: new Date().toISOString() };
        saveStorage('family', updatedFamily);
        return updatedFamily;
      });
    }

    logAudit('MEMBER_ROLE_UPDATED', 'member', memberId, { name: target.user.name, newRole });
    addNotification(
      target.user_id,
      'member_activity',
      'Role Updated',
      `Role for ${target.user.name} was updated to ${newRole.replace('_', ' ')}.`
    );
  }, [members, logAudit, checkReadOnly, addNotification]);

  // Action: Toggle Member Custom Permission
  const toggleMemberPermission = useCallback((memberId: string, perm: PermissionKey, allowed: boolean) => {
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          custom_permissions: {
            ...m.custom_permissions,
            [perm]: allowed,
          },
        };
      }
      return m;
    }));
    logAudit('MEMBER_PERMISSION_OVERRIDE', 'permission', memberId, { perm, allowed });
  }, [logAudit]);

  // Action: Grant All Permissions to Member
  const grantAllMemberPermissions = useCallback((memberId: string) => {
    const allPerms: Partial<Record<PermissionKey, boolean>> = {};
    SYSTEM_PERMISSIONS.forEach(p => {
      allPerms[p.key] = true;
    });
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          custom_permissions: {
            ...m.custom_permissions,
            ...allPerms,
          },
        };
      }
      return m;
    }));
    logAudit('MEMBER_PERMISSIONS_GRANT_ALL', 'permission', memberId);
  }, [logAudit]);

  // Action: Revoke All Permissions from Member
  const revokeAllMemberPermissions = useCallback((memberId: string) => {
    const noPerms: Partial<Record<PermissionKey, boolean>> = {};
    SYSTEM_PERMISSIONS.forEach(p => {
      noPerms[p.key] = false;
    });
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          custom_permissions: {
            ...m.custom_permissions,
            ...noPerms,
          },
        };
      }
      return m;
    }));
    logAudit('MEMBER_PERMISSIONS_REVOKE_ALL', 'permission', memberId);
  }, [logAudit]);

  // Action: Reset Member Overrides to System Role Defaults
  const resetMemberPermissions = useCallback((memberId: string) => {
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          custom_permissions: {},
        };
      }
      return m;
    }));
    logAudit('MEMBER_PERMISSIONS_RESET_DEFAULTS', 'permission', memberId);
  }, [logAudit]);

  // Action: Save Permission Changes to Supabase Backend
  const savePermissionsToBackend = useCallback(async (changedMemberIds: string[]): Promise<{ success: boolean; error?: string }> => {
    // In demo mode: changes are already persisted to localStorage via the members useEffect
    if (isDemoMode || family.id.startsWith('fam-demo')) {
      return { success: true };
    }
    try {
      const targets = members.filter(m => changedMemberIds.includes(m.id));
      await Promise.all(
        targets.map(m =>
          supabaseDataService.updateMemberPermissions(
            m.id,
            m.custom_permissions || {},
            family.id,
            currentMember.user_id
          )
        )
      );
      logAudit('PERMISSIONS_BATCH_SAVED', 'permission', family.id, { count: targets.length });
      return { success: true };
    } catch (err: any) {
      console.error('[Context] savePermissionsToBackend failed:', err);
      return { success: false, error: err.message };
    }
  }, [isDemoMode, family?.id, members, currentMember?.user_id, logAudit]);

  // Action: Invite Member
  const inviteMember = useCallback((name: string, email: string, role: SystemRoleType, allowance?: number) => {
    const newUserId = `user-${Date.now()}`;
    const newMemberId = `mem-${Date.now()}`;
    const newMember: FamilyMember = {
      id: newMemberId,
      family_id: family.id,
      user_id: newUserId,
      user: {
        id: newUserId,
        name,
        email,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      role,
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      monthly_allowance: allowance || (role === 'CHILD' ? 500000 : 0),
      monthly_spending_limit: allowance || (role === 'CHILD' ? 500000 : 0),
    };

    setMembers(prev => [...prev, newMember]);
    logAudit('MEMBER_INVITED', 'member', newMemberId, { name, email, role });
  }, [currentMember, logAudit]);

  // Action: Create Invitation
  const createInvitation = useCallback((role: SystemRoleType, email?: string): FamilyInvitation => {
    const inviteId = `inv-${Date.now()}`;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const newInvite: FamilyInvitation = {
      id: inviteId,
      family_id: family.id,
      invite_code: code,
      invite_link: `${window.location.origin}/join?code=${code}&family=${family.id}`,
      invited_role: role,
      email,
      status: 'PENDING',
      created_by: currentMember.user_id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    setInvitations(prev => [newInvite, ...prev]);
    logAudit('INVITATION_CREATED', 'invitation', inviteId, { code, role, email });

    return newInvite;
  }, [family.id, currentMember, logAudit]);

  // Action: Revoke Invitation
  const revokeInvitation = useCallback((invitationId: string) => {
    setInvitations(prev => prev.map(inv => (inv.id === invitationId ? { ...inv, status: 'REVOKED' } : inv)));
    logAudit('INVITATION_REVOKED', 'invitation', invitationId);
  }, [logAudit]);

  // Action: Internal Transfer Between Members (without double-counting family cash flow)
  const transferBetweenMembers = useCallback((fromMemberId: string, toMemberId: string, amountPaise: number, note: string) => {
    const fromMember = members.find(m => m.id === fromMemberId);
    const toMember = members.find(m => m.id === toMemberId);

    if (!fromMember || !toMember) return;

    // Deduct from sender's primary account, credit recipient's primary account
    const fromAcc = accounts.find(a => a.type === 'wallet' || a.is_shared) || accounts[0];
    const toAcc = accounts.find(a => a.id !== fromAcc.id) || accounts[0];

    if (fromAcc && toAcc) {
      setAccounts(prev => prev.map(a => {
        if (a.id === fromAcc.id) return { ...a, balance: a.balance - amountPaise };
        if (a.id === toAcc.id) return { ...a, balance: a.balance + amountPaise };
        return a;
      }));
    }

    logAudit('INTERNAL_MEMBER_TRANSFER', 'transfer', `${fromMemberId}->${toMemberId}`, {
      from: fromMember.user.name,
      to: toMember.user.name,
      amount: amountPaise,
      note,
    });
  }, [members, accounts, logAudit]);

  // Action: Disburse Allowance to Member
  const disburseAllowance = useCallback((memberId: string, amountPaise: number) => {
    const target = members.find(m => m.id === memberId);
    if (!target) return;

    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          monthly_allowance: (m.monthly_allowance || 0) + amountPaise,
        };
      }
      return m;
    }));

    logAudit('ALLOWANCE_DISBURSED', 'member', memberId, { name: target.user.name, amount: amountPaise });
  }, [members, logAudit]);

  // Action: Remove Member
  const removeMember = useCallback((memberId: string) => {
    if (checkReadOnly()) return;
    const target = members.find(m => m.id === memberId);
    if (!target) return;
    if (target.role === 'FAMILY_HEAD' || target.role === 'family_head') {
      alert('Cannot remove a Family Head. Transfer ownership first.');
      return;
    }
    setMembers(prev => prev.filter(m => m.id !== memberId));
    logAudit('MEMBER_REMOVED', 'member', memberId, { name: target.user.name });

    try {
      getFamilyChannel(family.id).publish('member.removed', {
        member_id: memberId,
        name: target.user.name,
      });
    } catch (err) {
      console.warn('Realtime publish warning:', err);
    }
  }, [members, logAudit, checkReadOnly, family.id]);

  // Action: Create Custom Role
  const createRole = useCallback((roleName: string, description: string): RoleDefinition => {
    const roleKey = `role-${roleName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    const newRole: RoleDefinition = {
      id: roleKey,
      name: roleName,
      description: description || 'Custom family role with customized financial access',
      is_custom: true,
      default_permissions: [
        'transactions.create',
        'transactions.view',
        'requests.create',
        'notifications.receive',
        'family.view',
      ],
      permissions: {
        can_view_all_transactions: false,
        can_add_transactions: true,
        can_edit_transactions: false,
        can_delete_transactions: false,
        can_manage_budgets: false,
        can_manage_goals: false,
        can_manage_members: false,
        can_view_reports: false,
        can_export_data: false,
        can_manage_accounts: false,
        can_request_expenses: true,
        can_approve_requests: false,
        max_transaction_amount: 500000,
        monthly_spending_limit: 1000000,
      },
    };
    setRoles(prev => [...prev, newRole]);
    logAudit('ROLE_CREATED', 'role', roleKey, { roleName, description });
    return newRole;
  }, [logAudit]);

  // Action: Update Member Sharing Preferences
  const updateMemberSharing = useCallback((memberId: string, incomeSharing: boolean, expenseSharing: boolean) => {
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          income_sharing_enabled: incomeSharing,
          expense_sharing_enabled: expenseSharing,
        };
      }
      return m;
    }));
    logAudit('MEMBER_SHARING_UPDATED', 'member', memberId, { incomeSharing, expenseSharing });
  }, [logAudit]);

  // Notification actions
  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
  }, []);

  // Inter-Account Transfer Action
  const transferFunds = useCallback((fromAccountId: string, toAccountId: string, amountPaise: number, description: string) => {
    if (checkReadOnly()) return;
    if (fromAccountId === toAccountId || amountPaise <= 0) return;

    setAccounts(prev => prev.map(acc => {
      if (acc.id === fromAccountId) {
        return { ...acc, balance: acc.balance - amountPaise };
      }
      if (acc.id === toAccountId) {
        return { ...acc, balance: acc.balance + amountPaise };
      }
      return acc;
    }));

    const fromAcc = accounts.find(a => a.id === fromAccountId);
    const toAcc = accounts.find(a => a.id === toAccountId);

    const txId = `tx-transfer-${Date.now()}`;
    const newTx: Transaction = {
      id: txId,
      family_id: family.id,
      user_id: currentMember.user_id,
      account_id: fromAccountId,
      category_id: 'cat-transfers',
      type: 'transfer',
      amount: amountPaise,
      description: description || `Transfer: ${fromAcc?.name || 'Account'} → ${toAcc?.name || 'Account'}`,
      transaction_date: new Date().toISOString(),
      payment_method: 'Internal Transfer',
      is_shared: true,
      status: 'cleared',
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setTransactions(prev => [newTx, ...prev]);
    logAudit('ACCOUNT_TRANSFER', 'account', fromAccountId, {
      from: fromAcc?.name,
      to: toAcc?.name,
      amountPaise,
    });
  }, [accounts, currentMember?.user_id, family?.id, logAudit]);

  // Action: Add Account
  const addAccount = useCallback((acc: Omit<Account, 'id' | 'created_at' | 'family_id'>) => {
    const newId = `acc-${Date.now()}`;
    const newAcc: Account = {
      ...acc,
      id: newId,
      family_id: family.id,
      created_at: new Date().toISOString(),
    };
    setAccounts(prev => [...prev, newAcc]);
    logAudit('ACCOUNT_CREATED', 'account', newId, { name: acc.name, type: acc.type });
  }, [family.id, logAudit]);

  // Action: Delete Account
  const deleteAccount = useCallback((id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    logAudit('ACCOUNT_DELETED', 'account', id);
  }, [logAudit]);

  // Action: Add Loan
  const addLoan = useCallback((loan: Omit<LoanItem, 'id' | 'family_id' | 'created_at' | 'total_paid'>) => {
    const newId = `loan-${Date.now()}`;
    const newLoan: LoanItem = {
      ...loan,
      id: newId,
      family_id: family.id,
      total_paid: 0,
      created_at: new Date().toISOString(),
    };
    setLoans(prev => [newLoan, ...prev]);
    logAudit('LOAN_CREATED', 'loan', newId, { name: loan.name, principal: loan.principal_amount });
  }, [family.id, logAudit]);

  // Action: Record EMI Payment
  const recordEmiPayment = useCallback((loanId: string, amountPaise: number) => {
    setLoans(prev => prev.map(loan => {
      if (loan.id === loanId) {
        const newRemaining = Math.max(0, loan.remaining_balance - amountPaise);
        const newPaid = loan.total_paid + amountPaise;
        return {
          ...loan,
          remaining_balance: newRemaining,
          total_paid: newPaid,
          status: newRemaining === 0 ? 'closed' : loan.status,
        };
      }
      return loan;
    }));

    const targetLoan = loans.find(l => l.id === loanId);
    if (targetLoan) {
      // Also register an expense transaction
      const txId = `tx-emi-${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        family_id: family.id,
        user_id: currentMember.user_id,
        account_id: accounts[0]?.id || 'acc-hdfc',
        category_id: 'cat-utilities',
        type: 'expense',
        amount: amountPaise,
        description: `EMI Payment: ${targetLoan.name}`,
        transaction_date: new Date().toISOString(),
        payment_method: 'Auto-Debit Net Banking',
        is_shared: true,
        status: 'cleared',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTransactions(prev => [newTx, ...prev]);
    }

    logAudit('EMI_PAYMENT_RECORDED', 'loan', loanId, { amountPaise });
  }, [accounts, currentMember?.user_id, family?.id, loans, logAudit]);

  // Action: Delete Loan
  const deleteLoan = useCallback((id: string) => {
    setLoans(prev => prev.filter(l => l.id !== id));
    logAudit('LOAN_DELETED', 'loan', id);
  }, [logAudit]);

  // Action: Add Investment
  const addInvestment = useCallback((inv: Omit<InvestmentAsset, 'id' | 'family_id'>) => {
    const newId = `inv-${Date.now()}`;
    const newInv: InvestmentAsset = {
      ...inv,
      id: newId,
      family_id: family.id,
    };
    setInvestments(prev => [newInv, ...prev]);
    logAudit('INVESTMENT_ADDED', 'investment', newId, { name: inv.name, type: inv.type });
  }, [family.id, logAudit]);

  // Action: Update Investment Value
  const updateInvestmentValue = useCallback((id: string, currentValuePaise: number) => {
    setInvestments(prev => prev.map(inv => (inv.id === id ? { ...inv, current_value: currentValuePaise } : inv)));
  }, []);

  // Action: Delete Investment
  const deleteInvestment = useCallback((id: string) => {
    setInvestments(prev => prev.filter(i => i.id !== id));
    logAudit('INVESTMENT_DELETED', 'investment', id);
  }, [logAudit]);

  // Action: Add Shared Expense
  const addSharedExpense = useCallback((split: Omit<SharedExpenseSplit, 'id' | 'family_id' | 'created_at'>) => {
    const newId = `split-${Date.now()}`;
    const newSplit: SharedExpenseSplit = {
      ...split,
      id: newId,
      family_id: family.id,
      created_at: new Date().toISOString(),
    };
    setSharedExpenses(prev => [newSplit, ...prev]);
    logAudit('SHARED_EXPENSE_CREATED', 'split_expense', newId, { title: split.title, total: split.total_amount });
  }, [family.id, logAudit]);

  // Action: Settle Split Share
  const settleSplitShare = useCallback((splitId: string, memberId: string) => {
    setSharedExpenses(prev => prev.map(split => {
      if (split.id === splitId) {
        return {
          ...split,
          shares: split.shares.map(s => s.member_id === memberId ? { ...s, settled: true, settled_at: new Date().toISOString() } : s),
        };
      }
      return split;
    }));
    logAudit('SPLIT_SHARE_SETTLED', 'split_expense', splitId, { memberId });
  }, [logAudit]);

  // Action: Mark Recurring Bill Paid
  const markRecurringPaid = useCallback((id: string) => {
    const item = recurring.find(r => r.id === id);
    if (!item) return;

    const txId = `tx-rec-${Date.now()}`;
    const newTx: Transaction = {
      id: txId,
      family_id: family.id,
      user_id: currentMember.user_id,
      account_id: item.account_id,
      category_id: item.category_id,
      type: 'expense',
      amount: item.amount,
      description: `Bill Paid: ${item.description}`,
      transaction_date: new Date().toISOString(),
      payment_method: 'Auto-Debit',
      is_shared: true,
      status: 'cleared',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setTransactions(prev => [newTx, ...prev]);
    logAudit('RECURRING_BILL_PAID', 'recurring', id, { description: item.description, amount: item.amount });
  }, [currentMember?.user_id, family?.id, logAudit, recurring]);

  // Action: Update User Profile
  const updateUserProfile = useCallback((
    name: string,
    email: string,
    avatarUrl?: string,
    extra?: {
      phone?: string;
      date_of_birth?: string;
      gender?: string;
      location?: string;
      bio?: string;
    }
  ) => {
    setMembers(prev => prev.map(m => {
      if (m.id === currentMemberId) {
        return {
          ...m,
          user: {
            ...m.user,
            name,
            email,
            avatar_url: avatarUrl !== undefined ? avatarUrl : m.user.avatar_url,
            phone: extra?.phone !== undefined ? extra.phone : m.user.phone,
            date_of_birth: extra?.date_of_birth !== undefined ? extra.date_of_birth : m.user.date_of_birth,
            gender: extra?.gender !== undefined ? extra.gender : m.user.gender,
            location: extra?.location !== undefined ? extra.location : m.user.location,
            bio: extra?.bio !== undefined ? extra.bio : m.user.bio,
          },
        };
      }
      return m;
    }));
    logAudit('PROFILE_UPDATED', 'user', currentMember?.user_id, { name, email, ...extra });
  }, [currentMember?.user_id, currentMemberId, logAudit]);

  // Action: Update Family Name (Restricted to authorized Family Members)
  const updateFamilyName = useCallback((newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const normRole = (currentMember?.role || '').toLowerCase();
    const isHead = normRole === 'family_head' || normRole.includes('head');
    const isCoManager = normRole.includes('spouse') || normRole.includes('co_manager') || normRole.includes('comanager');
    const isAdult = normRole.includes('adult');
    const isViewer = normRole.includes('viewer');
    const isChild = normRole.includes('child') || normRole === 'son' || normRole === 'daughter';

    const isFamilyMember = (isHead || isCoManager || isAdult) && !isViewer && !isChild;

    if (!isFamilyMember) {
      addNotification(
        currentMember.user_id,
        'member_activity',
        'Permission Denied',
        'Only authorized family members can edit the family name.'
      );
      return;
    }

    setFamily(prev => {
      const updated = {
        ...prev,
        name: trimmed,
        updated_at: new Date().toISOString(),
      };
      saveStorage('family', updated);
      return updated;
    });

    logAudit('family.name_updated', 'family', family.id, {
      previous_name: family.name,
      new_name: trimmed,
      updated_by_role: currentMember.role,
    });

    addNotification(
      currentMember.user_id,
      'member_activity',
      'Family Name Updated',
      `Family name was successfully updated to "${trimmed}".`
    );
  }, [currentMember, family.id, family.name, logAudit, addNotification]);

  // Reset to demo defaults
  const resetToDemoDefaults = useCallback(() => {
    localStorage.clear();
    setMembers(DEMO_MEMBERS);
    setCurrentMemberId('mem-arun');
    setAccounts(DEMO_ACCOUNTS);
    setTransactions(DEMO_TRANSACTIONS);
    setBudget(DEMO_BUDGET);
    setSavingsGoals(DEMO_SAVINGS_GOALS);
    setRequests(DEMO_REQUESTS);
    setRecurring(DEMO_RECURRING);
    setNotifications(DEMO_NOTIFICATIONS);
    setAuditLogs(DEMO_AUDIT_LOGS);
    setLoans(DEMO_LOANS);
    setInvestments(DEMO_INVESTMENTS);
    setSharedExpenses(DEMO_SHARED_EXPENSES);
    window.location.reload();
  }, []);

  const bulkImportFamilyData = useCallback((data: {
    members?: any[];
    accounts?: any[];
    transactions?: any[];
    savingsGoals?: any[];
  }) => {
    if (data.members && data.members.length > 0) {
      setMembers(prev => {
        const newMems = data.members!.map((m, idx) => ({
          id: `mem-imp-${Date.now()}-${idx}`,
          family_id: family.id,
          user_id: `usr-imp-${Date.now()}-${idx}`,
          role: m.role || 'ADULT_MEMBER',
          status: 'active',
          joined_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          user: {
            id: `usr-imp-${Date.now()}-${idx}`,
            name: m.name || 'Imported Member',
            email: m.email || 'member@family.sync',
            avatar_url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          monthly_allowance: m.monthly_allowance || 500000,
        })) as FamilyMember[];
        return [...prev, ...newMems];
      });
    }

    if (data.accounts && data.accounts.length > 0) {
      setAccounts(prev => {
        const newAccs = data.accounts!.map((a, idx) => ({
          id: `acc-imp-${Date.now()}-${idx}`,
          family_id: family.id,
          name: a.name || 'Imported Vault',
          type: a.type || 'bank',
          balance: a.balance || 1000000,
          currency: 'INR',
          account_number_mask: a.account_number_mask || '•••• 1234',
          is_shared: true,
          created_at: new Date().toISOString(),
        })) as Account[];
        return [...prev, ...newAccs];
      });
    }

    if (data.transactions && data.transactions.length > 0) {
      setTransactions(prev => {
        const newTxs = data.transactions!.map((t, idx) => ({
          id: `tx-imp-${Date.now()}-${idx}`,
          family_id: family.id,
          account_id: accounts[0]?.id || 'acc-1',
          user_id: currentMember.user_id,
          category_id: 'cat-groceries',
          amount: t.amount || 100000,
          type: t.type || 'expense',
          description: t.description || 'Imported Transaction',
          transaction_date: new Date().toISOString(),
          payment_method: t.payment_method || 'Net Banking',
          is_shared: true,
          status: 'cleared',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })) as Transaction[];
        return [...newTxs, ...prev];
      });
    }

    if (data.savingsGoals && data.savingsGoals.length > 0) {
      setSavingsGoals(prev => {
        const newGoals = data.savingsGoals!.map((g, idx) => ({
          id: `goal-imp-${Date.now()}-${idx}`,
          family_id: family.id,
          name: g.name || g.title || 'Imported Goal',
          description: 'Imported from family data file',
          target_amount: g.target_amount || 10000000,
          current_amount: g.current_amount || 2500000,
          target_date: g.target_date || '2026-12-31',
          created_by: currentMember.user_id,
          status: 'in_progress',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })) as SavingsGoal[];
        return [...prev, ...newGoals];
      });
    }
  }, [family?.id, accounts, currentMember?.user_id]);

  const createFamilyWorkspace = useCallback((familyName: string, currency: string = 'INR', timezone: string = 'Asia/Kolkata'): FamilyMember => {
    const famId = `fam-${Date.now()}`;
    const userId = `usr-head-${Date.now()}`;
    const memId = `mem-head-${Date.now()}`;

    const nameStr = familyName.trim() || 'My Family Workspace';

    const newFamily: Family = {
      id: famId,
      name: nameStr,
      owner_id: userId,
      currency,
      timezone,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newHeadMember: FamilyMember = {
      id: memId,
      family_id: famId,
      user_id: userId,
      user: {
        id: userId,
        name: `${nameStr} Admin`,
        email: `head@${nameStr.toLowerCase().replace(/[^a-z0-9]/g, '')}.sync`,
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      role: 'FAMILY_HEAD',
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      monthly_allowance: 0,
      monthly_spending_limit: 0,
    };

    // User-specific starter accounts for new family
    const initialAccounts: Account[] = [
      {
        id: `acc-main-${Date.now()}`,
        family_id: famId,
        name: `${nameStr} Vault Account`,
        type: 'bank',
        balance: 2500000, // ₹25,000 initial balance
        currency,
        account_number_mask: '•••• 7788',
        is_shared: true,
        created_at: new Date().toISOString(),
      },
      {
        id: `acc-cash-${Date.now()}`,
        family_id: famId,
        name: `${nameStr} Cash Wallet`,
        type: 'cash',
        balance: 500000, // ₹5,000 cash balance
        currency,
        account_number_mask: 'Cash Box',
        is_shared: true,
        created_at: new Date().toISOString(),
      },
    ];

    // User-specific setup transaction
    const initialTxs: Transaction[] = [
      {
        id: `tx-init-${Date.now()}`,
        family_id: famId,
        user_id: userId,
        account_id: initialAccounts[0].id,
        category_id: 'cat-salary',
        type: 'income',
        amount: 2500000,
        description: `Workspace Setup Opening Deposit - ${nameStr}`,
        transaction_date: new Date().toISOString(),
        payment_method: 'Net Banking',
        is_shared: true,
        status: 'cleared',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    setFamily(newFamily);
    setMembers([newHeadMember]);
    setCurrentMemberId(memId);
    setAccounts(initialAccounts);
    setTransactions(initialTxs);
    setBudget({
      id: `bgt-${Date.now()}`,
      family_id: famId,
      name: `${nameStr} Monthly Budget Plan`,
      period: 'monthly',
      start_date: new Date().toISOString().slice(0, 7) + '-01',
      end_date: new Date().toISOString().slice(0, 7) + '-31',
      total_amount: 10000000,
      created_by: userId,
      categories: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setSavingsGoals([]);
    setRequests([]);
    setLoans([]);
    setInvestments([]);
    setSharedExpenses([]);

    setIsDemoMode(false);
    saveStorage('is_demo_mode', false);
    saveStorage('family', newFamily);
    saveStorage('members', [newHeadMember]);
    saveStorage('active_member_id', memId);
    saveStorage('accounts', initialAccounts);
    saveStorage('transactions', initialTxs);

    logAudit('FAMILY_WORKSPACE_CREATED', 'family', famId, { name: nameStr });
    return newHeadMember;
  }, [logAudit]);

  const loadDemoFamilyWorkspace = useCallback(() => {
    setFamily(DEMO_FAMILY);
    setMembers(DEMO_MEMBERS);
    setCurrentMemberId('mem-raj');
    setIsDemoMode(true);
    setAccounts(DEMO_ACCOUNTS);
    setTransactions(DEMO_TRANSACTIONS);
    setBudget(DEMO_BUDGET);
    setSavingsGoals(DEMO_SAVINGS_GOALS);
    setRequests(DEMO_REQUESTS);
    setRecurring(DEMO_RECURRING);
    setNotifications(DEMO_NOTIFICATIONS);
    setAuditLogs(DEMO_AUDIT_LOGS);
    setLoans(DEMO_LOANS);
    setInvestments(DEMO_INVESTMENTS);
    setSharedExpenses(DEMO_SHARED_EXPENSES);

    saveStorage('family', DEMO_FAMILY);
    saveStorage('members', DEMO_MEMBERS);
    saveStorage('active_member_id', 'mem-raj');
    saveStorage('is_demo_mode', true);
    saveStorage('accounts', DEMO_ACCOUNTS);
    saveStorage('transactions', DEMO_TRANSACTIONS);

    logAudit('EXPLORE_DEMO_FAMILY', 'system', 'demo', { mode: 'testing' });
  }, [logAudit]);

  const lookupInvitation = useCallback((inviteCodeOrLink: string) => {
    const cleanCode = inviteCodeOrLink.trim().toUpperCase().replace(/^.*CODE=/, '').replace(/^.*JOIN\//, '').replace(/[^A-Z0-9-]/g, '');
    if (!cleanCode) return null;

    const existing = invitations.find(i => i.invite_code.toUpperCase() === cleanCode || i.id === cleanCode || i.invite_link.toUpperCase().includes(cleanCode));
    if (existing) {
      const inviter = members.find(m => m.user_id === existing.created_by) || members[0];
      return {
        found: true,
        invitation: existing,
        familyName: family.name,
        inviterName: inviter ? inviter.user.name : 'Family Head',
        assignedRole: existing.invited_role,
      };
    }

    let fallbackRole: SystemRoleType = 'CHILD';
    if (cleanCode.includes('PARENT') || cleanCode.includes('HEAD') || cleanCode.includes('CO')) fallbackRole = 'CO_MANAGER';
    if (cleanCode.includes('ADULT')) fallbackRole = 'ADULT_MEMBER';

    const mockInv: FamilyInvitation = {
      id: `inv-mock-${cleanCode}`,
      family_id: family.id,
      invite_code: cleanCode,
      invite_link: `${window.location.origin}/join?code=${cleanCode}`,
      invited_role: fallbackRole,
      status: 'PENDING',
      created_by: members[0]?.user_id || 'user-arun',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    return {
      found: true,
      invitation: mockInv,
      familyName: family.name,
      inviterName: members[0]?.user.name || 'Arun',
      assignedRole: fallbackRole,
    };
  }, [invitations, members, family.name, family.id]);

  const acceptInvitation = useCallback((inviteCodeOrLink: string, userName: string, userEmail: string): FamilyMember => {
    const info = lookupInvitation(inviteCodeOrLink);
    const assignedRole: SystemRoleType = info ? info.assignedRole : 'CHILD';

    const userId = `usr-joined-${Date.now()}`;
    const memId = `mem-joined-${Date.now()}`;

    const newMember: FamilyMember = {
      id: memId,
      family_id: family.id,
      user_id: userId,
      user: {
        id: userId,
        name: userName.trim() || 'Joined Member',
        email: userEmail.trim() || 'member@family.sync',
        avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      role: assignedRole,
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      monthly_allowance: assignedRole === 'CHILD' ? 200000 : 1000000,
      monthly_spending_limit: assignedRole === 'CHILD' ? 300000 : 2000000,
    };

    setMembers(prev => [...prev, newMember]);
    setCurrentMemberId(memId);

    logAudit('INVITATION_ACCEPTED', 'member', memId, { name: userName, role: assignedRole });
    return newMember;
  }, [lookupInvitation, family.id, logAudit]);

  // Demo User Switcher (Section 30)
  const switchDemoUser = useCallback((userId: string) => {
    setActiveUserId(userId);
    // Find member for this user in current family
    const memberInFamily = members.find(m => m.user_id === userId && m.family_id === family.id);
    if (memberInFamily) {
      setCurrentMemberId(memberInFamily.id);
    } else {
      // Check user's linked families and switch to default if not in current family
      const userFamilies = linkedFamiliesMap[userId] || [];
      if (userFamilies.length > 0) {
        const targetFam = allFamilies.find(f => f.id === userFamilies[0].family_id);
        if (targetFam) {
          setFamily(targetFam);
          const memberInTarget = members.find(m => m.user_id === userId && m.family_id === targetFam.id);
          if (memberInTarget) setCurrentMemberId(memberInTarget.id);
        }
      }
    }
  }, [family.id, members, allFamilies, linkedFamiliesMap]);

  // Active Family Switcher (Section 3 & 22)
  const switchActiveFamily = useCallback((familyId: string) => {
    const target = allFamilies.find(f => f.id === familyId);
    if (!target) return;
    setFamily(target);
    const memberInTarget = members.find(m => m.family_id === target.id && m.user_id === activeUserId);
    if (memberInTarget) {
      setCurrentMemberId(memberInTarget.id);
    } else {
      const firstMember = members.find(m => m.family_id === target.id);
      if (firstMember) setCurrentMemberId(firstMember.id);
    }
  }, [allFamilies, members, activeUserId]);

  // Create Family (Section 12)
  const createFamily = useCallback((name: string, description?: string, currency = 'INR', country = 'India'): Family => {
    const newFamId = `fam-${Date.now()}`;
    const newFam: Family = {
      id: newFamId,
      name,
      description: description || 'New family workspace',
      currency,
      country,
      owner_id: activeUserId,
      timezone: 'Asia/Kolkata',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setAllFamilies(prev => [...prev.filter(f => f.id !== newFamId), newFam]);
    setFamily(newFam);
    saveStorage('family', newFam);
    setIsDemoMode(false);
    saveStorage('is_demo_mode', false);

    // Completely clear demo seed collections for this new real family
    setTransactions(prev => prev.filter(t => t.family_id && !t.family_id.startsWith('fam-demo')));
    setRequests(prev => prev.filter(r => r.family_id && !r.family_id.startsWith('fam-demo')));
    setSavingsGoals(prev => prev.filter(g => g.family_id && !g.family_id.startsWith('fam-demo')));
    setLoans(prev => prev.filter(l => l.family_id && !l.family_id.startsWith('fam-demo')));
    setSharedExpenses(prev => prev.filter(s => s.family_id && !s.family_id.startsWith('fam-demo')));

    const newMember: FamilyMember = {
      id: `mem-${Date.now()}`,
      family_id: newFamId,
      user_id: activeUserId,
      user: currentMember?.user || { id: activeUserId, name: 'Family Head', email: '', role: 'FAMILY_HEAD' },
      role: 'FAMILY_HEAD',
      status: 'active',
      income_sharing_enabled: true,
      expense_sharing_enabled: true,
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setMembers(prev => [...prev.filter(m => m.family_id !== newFamId), newMember]);
    setCurrentMemberId(newMember.id);

    const starterAccounts: Account[] = [
      {
        id: `acc-main-${newFamId}`,
        family_id: newFamId,
        name: 'Main Bank Account',
        type: 'bank',
        balance: 0,
        currency,
        is_shared: true,
        created_at: new Date().toISOString(),
      },
      {
        id: `acc-cash-${newFamId}`,
        family_id: newFamId,
        name: 'Cash In Hand',
        type: 'cash',
        balance: 0,
        currency,
        is_shared: true,
        created_at: new Date().toISOString(),
      },
    ];
    setAccounts(starterAccounts);

    setLinkedFamiliesMap(prev => ({
      ...prev,
      [activeUserId]: [
        ...(prev[activeUserId] || []).filter(m => m.family_id !== newFamId),
        {
          family_id: newFamId,
          family_name: name,
          role: 'owner',
          status: 'active',
          member_count: 1,
          description,
          currency,
          joined_at: new Date().toISOString(),
        },
      ],
    }));

    return newFam;
  }, [activeUserId, currentMember]);

  // Join Family (Section 11)
  const joinFamily = useCallback((inviteCode: string) => {
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode) return { success: false, message: 'Please enter a valid family invitation code.' };

    let target = allFamilies.find(f => f.id.toUpperCase().includes(cleanCode) || f.name.toUpperCase().includes(cleanCode));
    if (!target) {
      target = {
        id: `fam-join-${Date.now()}`,
        name: `Linked Family (${cleanCode})`,
        owner_id: 'user-shared',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        description: `Connected via invite code ${cleanCode}`,
        country: 'India',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setAllFamilies(prev => [...prev, target!]);
    }

    const userLinks = linkedFamiliesMap[activeUserId] || [];
    if (!userLinks.some(l => l.family_id === target!.id)) {
      setLinkedFamiliesMap(prev => ({
        ...prev,
        [activeUserId]: [
          ...(prev[activeUserId] || []),
          {
            family_id: target!.id,
            family_name: target!.name,
            role: 'member',
            status: 'active',
            member_count: 4,
            description: target!.description,
            currency: target!.currency,
            joined_at: new Date().toISOString(),
          },
        ],
      }));
    }

    const existingMember = members.find(m => m.family_id === target!.id && m.user_id === activeUserId);
    if (!existingMember) {
      const newMember: FamilyMember = {
        id: `mem-joined-${Date.now()}`,
        family_id: target!.id,
        user_id: activeUserId,
        user: currentMember?.user || DEMO_USERS[0],
        role: 'ADULT_MEMBER',
        status: 'active',
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      setMembers(prev => [...prev, newMember]);
      setCurrentMemberId(newMember.id);
    } else {
      setCurrentMemberId(existingMember.id);
    }

    setFamily(target);
    return { success: true, message: `Successfully joined ${target.name}!`, family: target };
  }, [allFamilies, activeUserId, currentMember?.user, linkedFamiliesMap, members]);

  // Update Transaction Visibility (Section 21)
  const updateTransactionVisibility = useCallback((txId: string, newVisibility: 'private' | 'family', targetFamilyId?: string) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== txId) return t;
      if (newVisibility === 'private') {
        return {
          ...t,
          visibility: 'private',
          family_id: null,
          is_shared: false,
          updated_at: new Date().toISOString(),
        };
      } else {
        return {
          ...t,
          visibility: 'family',
          family_id: targetFamilyId || family.id,
          is_shared: true,
          updated_at: new Date().toISOString(),
        };
      }
    }));
  }, [family.id]);

  return (
    <FamilyFinanceContext.Provider
      value={{
        allFamilies,
        activeFamily,
        linkedFamilies,
        activeUserId,
        demoUsers: DEMO_USERS,
        switchDemoUser,
        switchActiveFamily,
        createFamily,
        joinFamily,
        updateTransactionVisibility,
        authorizedTransactions,
        familyTransactions,
        privateTransactions,
        privateSummary,
        activeFamilyMembers,
        familyGoals,
        privateGoals,
        familyLoans,
        privateLoans,
        family,
        members: isDemoMode ? members : activeFamilyMembers,
        currentMember,
        categories,
        accounts: isDemoMode ? accounts : activeAccountsList,
        transactions,
        summary,
        budget: isDemoMode ? budget : activeBudgetObj,
        roles,
        savingsGoals: isDemoMode ? savingsGoals : activeSavingsGoalsList,
        requests: isDemoMode ? requests : activeRequestsList,
        recurring: isDemoMode ? recurring : activeRecurringList,
        approvalRules,
        notifications,
        auditLogs: isDemoMode ? auditLogs : activeAuditLogsList,
        loans: isDemoMode ? loans : activeLoansList,
        investments: isDemoMode ? investments : activeInvestments,
        sharedExpenses: isDemoMode ? sharedExpenses : activeSharedExpensesList,
        invitations,
        allowances,
        theme,
        toggleTheme,
        switchMember,
        hasPermission,
        canApproveRequestAmount,
        addTransaction,
        deleteTransaction,
        transferFunds,
        transferBetweenMembers,
        disburseAllowance,
        addAccount,
        deleteAccount,
        createRequest,
        approveRequest,
        rejectRequest,
        contributeToGoal,
        createGoal,
        updateBudgetCategory,
        updateMemberLimit,
        updateMemberRole,
        toggleMemberPermission,
        grantAllMemberPermissions,
        revokeAllMemberPermissions,
        resetMemberPermissions,
        savePermissionsToBackend,
        inviteMember,
        createInvitation,
        revokeInvitation,
        removeMember,
        createRole,
        updateMemberSharing,
        markNotificationRead,
        markAllNotificationsRead,
        addLoan,
        recordEmiPayment,
        deleteLoan,
        addInvestment,
        updateInvestmentValue,
        deleteInvestment,
        addSharedExpense,
        settleSplitShare,
        markRecurringPaid,
        updateUserProfile,
        updateFamilyName,
        resetToDemoDefaults,
        bulkImportFamilyData,
        createFamilyWorkspace,
        lookupInvitation,
        acceptInvitation,
        loadDemoFamilyWorkspace,
        isDemoMode,
      }}
    >
      {children}
    </FamilyFinanceContext.Provider>
  );
};

export const useFamilyFinance = () => {
  const context = useContext(FamilyFinanceContext);
  if (!context) {
    throw new Error('useFamilyFinance must be used within a FamilyFinanceProvider');
  }
  return context;
};
