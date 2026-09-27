/* =========================================================
   INVESTMENT TRACKING & ASSET ALLOCATION (Module 14)
   Mutual Funds, Stocks, Fixed Deposits, Gold, Bonds, PPF, NPS
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, rupeesToPaise } from '../../utils/currency';
import { InvestmentType } from '../../types';
import {
  TrendingUp,
  Plus,
  Coins,
  Building2,
  PieChart,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  X,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

export const InvestmentsPage: React.FC = () => {
  const { investments, addInvestment, updateInvestmentValue, deleteInvestment, hasPermission } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalAssetId, setEditModalAssetId] = useState<string | null>(null);
  const [newValueRupees, setNewValueRupees] = useState('');

  // Add Form State
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<InvestmentType>('mutual_fund');
  const [institution, setInstitution] = useState('');
  const [investedRupees, setInvestedRupees] = useState('');
  const [currentValueRupees, setCurrentValueRupees] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const canManage = hasPermission('transactions.create');

  const totalInvestedPaise = investments.reduce((sum, i) => sum + i.invested_amount, 0);
  const totalCurrentValuePaise = investments.reduce((sum, i) => sum + i.current_value, 0);
  const totalPnlPaise = totalCurrentValuePaise - totalInvestedPaise;
  const overallReturnPct = totalInvestedPaise > 0 ? ((totalPnlPaise / totalInvestedPaise) * 100).toFixed(1) : '0.0';
  const isPositive = totalPnlPaise >= 0;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const invPaise = rupeesToPaise(investedRupees);
    const curPaise = currentValueRupees ? rupeesToPaise(currentValueRupees) : invPaise;

    if (!assetName.trim() || invPaise <= 0) return;

    addInvestment({
      name: assetName.trim(),
      type: assetType,
      institution: institution.trim() || 'Direct Holding',
      invested_amount: invPaise,
      current_value: curPaise,
      purchase_date: purchaseDate,
      notes: notes.trim(),
    });

    setAddModalOpen(false);
    setAssetName('');
    setInstitution('');
    setInvestedRupees('');
    setCurrentValueRupees('');
    setNotes('');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalAssetId) return;
    const paise = rupeesToPaise(newValueRupees);
    if (paise <= 0) return;

    updateInvestmentValue(editModalAssetId, paise);
    setEditModalAssetId(null);
    setNewValueRupees('');
  };

  const getAssetBadgeColor = (type: InvestmentType) => {
    switch (type) {
      case 'mutual_fund':
        return 'badge-sage';
      case 'stock':
        return 'badge-sky';
      case 'gold':
        return 'badge-brass';
      case 'fixed_deposit':
        return 'badge-gray';
      default:
        return 'badge-sky';
    }
  };

  // Compute allocation per type
  const typeBreakdown = investments.reduce((acc, curr) => {
    acc[curr.type] = (acc[curr.type] || 0) + curr.current_value;
    return acc;
  }, {} as Record<string, number>);

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
          <h1>Family Investment Portfolio</h1>
          <p style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
            Consolidated tracking for mutual funds, equities, FDs, gold, PPF, and retirement wealth
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={() => setAddModalOpen(true)}>
              <Plus size={15} /> Add Investment Asset
            </button>
          )}
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--mint-primary)' }}>
          <div className="stat-label">
            <span>Portfolio Market Value</span>
            <TrendingUp size={16} color="var(--mint-primary)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--mint-primary)' }}>
            {formatPaise(totalCurrentValuePaise)}
          </div>
          <div className="stat-meta">Live consolidated valuation</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--sky-accent)' }}>
          <div className="stat-label">
            <span>Total Capital Invested</span>
            <Building2 size={16} color="var(--sky-accent)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--text-main)' }}>
            {formatPaise(totalInvestedPaise)}
          </div>
          <div className="stat-meta">Across {investments.length} holdings</div>
        </div>

        <div className="stat-card" style={{ borderLeft: `4px solid ${isPositive ? 'var(--mint-primary)' : 'var(--coral-accent)'}` }}>
          <div className="stat-label">
            <span>Total Unrealized P&L</span>
            {isPositive ? <ArrowUpRight size={16} color="var(--mint-primary)" /> : <ArrowDownRight size={16} color="var(--coral-accent)" />}
          </div>
          <div className="stat-value" style={{ color: isPositive ? 'var(--mint-primary)' : 'var(--coral-accent)' }}>
            {isPositive ? `+${formatPaise(totalPnlPaise)}` : `-${formatPaise(Math.abs(totalPnlPaise))}`}
          </div>
          <div className="stat-meta">
            Overall Returns: <strong>{isPositive ? `+${overallReturnPct}%` : `${overallReturnPct}%`}</strong>
          </div>
        </div>
      </div>

      {/* Asset Allocation Strip */}
      <div className="card" style={{ marginBottom: '1.75rem', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Asset Class Allocation
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            100% Family Capital Diversified
          </span>
        </div>

        <div style={{ display: 'flex', height: 12, borderRadius: 9999, overflow: 'hidden', gap: 2, background: 'var(--bg-canvas-subtle)' }}>
          {Object.entries(typeBreakdown).map(([type, val], idx) => {
            const pct = totalCurrentValuePaise > 0 ? Math.round((val / totalCurrentValuePaise) * 100) : 0;
            const colors = ['#22A05B', '#3E8BF5', '#E5A11E', '#9B51E0', '#00B4B6', '#EB5757'];
            const color = colors[idx % colors.length];

            return (
              <div
                key={type}
                style={{ width: `${pct}%`, background: color, transition: 'width 0.3s ease' }}
                title={`${type.replace('_', ' ')}: ${pct}%`}
              ></div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
          {Object.entries(typeBreakdown).map(([type, val], idx) => {
            const pct = totalCurrentValuePaise > 0 ? Math.round((val / totalCurrentValuePaise) * 100) : 0;
            const colors = ['#22A05B', '#3E8BF5', '#E5A11E', '#9B51E0', '#00B4B6', '#EB5757'];
            const color = colors[idx % colors.length];

            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }}></span>
                <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{type.replace('_', ' ')}</span>
                <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Holdings Grid */}
      <div className="grid-2col">
        {investments.map(inv => {
          const pnl = inv.current_value - inv.invested_amount;
          const pnlPct = inv.invested_amount > 0 ? ((pnl / inv.invested_amount) * 100).toFixed(1) : '0.0';
          const pnlPos = pnl >= 0;

          return (
            <div key={inv.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className={`badge ${getAssetBadgeColor(inv.type)}`}>
                      {inv.type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {inv.institution}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {inv.name}
                  </h3>
                </div>

                {canManage && (
                  <button
                    onClick={() => deleteInvestment(inv.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                    title="Remove Asset"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {inv.notes && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  "{inv.notes}"
                </div>
              )}

              {/* Financial Box */}
              <div style={{ background: 'var(--bg-canvas-subtle)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Invested</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{formatPaise(inv.invested_amount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Value</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{formatPaise(inv.current_value)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profit / Loss</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: pnlPos ? 'var(--mint-primary)' : 'var(--coral-accent)' }}>
                      {pnlPos ? `+${pnlPct}%` : `${pnlPct}%`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Acquired: {inv.purchase_date}
                </span>

                {canManage && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setEditModalAssetId(inv.id);
                      setNewValueRupees(String(inv.current_value / 100));
                    }}
                  >
                    Update Valuation
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Investment Modal */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Add Investment Asset</h3>
              <button className="btn-icon" onClick={() => setAddModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="label">Asset / Scheme Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Parag Parikh Flexi Cap Fund"
                    value={assetName}
                    onChange={e => setAssetName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Asset Class</label>
                    <select
                      className="select"
                      value={assetType}
                      onChange={e => setAssetType(e.target.value as InvestmentType)}
                    >
                      <option value="mutual_fund">Mutual Fund</option>
                      <option value="stock">Equity / Stocks</option>
                      <option value="gold">Gold / SGB</option>
                      <option value="fixed_deposit">Fixed Deposit</option>
                      <option value="ppf">PPF</option>
                      <option value="nps">NPS</option>
                      <option value="bond">Bonds / Debentures</option>
                      <option value="crypto">Crypto</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Broker / Bank</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Zerodha, Groww, HDFC"
                      value={institution}
                      onChange={e => setInstitution(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Total Invested (₹)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="50000"
                      value={investedRupees}
                      onChange={e => setInvestedRupees(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Current Market Value (₹)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="Leave blank if same"
                      value={currentValueRupees}
                      onChange={e => setCurrentValueRupees(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Purchase Date</label>
                  <input
                    type="date"
                    className="input"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Strategy Notes</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Monthly SIP for retirement"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Holding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Valuation Modal */}
      {editModalAssetId && (
        <div className="modal-backdrop" onClick={() => setEditModalAssetId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Update Current Market Valuation</h3>
              <button className="btn-icon" onClick={() => setEditModalAssetId(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Enter the latest NAV or market price valuation for this holding.
                </p>
                <div>
                  <label className="label">Current Market Value (₹)</label>
                  <input
                    type="number"
                    className="input"
                    value={newValueRupees}
                    onChange={e => setNewValueRupees(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditModalAssetId(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Valuation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
