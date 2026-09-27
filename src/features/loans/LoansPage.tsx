/* =========================================================
   DEBT & LOAN MANAGEMENT (Module 12)
   Personal, Home, Vehicle, Education, Credit Cards, EMI Tracker
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, rupeesToPaise } from '../../utils/currency';
import { LoanType } from '../../types';
import {
  CreditCard,
  Plus,
  Home,
  Car,
  GraduationCap,
  Banknote,
  Calendar,
  CheckCircle2,
  Trash2,
  X,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

export const LoansPage: React.FC = () => {
  const {
    loans,
    familyLoans,
    privateLoans,
    activeFamily,
    allFamilies,
    activeUserId,
    addLoan,
    recordEmiPayment,
    deleteLoan,
    hasPermission,
  } = useFamilyFinance();

  const [loanTab, setLoanTab] = useState<'family' | 'private'>('family');
  const [loanVisibility, setLoanVisibility] = useState<'family' | 'private'>('family');
  const [targetFamilyId, setTargetFamilyId] = useState<string>(activeFamily.id);
  const { openViewSettingsModal } = useViewSettings();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [payEmiModalLoanId, setPayEmiModalLoanId] = useState<string | null>(null);
  const [emiAmountRupees, setEmiAmountRupees] = useState('');

  // Add Loan Form State
  const [loanName, setLoanName] = useState('');
  const [loanType, setLoanType] = useState<LoanType>('personal');
  const [lender, setLender] = useState('');
  const [principalRupees, setPrincipalRupees] = useState('');
  const [interestRate, setInterestRate] = useState('8.5');
  const [emiRupees, setEmiRupees] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [completionDate, setCompletionDate] = useState('2028-12-31');

  const canManage = hasPermission('transactions.create');

  const displayedLoans = loanTab === 'family' ? familyLoans : privateLoans;

  const totalOutstandingPaise = displayedLoans
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + l.remaining_balance, 0);

  const totalMonthlyEmiPaise = displayedLoans
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + l.monthly_emi, 0);

  const totalPaidPaise = displayedLoans.reduce((sum, l) => sum + l.total_paid, 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const principalPaise = rupeesToPaise(principalRupees);
    const emiPaise = rupeesToPaise(emiRupees);

    if (!loanName.trim() || principalPaise <= 0) return;

    addLoan({
      name: loanName.trim(),
      type: loanType,
      lender_or_borrower: lender.trim() || 'Direct Institution',
      principal_amount: principalPaise,
      interest_rate: parseFloat(interestRate) || 0,
      monthly_emi: emiPaise > 0 ? emiPaise : Math.round(principalPaise / 36),
      due_day_of_month: parseInt(dueDay, 10) || 5,
      remaining_balance: principalPaise,
      completion_date: completionDate,
      status: 'active',
      visibility: loanVisibility,
      family_id: loanVisibility === 'family' ? targetFamilyId : null,
      user_id: activeUserId,
    } as any);

    setAddModalOpen(false);
    setLoanName('');
    setLender('');
    setPrincipalRupees('');
    setEmiRupees('');
  };

  const handlePayEmiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payEmiModalLoanId) return;
    const paise = rupeesToPaise(emiAmountRupees);
    if (paise <= 0) return;

    recordEmiPayment(payEmiModalLoanId, paise);
    setPayEmiModalLoanId(null);
    setEmiAmountRupees('');
  };

  const openEmiModal = (loanId: string, currentEmiPaise: number) => {
    setPayEmiModalLoanId(loanId);
    setEmiAmountRupees(String(currentEmiPaise / 100));
  };

  const getLoanTypeIcon = (type: LoanType) => {
    switch (type) {
      case 'home':
        return <Home size={18} color="var(--sky-accent)" />;
      case 'vehicle':
        return <Car size={18} color="var(--mint-primary)" />;
      case 'education':
        return <GraduationCap size={18} color="var(--purple-accent)" />;
      case 'credit_card':
        return <CreditCard size={18} color="var(--coral-accent)" />;
      default:
        return <Banknote size={18} color="var(--amber-accent)" />;
    }
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
          <h1>Family Debt & Loan Management</h1>
          <p style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
            Unified tracking for home loans, vehicle EMIs, education debt, and family commitments
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={() => setAddModalOpen(true)}>
              <Plus size={15} /> Add Loan / Debt
            </button>
          )}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--coral-accent)' }}>
          <div className="stat-label">
            <span>Total Outstanding Debt</span>
            <Banknote size={16} color="var(--coral-accent)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--coral-accent)' }}>
            {formatPaise(totalOutstandingPaise)}
          </div>
          <div className="stat-meta">Across {loans.filter(l => l.status === 'active').length} active facilities</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--amber-accent)' }}>
          <div className="stat-label">
            <span>Monthly EMI Outflow</span>
            <Calendar size={16} color="var(--amber-accent)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--amber-accent)' }}>
            {formatPaise(totalMonthlyEmiPaise)}
          </div>
          <div className="stat-meta">Committed monthly debt service</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--mint-primary)' }}>
          <div className="stat-label">
            <span>Total Principal Repaid</span>
            <CheckCircle2 size={16} color="var(--mint-primary)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--mint-primary)' }}>
            {formatPaise(totalPaidPaise)}
          </div>
          <div className="stat-meta">Equity built across all loans</div>
        </div>
      </div>

      {/* Loans Grid */}
      <div className="grid-2col">
        {displayedLoans.map(loan => {
          const totalFacility = loan.principal_amount;
          const paid = loan.total_paid;
          const pctPaid = totalFacility > 0 ? Math.min(100, Math.round((paid / totalFacility) * 100)) : 0;
          const isClosed = loan.status === 'closed' || loan.remaining_balance === 0;

          return (
            <div key={loan.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="brand-icon-wrap" style={{ width: 42, height: 42 }}>
                    {getLoanTypeIcon(loan.type)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                      {loan.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {loan.lender_or_borrower} • Due Day {loan.due_day_of_month}th
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className={`badge ${isClosed ? 'badge-sage' : 'badge-rust'}`}>
                    {isClosed ? 'CLOSED' : `${loan.interest_rate}% APR`}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => deleteLoan(loan.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                      title="Remove Loan"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress & Balances */}
              <div style={{ background: 'var(--bg-canvas-subtle)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>REPAYMENT PROGRESS</span>
                  <span style={{ color: 'var(--mint-primary)', fontWeight: 700 }}>{pctPaid}% PAID</span>
                </div>

                <div className="progress-bar-wrap" style={{ height: 8, marginBottom: '0.85rem' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${pctPaid}%`,
                      background: isClosed ? 'var(--mint-primary)' : 'linear-gradient(90deg, var(--mint-primary), var(--sky-accent))',
                    }}
                  ></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Principal</div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>{formatPaise(loan.principal_amount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monthly EMI</div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--amber-accent)' }}>{formatPaise(loan.monthly_emi)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining</div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isClosed ? 'var(--mint-primary)' : 'var(--coral-accent)' }}>
                      {formatPaise(loan.remaining_balance)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Target Completion: <strong>{loan.completion_date}</strong>
                </div>

                {!isClosed && canManage && (
                  <button
                    className="btn btn-sage btn-sm"
                    onClick={() => openEmiModal(loan.id, loan.monthly_emi)}
                  >
                    <Sparkles size={13} /> Record EMI Payment
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Loan Modal */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Add Loan or Debt Facility</h3>
              <button className="btn-icon" onClick={() => setAddModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="label">Loan Facility Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Home Renovation Loan"
                    value={loanName}
                    onChange={e => setLoanName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Debt Type</label>
                    <select
                      className="select"
                      value={loanType}
                      onChange={e => setLoanType(e.target.value as LoanType)}
                    >
                      <option value="personal">Personal Loan</option>
                      <option value="home">Home Loan</option>
                      <option value="vehicle">Vehicle Loan</option>
                      <option value="education">Education Loan</option>
                      <option value="credit_card">Credit Card EMI</option>
                      <option value="borrowed">Borrowed from Friend/Family</option>
                      <option value="lent">Lent to Someone</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Lender / Institution</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. HDFC Bank, SBI"
                      value={lender}
                      onChange={e => setLender(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Principal Amount (₹)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="500000"
                      value={principalRupees}
                      onChange={e => setPrincipalRupees(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Interest Rate (% APR)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      placeholder="8.5"
                      value={interestRate}
                      onChange={e => setInterestRate(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Monthly EMI (₹)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="14500"
                      value={emiRupees}
                      onChange={e => setEmiRupees(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Due Day of Month</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="input"
                      placeholder="5"
                      value={dueDay}
                      onChange={e => setDueDay(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Target Payoff Date</label>
                  <input
                    type="date"
                    className="input"
                    value={completionDate}
                    onChange={e => setCompletionDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Loan Facility
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record EMI Modal */}
      {payEmiModalLoanId && (
        <div className="modal-backdrop" onClick={() => setPayEmiModalLoanId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Record EMI Payment</h3>
              <button className="btn-icon" onClick={() => setPayEmiModalLoanId(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handlePayEmiSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Recording this EMI will reduce the remaining loan balance and log an automated expense in your family ledger.
                </p>
                <div>
                  <label className="label">Payment Amount (₹)</label>
                  <input
                    type="number"
                    className="input"
                    value={emiAmountRupees}
                    onChange={e => setEmiAmountRupees(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPayEmiModalLoanId(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm EMI Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
