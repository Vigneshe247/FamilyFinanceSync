/* =========================================================
   FINOVA & CREXTIO DASHBOARD (Exact 3-Column Luxury Neo-Mint UI)
   Restored from version control with live data synchronization
   ========================================================= */

import React, { useState, useMemo } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { usePermissions } from '../../context/FamilyContext';
import { formatPaise, formatDate } from '../../utils/currency';
import { ROLE_DISPLAY_NAMES, normalizeRole } from '../../utils/permissions';
import { OverviewChart, OverviewTimeframe } from './components/OverviewChart';
import { QuickActionsCard } from './components/QuickActionsCard';
import { SpendingBreakdownCard } from './components/SpendingBreakdownCard';
import {
  Eye,
  EyeOff,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Plus,
  Send,
  Calculator,
  Landmark,
  PiggyBank,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Users,
  Target,
  ListTodo,
  CheckSquare,
  Square,
  Trash2,
  UploadCloud,
  Settings,
  Receipt,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';
import { PrivateFinancesView } from './components/PrivateFinancesView';
import { Lock } from 'lucide-react';

interface DashboardPageProps {
  onOpenNewTx: (initialType?: 'expense' | 'income') => void;
  onOpenNewRequest: () => void;
  onOpenAffordability?: () => void;
  setActiveTab: (tab: string) => void;
  onOpenImportModal?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenNewTx,
  onOpenNewRequest,
  onOpenAffordability,
  setActiveTab,
  onOpenImportModal,
}) => {
  const {
    activeFamily,
    currentMember,
    activeUserId,
    members,
    categories,
    transactions,
    familyTransactions,
    accounts,
    requests,
    auditLogs,
    createGoal,
  } = useFamilyFinance();

  const [dashboardScope, setDashboardScope] = useState<'family' | 'private'>('family');

  const {
    isFamilyHead,
    isSon,
    isDaughter,
    isChild: isPermChild,
  } = usePermissions();

  const isHead = isFamilyHead || currentMember.role === 'FAMILY_HEAD';
  const isChild =
    isPermChild ||
    isSon ||
    isDaughter ||
    currentMember.role === 'CHILD' ||
    currentMember.role === 'SON' ||
    currentMember.role === 'DAUGHTER';

  const { settings, openViewSettingsModal } = useViewSettings();
  const [balanceVisible, setBalanceVisible] = useState(!settings.dashboard.maskBalancesDefault);

  // Financial Plan To-Do Tasks State
  const { isDemoMode } = useFamilyFinance();
  const [planTasks, setPlanTasks] = useState<Array<{ id: string; title: string; completed: boolean; tag: string }>>(() => {
    if (!isDemoMode) return [];
    return [
      { id: '1', title: 'Rebalance Emergency Vault (₹2.5L)', completed: true, tag: 'Vault' },
      { id: '2', title: 'Approve child allowance request', completed: false, tag: 'Requests' },
      { id: '3', title: 'Set up auto-pay for utility bills', completed: true, tag: 'Bills' },
    ];
  });

  const [newTaskInput, setNewTaskInput] = useState('');
  const [convertedGoalMsg, setConvertedGoalMsg] = useState<string>('');

  const handleToggleTask = (id: string) => {
    setPlanTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    setPlanTasks(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        title: newTaskInput.trim(),
        completed: false,
        tag: 'Plan',
      },
    ]);
    setNewTaskInput('');
  };

  const handleDeleteTask = (id: string) => {
    setPlanTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleConvertTaskToGoal = (task: { id: string; title: string; tag: string }) => {
    createGoal({
      name: `Plan: ${task.title}`,
      description: `Converted from Financial Action Plan item (${task.tag})`,
      target_amount: 15000000,
      target_date: '2027-03-31',
      created_by: currentMember.user_id,
      status: 'in_progress',
    });
    setPlanTasks(prev => prev.map(t => (t.id === task.id ? { ...t, completed: true } : t)));
    setConvertedGoalMsg(`✓ Converted "${task.title}" to Active Family Goal!`);
    setTimeout(() => setConvertedGoalMsg(''), 3500);
  };

  // Interactive Timeframe Dropdown State
  const [overviewTimeframe, setOverviewTimeframe] = useState<'this_month' | 'last_month' | 'q3' | 'yearly'>('this_month');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>('all');

  // Role-Based Data Privacy Scoping (RBAC):
  // Family Head: Monitors ALL family data & wealth
  // Adult Member: Views shared family accounts + personal transactions
  // Child: Views ONLY child pocket balance, allowance tracker, child transactions & requests
  // Section 17: Family Dashboard must calculate ONLY Authorized Family Transactions
  // Private transactions are strictly excluded from family calculations!
  const scopedTransactions = useMemo(() => {
    if (isChild) {
      return familyTransactions.filter(t => t.user_id === currentMember.user_id);
    }
    return familyTransactions;
  }, [isChild, familyTransactions, currentMember.user_id]);

  const scopedAccounts = useMemo(() => {
    const familyAccs = accounts.filter(a => a.family_id === activeFamily.id);
    if (isChild) {
      const childAccounts = familyAccs.filter(
        a => a.name.toLowerCase().includes('pocket') || a.name.toLowerCase().includes('child')
      );
      return childAccounts.length > 0 ? childAccounts : familyAccs.slice(0, 1);
    }
    return familyAccs;
  }, [isChild, accounts, activeFamily.id]);

  // Timeframe multiplier simulation
  const timeframeMultiplier = overviewTimeframe === 'last_month' ? 1.08 : overviewTimeframe === 'q3' ? 3.1 : overviewTimeframe === 'yearly' ? 11.5 : 1;

  // Financial aggregates
  const totalIncomePaise = useMemo(() => {
    return Math.round(
      scopedTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0) * timeframeMultiplier
    );
  }, [scopedTransactions, timeframeMultiplier]);

  const totalExpensePaise = useMemo(() => {
    return Math.round(
      scopedTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0) * timeframeMultiplier
    );
  }, [scopedTransactions, timeframeMultiplier]);

  const totalLiquidPaise = useMemo(() => {
    return scopedAccounts.reduce((sum, a) => sum + a.balance, 0);
  }, [scopedAccounts]);

  // Child metrics
  const childAllowancePaise = currentMember.monthly_allowance || 500000;
  const childTransactions = useMemo(() => {
    return transactions.filter(t => t.user_id === currentMember.user_id && t.type === 'expense');
  }, [transactions, currentMember.user_id]);

  const childSpentPaise = useMemo(() => {
    return childTransactions.reduce((sum, t) => sum + t.amount, 0);
  }, [childTransactions]);

  const childRemainingPaise = Math.max(0, childAllowancePaise - childSpentPaise);
  const childSpendPercent = childAllowancePaise > 0
    ? Math.min(100, Math.round((childSpentPaise / childAllowancePaise) * 100))
    : 0;

  const childRequests = useMemo(() => {
    return requests.filter(r => r.requested_by === currentMember.user_id);
  }, [requests, currentMember.user_id]);

  // Dynamic Spending Breakdown by Category
  const categorySpending = useMemo(() => {
    const map = new Map<string, { categoryId: string; name: string; color: string; amount: number }>();
    scopedTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = categories.find(c => c.id === t.category_id);
        const catName = t.custom_category ? `Other (${t.custom_category})` : (cat?.name || 'General');
        const color = cat?.color || '#22A05B';

        const existing = map.get(t.category_id) || { categoryId: t.category_id, name: catName, color, amount: 0 };
        existing.amount += t.amount;
        map.set(t.category_id, existing);
      });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [scopedTransactions, categories]);

  const totalSpendingPaise = useMemo(() => {
    return categorySpending.reduce((sum, c) => sum + c.amount, 0);
  }, [categorySpending]);

  const formatActionText = (action: string) => {
    switch (action) {
      case 'SPENDING_LIMIT_UPDATED': return 'Spending limit adjusted';
      case 'REQUEST_SUBMITTED': return 'New expense request filed';
      case 'REQUEST_APPROVED': return 'Expense request approved';
      case 'BUDGET_UPDATED': return 'Monthly budget adjusted';
      case 'ROLE_PERMISSION_UPDATED': return 'Security permissions updated';
      case 'TRANSACTION_RECORDED': return 'Transaction recorded';
      case 'SAVINGS_GOAL_CREATED': return 'Savings goal created';
      default: return action.toLowerCase().replace(/_/g, ' ');
    }
  };

  const activeMembersCount = members.filter(m => m.status === 'active').length;

  return (
    <div className="neo-page-body">
      {/* ================= CHILD MODE: CREXTIO DESIGN ================= */}
      {isChild ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Welcome In & Status Segments Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>
                Welcome in, {currentMember.user.name}
              </h1>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ background: '#1B241E', color: '#FFF', borderRadius: '9999px', padding: '0.35rem 0.85rem', fontSize: '0.78rem', fontWeight: 600 }}>
                  Allowance {childSpendPercent}%
                </div>
                <div style={{ background: 'var(--mint-primary)', color: '#FFF', borderRadius: '9999px', padding: '0.35rem 0.85rem', fontSize: '0.78rem', fontWeight: 600 }}>
                  Pocket Balance {100 - childSpendPercent}%
                </div>
                <div style={{ background: 'rgba(34, 160, 91, 0.2)', color: 'var(--mint-dark)', borderRadius: '9999px', padding: '0.35rem 0.85rem', fontSize: '0.78rem', fontWeight: 600, border: '1px dashed var(--mint-primary)' }}>
                  Education Goal 60%
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                  {formatPaise(childRemainingPaise)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pocket Balance</div>
              </div>
              <div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--amber-accent)' }}>
                  {childRequests.filter(r => r.status === 'pending').length}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pending Requests</div>
              </div>
            </div>
          </div>

          {/* Child Cards Grid (Crextio style) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {/* Profile Card with Balance Pill */}
            <div className="neo-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', height: '170px' }}>
                <img
                  src={currentMember.user.avatar_url}
                  alt={currentMember.user.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '12px',
                    right: '12px',
                    background: 'rgba(16, 24, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '16px',
                    padding: '0.5rem 0.85rem',
                    color: '#FFFFFF',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{currentMember.user.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#D5F2E2' }}>
                      {ROLE_DISPLAY_NAMES[normalizeRole(currentMember.role)] || 'Child Member'}
                    </div>
                  </div>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.15)',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                    }}
                  >
                    {formatPaise(childRemainingPaise)}
                  </div>
                </div>
              </div>

              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={onOpenNewRequest}
                >
                  <Plus size={15} /> Ask Family Head (+ Request)
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => onOpenNewTx('expense')}
                >
                  <ArrowDownLeft size={15} /> Record Expense
                </button>
              </div>
            </div>

            {/* Progress / Activity Bar Chart */}
            <div className="neo-card">
              <div className="neo-card-header">
                <div>
                  <div className="neo-card-title">Allowance Progress</div>
                  <div className="neo-card-subtitle">{formatPaise(childSpentPaise)} of {formatPaise(childAllowancePaise)}</div>
                </div>
                <span className="badge badge-sage">{childSpendPercent}% SPENT</span>
              </div>

              {/* Vertical Bar Chart (Crextio style) */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '110px', padding: '0 0.5rem', marginTop: '1rem' }}>
                {[
                  { day: 'S', h: '30%', active: false },
                  { day: 'M', h: '60%', active: false },
                  { day: 'T', h: '45%', active: false },
                  { day: 'W', h: '85%', active: false },
                  { day: 'T', h: '70%', active: false },
                  { day: 'F', h: `${Math.min(95, Math.max(25, childSpendPercent))}%`, active: true, val: formatPaise(childSpentPaise) },
                  { day: 'S', h: '20%', active: false },
                ].map((col, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    {col.active && (
                      <span style={{ fontSize: '0.68rem', background: 'var(--mint-primary)', color: '#FFF', padding: '0.1rem 0.4rem', borderRadius: '9999px', fontWeight: 700 }}>
                        {col.val}
                      </span>
                    )}
                    <div
                      style={{
                        width: '12px',
                        height: col.h,
                        borderRadius: '9999px',
                        background: col.active ? 'var(--mint-primary)' : 'var(--text-main)',
                      }}
                    ></div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{col.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Time / Allowance Ring Gauge Tracker */}
            <div className="neo-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div className="neo-card-title" style={{ alignSelf: 'flex-start', marginBottom: '0.5rem' }}>
                Pocket Allowance Tracker
              </div>
              <div style={{ position: 'relative', width: '130px', height: '130px', margin: '0.5rem 0' }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="var(--bg-canvas)"
                    strokeWidth="3.2"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="var(--mint-primary)"
                    strokeWidth="3.5"
                    strokeDasharray={`${Math.min(100, Math.max(0, 100 - childSpendPercent))}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {formatPaise(childRemainingPaise)}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Available</span>
                </div>
              </div>
            </div>

            {/* Dark Onboarding Task / Request Card */}
            <div
              style={{
                background: 'var(--card-dark)',
                borderRadius: 'var(--radius-card)',
                padding: '1.35rem',
                color: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>My Requests & Tasks</div>
                <span style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.78rem' }}>
                  {childRequests.filter(r => r.status === 'approved').length} / {childRequests.length} Resolved
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {childRequests.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#8A9E93', fontSize: '0.8rem' }}>
                    No requests submitted yet.
                  </div>
                ) : (
                  childRequests.slice(0, 4).map(r => (
                    <div
                      key={r.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '0.75rem',
                        borderRadius: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.title}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94A69C' }}>{formatPaise(r.amount)}</div>
                      </div>
                      {r.status === 'approved' ? (
                        <CheckCircle2 size={18} color="var(--mint-vibrant)" />
                      ) : (
                        <span className="badge badge-brass" style={{ fontSize: '0.68rem' }}>PENDING</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= EXECUTIVE FINOVA 3-COLUMN VIEW ================= */
        <div>
          {/* Family vs Private Dashboard Toggle (Sections 4 & 5) */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setDashboardScope('family')}
              style={{
                borderRadius: '9999px',
                padding: '0.45rem 1.15rem',
                gap: '0.45rem',
                fontWeight: 700,
                fontSize: '0.82rem',
                background: dashboardScope === 'family' ? 'var(--mint-primary)' : 'var(--bg-canvas-subtle)',
                color: dashboardScope === 'family' ? '#FFFFFF' : 'var(--text-main)',
                border: dashboardScope === 'family' ? '1px solid var(--mint-primary)' : '1px solid var(--border-subtle)',
                boxShadow: dashboardScope === 'family' ? '0 4px 12px rgba(5, 150, 105, 0.25)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Users size={15} />
              <span>{activeFamily.name} Overview</span>
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setDashboardScope('private')}
              style={{
                borderRadius: '9999px',
                padding: '0.45rem 1.15rem',
                gap: '0.45rem',
                fontWeight: 700,
                fontSize: '0.82rem',
                background: dashboardScope === 'private' ? '#D97706' : 'var(--bg-canvas-subtle)',
                color: dashboardScope === 'private' ? '#FFFFFF' : 'var(--text-main)',
                border: dashboardScope === 'private' ? '1px solid #D97706' : '1px solid var(--border-subtle)',
                boxShadow: dashboardScope === 'private' ? '0 4px 12px rgba(217, 119, 6, 0.25)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Lock size={15} />
              <span>My Private Finances ({currentMember?.user?.name || 'Personal'})</span>
            </button>
          </div>

          {dashboardScope === 'private' ? (
            <PrivateFinancesView onOpenNewTx={onOpenNewTx} />
          ) : (
            <>
          {/* Executive Header Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                {activeFamily.name} — Financial Overview
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0, marginTop: '0.15rem' }}>
                Authorized shared family ledger • Private transactions strictly excluded
              </p>
            </div>
          </div>

          {/* New Workspace Onboarding Guidance */}
          {scopedTransactions.length === 0 && scopedAccounts.length === 0 && (
            <div
              className="neo-card"
              style={{
                marginBottom: '1.25rem',
                background: 'linear-gradient(135deg, rgba(19, 42, 34, 0.95), rgba(30, 60, 48, 0.95))',
                border: '1px solid var(--brass)',
                color: '#FBFAF5',
                padding: '1.25rem 1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
                <Sparkles size={20} color="var(--brass)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#FBFAF5' }}>
                  Welcome to your Family Financial Workspace
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#D5E5DC', margin: '0 0 1rem 0', maxWidth: '720px' }}>
                Your private ledger is set up and ready. Begin by adding your bank accounts or cash vaults, recording your initial income or expense, and inviting family members to collaborate.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sage btn-sm"
                  onClick={() => setActiveTab('accounts')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Landmark size={14} /> + Add Account
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onOpenNewTx('income')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Plus size={14} /> + Add Income
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onOpenNewTx('expense')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Plus size={14} /> + Add Expense
                </button>
                {isHead && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActiveTab('members')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <UserPlus size={14} /> Invite Family
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="finova-grid-3col">
          {/* ================= COLUMN 1 (LEFT) ================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* 1. Total Balance Card */}
            <div className="neo-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                    <span>{isHead ? 'Total Family Balance' : 'Total Balance'}</span>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                      onClick={() => setBalanceVisible(!balanceVisible)}
                    >
                      {balanceVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </div>

                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                    {balanceVisible ? formatPaise(totalLiquidPaise) : '••••••••'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--mint-primary)', fontWeight: 600 }}>
                    <TrendingUp size={14} />
                    <span>+12.5% from last month</span>
                  </div>
                </div>

                {/* Money bag green pill icon */}
                <div
                  className="pastel-icon-box"
                  style={{ background: '#D5F2E2', color: 'var(--mint-primary)' }}
                >
                  <PiggyBank size={22} />
                </div>
              </div>
            </div>

            {/* 2. Financial Action Plan & To-Do List Widget */}
            <div
              style={{
                background: 'var(--card-dark)',
                borderRadius: 'var(--radius-card)',
                padding: '1.25rem',
                color: '#FFFFFF',
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                position: 'relative',
              }}
            >
              {/* Widget Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '10px',
                      background: 'rgba(34, 160, 91, 0.2)',
                      color: 'var(--mint-vibrant)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ListTodo size={17} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#FFFFFF', lineHeight: 1.2 }}>
                      Action Plan & To-Do
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94A69C' }}>
                      Financial Milestones & Goal Converter
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {onOpenImportModal && (
                    <button
                      type="button"
                      style={{
                        background: 'rgba(62, 139, 245, 0.2)',
                        color: 'var(--sky-accent)',
                        border: '1px solid rgba(62, 139, 245, 0.4)',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                      onClick={onOpenImportModal}
                      title="Import Family Excel / DOCX / PDF"
                    >
                      <UploadCloud size={12} /> Import
                    </button>
                  )}
                  <span
                    style={{
                      background: 'rgba(38, 194, 109, 0.2)',
                      color: '#4ADE80',
                      border: '1px solid rgba(38, 194, 109, 0.35)',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}
                  >
                    {planTasks.filter(t => t.completed).length} / {planTasks.length} Done
                  </span>
                </div>
              </div>

              {/* Converted Goal Success Toast */}
              {convertedGoalMsg && (
                <div
                  style={{
                    background: 'rgba(34, 160, 91, 0.25)',
                    border: '1px solid var(--mint-primary)',
                    color: '#D5F2E2',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <CheckCircle2 size={14} color="var(--mint-vibrant)" />
                  <span>{convertedGoalMsg}</span>
                </div>
              )}

              {/* Progress Bar */}
              {planTasks.length > 0 && (
                <div>
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round((planTasks.filter(t => t.completed).length / planTasks.length) * 100)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #22A05B, #26C26D)',
                        borderRadius: '9999px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Upgraded 2-Row Layout To-Do List with Convert to Goal Action */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '235px', overflowY: 'auto' }}>
                {planTasks.map(task => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      background: task.completed ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.07)',
                      padding: '0.55rem 0.7rem',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                    onClick={() => handleToggleTask(task.id)}
                  >
                    {/* Row 1: Checkbox + Full Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', width: '100%' }}>
                      <div style={{ color: task.completed ? 'var(--mint-vibrant)' : '#7A8E83', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        {task.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                      </div>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: task.completed ? '#8A9E93' : '#FFFFFF',
                          textDecoration: task.completed ? 'line-through' : 'none',
                          fontWeight: task.completed ? 400 : 600,
                          lineHeight: '1.3',
                          wordBreak: 'break-word',
                        }}
                      >
                        {task.title}
                      </span>
                    </div>

                    {/* Row 2: Tag + Convert Button + Delete Icon */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '1.45rem', marginTop: '0.1rem' }}>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#C8D8CE',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '6px',
                          fontWeight: 600,
                        }}
                      >
                        {task.tag}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {!task.completed && (
                          <button
                            type="button"
                            style={{
                              background: 'rgba(34, 160, 91, 0.25)',
                              color: '#4ADE80',
                              border: '1px solid rgba(34, 160, 91, 0.4)',
                              borderRadius: '6px',
                              padding: '0.18rem 0.5rem',
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              handleConvertTaskToGoal(task);
                            }}
                            title="Convert item to an active Family Savings Goal"
                          >
                            <Target size={11} /> Convert to Plan
                          </button>
                        )}

                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#7A8E83',
                            cursor: 'pointer',
                            padding: '0.15rem',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteTask(task.id);
                          }}
                          title="Delete task"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Plan/Task Input */}
              <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                <input
                  type="text"
                  placeholder="+ Add new plan or task..."
                  value={newTaskInput}
                  onChange={e => setNewTaskInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '10px',
                    padding: '0.45rem 0.75rem',
                    color: '#FFFFFF',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: 'var(--mint-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Plus size={14} /> Add
                </button>
              </form>
            </div>

            {/* 3. Accounts List (+ Add) */}
            <div className="neo-card">
              <div className="neo-card-header">
                <div className="neo-card-title">Accounts</div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ borderRadius: '9999px', padding: '0.2rem 0.65rem' }}
                  onClick={() => setActiveTab('accounts')}
                >
                  + Add
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {scopedAccounts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.25rem 0.5rem' }}>
                    <Landmark size={24} style={{ color: 'var(--text-muted)', opacity: 0.6, margin: '0 auto 0.4rem', display: 'block' }} />
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                      No accounts added yet
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setActiveTab('accounts')}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', borderRadius: '9999px' }}
                    >
                      + Add Account
                    </button>
                  </div>
                ) : (
                  scopedAccounts.slice(0, 4).map((acc, i) => {
                    const bgColors = ['#D5F2E2', '#E1EDFE', '#F3E8FC', '#FEF6E6'];
                    const iconColors = ['var(--mint-primary)', 'var(--sky-accent)', 'var(--purple-accent)', 'var(--amber-accent)'];
                    const IconComp = i === 0 ? Landmark : i === 1 ? PiggyBank : i === 2 ? ShieldCheck : Wallet;

                    return (
                      <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="pastel-icon-box" style={{ background: bgColors[i % 4], color: iconColors[i % 4] }}>
                            <IconComp size={19} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                              {acc.name}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {acc.account_number_mask || 'Physical Vault'}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.88rem' }}>
                          {formatPaise(acc.balance)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                onClick={() => setActiveTab('accounts')}
              >
                <span>View all accounts</span>
                <ChevronRight size={14} />
              </div>
            </div>
          </div>

          {/* ================= COLUMN 2 (CENTER) ================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* 4. Upgraded Financial Overview (Dynamic Spline Area Chart) */}
            <OverviewChart
              transactions={scopedTransactions}
              totalIncomePaise={totalIncomePaise}
              totalExpensePaise={totalExpensePaise}
              timeframe={overviewTimeframe}
              onTimeframeChange={setOverviewTimeframe}
              members={members}
              currentMember={currentMember}
              isHead={isHead}
              selectedMemberId={selectedMemberFilter}
              onSelectMember={setSelectedMemberFilter}
              onNavigateToMembers={() => setActiveTab('members')}
            />

            {/* 5. Recent Transactions List */}
            <div className="neo-card">
              <div className="neo-card-header">
                <div className="neo-card-title">Recent Transactions</div>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--sky-accent)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setActiveTab('transactions')}
                >
                  View All
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {scopedTransactions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0.75rem' }}>
                    <Receipt size={26} style={{ color: 'var(--text-muted)', opacity: 0.6, margin: '0 auto 0.4rem', display: 'block' }} />
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                      No Transactions Yet
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                      Record your first income or expense to activate the family ledger.
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        className="btn btn-sage btn-sm"
                        onClick={() => onOpenNewTx('income')}
                        style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem', borderRadius: '9999px' }}
                      >
                        + Income
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onOpenNewTx('expense')}
                        style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem', borderRadius: '9999px' }}
                      >
                        + Expense
                      </button>
                    </div>
                  </div>
                ) : (
                  scopedTransactions.slice(0, 7).map(tx => {
                    const isExp = tx.type === 'expense';
                    return (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            className="pastel-icon-box"
                            style={{
                              background: isExp ? '#FEF2F2' : '#D5F2E2',
                              color: isExp ? 'var(--coral-accent)' : 'var(--mint-primary)',
                            }}
                          >
                            {isExp ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                              {tx.description}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {formatDate(tx.transaction_date)} • {tx.payment_method || 'UPI'}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: isExp ? 'var(--coral-accent)' : 'var(--mint-primary)',
                          }}
                        >
                          {isExp ? '-' : '+'}
                          {formatPaise(tx.amount)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ================= COLUMN 3 (RIGHT) ================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* 6. Upgraded Quick Actions Card */}
            <QuickActionsCard
              onOpenNewTx={onOpenNewTx}
              onOpenNewRequest={onOpenNewRequest}
              onOpenAffordability={onOpenAffordability}
              setActiveTab={setActiveTab}
            />

            {/* 7. Upgraded Spending Breakdown Card with Quick Tabs for Expense, Income, and Both */}
            <SpendingBreakdownCard
              transactions={scopedTransactions}
              categories={categories}
              totalSpendingPaise={totalSpendingPaise}
              totalIncomePaise={totalIncomePaise}
              onOpenNewTx={onOpenNewTx}
            />

            {/* 8. Recent Activity / Audit Log */}
            <div className="neo-card">
              <div className="neo-card-header">
                <div className="neo-card-title">Recent Activity</div>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--sky-accent)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setActiveTab('control_center')}
                >
                  View All
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {auditLogs.slice(0, 3).map(log => {
                  const isPending = log.action.includes('REQUEST_SUBMITTED');
                  return (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          className="pastel-icon-box"
                          style={{
                            width: 32,
                            height: 32,
                            background: isPending ? '#FEF6E6' : '#E1EDFE',
                            color: isPending ? 'var(--amber-accent)' : 'var(--sky-accent)',
                          }}
                        >
                          {isPending ? <Clock size={15} /> : <ShieldCheck size={15} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {formatActionText(log.action)}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {log.user_name}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`badge ${isPending ? 'badge-brass' : 'badge-sage'}`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {isPending ? 'PENDING' : 'SUCCESS'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
