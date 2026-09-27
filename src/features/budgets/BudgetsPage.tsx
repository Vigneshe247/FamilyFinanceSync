/* =========================================================
   BUDGETS MANAGEMENT & THRESHOLD ALERTS (Section 17)
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, paiseToRupees, rupeesToPaise } from '../../utils/currency';
import {
  PiggyBank,
  AlertTriangle,
  CheckCircle,
  Plus,
  Edit2,
  Calendar,
  Layers,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

export const BudgetsPage: React.FC = () => {
  const {
    budget,
    categories,
    transactions,
    hasPermission,
    updateBudgetCategory,
  } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editRupees, setEditRupees] = useState<string>('');

  const canEdit = hasPermission('budgets.update');

  // Compute spent amount for each budget category
  const budgetStats = budget.categories.map(bc => {
    const cat = categories.find(c => c.id === bc.category_id);
    const spent = transactions
      .filter(t => t.category_id === bc.category_id && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const allocated = bc.allocated_amount;
    const remaining = Math.max(0, allocated - spent);
    const pct = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;

    let statusType: 'safe' | 'warning' | 'critical' | 'exceeded' = 'safe';
    if (pct >= 100) statusType = 'exceeded';
    else if (pct >= 90) statusType = 'critical';
    else if (pct >= 75) statusType = 'warning';

    return {
      ...bc,
      categoryName: cat?.name || 'General',
      categoryColor: cat?.color || 'var(--brass)',
      spent,
      allocated,
      remaining,
      pct,
      statusType,
    };
  });

  const totalAllocatedPaise = budget.total_amount;
  const totalSpentPaise = budgetStats.reduce((sum, b) => sum + b.spent, 0);
  const overallPct = Math.round((totalSpentPaise / totalAllocatedPaise) * 100);

  const startEdit = (categoryId: string, currentPaise: number) => {
    setEditingCategoryId(categoryId);
    setEditRupees(String(paiseToRupees(currentPaise)));
  };

  const saveEdit = (categoryId: string) => {
    const newPaise = rupeesToPaise(editRupees);
    if (newPaise >= 0) {
      updateBudgetCategory(categoryId, newPaise);
    }
    setEditingCategoryId(null);
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
            Family Budget System
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            {budget.name} • Configurable threshold alerts (70%, 80%, 90%, 100%)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div className="sync-chip">
            <Calendar size={14} />
            <span>Active Cycle: 01 Sep — 30 Sep 2026</span>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--ink)' }}>
          <div className="stat-label">
            <span>Total Family Cap</span>
            <PiggyBank size={16} />
          </div>
          <div className="stat-value">{formatPaise(totalAllocatedPaise)}</div>
          <div className="stat-meta">Aggregated across all categories</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--rust)' }}>
          <div className="stat-label">
            <span>Actual Spend to Date</span>
            <AlertTriangle size={16} color="var(--rust)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--rust)' }}>
            {formatPaise(totalSpentPaise)}
          </div>
          <div className="stat-meta">{overallPct}% of allocated ceiling consumed</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--sage)' }}>
          <div className="stat-label">
            <span>Available Cushion</span>
            <CheckCircle size={16} color="var(--sage)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sage)' }}>
            {formatPaise(Math.max(0, totalAllocatedPaise - totalSpentPaise))}
          </div>
          <div className="stat-meta">Remaining headroom for September</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--amber)' }}>
          <div className="stat-label">
            <span>Threshold Health</span>
            <Layers size={16} color="var(--amber)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>
            {budgetStats.filter(b => b.statusType !== 'safe').length} Alerts
          </div>
          <div className="stat-meta">Categories nearing or past 80% mark</div>
        </div>
      </div>

      {/* Threshold Legend */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          background: 'var(--paper-card)',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--line)',
          marginBottom: '1.5rem',
          fontSize: '0.8rem',
        }}
      >
        <span style={{ fontWeight: 700 }}>Alert Thresholds:</span>
        <span style={{ color: 'var(--sage)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--sage)' }}></span>
          &lt; 75% Safe
        </span>
        <span style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--amber)' }}></span>
          75% - 89% Warning
        </span>
        <span style={{ color: 'var(--rust)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--rust)' }}></span>
          90% - 99% Critical
        </span>
        <span style={{ color: '#832C26', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#832C26' }}></span>
          100%+ Exceeded
        </span>
      </div>

      {/* Categories Budget Cards Grid */}
      <div className="grid-2col">
        {budgetStats.map(item => {
          const isEditing = editingCategoryId === item.category_id;
          const barColor =
            item.statusType === 'exceeded'
              ? '#832C26'
              : item.statusType === 'critical'
              ? 'var(--rust)'
              : item.statusType === 'warning'
              ? 'var(--amber)'
              : 'var(--sage)';

          return (
            <div key={item.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--ink)' }}>
                    {item.categoryName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                    {item.statusType === 'safe'
                      ? 'Comfortably within budget'
                      : item.statusType === 'warning'
                      ? 'Nearing 80% alert threshold'
                      : 'Critical consumption alert!'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    className={`badge ${
                      item.statusType === 'safe'
                        ? 'badge-sage'
                        : item.statusType === 'warning'
                        ? 'badge-brass'
                        : 'badge-rust'
                    }`}
                  >
                    {item.pct}% USED
                  </span>

                  {canEdit && !isEditing && (
                    <button
                      className="btn btn-icon btn-sm"
                      title="Edit allocation"
                      onClick={() => startEdit(item.category_id, item.allocated)}
                    >
                      <Edit2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="progress-bar-container" style={{ height: '10px', marginBottom: '0.75rem' }}>
                <div
                  className="progress-bar-fill"
                  style={{ width: `${Math.min(100, item.pct)}%`, backgroundColor: barColor }}
                ></div>
              </div>

              {/* Numerical details */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  fontSize: '0.82rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--paper-dim)',
                  border: '1px solid var(--line)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>ALLOCATED</div>
                  <div style={{ fontWeight: 700 }}>{formatPaise(item.allocated)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>SPENT</div>
                  <div style={{ fontWeight: 700, color: 'var(--rust)' }}>{formatPaise(item.spent)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>REMAINING</div>
                  <div style={{ fontWeight: 700, color: 'var(--sage)' }}>{formatPaise(item.remaining)}</div>
                </div>
              </div>

              {/* Inline Editor */}
              {isEditing && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.75rem',
                    background: 'var(--paper-dim)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--brass)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>New Allocation (₹):</span>
                  <input
                    type="number"
                    className="input"
                    style={{ flex: 1, padding: '0.35rem 0.6rem' }}
                    value={editRupees}
                    onChange={e => setEditRupees(e.target.value)}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item.category_id)}>
                    Save
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingCategoryId(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
