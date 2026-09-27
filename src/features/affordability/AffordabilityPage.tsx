/* =========================================================
   "CAN I AFFORD THIS?" FINANCIAL DECISION ENGINE (Section 21)
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, rupeesToPaise } from '../../utils/currency';
import {
  Calculator,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  Send,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

interface AffordabilityPageProps {
  onOpenNewRequestWithData?: (data: { title: string; amountRupees: string; categoryId: string; description: string }) => void;
}

export const AffordabilityPage: React.FC<AffordabilityPageProps> = ({ onOpenNewRequestWithData }) => {
  const {
    transactions,
    categories,
    recurring,
    savingsGoals,
    currentMember,
  } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const [purchaseAmountRupees, setPurchaseAmountRupees] = useState<string>('25000');
  const [purchaseTitle, setPurchaseTitle] = useState<string>('New Family Laptop');
  const [purchaseCategoryId, setPurchaseCategoryId] = useState<string>(categories[0]?.id || '');

  const isChild = currentMember.role === 'CHILD';

  // Financial baseline calculations
  const totalIncomePaise = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpensePaise = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  // Current discretionary amount
  const currentDiscretionaryPaise = Math.max(0, totalIncomePaise - totalExpensePaise);

  // Upcoming bills committed this cycle
  const upcomingBillsPaise = recurring.filter(r => r.active).reduce((sum, r) => sum + r.amount, 0);

  // Monthly savings target commitments (approx 10% of income or ₹10,000)
  const savingsCommitmentPaise = 1000000; // ₹10,000

  // Proposed purchase
  const purchasePaise = rupeesToPaise(purchaseAmountRupees);

  // After purchase remaining discretionary
  const afterPurchaseDiscretionaryPaise = currentDiscretionaryPaise - purchasePaise;

  // True safety cushion factoring bills and savings
  const trueBufferPaise = afterPurchaseDiscretionaryPaise - upcomingBillsPaise - savingsCommitmentPaise;

  const isComfortable = trueBufferPaise > 0;
  const isTight = trueBufferPaise <= 0 && afterPurchaseDiscretionaryPaise > 0;
  const isDeficit = afterPurchaseDiscretionaryPaise <= 0;

  const handleSendAsRequest = () => {
    if (onOpenNewRequestWithData) {
      onOpenNewRequestWithData({
        title: purchaseTitle,
        amountRupees: purchaseAmountRupees,
        categoryId: purchaseCategoryId,
        description: `Affordability Simulation: Evaluated ${purchaseTitle} for ₹${purchaseAmountRupees}. Remaining discretionary would be ${formatPaise(afterPurchaseDiscretionaryPaise)}.`,
      });
    }
  };

  return (
    <div className="content-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
            "Can I Afford This?" Decision Tool
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            Objective mathematical simulation of purchasing power against family commitments and savings goals
          </p>
        </div>
      </div>

      <div className="grid-2col">
        {/* Left Card: Input Parameters */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Simulate a Purchase</div>
              <div className="card-subtitle">Enter proposed outlay details</div>
            </div>
            <div className="brand-icon-wrap" style={{ width: 36, height: 36 }}>
              <Calculator size={18} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label className="label">Item Name / Intended Purchase</label>
              <input
                type="text"
                className="input"
                value={purchaseTitle}
                onChange={e => setPurchaseTitle(e.target.value)}
                placeholder="e.g. Ergonomic Office Chair, Tablet, Vacation Booking"
              />
            </div>

            <div>
              <label className="label">Purchase Price (₹ INR)</label>
              <input
                type="number"
                className="input"
                style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                value={purchaseAmountRupees}
                onChange={e => setPurchaseAmountRupees(e.target.value)}
                placeholder="25000"
              />
            </div>

            <div>
              <label className="label">Expense Category</label>
              <select
                className="select"
                value={purchaseCategoryId}
                onChange={e => setPurchaseCategoryId(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Amount Presets */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.35rem' }}>
                Quick Preset Amounts:
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['2500', '8500', '25000', '50000', '100000'].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPurchaseAmountRupees(amt)}
                  >
                    ₹{Number(amt).toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Member Action: Forward as Request */}
            {(isChild || currentMember.role === 'ADULT_MEMBER') && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--brass-light)',
                  border: '1px solid var(--brass)',
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
                  Submit this to Family Head
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
                  Forward this simulated purchase directly to your parents' approval queue with one tap.
                </p>
                <button
                  className="btn btn-brass btn-sm"
                  style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
                  onClick={handleSendAsRequest}
                >
                  <Send size={14} /> Send Request to Family Head
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Financial Impact Breakdown (Section 21) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <div>
                <div className="card-title">Impact Analysis & Verdict</div>
                <div className="card-subtitle">Projected cashflow balance</div>
              </div>
              <span
                className={`badge ${
                  isComfortable ? 'badge-sage' : isTight ? 'badge-brass' : 'badge-rust'
                }`}
                style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
              >
                {isComfortable ? 'AFFORDABLE' : isTight ? 'CAUTION' : 'DEFICIT RISK'}
              </span>
            </div>

            {/* Ledger Breakdown Table */}
            <div
              style={{
                background: 'var(--paper-dim)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                overflow: 'hidden',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.88rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-muted)' }}>Current Monthly Surplus</span>
                <span style={{ fontWeight: 700, color: 'var(--sage)' }}>+{formatPaise(currentDiscretionaryPaise)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--line)', background: 'var(--paper-card)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--rust)', fontWeight: 600 }}>Proposed Outlay</span>
                <span style={{ fontWeight: 700, color: 'var(--rust)' }}>-{formatPaise(purchasePaise)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-muted)' }}>Surplus After Outlay</span>
                <span style={{ fontWeight: 700 }}>{formatPaise(afterPurchaseDiscretionaryPaise)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-muted)' }}>Upcoming Committed Bills</span>
                <span style={{ color: 'var(--rust)' }}>-{formatPaise(upcomingBillsPaise)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-muted)' }}>Savings Goal Target Allocation</span>
                <span style={{ color: 'var(--brass)' }}>-{formatPaise(savingsCommitmentPaise)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--paper-card)', fontWeight: 700 }}>
                <span style={{ fontFamily: 'var(--font-sans)' }}>Net Cushion Remaining</span>
                <span style={{ color: trueBufferPaise >= 0 ? 'var(--sage)' : 'var(--rust)', fontSize: '1.1rem' }}>
                  {formatPaise(trueBufferPaise)}
                </span>
              </div>
            </div>

            {/* Neutral Financial Summary Statement (Section 21) */}
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: isComfortable ? 'var(--sage-light)' : isTight ? 'var(--amber-light)' : 'var(--rust-light)',
                color: 'var(--ink)',
                fontSize: '0.85rem',
                lineHeight: 1.45,
              }}
            >
              {isComfortable ? (
                <div>
                  <strong>Neutral Verdict:</strong> This purchase of {formatPaise(purchasePaise)} leaves a positive discretionary cushion of {formatPaise(afterPurchaseDiscretionaryPaise)} for this period, comfortably protecting upcoming bills and scheduled savings goals.
                </div>
              ) : isTight ? (
                <div>
                  <strong>Cautionary Note:</strong> This purchase reduces the available discretionary surplus to {formatPaise(afterPurchaseDiscretionaryPaise)}. While cash is technically available today, funding upcoming bills ({formatPaise(upcomingBillsPaise)}) and savings will require tightening non-essential categories.
                </div>
              ) : (
                <div>
                  <strong>Deficit Warning:</strong> This purchase exceeds your currently available surplus by {formatPaise(Math.abs(afterPurchaseDiscretionaryPaise))}. Executing this outlay will require dipping into family liquid reserves or postponing milestone savings.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
