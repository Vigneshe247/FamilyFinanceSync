/* =========================================================
   RECURRING EXPENSES & BILL SCHEDULE (Section 19)
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, formatDate } from '../../utils/currency';
import {
  CalendarClock,
  Plus,
  Zap,
  CheckCircle2,
  Calendar,
  CreditCard,
  BellRing,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

export const RecurringPage: React.FC = () => {
  const { recurring, categories, accounts, hasPermission } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const [activeOnly, setActiveOnly] = useState(true);

  const displayedList = activeOnly ? recurring.filter(r => r.active) : recurring;
  const totalMonthlyCommitmentPaise = recurring
    .filter(r => r.active)
    .reduce((sum, r) => sum + r.amount, 0);

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
            Recurring Obligations & Bills
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            Automated family commitments, rent, subscriptions, EMIs, and utility reminders
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div className="sync-chip">
            <BellRing size={14} />
            <span>Active Reminders Enabled</span>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--sky)' }}>
          <div className="stat-label">
            <span>Committed Monthly Outflow</span>
            <CalendarClock size={16} color="var(--sky)" />
          </div>
          <div className="stat-value">{formatPaise(totalMonthlyCommitmentPaise)}</div>
          <div className="stat-meta">Across {recurring.length} automated subscriptions & bills</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--amber)' }}>
          <div className="stat-label">
            <span>Upcoming in Next 7 Days</span>
            <AlertCircle size={16} color="var(--amber)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--amber)' }}>
            Electricity (₹2,500)
          </div>
          <div className="stat-meta">Due 24 Sep 2026 • Linked to HDFC Family Savings</div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Description / Bill</th>
                <th>Category</th>
                <th>Frequency</th>
                <th>Next Due Date</th>
                <th>Linked Account</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {displayedList.map(item => {
                const cat = categories.find(c => c.id === item.category_id);
                const acc = accounts.find(a => a.id === item.account_id);

                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.description}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--paper-dim)', border: '1px solid var(--line)' }}>
                        {cat?.name || 'Utilities'}
                      </span>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: '0.82rem' }}>
                        {item.frequency}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                        <Calendar size={13} color="var(--ink-muted)" />
                        <span>{formatDate(item.next_date)}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                        <CreditCard size={13} />
                        <span>{acc?.name || 'HDFC Bank'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-sage" style={{ fontSize: '0.72rem' }}>
                        ACTIVE AUTO-SYNC
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: 'var(--rust)',
                        fontSize: '0.95rem',
                      }}
                    >
                      -{formatPaise(item.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
