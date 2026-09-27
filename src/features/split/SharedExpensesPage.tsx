/* =========================================================
   SHARED EXPENSES & BILL SPLITTING (Module 15)
   Equal & Custom Split, Member Contributions, Settlement Tracking
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, rupeesToPaise } from '../../utils/currency';
import {
  Users,
  Plus,
  Receipt,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  X,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

export const SharedExpensesPage: React.FC = () => {
  const { sharedExpenses, members, currentMember, categories, addSharedExpense, settleSplitShare, hasPermission } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [totalAmountRupees, setTotalAmountRupees] = useState('3000');
  const [paidByMemberId, setPaidByMemberId] = useState(currentMember.id);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(members.map(m => m.id));
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

  const canManage = hasPermission('transactions.create');

  // Compute metrics
  const totalSharedPaise = sharedExpenses.reduce((sum, s) => sum + s.total_amount, 0);

  let totalSettledPaise = 0;
  let totalPendingPaise = 0;
  let myPendingPaise = 0;

  sharedExpenses.forEach(s => {
    s.shares.forEach(sh => {
      if (sh.settled) {
        totalSettledPaise += sh.amount;
      } else {
        totalPendingPaise += sh.amount;
        if (sh.member_id === currentMember.id) {
          myPendingPaise += sh.amount;
        }
      }
    });
  });

  const toggleMemberSelection = (id: string) => {
    if (selectedMemberIds.includes(id)) {
      if (selectedMemberIds.length > 1) {
        setSelectedMemberIds(selectedMemberIds.filter(mId => mId !== id));
      }
    } else {
      setSelectedMemberIds([...selectedMemberIds, id]);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalPaise = rupeesToPaise(totalAmountRupees);
    if (!title.trim() || totalPaise <= 0 || selectedMemberIds.length === 0) return;

    const paidByMem = members.find(m => m.id === paidByMemberId);

    let shares: { member_id: string; member_name: string; amount: number; settled: boolean; settled_at?: string }[] = [];

    if (splitType === 'equal') {
      const perHeadPaise = Math.round(totalPaise / selectedMemberIds.length);
      shares = selectedMemberIds.map(mId => {
        const mem = members.find(m => m.id === mId);
        const isPayer = mId === paidByMemberId;
        return {
          member_id: mId,
          member_name: mem?.user.name || 'Member',
          amount: perHeadPaise,
          settled: isPayer,
          settled_at: isPayer ? new Date().toISOString() : undefined,
        };
      });
    } else {
      shares = selectedMemberIds.map(mId => {
        const mem = members.find(m => m.id === mId);
        const val = customShares[mId] ? rupeesToPaise(customShares[mId]) : 0;
        const isPayer = mId === paidByMemberId;
        return {
          member_id: mId,
          member_name: mem?.user.name || 'Member',
          amount: val,
          settled: isPayer,
          settled_at: isPayer ? new Date().toISOString() : undefined,
        };
      });
    }

    addSharedExpense({
      title: title.trim(),
      total_amount: totalPaise,
      paid_by_member_id: paidByMemberId,
      paid_by_member_name: paidByMem?.user.name || 'Member',
      category_id: categoryId,
      date: new Date().toISOString().slice(0, 10),
      split_type: splitType,
      shares,
    });

    setAddModalOpen(false);
    setTitle('');
    setTotalAmountRupees('3000');
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
          <h1>Shared Expenses & Bill Splitting</h1>
          <p style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
            Multi-member bill splitting, equal & custom shares, and real-time family settlement tracking
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={() => setAddModalOpen(true)}>
              <Plus size={15} /> Split New Family Bill
            </button>
          )}
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--mint-primary)' }}>
          <div className="stat-label">
            <span>Total Shared Bills</span>
            <Receipt size={16} color="var(--mint-primary)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--text-main)' }}>
            {formatPaise(totalSharedPaise)}
          </div>
          <div className="stat-meta">Across {sharedExpenses.length} split expenses</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--sky-accent)' }}>
          <div className="stat-label">
            <span>Settled Contributions</span>
            <CheckCircle2 size={16} color="var(--sky-accent)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--mint-primary)' }}>
            {formatPaise(totalSettledPaise)}
          </div>
          <div className="stat-meta">Fully paid & resolved</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--amber-accent)' }}>
          <div className="stat-label">
            <span>Pending Family Settlements</span>
            <Clock size={16} color="var(--amber-accent)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--amber-accent)' }}>
            {formatPaise(totalPendingPaise)}
          </div>
          <div className="stat-meta">Awaiting member payment</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--coral-accent)' }}>
          <div className="stat-label">
            <span>Your Pending Share</span>
            <Users size={16} color="var(--coral-accent)" />
          </div>
          <div className="stat-value" style={{ color: myPendingPaise > 0 ? 'var(--coral-accent)' : 'var(--mint-primary)' }}>
            {formatPaise(myPendingPaise)}
          </div>
          <div className="stat-meta">{myPendingPaise > 0 ? 'You owe family balance' : 'You are all settled up!'}</div>
        </div>
      </div>

      {/* Shared Expenses Grid */}
      <div className="grid-2col">
        {sharedExpenses.map(item => {
          const allSettled = item.shares.every(s => s.settled);

          return (
            <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className={`badge ${allSettled ? 'badge-sage' : 'badge-brass'}`}>
                      {allSettled ? 'FULLY SETTLED' : 'PENDING SHARES'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {item.date}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {item.title}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Paid upfront by <strong>{item.paid_by_member_name}</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-main)' }}>
                    {formatPaise(item.total_amount)}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {item.split_type} split
                  </span>
                </div>
              </div>

              {/* Members Breakdown */}
              <div style={{ background: 'var(--bg-canvas-subtle)', borderRadius: '16px', padding: '0.85rem 1rem', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                  Member Contributions & Status
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {item.shares.map(share => {
                    const isMyShare = share.member_id === currentMember.id;

                    return (
                      <div
                        key={share.member_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.45rem 0.65rem',
                          background: isMyShare ? 'var(--card-bg)' : 'transparent',
                          borderRadius: '12px',
                          border: isMyShare ? '1px solid var(--border-card)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {share.member_name}
                          </span>
                          {isMyShare && <span className="badge badge-sky" style={{ fontSize: '0.65rem' }}>YOU</span>}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            {formatPaise(share.amount)}
                          </span>

                          {share.settled ? (
                            <span className="badge badge-sage" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <CheckCircle2 size={12} /> Settled
                            </span>
                          ) : (
                            <button
                              className="btn btn-sage btn-sm"
                              onClick={() => settleSplitShare(item.id, share.member_id)}
                              style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem' }}
                            >
                              Mark Settled
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Shared Expense Modal */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Split New Family Expense</h3>
              <button className="btn-icon" onClick={() => setAddModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="label">Bill Title</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. ₹3,000 Electricity Bill"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Total Amount (₹)</label>
                    <input
                      type="number"
                      className="input"
                      value={totalAmountRupees}
                      onChange={e => setTotalAmountRupees(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Paid Upfront By</label>
                    <select
                      className="select"
                      value={paidByMemberId}
                      onChange={e => setPaidByMemberId(e.target.value)}
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.user.name} ({m.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Split Methodology</label>
                  <div className="segmented-pill-tabs">
                    <button
                      type="button"
                      className={`segmented-pill-tab ${splitType === 'equal' ? 'active' : ''}`}
                      onClick={() => setSplitType('equal')}
                    >
                      Equal Split
                    </button>
                    <button
                      type="button"
                      className={`segmented-pill-tab ${splitType === 'custom' ? 'active' : ''}`}
                      onClick={() => setSplitType('custom')}
                    >
                      Custom Amounts
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Select Participating Family Members</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {members.map(m => {
                      const isSelected = selectedMemberIds.includes(m.id);
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '12px',
                            background: isSelected ? 'var(--bg-canvas-subtle)' : 'transparent',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMemberSelection(m.id)}
                            />
                            {m.user.name}
                          </label>

                          {splitType === 'custom' && isSelected && (
                            <input
                              type="number"
                              className="input"
                              placeholder="₹ Share"
                              style={{ width: '110px', padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                              value={customShares[m.id] || ''}
                              onChange={e => setCustomShares({ ...customShares, [m.id]: e.target.value })}
                              required
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm & Split Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
