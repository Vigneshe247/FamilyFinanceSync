/* =========================================================
   FINANCIAL REPORTS & VISUAL ANALYTICS (Section 20)
   Upgraded:
   - Single date picker mode
   - From/To date range picker
   - Period presets (Today, This Week, This Month, Last Month, Q3, YTD)
   - Per-member spending comparison bars for any date range
   - Date-by-date daily spending breakdown table
   ========================================================= */

import React, { useState, useMemo } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise } from '../../utils/currency';
import {
  BarChart3,
  PieChart,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Wallet,
  Filter,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  Settings,
} from 'lucide-react';
import { normalizeRole } from '../../utils/permissions';
import { useViewSettings } from '../../context/ViewSettingsContext';

type FilterMode = 'preset' | 'range' | 'single';
type PresetPeriod = 'today' | 'this_week' | 'current_month' | 'last_month' | 'q3' | 'year_to_date';

const PRESET_LABELS: Record<PresetPeriod, string> = {
  today: 'Today',
  this_week: 'This Week',
  current_month: 'This Month (Sep 2026)',
  last_month: 'Last Month (Aug 2026)',
  q3: 'Q3 2026 (Jul–Sep)',
  year_to_date: 'Year to Date (2026)',
};

export const ReportsPage: React.FC = () => {
  const {
    transactions,
    familyTransactions,
    authorizedTransactions,
    activeFamily,
    activeUserId,
    categories,
    members,
    budget,
    savingsGoals,
    recurring,
  } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const isDemoDate = transactions.some(t => t.transaction_date.startsWith('2026'));
  const anchor = isDemoDate ? new Date('2026-09-20') : new Date();
  const anchorStr = anchor.toISOString().slice(0, 10);

  // Filter mode state
  const [filterMode, setFilterMode] = useState<FilterMode>('preset');
  const [presetPeriod, setPresetPeriod] = useState<PresetPeriod>('current_month');
  const [rangeFrom, setRangeFrom] = useState(
    new Date(anchor.getFullYear(), anchor.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [rangeTo, setRangeTo] = useState(anchorStr);
  const [singleDate, setSingleDate] = useState(anchorStr);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [reportScope, setReportScope] = useState<'family' | 'personal'>('family');
  const [showDailyBreakdown, setShowDailyBreakdown] = useState(false);

  // Compute date range from filter mode
  const { fromDate, toDate } = useMemo((): { fromDate: Date; toDate: Date } => {
    const yr = anchor.getFullYear();
    const mo = anchor.getMonth(); // 8 = Sep

    if (filterMode === 'single') {
      const d = new Date(singleDate);
      const end = new Date(singleDate);
      end.setHours(23, 59, 59);
      return { fromDate: d, toDate: end };
    }

    if (filterMode === 'range') {
      const start = new Date(rangeFrom);
      const end = new Date(rangeTo);
      end.setHours(23, 59, 59);
      return { fromDate: start, toDate: end };
    }

    // Preset mode
    switch (presetPeriod) {
      case 'today': {
        const s = new Date(anchorStr);
        const e = new Date(anchorStr); e.setHours(23, 59, 59);
        return { fromDate: s, toDate: e };
      }
      case 'this_week': {
        const s = new Date(anchor);
        s.setDate(s.getDate() - s.getDay());
        s.setHours(0, 0, 0);
        return { fromDate: s, toDate: new Date(anchor) };
      }
      case 'current_month':
        return { fromDate: new Date(yr, mo, 1), toDate: new Date(anchor) };
      case 'last_month': {
        const pm = mo === 0 ? 11 : mo - 1;
        const py = mo === 0 ? yr - 1 : yr;
        const lastDay = new Date(yr, mo, 0);
        return { fromDate: new Date(py, pm, 1), toDate: lastDay };
      }
      case 'q3':
        return { fromDate: new Date(yr, 6, 1), toDate: new Date(yr, 8, 30) };
      case 'year_to_date':
        return { fromDate: new Date(yr, 0, 1), toDate: new Date(anchor) };
      default:
        return { fromDate: new Date(yr, mo, 1), toDate: new Date(anchor) };
    }
  }, [filterMode, presetPeriod, rangeFrom, rangeTo, singleDate]);

  // Label for current range
  const rangeLabel = useMemo(() => {
    const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    if (filterMode === 'single') return `On ${fmtDate(fromDate)}`;
    if (filterMode === 'range') return `${fmtDate(fromDate)} → ${fmtDate(toDate)}`;
    return PRESET_LABELS[presetPeriod];
  }, [filterMode, fromDate, toDate, presetPeriod]);

  // Scoped transactions
  const scopedTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.transaction_date);
      if (d < fromDate || d > toDate) return false;
      if (selectedMemberId !== 'all' && t.user_id !== selectedMemberId) return false;
      return true;
    });
  }, [transactions, fromDate, toDate, selectedMemberId]);

  // Financials
  const totalIncomePaise = scopedTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpensePaise = scopedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netSavingsPaise = totalIncomePaise - totalExpensePaise;
  const savingsRate = totalIncomePaise > 0 ? Math.round((netSavingsPaise / totalIncomePaise) * 100) : 0;

  const selectedMemberObj = members.find(m => m.user_id === selectedMemberId);

  // Category breakdown
  const categorySpending = categories
    .map(cat => {
      const spent = scopedTransactions.filter(t => t.category_id === cat.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { ...cat, spent, percentage: totalExpensePaise > 0 ? Math.round((spent / totalExpensePaise) * 100) : 0 };
    })
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  // Member spending for date range (uses scopedTransactions per member)
  const memberSpending = members.map(m => {
    const memberTx = transactions.filter(t => {
      const d = new Date(t.transaction_date);
      const inRange = d >= fromDate && d <= toDate;
      return t.user_id === m.user_id && t.type === 'expense' && inRange;
    });
    const spent = memberTx.reduce((s, t) => s + t.amount, 0);
    const totalForRange = scopedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const memberIncome = transactions
      .filter(t => t.user_id === m.user_id && t.type === 'income' && new Date(t.transaction_date) >= fromDate && new Date(t.transaction_date) <= toDate)
      .reduce((s, t) => s + t.amount, 0);
    const txCount = memberTx.length;
    return {
      member: m,
      spent,
      income: memberIncome,
      txCount,
      percentage: totalForRange > 0 ? Math.round((spent / totalForRange) * 100) : 0,
    };
  }).sort((a, b) => b.spent - a.spent);

  // Daily breakdown table
  const dailyBreakdown = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number }>();
    scopedTransactions.forEach(t => {
      const day = t.transaction_date.slice(0, 10);
      const prev = map.get(day) || { income: 0, expense: 0, count: 0 };
      map.set(day, {
        income: prev.income + (t.type === 'income' ? t.amount : 0),
        expense: prev.expense + (t.type === 'expense' ? t.amount : 0),
        count: prev.count + 1,
      });
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, data]) => ({
        date,
        label: new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
        ...data,
        net: data.income - data.expense,
      }));
  }, [scopedTransactions]);

  const maxDailyExpense = Math.max(...dailyBreakdown.map(d => d.expense), 1);

  const handleExportFullReport = () => {
    const targetName = selectedMemberObj ? `${selectedMemberObj.user.name}` : 'CONSOLIDATED FAMILY';
    const rows = [
      `FAMILY FINANCE SYNC — ${targetName.toUpperCase()} STATEMENT`,
      `Generated: ${new Date().toLocaleString()}`,
      `Period: ${rangeLabel}`,
      '',
      `FINANCIAL SUMMARY:`,
      `Total Income: ${formatPaise(totalIncomePaise)}`,
      `Total Expenses: ${formatPaise(totalExpensePaise)}`,
      `Net Surplus: ${formatPaise(netSavingsPaise)} (${savingsRate}% savings rate)`,
      '',
      `CATEGORY BREAKDOWN:`,
      ...categorySpending.map(c => `- ${c.name}: ${formatPaise(c.spent)} (${c.percentage}%)`),
      '',
      `MEMBER EXPENDITURES:`,
      ...memberSpending.map(m => `- ${m.member.user.name} (${m.member.role}): ${formatPaise(m.spent)} (${m.percentage}%)`),
      '',
      `DAILY BREAKDOWN:`,
      ...dailyBreakdown.map(d => `- ${d.label}: IN ${formatPaise(d.income)} | OUT ${formatPaise(d.expense)} | NET ${formatPaise(d.net)}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `family_report_${rangeFrom}_to_${rangeTo}_${selectedMemberId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getRoleColor = (role: string) => {
    const n = normalizeRole(role);
    if (n === 'family_head') return '#22A05B';
    if (n === 'spouse') return '#3E8BF5';
    if (n === 'child') return '#9B51E0';
    if (n === 'grandparent') return '#E5A11E';
    return '#6B7280';
  };

  return (
    <div className="content-page">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
            Financial Reports &amp; Analysis
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            Income, category burn, member allocations, and cashflow — filtered by date or range
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportFullReport}>
            <Download size={14} /> Export Statement
          </button>
        </div>
      </div>

      {/* ==================== FILTER BAR ==================== */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        {/* Filter Mode Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <SlidersHorizontal size={15} color="var(--brass)" style={{ marginRight: '0.2rem' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)', marginRight: '0.5rem' }}>Filter:</span>
          {(['preset', 'range', 'single'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: filterMode === mode ? 'var(--mint-primary)' : 'var(--line)',
                background: filterMode === mode ? 'rgba(34, 160, 91, 0.1)' : 'transparent',
                color: filterMode === mode ? 'var(--mint-primary)' : 'var(--ink-muted)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'preset' ? '⚡ Preset' : mode === 'range' ? '📅 Date Range' : '📌 Single Date'}
            </button>
          ))}
        </div>

        {/* Mode-specific inputs */}
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {filterMode === 'preset' && (
            <div style={{ flex: '1 1 220px' }}>
              <label className="label">Select Period</label>
              <select
                className="select"
                value={presetPeriod}
                onChange={e => setPresetPeriod(e.target.value as PresetPeriod)}
              >
                {(Object.entries(PRESET_LABELS) as [PresetPeriod, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          )}

          {filterMode === 'range' && (
            <div className="calendar-highlight-area" style={{ display: 'flex', gap: '0.75rem', flex: '1 1 340px' }}>
              <div style={{ flex: 1 }}>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#065F46', marginBottom: '0.35rem' }}>
                  <Calendar size={13} color="#059669" /> From Date
                </label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={e => setRangeFrom(e.target.value)}
                  max={rangeTo}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#065F46', marginBottom: '0.35rem' }}>
                  <Calendar size={13} color="#059669" /> To Date
                </label>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={e => setRangeTo(e.target.value)}
                  min={rangeFrom}
                  max={anchorStr}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}

          {filterMode === 'single' && (
            <div className="calendar-highlight-area" style={{ flex: '1 1 220px' }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#065F46', marginBottom: '0.35rem' }}>
                <Calendar size={13} color="#059669" /> Selected Date
              </label>
              <input
                type="date"
                value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
                max={anchorStr}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div style={{ flex: '1 1 180px' }}>
            <label className="label">Member</label>
            <select
              className="select"
              value={selectedMemberId}
              onChange={e => setSelectedMemberId(e.target.value)}
            >
              <option value="all">👥 All Members</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              background: 'var(--paper-dim)',
              border: '1px solid var(--line)',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--brass)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
              marginBottom: '0.02rem',
            }}
          >
            <Calendar size={13} /> {rangeLabel}
          </div>
        </div>
      </div>

      {/* Cash-Flow Summary Strip */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--sage)' }}>
          <div className="stat-label">
            <span>{selectedMemberObj ? `${selectedMemberObj.user.name}'s Inflow` : 'Family Inflow'}</span>
            <ArrowUpRight size={16} color="var(--sage)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sage)' }}>{formatPaise(totalIncomePaise)}</div>
          <div className="stat-meta">
            {scopedTransactions.filter(t => t.type === 'income').length} transactions · {rangeLabel}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--rust)' }}>
          <div className="stat-label">
            <span>{selectedMemberObj ? `${selectedMemberObj.user.name}'s Outflow` : 'Family Outflow'}</span>
            <ArrowDownLeft size={16} color="var(--rust)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--rust)' }}>{formatPaise(totalExpensePaise)}</div>
          <div className="stat-meta">
            {scopedTransactions.filter(t => t.type === 'expense').length} transactions · {rangeLabel}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--brass)' }}>
          <div className="stat-label">
            <span>Net Liquid Surplus</span>
            <Wallet size={16} color="var(--brass)" />
          </div>
          <div className="stat-value" style={{ color: netSavingsPaise >= 0 ? 'var(--sage)' : 'var(--rust)' }}>
            {formatPaise(netSavingsPaise)}
          </div>
          <div className="stat-meta">{savingsRate}% retention rate</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--sky)' }}>
          <div className="stat-label">
            <span>Days in Range</span>
            <Calendar size={16} color="var(--sky)" />
          </div>
          <div className="stat-value">
            {Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)}
          </div>
          <div className="stat-meta">{dailyBreakdown.length} active transaction days</div>
        </div>
      </div>

      {/* ==================== VISUAL ANALYTICS GRID ==================== */}
      <div className="grid-2col" style={{ marginBottom: '1.5rem' }}>
        {/* Category Breakdown */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Expenditure by Category</div>
              <div className="card-subtitle">Expense distribution · {rangeLabel}</div>
            </div>
            <div className="brand-icon-wrap" style={{ width: 34, height: 34 }}>
              <PieChart size={16} />
            </div>
          </div>

          {categorySpending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
              No expense transactions in this period.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {categorySpending.map(cat => (
                <div key={cat.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: cat.color }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cat.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ fontWeight: 700 }}>{formatPaise(cat.spent)}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>({cat.percentage}%)</span>
                    </div>
                  </div>
                  <div className="progress-bar-container" style={{ height: '7px' }}>
                    <div className="progress-bar-fill" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Per-Member Spending Comparison */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Member Spending Comparison</div>
              <div className="card-subtitle">Who spent how much · {rangeLabel}</div>
            </div>
            <div className="brand-icon-wrap" style={{ width: 34, height: 34 }}>
              <Users size={16} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {memberSpending.map(({ member, spent, income, txCount, percentage }) => {
              const roleColor = getRoleColor(member.role);
              return (
                <div
                  key={member.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid var(--line)`,
                    background: 'var(--paper-dim)',
                    borderLeft: `3px solid ${roleColor}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <img
                        src={member.user.avatar_url}
                        alt={member.user.name}
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{member.user.name}</div>
                        <div style={{ fontSize: '0.68rem', color: roleColor, fontWeight: 700, textTransform: 'uppercase' }}>
                          {member.role.replace(/_/g, ' ')} · {txCount} txn{txCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--rust)' }}>
                        {formatPaise(spent)}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--sage)' }}>
                        ↑ {formatPaise(income)}
                      </div>
                    </div>
                  </div>

                  <div className="progress-bar-container" style={{ height: '6px' }}>
                    <div className="progress-bar-fill" style={{ width: `${percentage}%`, backgroundColor: roleColor }} />
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--ink-muted)', marginTop: '0.25rem', textAlign: 'right' }}>
                    {percentage}% of family total
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==================== DAILY SPENDING BREAKDOWN ==================== */}
      <div className="card">
        <div
          className="card-header"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowDailyBreakdown(v => !v)}
        >
          <div>
            <div className="card-title">Day-by-Day Spending Breakdown</div>
            <div className="card-subtitle">
              {dailyBreakdown.length} transaction day{dailyBreakdown.length !== 1 ? 's' : ''} · {rangeLabel}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--brass)', fontWeight: 700 }}>
              {showDailyBreakdown ? 'Collapse' : 'Expand'}
            </span>
            {showDailyBreakdown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {showDailyBreakdown && (
          dailyBreakdown.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
              No transactions in this period.
            </div>
          ) : (
            <>
              {/* Mini bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '64px', marginBottom: '0.5rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                {[...dailyBreakdown].reverse().map(d => {
                  const pct = Math.round((d.expense / maxDailyExpense) * 100);
                  return (
                    <div
                      key={d.date}
                      title={`${d.label}: ${formatPaise(d.expense)}`}
                      style={{
                        flex: '0 0 auto',
                        width: '10px',
                        height: `${Math.max(4, pct * 0.64)}px`,
                        background: d.net >= 0
                          ? 'linear-gradient(180deg, #22A05B, #86EFAC)'
                          : 'linear-gradient(180deg, #EF4444, #FCA5A5)',
                        borderRadius: '2px 2px 0 0',
                        cursor: 'pointer',
                        transition: 'opacity 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    />
                  );
                })}
              </div>

              {/* Table */}
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Income</th>
                      <th style={{ textAlign: 'right' }}>Expense</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                      <th style={{ textAlign: 'right' }}>Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyBreakdown.map(d => (
                      <tr key={d.date}>
                        <td style={{ fontWeight: 600, fontSize: '0.82rem' }}>{d.label}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--sage)', fontWeight: 600, fontSize: '0.82rem' }}>
                          {d.income > 0 ? `+${formatPaise(d.income)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--rust)', fontWeight: 600, fontSize: '0.82rem' }}>
                          {d.expense > 0 ? formatPaise(d.expense) : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            color: d.net >= 0 ? 'var(--sage)' : 'var(--rust)',
                          }}
                        >
                          {d.net >= 0 ? '+' : ''}{formatPaise(d.net)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                          {d.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
};
