/* =========================================================
   TRANSACTIONS MANAGEMENT & LEDGER VIEW (Module 6 & 18)
   Income, Expense, Transfers, Date Presets, Sort, Filter
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, formatDate } from '../../utils/currency';
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  CreditCard,
  Sparkles,
  Calendar,
  Settings,
} from 'lucide-react';
import { AccountTransferModal } from '../../components/modals/AccountTransferModal';
import { TransactionDetailsModal } from '../../components/modals/TransactionDetailsModal';
import { Transaction } from '../../types';
import { Lock, Users, Eye } from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

interface TransactionsPageProps {
  onOpenNewTx: (initialType?: 'expense' | 'income') => void;
  onOpenReceiptOcr?: () => void;
}

export const TransactionsPage: React.FC<TransactionsPageProps> = ({ onOpenNewTx }) => {
  const {
    hasPermission,
    deleteTransaction,
    transactions,
    authorizedTransactions,
    familyTransactions,
    privateTransactions,
    activeFamily,
    activeUserId,
    categories,
    members,
    accounts,
    currentMember,
  } = useFamilyFinance();

  const [viewScope, setViewScope] = useState<'all' | 'family' | 'private' | 'my_tx'>('all');
  const [detailsModalTx, setDetailsModalTx] = useState<Transaction | null>(null);
  const { settings, openViewSettingsModal } = useViewSettings();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMember, setFilterMember] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [dateRangePreset, setDateRangePreset] = useState<'all' | 'today' | 'week' | 'this_month' | 'last_month' | 'this_year' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const isChild = currentMember.role === 'CHILD';

  // If child, only show their own transactions as required in Section 6 & 28
  // Section 6: View Scope Filtering
  // "All" means All data the current user is authorized to access (never other users' private data)
  const accessibleTransactions = React.useMemo(() => {
    let pool = authorizedTransactions;
    if (isChild) {
      pool = authorizedTransactions.filter(t => t.user_id === currentMember.user_id);
    }

    if (viewScope === 'family') {
      return familyTransactions;
    } else if (viewScope === 'private') {
      return privateTransactions;
    } else if (viewScope === 'my_tx') {
      return pool.filter(t => t.user_id === activeUserId);
    }
    return pool;
  }, [authorizedTransactions, familyTransactions, privateTransactions, isChild, currentMember.user_id, viewScope, activeUserId]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const filtered = accessibleTransactions.filter(tx => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (filterCategory !== 'all' && tx.category_id !== filterCategory) return false;
    if (filterMember !== 'all' && tx.user_id !== filterMember) return false;
    if (filterAccount !== 'all' && tx.account_id !== filterAccount) return false;

    // Date range filter presets
    if (dateRangePreset !== 'all') {
      const txDate = new Date(tx.transaction_date);
      if (dateRangePreset === 'today') {
        if (tx.transaction_date.slice(0, 10) !== todayStr) return false;
      } else if (dateRangePreset === 'custom' && customDate) {
        if (tx.transaction_date.slice(0, 10) !== customDate) return false;
      } else if (dateRangePreset === 'this_month') {
        if (txDate.getMonth() !== now.getMonth() || txDate.getFullYear() !== now.getFullYear()) return false;
      } else if (dateRangePreset === 'last_month') {
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        if (txDate.getMonth() !== lastMonth || txDate.getFullYear() !== lastMonthYear) return false;
      } else if (dateRangePreset === 'this_year') {
        if (txDate.getFullYear() !== now.getFullYear()) return false;
      } else if (dateRangePreset === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (txDate < oneWeekAgo) return false;
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchDesc = tx.description.toLowerCase().includes(q);
      const matchMethod = tx.payment_method.toLowerCase().includes(q);
      return matchDesc || matchMethod;
    }
    return true;
  });

  // Sorting
  const sortedTransactions = [...filtered].sort((a, b) => {
    if (sortBy === 'date_desc') return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
    if (sortBy === 'date_asc') return new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    if (sortBy === 'amount_desc') return b.amount - a.amount;
    if (sortBy === 'amount_asc') return a.amount - b.amount;
    return 0;
  });

  const handleExportCSV = () => {
    const headers = ['ID,Date,User,Type,Category,Description,PaymentMethod,Amount(INR)'];
    const rows = sortedTransactions.map(t => {
      const cat = categories.find(c => c.id === t.category_id)?.name || '';
      return `${t.id},${t.transaction_date},${t.user_id},${t.type},"${cat}","${t.description}","${t.payment_method}",${(t.amount / 100).toFixed(2)}`;
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `family_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <h1>Financial Transactions</h1>
          <p style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
            {isChild ? 'Your personal wallet transactions' : 'Master double-entry shared family ledger & inter-account transfers'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTransferModalOpen(true)}>
            <ArrowRightLeft size={14} /> Transfer Funds
          </button>
          {hasPermission('transactions.create') && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => onOpenNewTx('income')}>
                <ArrowUpRight size={14} color="#059669" /> + Income
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => onOpenNewTx('expense')}>
                <ArrowDownLeft size={14} /> + Expense
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                    {/* Section 6: Family vs Private View Scope Selector */}
          <select
            className="select"
            style={{
              width: 'auto',
              fontWeight: 700,
              color: viewScope === 'private' ? '#D97706' : viewScope === 'family' ? 'var(--mint-primary)' : 'var(--text-main)',
              border: viewScope === 'private' ? '2px solid #D97706' : viewScope === 'family' ? '2px solid var(--mint-primary)' : undefined,
            }}
            value={viewScope}
            onChange={e => setViewScope(e.target.value as any)}
          >
            <option value="all">View: All Authorized Data</option>
            <option value="family">View: Family Shared</option>
            <option value="private">View: Private (Only You)</option>
            <option value="my_tx">View: My Transactions</option>
          </select>

          {/* Search Box */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: '2.2rem' }}
              placeholder="Search description, merchant, UPI..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Date Range Preset */}
          <select
            className="select"
            style={{ width: 'auto' }}
            value={dateRangePreset}
            onChange={e => setDateRangePreset(e.target.value as any)}
          >
            <option value="all">Date: All Time</option>
            <option value="today">Date: Today</option>
            <option value="week">Date: Last 7 Days</option>
            <option value="this_month">Date: This Month (Sep)</option>
            <option value="last_month">Date: Last Month (Aug)</option>
            <option value="this_year">Date: This Year (2026)</option>
            <option value="custom">📅 Choose Calendar Date...</option>
          </select>

          {/* Highlighted Calendar Date Selector */}
          {dateRangePreset === 'custom' && (
            <div
              className="calendar-highlight-area"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.75rem',
              }}
            >
              <Calendar size={15} color="#059669" />
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                style={{
                  border: '1px solid #A7F3D0',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.82rem',
                  width: 'auto',
                }}
              />
              {customDate && (
                <button
                  type="button"
                  onClick={() => setCustomDate('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6B7280',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Type selector */}
          <select
            className="select"
            style={{ width: 'auto' }}
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses (-)</option>
            <option value="income">Income (+)</option>
            <option value="transfer">Transfers (⇄)</option>
          </select>

          {/* Category selector */}
          <select
            className="select"
            style={{ width: 'auto' }}
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Account selector */}
          <select
            className="select"
            style={{ width: 'auto' }}
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
          >
            <option value="all">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Member selector (Hidden for child) */}
          {!isChild && (
            <select
              className="select"
              style={{ width: 'auto' }}
              value={filterMember}
              onChange={e => setFilterMember(e.target.value)}
            >
              <option value="all">All Members</option>
              {members.map(m => (
                <option key={m.id} value={m.user_id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <select
            className="select"
            style={{ width: 'auto' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="date_desc">Sort: Newest First</option>
            <option value="date_asc">Sort: Oldest First</option>
            <option value="amount_desc">Amount: High to Low</option>
            <option value="amount_asc">Amount: Low to High</option>
          </select>
        </div>
      </div>

      {/* Transactions Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Category</th>
                <th>Description</th>
                <th>Payment / Account</th>
                <th>Visibility</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount (INR)</th>
                {hasPermission('transactions.delete') && <th style={{ width: '50px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    No transactions match your current search filters.
                  </td>
                </tr>
              ) : (
                sortedTransactions.map(tx => {
                  const cat = categories.find(c => c.id === tx.category_id);
                  const member = members.find(m => m.user_id === tx.user_id);
                  const isExpense = tx.type === 'expense';
                  const isTransfer = tx.type === 'transfer';

                  return (
                    <tr key={tx.id} style={{ height: settings.transactions.rowDensity === 'compact' ? '38px' : '52px' }}>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined }}>
                        {formatDate(tx.transaction_date)}
                      </td>
                      <td style={{ padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: isTransfer ? 'var(--purple-accent)' : isExpense ? 'var(--coral-accent)' : 'var(--mint-primary)',
                            }}
                          ></span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                            {member?.user.name || tx.user_id}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined }}>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: 'var(--bg-canvas-subtle)',
                            border: `1px solid ${cat?.color || 'var(--border-subtle)'}`,
                            color: 'var(--text-main)',
                            fontSize: '0.72rem',
                          }}
                        >
                          {isTransfer ? 'Transfer' : (cat?.name || 'General')}
                        </span>
                      </td>
                      <td
                        onClick={() => setDetailsModalTx(tx)}
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined,
                        }}
                        title="Click to view full transaction details and edit privacy"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>{tx.description}</span>
                          <Eye size={12} color="var(--text-muted)" style={{ opacity: 0.6 }} />
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <CreditCard size={14} />
                          <span>{tx.payment_method}</span>
                        </div>
                      </td>
                                            {/* Privacy Indicator Badge (Section 19) */}
                      <td style={{ padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined }}>
                        {tx.visibility === 'private' || !tx.family_id ? (
                          <span
                            className="badge"
                            title="Only you can see this transaction."
                            style={{
                              background: 'rgba(217, 119, 6, 0.12)',
                              color: '#D97706',
                              border: '1px solid rgba(217, 119, 6, 0.3)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Lock size={11} /> Private
                          </span>
                        ) : (
                          <span
                            className="badge"
                            title={`Visible to authorized members of ${activeFamily.name}`}
                            style={{
                              background: 'rgba(5, 150, 105, 0.12)',
                              color: 'var(--mint-primary)',
                              border: '1px solid rgba(5, 150, 105, 0.3)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Users size={11} /> Family Shared
                          </span>
                        )}
                      </td>
                      <td style={{ padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined }}>
                        <span className="badge badge-sage" style={{ fontSize: '0.68rem' }}>
                          {tx.status}
                        </span>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: isTransfer ? 'var(--purple-accent)' : isExpense ? 'var(--coral-accent)' : 'var(--mint-primary)',
                          whiteSpace: 'nowrap',
                          padding: settings.transactions.rowDensity === 'compact' ? '0.4rem 0.75rem' : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                          {isTransfer ? (
                            <ArrowRightLeft size={14} />
                          ) : isExpense ? (
                            <ArrowDownLeft size={14} />
                          ) : (
                            <ArrowUpRight size={14} />
                          )}
                          <span>
                            {settings.transactions.maskSensitiveAmounts
                              ? '••••••••'
                              : isTransfer
                              ? formatPaise(tx.amount)
                              : isExpense
                              ? `-${formatPaise(tx.amount)}`
                              : `+${formatPaise(tx.amount)}`}
                          </span>
                        </div>
                      </td>
                      {hasPermission('transactions.delete') && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '0.3rem',
                            }}
                            title="Delete transaction"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Modal */}
      <AccountTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
      />
          {/* Transaction Details & Privacy Modal */}
      <TransactionDetailsModal
        transaction={detailsModalTx}
        isOpen={Boolean(detailsModalTx)}
        onClose={() => setDetailsModalTx(null)}
      />
    </div>
  );
};
