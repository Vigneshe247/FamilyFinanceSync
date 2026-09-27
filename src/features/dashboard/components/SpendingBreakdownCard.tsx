/* =========================================================
   BREAKDOWN CARD — DYNAMIC INTERACTIVE DONUT & QUICK TABS
   - Quick Tabs for: [ Expense ] [ Income ] [ Both (Inflow vs Outflow) ]
   - 100% Dynamic SVG Donut slices calculated from active category spending or income
   - Interactive hover synchronization: hovering donut slice or legend row
     dynamically shifts center display to show category name, amount & %
   - Both mode compares Inflow vs Outflow with Net Surplus and Savings Rate
   - Quick Task (+) button to instantly log new Income or Expense
   - Timeframe switcher (This Month / Last Month / All Time)
   - Neo-mint / dark theme luxury styling
   ========================================================= */

import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../../../types';
import { formatPaise } from '../../../utils/currency';
import {
  PieChart,
  ChevronDown,
  Plus,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
} from 'lucide-react';

interface SpendingBreakdownCardProps {
  transactions: Transaction[];
  categories: Category[];
  totalSpendingPaise: number;
  totalIncomePaise?: number;
  onOpenNewTx?: (initialType?: 'expense' | 'income') => void;
}

export type BreakdownTimeframe = 'this_month' | 'last_month' | 'all_time';
export type BreakdownViewMode = 'expense' | 'income' | 'both';

export const SpendingBreakdownCard: React.FC<SpendingBreakdownCardProps> = ({
  transactions,
  categories,
  totalSpendingPaise: propTotalSpending,
  totalIncomePaise: propTotalIncome = 10500000,
  onOpenNewTx,
}) => {
  const [viewMode, setViewMode] = useState<BreakdownViewMode>('expense');
  const [breakdownTimeframe, setBreakdownTimeframe] = useState<BreakdownTimeframe>('this_month');
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);

  // Filter transactions based on breakdown timeframe
  const periodTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t.transaction_date) return true;
      const dateStr = t.transaction_date.slice(0, 10);
      if (breakdownTimeframe === 'this_month') {
        return dateStr.startsWith('2026-09');
      } else if (breakdownTimeframe === 'last_month') {
        return dateStr.startsWith('2026-08');
      }
      return true; // all_time
    });
  }, [transactions, breakdownTimeframe]);

  const filteredExpenses = useMemo(() => {
    return periodTransactions.filter(t => t.type === 'expense');
  }, [periodTransactions]);

  const filteredIncomes = useMemo(() => {
    return periodTransactions.filter(t => t.type === 'income');
  }, [periodTransactions]);

  // Aggregate category spending (Expenses)
  const categorySpending = useMemo(() => {
    const map = new Map<string, { categoryId: string; name: string; color: string; amount: number }>();
    const defaultColors = ['#22A05B', '#E5A11E', '#3E8BF5', '#9B51E0', '#00B4B6', '#EB5757', '#F79E1B'];

    filteredExpenses.forEach(t => {
      const cat = categories.find(c => c.id === t.category_id);
      const catName = t.custom_category ? `Other (${t.custom_category})` : (cat?.name || 'General');
      const color = cat?.color || defaultColors[map.size % defaultColors.length];

      const key = t.category_id || catName;
      const existing = map.get(key) || { categoryId: key, name: catName, color, amount: 0 };
      existing.amount += t.amount;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, categories]);

  // Aggregate category income (Income Inflows)
  const categoryIncome = useMemo(() => {
    const map = new Map<string, { categoryId: string; name: string; color: string; amount: number }>();
    const incomeColors = ['#22A05B', '#3E8BF5', '#7C3AED', '#E5A11E', '#059669', '#0891B2', '#DB2777'];

    filteredIncomes.forEach(t => {
      const cat = categories.find(c => c.id === t.category_id);
      const catName = t.custom_category ? `Other (${t.custom_category})` : (cat?.name || 'Salary & Wages');
      const color = cat?.color || incomeColors[map.size % incomeColors.length];

      const key = t.category_id || catName;
      const existing = map.get(key) || { categoryId: key, name: catName, color, amount: 0 };
      existing.amount += t.amount;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredIncomes, categories]);

  // Total amounts
  const calculatedTotalExpense = useMemo(() => {
    const sum = filteredExpenses.reduce((s, t) => s + t.amount, 0);
    return sum > 0 ? sum : (propTotalSpending > 0 ? propTotalSpending : 0);
  }, [filteredExpenses, propTotalSpending]);

  const calculatedTotalIncome = useMemo(() => {
    const sum = filteredIncomes.reduce((s, t) => s + t.amount, 0);
    return sum > 0 ? sum : (propTotalIncome > 0 ? propTotalIncome : 0);
  }, [filteredIncomes, propTotalIncome]);

  // Combined Inflow vs Outflow (Both Mode)
  const bothItems = useMemo(() => {
    return [
      {
        categoryId: 'both-income',
        name: 'Total Inflow',
        color: '#22A05B',
        amount: calculatedTotalIncome,
      },
      {
        categoryId: 'both-expense',
        name: 'Total Outflow',
        color: '#3E8BF5',
        amount: calculatedTotalExpense,
      },
    ];
  }, [calculatedTotalIncome, calculatedTotalExpense]);

  // Active items for active viewMode
  const activeItems = useMemo(() => {
    if (viewMode === 'expense') return categorySpending;
    if (viewMode === 'income') return categoryIncome;
    return bothItems;
  }, [viewMode, categorySpending, categoryIncome, bothItems]);

  const activeTotalPaise = useMemo(() => {
    if (viewMode === 'expense') return calculatedTotalExpense;
    if (viewMode === 'income') return calculatedTotalIncome;
    return calculatedTotalIncome + calculatedTotalExpense;
  }, [viewMode, calculatedTotalExpense, calculatedTotalIncome]);

  const netSurplusPaise = calculatedTotalIncome - calculatedTotalExpense;
  const savingsRate = calculatedTotalIncome > 0 ? Math.round((netSurplusPaise / calculatedTotalIncome) * 100) : 0;

  // Compute donut segment slices
  const donutSlices = useMemo(() => {
    let runningPct = 0;
    return activeItems.map((item, idx) => {
      const rawPct = activeTotalPaise > 0 ? (item.amount / activeTotalPaise) * 100 : 0;
      const pct = Math.max(1, Math.round(rawPct * 10) / 10);
      const offset = runningPct;
      runningPct += pct;

      return {
        ...item,
        pct: Math.round(rawPct),
        dashArray: `${pct} ${100 - pct}`,
        dashOffset: -offset,
      };
    });
  }, [activeItems, activeTotalPaise]);

  const hoveredItem = hoveredCategoryId ? activeItems.find(c => c.categoryId === hoveredCategoryId) : null;
  const hoveredPct = hoveredItem && activeTotalPaise > 0 ? Math.round((hoveredItem.amount / activeTotalPaise) * 100) : 0;

  return (
    <div className="neo-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* 1. Header with Title & Quick Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span className="neo-card-title" style={{ margin: 0, fontSize: '0.98rem' }}>
            {viewMode === 'expense' ? 'Spending Breakdown' : viewMode === 'income' ? 'Income Breakdown' : 'Cashflow (Both)'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {/* Timeframe Dropdown */}
          <select
            value={breakdownTimeframe}
            onChange={e => setBreakdownTimeframe(e.target.value as BreakdownTimeframe)}
            style={{
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-card)',
              borderRadius: '9999px',
              padding: '0.2rem 0.55rem',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="all_time">All Time</option>
          </select>

          {/* Quick Task (+) Log Action Button */}
          {onOpenNewTx && (
            <button
              type="button"
              onClick={() => onOpenNewTx(viewMode === 'income' ? 'income' : 'expense')}
              style={{
                background: 'rgba(34, 160, 91, 0.12)',
                border: '1px solid rgba(34, 160, 91, 0.28)',
                color: 'var(--mint-primary)',
                borderRadius: '50%',
                width: 25,
                height: 25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.18s ease',
              }}
              title={viewMode === 'income' ? 'Quick Task: Log Income' : 'Quick Task: Log Expense'}
            >
              <Plus size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Quick Tabs (Expense | Income | Both) */}
      <div
        style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '9999px',
          padding: '0.15rem',
          border: '1px solid var(--border-card)',
          gap: '0.15rem',
          width: '100%',
        }}
      >
        <button
          type="button"
          onClick={() => { setViewMode('expense'); setHoveredCategoryId(null); }}
          style={{
            flex: 1,
            textAlign: 'center',
            background: viewMode === 'expense' ? 'var(--mint-primary)' : 'transparent',
            color: viewMode === 'expense' ? '#FFFFFF' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '9999px',
            padding: '0.24rem 0.45rem',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => { setViewMode('income'); setHoveredCategoryId(null); }}
          style={{
            flex: 1,
            textAlign: 'center',
            background: viewMode === 'income' ? 'var(--mint-primary)' : 'transparent',
            color: viewMode === 'income' ? '#FFFFFF' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '9999px',
            padding: '0.24rem 0.45rem',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          Income
        </button>
        <button
          type="button"
          onClick={() => { setViewMode('both'); setHoveredCategoryId(null); }}
          style={{
            flex: 1,
            textAlign: 'center',
            background: viewMode === 'both' ? 'var(--mint-primary)' : 'transparent',
            color: viewMode === 'both' ? '#FFFFFF' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '9999px',
            padding: '0.24rem 0.45rem',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          Both
        </button>
      </div>

      {/* 3. Donut Chart & Breakdown Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.1rem' }}>
        {/* SVG Donut Chart */}
        <div
          style={{
            position: 'relative',
            width: '118px',
            height: '118px',
            flexShrink: 0,
          }}
        >
          <svg
            viewBox="0 0 42 42"
            style={{
              width: '100%',
              height: '100%',
              transform: 'rotate(-90deg)',
              overflow: 'visible',
            }}
          >
            <defs>
              <filter id="donutGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#34C779" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Background Ring Track */}
            <circle
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="5.5"
            />

            {/* Slices */}
            {donutSlices.map((slice, i) => {
              const isHovered = hoveredCategoryId === slice.categoryId;
              return (
                <circle
                  key={slice.categoryId || i}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={isHovered ? 7.6 : 5.6}
                  strokeDasharray={slice.dashArray}
                  strokeDashoffset={slice.dashOffset}
                  strokeLinecap="round"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                    filter: isHovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.4))' : 'none',
                    opacity: hoveredCategoryId && !isHovered ? 0.45 : 1,
                  }}
                  onMouseEnter={() => setHoveredCategoryId(slice.categoryId)}
                  onMouseLeave={() => setHoveredCategoryId(null)}
                />
              );
            })}
          </svg>

          {/* Dynamic Center Display */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              pointerEvents: 'none',
              padding: '0.2rem',
              transition: 'all 0.2s ease',
            }}
          >
            {hoveredItem ? (
              <>
                <span
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: hoveredItem.color,
                    lineHeight: 1.1,
                  }}
                >
                  {formatPaise(hoveredItem.amount)}
                </span>
                <span
                  style={{
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    maxWidth: '80px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '0.1rem',
                  }}
                >
                  {hoveredItem.name}
                </span>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                  {hoveredPct}%
                </span>
              </>
            ) : viewMode === 'both' ? (
              <>
                <span
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: netSurplusPaise >= 0 ? 'var(--mint-primary)' : 'var(--coral-accent)',
                    lineHeight: 1.1,
                  }}
                >
                  {netSurplusPaise >= 0 ? `+${formatPaise(netSurplusPaise)}` : formatPaise(netSurplusPaise)}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '0.1rem' }}>
                  Net Surplus
                </span>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--mint-primary)' }}>
                  {savingsRate}% Saved
                </span>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: '0.94rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-main)',
                    lineHeight: 1.1,
                  }}
                >
                  {formatPaise(activeTotalPaise)}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '0.15rem' }}>
                  {viewMode === 'income' ? 'Total Income' : 'Total Spent'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Category Percentages & Micro Progress Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1, fontSize: '0.76rem' }}>
          {activeItems.slice(0, 4).map(item => {
            const pct = activeTotalPaise > 0 ? Math.round((item.amount / activeTotalPaise) * 100) : 0;
            const isHovered = hoveredCategoryId === item.categoryId;

            return (
              <div
                key={item.categoryId}
                onMouseEnter={() => setHoveredCategoryId(item.categoryId)}
                onMouseLeave={() => setHoveredCategoryId(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.15rem',
                  cursor: 'pointer',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '6px',
                  background: isHovered ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: item.color,
                        flexShrink: 0,
                        boxShadow: isHovered ? `0 0 8px ${item.color}` : 'none',
                        transition: 'box-shadow 0.2s ease',
                      }}
                    />
                    <span
                      style={{
                        fontWeight: isHovered ? 700 : 600,
                        color: isHovered ? 'var(--text-main)' : 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: '0.76rem',
                      }}
                    >
                      {item.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: isHovered ? item.color : 'var(--text-main)' }}>
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Micro Progress Track */}
                <div
                  style={{
                    width: '100%',
                    height: '3px',
                    borderRadius: '9999px',
                    backgroundColor: 'var(--border-subtle)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: item.color,
                      borderRadius: '9999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Quick Net Surplus Badge when in Both mode */}
          {viewMode === 'both' && (
            <div
              style={{
                marginTop: '0.15rem',
                padding: '0.3rem 0.5rem',
                borderRadius: '8px',
                background: 'rgba(34, 160, 91, 0.1)',
                border: '1px solid rgba(34, 160, 91, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.7rem',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Net Retained:</span>
              <span style={{ color: 'var(--mint-primary)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {formatPaise(netSurplusPaise)} ({savingsRate}%)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
