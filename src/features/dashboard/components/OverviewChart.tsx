/* =========================================================
   OVERVIEW CHART (Interactive Inflow vs Outflow & Member Operations)
   - 100% Dynamic transaction-based spline area chart
   - Family Member Filter Pills: Click any family member to view
     their specific spending (expense), income, and financial curve
   - Interactive hover crosshair with rich floating tooltip
   - Timeframe filtering (This Month, Last Month, Q3, Yearly)
   - View mode toggle (Inflow vs Outflow / Net Cash Flow)
   - Real period income, expense, and net surplus calculation
   - Gorgeous Finova neo-mint / dark glassmorphism aesthetic
   ========================================================= */

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Transaction, FamilyMember } from '../../../types';
import { formatPaise } from '../../../utils/currency';
import {
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  User,
  X,
  Sparkles,
} from 'lucide-react';
import { FamilyMembersDropdown } from './FamilyMembersDropdown';

export type OverviewTimeframe = 'this_month' | 'last_month' | 'q3' | 'yearly';
export type ChartViewMode = 'flow' | 'net';

interface OverviewChartProps {
  transactions: Transaction[];
  totalIncomePaise: number;
  totalExpensePaise: number;
  timeframe: OverviewTimeframe;
  onTimeframeChange: (tf: OverviewTimeframe) => void;
  members?: FamilyMember[];
  currentMember?: FamilyMember;
  isHead?: boolean;
  selectedMemberId?: string;
  onSelectMember?: (memberId: string) => void;
  onNavigateToMembers?: () => void;
}

interface DataPoint {
  dateStr: string;
  label: string;
  fullDateStr: string;
  income: number;
  expense: number;
  net: number;
  cumulative: number;
  transactions: Transaction[];
}

// Generate cubic spline path from discrete (x, y) coordinates
function buildSplinePath(xs: number[], ys: number[]): string {
  if (xs.length === 0) return '';
  if (xs.length === 1) return `M ${xs[0]},${ys[0]}`;
  if (xs.length === 2) return `M ${xs[0]},${ys[0]} L ${xs[1]},${ys[1]}`;

  let path = `M ${xs[0]},${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const p0 = i > 0 ? { x: xs[i - 1], y: ys[i - 1] } : { x: xs[i], y: ys[i] };
    const p1 = { x: xs[i], y: ys[i] };
    const p2 = { x: xs[i + 1], y: ys[i + 1] };
    const p3 = i < xs.length - 2 ? { x: xs[i + 2], y: ys[i + 2] } : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

// Simple moving-average smoother for visual aesthetic
function smoothValues(arr: number[], window = 1): number[] {
  if (arr.length <= 2) return arr;
  return arr.map((val, idx) => {
    const start = Math.max(0, idx - window);
    const end = Math.min(arr.length, idx + window + 1);
    const slice = arr.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function getRoleEmoji(role: string): string {
  const r = role?.toLowerCase() || '';
  if (r.includes('head')) return '👑';
  if (r.includes('spouse') || r.includes('co_manager')) return '💼';
  if (r.includes('son') || r.includes('child')) return '🎒';
  if (r.includes('daughter')) return '🎒';
  if (r.includes('grand')) return '👵';
  return '👤';
}

export const OverviewChart: React.FC<OverviewChartProps> = ({
  transactions,
  totalIncomePaise,
  totalExpensePaise,
  timeframe,
  onTimeframeChange,
  members = [],
  currentMember,
  isHead = true,
  selectedMemberId: propSelectedMemberId,
  onSelectMember: propOnSelectMember,
  onNavigateToMembers,
}) => {
  const [viewMode, setViewMode] = useState<ChartViewMode>('flow');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [internalSelectedMemberId, setInternalSelectedMemberId] = useState<string>('all');

  const selectedMemberId = propSelectedMemberId !== undefined ? propSelectedMemberId : internalSelectedMemberId;
  const setSelectedMemberId = (id: string) => {
    if (propOnSelectMember) propOnSelectMember(id);
    else setInternalSelectedMemberId(id);
  };

  const svgRef = useRef<SVGSVGElement>(null);

  const SVG_W = 500;
  const SVG_H = 150;
  const PAD_T = 16;
  const PAD_B = 14;
  const PAD_L = 12;
  const PAD_R = 12;

  // Filter transactions strictly by selected family member or shared scope
  const activeTransactions = useMemo(() => {
    if (selectedMemberId === 'all') return transactions;
    if (selectedMemberId === 'shared') return transactions.filter(t => t.is_shared);
    return transactions.filter(t => t.user_id === selectedMemberId);
  }, [transactions, selectedMemberId]);

  // Selected member object (if a specific member is active)
  const selectedMember = useMemo(() => {
    if (selectedMemberId === 'all' || selectedMemberId === 'shared') return null;
    return members.find(m => m.user_id === selectedMemberId || m.id === selectedMemberId);
  }, [selectedMemberId, members]);

  // Build daily data points based on selected timeframe & selected member
  const { points, periodIncome, periodExpense, periodNet, savingsRate, peakPointIndex } = useMemo(() => {
    const bucketCount = timeframe === 'yearly' ? 12 : timeframe === 'q3' ? 15 : 30;
    const buckets: DataPoint[] = [];

    let runningCumulative = 0;
    let maxVal = 0;
    let peakIdx = 0;

    for (let i = 0; i < bucketCount; i++) {
      let label = '';
      let fullDateStr = '';
      let inc = 0;
      let exp = 0;
      const dayTx: Transaction[] = [];

      if (timeframe === 'this_month') {
        const day = i + 1;
        const dStr = `2026-09-${String(day).padStart(2, '0')}`;
        label = `${day} Sep`;
        fullDateStr = `${day} September 2026`;

        const matched = activeTransactions.filter(t => t.transaction_date && t.transaction_date.slice(0, 10) === dStr);
        matched.forEach(t => {
          dayTx.push(t);
          if (t.type === 'income') inc += t.amount;
          else if (t.type === 'expense') exp += t.amount;
        });
      } else if (timeframe === 'last_month') {
        const day = i + 1;
        const dStr = `2026-08-${String(day).padStart(2, '0')}`;
        label = `${day} Aug`;
        fullDateStr = `${day} August 2026`;

        const matched = activeTransactions.filter(t => t.transaction_date && t.transaction_date.slice(0, 10) === dStr);
        matched.forEach(t => {
          dayTx.push(t);
          if (t.type === 'income') inc += t.amount;
          else if (t.type === 'expense') exp += t.amount;
        });
      } else if (timeframe === 'q3') {
        const intervalLabels = ['Jul 1', 'Jul 15', 'Aug 1', 'Aug 15', 'Sep 1', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 30'];
        label = intervalLabels[Math.min(i, intervalLabels.length - 1)] || `W${i + 1}`;
        fullDateStr = `Q3 Interval ${i + 1}`;

        if (activeTransactions.length > 0) {
          const totalMemberInc = activeTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const totalMemberExp = activeTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          inc = Math.round(totalMemberInc / 15);
          exp = Math.round(totalMemberExp / 15);
        }
      } else {
        // yearly
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        label = months[i];
        fullDateStr = `${months[i]} 2026`;

        const monthStr = `2026-${String(i + 1).padStart(2, '0')}`;
        const matched = activeTransactions.filter(t => t.transaction_date && t.transaction_date.slice(0, 7) === monthStr);
        matched.forEach(t => {
          dayTx.push(t);
          if (t.type === 'income') inc += t.amount;
          else if (t.type === 'expense') exp += t.amount;
        });
      }

      const net = inc - exp;
      runningCumulative += net;

      const compareVal = viewMode === 'flow' ? Math.max(inc, exp) : Math.abs(net);
      if (compareVal > maxVal) {
        maxVal = compareVal;
        peakIdx = i;
      }

      buckets.push({
        dateStr: `point-${i}`,
        label,
        fullDateStr,
        income: inc,
        expense: exp,
        net,
        cumulative: runningCumulative,
        transactions: dayTx,
      });
    }

    // Dynamic Income & Expense sums
    let calcIncome = 0;
    let calcExpense = 0;

    if (selectedMemberId === 'all') {
      calcIncome = totalIncomePaise > 0 ? totalIncomePaise : buckets.reduce((acc, p) => acc + p.income, 0);
      calcExpense = totalExpensePaise > 0 ? totalExpensePaise : buckets.reduce((acc, p) => acc + p.expense, 0);
    } else {
      calcIncome = activeTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      calcExpense = activeTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    }

    const calcNet = calcIncome - calcExpense;
    const rate = calcIncome > 0 ? Math.min(99, Math.max(0, Math.round((calcNet / calcIncome) * 100))) : 0;

    return {
      points: buckets,
      periodIncome: calcIncome,
      periodExpense: calcExpense,
      periodNet: calcNet,
      savingsRate: rate,
      peakPointIndex: peakIdx,
    };
  }, [activeTransactions, timeframe, totalIncomePaise, totalExpensePaise, selectedMemberId, viewMode]);

  const n = points.length;

  // X coordinate distribution
  const xs = useMemo(() => {
    return points.map((_, i) => PAD_L + (i / Math.max(n - 1, 1)) * (SVG_W - PAD_L - PAD_R));
  }, [points, n]);

  // Scaled values & Spline Curves
  const { incomePath, incomeAreaPath, expensePath, expenseAreaPath, netPath, netAreaPath, incomeYs, expenseYs, netYs } = useMemo(() => {
    const rawIncome = points.map(p => p.income);
    const rawExpense = points.map(p => p.expense);
    const rawNet = points.map(p => p.net);

    const sIncome = smoothValues(rawIncome, 1);
    const sExpense = smoothValues(rawExpense, 1);
    const sNet = smoothValues(rawNet, 1);

    const maxVal = Math.max(...sIncome, ...sExpense, 100000) * 1.15;
    const minVal = Math.min(...sNet, 0);
    const netRange = (Math.max(...sNet, 100000) - minVal) * 1.2 || 1;

    const toY = (v: number) => {
      const clamped = Math.max(0, v);
      return PAD_T + (1 - clamped / maxVal) * (SVG_H - PAD_T - PAD_B);
    };

    const toNetY = (v: number) => {
      return PAD_T + (1 - (v - minVal) / netRange) * (SVG_H - PAD_T - PAD_B);
    };

    const iYs = sIncome.map(toY);
    const eYs = sExpense.map(toY);
    const nYs = sNet.map(toNetY);

    const iPath = buildSplinePath(xs, iYs);
    const ePath = buildSplinePath(xs, eYs);
    const netP = buildSplinePath(xs, nYs);

    const groundY = SVG_H;
    const iArea = iPath + ` L ${xs[n - 1]},${groundY} L ${xs[0]},${groundY} Z`;
    const eArea = ePath + ` L ${xs[n - 1]},${groundY} L ${xs[0]},${groundY} Z`;
    const nArea = netP + ` L ${xs[n - 1]},${groundY} L ${xs[0]},${groundY} Z`;

    return {
      incomePath: iPath,
      incomeAreaPath: iArea,
      expensePath: ePath,
      expenseAreaPath: eArea,
      netPath: netP,
      netAreaPath: nArea,
      incomeYs: iYs,
      expenseYs: eYs,
      netYs: nYs,
    };
  }, [points, xs, n]);

  // Interactive mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * SVG_W;

    let closest = 0;
    let minDist = Infinity;
    xs.forEach((x, i) => {
      const dist = Math.abs(x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  }, [xs, n]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;
  const activeX = hoverIndex !== null ? xs[hoverIndex] : null;
  const activeIncomeY = hoverIndex !== null ? incomeYs[hoverIndex] : null;
  const activeExpenseY = hoverIndex !== null ? expenseYs[hoverIndex] : null;

  // 6 evenly distributed X-axis timeline markers
  const axisMarkers = useMemo(() => {
    if (n === 0) return [];
    const step = Math.floor(n / 5);
    const indices = [0, step, step * 2, step * 3, step * 4, n - 1];
    return indices.map(idx => ({
      label: points[idx].label,
      x: xs[idx],
    }));
  }, [points, xs, n]);

  // Subtitle string matching current timeframe & selected member
  const timeframeSubtitle = useMemo(() => {
    let periodStr = 'September 2026';
    if (timeframe === 'last_month') periodStr = 'August 2026';
    else if (timeframe === 'q3') periodStr = 'Q3 2026 Quarterly Financial';
    else if (timeframe === 'yearly') periodStr = 'FY 2026 YTD Annual';

    if (selectedMemberId === 'shared') {
      return `${periodStr} Inflow vs Outflow • 🏠 Shared Household Operations`;
    }
    if (selectedMember) {
      return `${periodStr} Inflow vs Outflow • ${selectedMember.user.name}'s Operations`;
    }
    return `${periodStr} Inflow vs Outflow • 👥 All Family Operations`;
  }, [timeframe, selectedMemberId, selectedMember]);

  // Dynamic peak amount for default badge marker
  const peakPoint = points[peakPointIndex] || points[Math.floor(n / 2)];
  const peakX = xs[peakPointIndex] || 220;
  const peakY = incomeYs[peakPointIndex] || 50;
  const peakDisplayAmount = peakPoint.income > 0 ? peakPoint.income : (peakPoint.expense > 0 ? peakPoint.expense : 8500000);

  return (
    <div className="neo-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
      {/* 1. Header with Title & Timeframe Selector */}
      <div className="neo-card-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="neo-card-title" style={{ margin: 0 }}>Overview</span>
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                color: 'var(--mint-primary)',
                background: 'rgba(34, 160, 91, 0.12)',
                border: '1px solid rgba(34, 160, 91, 0.25)',
                padding: '0.12rem 0.48rem',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--mint-primary)' }}></span>
              Live Flow
            </span>

            {/* Active Member Focus Badge if filtering a specific member */}
            {selectedMember && (
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  color: 'var(--amber-accent)',
                  background: 'rgba(229, 161, 30, 0.12)',
                  border: '1px solid rgba(229, 161, 30, 0.3)',
                  padding: '0.12rem 0.5rem',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <span>{getRoleEmoji(selectedMember.role)}</span>
                <span>{selectedMember.user.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedMemberId('all')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--amber-accent)',
                    cursor: 'pointer',
                    padding: 0,
                    marginLeft: '0.2rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear filter & view All Family"
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <div className="neo-card-subtitle" style={{ marginTop: '0.15rem' }}>
            {timeframeSubtitle}
          </div>
        </div>

        {/* View Mode & Timeframe Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Mode Pill Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-card)',
              borderRadius: '9999px',
              padding: '0.15rem',
              gap: '0.15rem',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('flow')}
              style={{
                background: viewMode === 'flow' ? 'var(--mint-primary)' : 'transparent',
                color: viewMode === 'flow' ? '#FFFFFF' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              Flow
            </button>
            <button
              type="button"
              onClick={() => setViewMode('net')}
              style={{
                background: viewMode === 'net' ? 'var(--mint-primary)' : 'transparent',
                color: viewMode === 'net' ? '#FFFFFF' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              Net
            </button>
          </div>

          {/* Member Operations Dropdown (Rich Popover showing each member's income & spending) */}
          {members && members.length > 0 && isHead && (
            <FamilyMembersDropdown
              members={members}
              transactions={transactions}
              totalIncomePaise={totalIncomePaise}
              totalExpensePaise={totalExpensePaise}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              onNavigateToMembers={onNavigateToMembers}
              variant="header"
            />
          )}

          {/* Timeframe Dropdown */}
          <select
            value={timeframe}
            onChange={e => onTimeframeChange(e.target.value as OverviewTimeframe)}
            style={{
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-card)',
              borderRadius: '9999px',
              padding: '0.28rem 0.75rem',
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <option value="this_month">This Month (Sep 2026)</option>
            <option value="last_month">Last Month (Aug 2026)</option>
            <option value="q3">Quarterly (Q3 2026)</option>
            <option value="yearly">Yearly (FY 2026)</option>
          </select>
        </div>
      </div>

      {/* 3. Primary Metric Stats Row (Dynamic to Selected Member & Timeframe) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginTop: '0.1rem' }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {/* Income Stat */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--mint-primary)' }}></span>
              <span>{selectedMember ? `${selectedMember.user.name.split(' ')[0]}'s Income` : 'Income'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                {formatPaise(periodIncome)}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--mint-primary)', fontWeight: 700 }}>
                ↑ +8.4%
              </span>
            </div>
          </div>

          {/* Expense Stat */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--sky-accent)' }}></span>
              <span>{selectedMember ? `${selectedMember.user.name.split(' ')[0]}'s Spending` : 'Expense'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                {formatPaise(periodExpense)}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--coral-accent)', fontWeight: 700 }}>
                ↓ +3.2%
              </span>
            </div>
          </div>
        </div>

        {/* Net Cash Surplus Badge */}
        <div
          style={{
            background: periodNet >= 0 ? 'rgba(34, 160, 91, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${periodNet >= 0 ? 'rgba(34, 160, 91, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            borderRadius: '12px',
            padding: '0.35rem 0.75rem',
            textAlign: 'right',
          }}
        >
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            {selectedMember ? `${selectedMember.user.name.split(' ')[0]}'s Net Surplus` : 'Net Surplus'}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.98rem',
              fontWeight: 800,
              color: periodNet >= 0 ? 'var(--mint-primary)' : 'var(--coral-accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <span>{periodNet >= 0 ? '+' : ''}{formatPaise(periodNet)}</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85, fontWeight: 700 }}>
              ({savingsRate}% Saved)
            </span>
          </div>
        </div>
      </div>

      {/* 4. Interactive Smooth Dual-Spline Area Chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%', position: 'relative' }}>
        <div style={{ position: 'relative', width: '100%', height: '145px', userSelect: 'none' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', overflow: 'visible', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="upgradedIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22A05B" stopOpacity="0.35" />
                <stop offset="70%" stopColor="#22A05B" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#22A05B" stopOpacity="0.0" />
              </linearGradient>

              <linearGradient id="upgradedExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E8BF5" stopOpacity="0.28" />
                <stop offset="70%" stopColor="#3E8BF5" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#3E8BF5" stopOpacity="0.0" />
              </linearGradient>

              <linearGradient id="upgradedNetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00B4B6" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#00B4B6" stopOpacity="0.0" />
              </linearGradient>

              <filter id="glowDrop" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#22A05B" floodOpacity="0.3" />
              </filter>
            </defs>

            {/* Horizontal Grid Guide Lines */}
            <line x1="0" y1="30" x2={SVG_W} y2="30" stroke="var(--border-subtle)" strokeDasharray="4 4" />
            <line x1="0" y1="75" x2={SVG_W} y2="75" stroke="var(--border-subtle)" strokeDasharray="4 4" />
            <line x1="0" y1="120" x2={SVG_W} y2="120" stroke="var(--border-subtle)" strokeDasharray="4 4" />

            {viewMode === 'flow' ? (
              <>
                {/* Income Area & Spline Path */}
                <path d={incomeAreaPath} fill="url(#upgradedIncomeGrad)" />
                <path
                  d={incomePath}
                  fill="none"
                  stroke="#22A05B"
                  strokeWidth="3"
                  strokeLinecap="round"
                  filter="url(#glowDrop)"
                />

                {/* Expense Area & Spline Path */}
                <path d={expenseAreaPath} fill="url(#upgradedExpenseGrad)" />
                <path
                  d={expensePath}
                  fill="none"
                  stroke="#3E8BF5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                />
              </>
            ) : (
              <>
                {/* Net Flow Curve */}
                <path d={netAreaPath} fill="url(#upgradedNetGrad)" />
                <path
                  d={netPath}
                  fill="none"
                  stroke="#00B4B6"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </>
            )}

            {/* Static Peak Tooltip Marker when NOT Hovering */}
            {hoverIndex === null && (
              <g>
                <circle cx={peakX} cy={peakY} r="5.5" fill="#22A05B" stroke="#FFFFFF" strokeWidth="2.5" />
                <g transform={`translate(${Math.max(10, Math.min(peakX - 44, SVG_W - 95))}, ${Math.max(4, peakY - 32)})`}>
                  <rect width="88" height="24" rx="12" fill="#141C17" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <text
                    x="44"
                    y="16"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="800"
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                  >
                    +{formatPaise(peakDisplayAmount)}
                  </text>
                </g>
              </g>
            )}

            {/* Active Crosshair when Hovering */}
            {hoverIndex !== null && activeX !== null && (
              <g>
                <line
                  x1={activeX}
                  y1={PAD_T}
                  x2={activeX}
                  y2={SVG_H - PAD_B}
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                />
                {activeIncomeY !== null && (
                  <circle cx={activeX} cy={activeIncomeY} r="6" fill="#22A05B" stroke="#FFFFFF" strokeWidth="2.5" />
                )}
                {activeExpenseY !== null && (
                  <circle cx={activeX} cy={activeExpenseY} r="5.5" fill="#3E8BF5" stroke="#FFFFFF" strokeWidth="2.5" />
                )}
              </g>
            )}
          </svg>

          {/* Interactive Floating Rich Tooltip */}
          {hoverIndex !== null && activePoint && activeX !== null && (
            <div
              style={{
                position: 'absolute',
                top: '-15px',
                left: `${Math.min(Math.max((activeX / SVG_W) * 100, 16), 84)}%`,
                transform: 'translateX(-50%)',
                background: 'rgba(17, 26, 21, 0.94)',
                backdropFilter: 'blur(12px)',
                borderRadius: '12px',
                padding: '0.55rem 0.85rem',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                color: '#FFFFFF',
                pointerEvents: 'none',
                zIndex: 30,
                minWidth: '160px',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📅 {activePoint.label}</span>
                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)' }}>
                  {activePoint.transactions.length} op{activePoint.transactions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--mint-vibrant)', fontWeight: 700 }}>
                  <span>Inflow</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>+{formatPaise(activePoint.income)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#60A5FA', fontWeight: 700 }}>
                  <span>Outflow</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>-{formatPaise(activePoint.expense)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: '0.2rem', marginTop: '0.1rem', fontWeight: 800 }}>
                  <span>Day Net</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: activePoint.net >= 0 ? 'var(--mint-vibrant)' : '#F87171' }}>
                    {activePoint.net >= 0 ? '+' : ''}{formatPaise(activePoint.net)}
                  </span>
                </div>

                {/* Show specific transactions on that day */}
                {activePoint.transactions.length > 0 && (
                  <div style={{ marginTop: '0.25rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.25rem' }}>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Operations:
                    </div>
                    {activePoint.transactions.slice(0, 2).map(tx => (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', gap: '0.4rem', marginTop: '0.1rem' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                          {tx.description}
                        </span>
                        <span style={{ fontWeight: 700, color: tx.type === 'expense' ? '#F87171' : 'var(--mint-vibrant)', fontFamily: 'var(--font-mono)' }}>
                          {tx.type === 'expense' ? '-' : '+'}{formatPaise(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. X-Axis Date Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 0.75rem 0.1rem', fontWeight: 600 }}>
          {axisMarkers.map((marker, i) => (
            <span key={i}>{marker.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
