/* =========================================================
   EXECUTIVE APPROVAL CENTER — FAMILY HEAD GOVERNANCE (Section 58)
   Centralized approval workflow for money requests, child spending,
   and allowance disbursements.
   ========================================================= */

import React, { useState, useEffect } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise } from '../../utils/currency';
import {
  getPendingFamilyJoinRequests,
  approveFamilyJoinRequest,
  rejectFamilyJoinRequest,
  FamilyJoinRequestRecord,
} from '../../services/familyService';
import {
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  ShieldCheck,
  AlertCircle,
  Coins,
  MessageSquare,
  UserCheck,
  UserPlus,
  Filter,
  Check,
  X,
  FileText,
} from 'lucide-react';

export const ApprovalCenterPage: React.FC = () => {
  const {
    family,
    requests,
    approveRequest,
    rejectRequest,
    currentMember,
    transactions,
    members,
    categories,
  } = useFamilyFinance();

  const [activeTab, setActiveTab] = useState<'requests' | 'join_requests' | 'pending_tx' | 'history'>('join_requests');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [questionModalItem, setQuestionModalItem] = useState<string | null>(null);

  const [pendingJoinRequests, setPendingJoinRequests] = useState<FamilyJoinRequestRecord[]>([]);
  const [actionFeedback, setActionFeedback] = useState('');

  const loadJoinRequests = async () => {
    const list = await getPendingFamilyJoinRequests(family?.id);
    setPendingJoinRequests(list);
  };

  useEffect(() => {
    loadJoinRequests();
  }, [family?.id]);

  const handleApproveMember = async (requestId: string) => {
    const res = await approveFamilyJoinRequest(requestId);
    if (res.success) {
      setActionFeedback('Member join request approved!');
      await loadJoinRequests();
      setTimeout(() => setActionFeedback(''), 3000);
    }
  };

  const handleRejectMember = async (requestId: string) => {
    const res = await rejectFamilyJoinRequest(requestId);
    if (res.success) {
      setActionFeedback('Member join request rejected.');
      await loadJoinRequests();
      setTimeout(() => setActionFeedback(''), 3000);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const resolvedRequests = requests.filter(r => r.status !== 'pending');
  const pendingTransactions = transactions.filter(t => t.status === 'pending');

  const totalPendingAmount = pendingRequests.reduce((sum, r) => sum + r.amount, 0);

  const getCategoryName = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : 'General Expense';
  };

  const handleApprove = (requestId: string) => {
    const comment = reviewComment[requestId] || 'Approved by Family Head';
    approveRequest(requestId, comment);
  };

  const handleReject = (requestId: string) => {
    const comment = reviewComment[requestId] || 'Rejected by Family Head';
    rejectRequest(requestId, comment);
  };

  return (
    <div className="content-page" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: '14px',
              background: 'var(--mint-light)',
              color: 'var(--mint-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Executive Approval Center
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
              Review, approve, or reject expense requests and child transactions
            </p>
          </div>
        </div>

        {/* Aggregate Stats Pill */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-card)',
              padding: '0.6rem 1rem',
              borderRadius: '16px',
            }}
          >
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
              Pending Action Items
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--amber-accent)', marginTop: '0.1rem' }}>
              {pendingRequests.length + pendingTransactions.length} Items
            </div>
          </div>

          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-card)',
              padding: '0.6rem 1rem',
              borderRadius: '16px',
            }}
          >
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
              Total Requested Outflow
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.1rem', fontFamily: 'var(--font-mono)' }}>
              {formatPaise(totalPendingAmount)}
            </div>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            color: '#15803D',
            fontSize: '0.88rem',
            fontWeight: 700,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={18} /> {actionFeedback}
        </div>
      )}

      {/* Segmented Filter Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${activeTab === 'join_requests' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('join_requests')}
        >
          <UserPlus size={15} />
          <span>Member Join Requests ({pendingJoinRequests.length})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('requests')}
        >
          <Clock size={15} />
          <span>Money Requests ({pendingRequests.length})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'pending_tx' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('pending_tx')}
        >
          <FileText size={15} />
          <span>Pending Transactions ({pendingTransactions.length})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('history')}
        >
          <CheckCircle2 size={15} />
          <span>Approval History ({resolvedRequests.length})</span>
        </button>
      </div>

      {/* Tab 0: Pending Member Join Requests */}
      {activeTab === 'join_requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pendingJoinRequests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <CheckCircle2 size={42} color="var(--mint-primary)" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem' }}>No Pending Join Requests</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                All family code join requests have been processed!
              </p>
            </div>
          ) : (
            pendingJoinRequests.map(req => (
              <div
                key={req.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1.15rem 1.35rem',
                  borderLeft: '4px solid #2563EB',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(37, 99, 235, 0.12)',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                    }}
                  >
                    {req.applicant_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      {req.applicant_name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {req.applicant_email} • Requested: {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRejectMember(req.id)}
                    style={{ color: '#EF4444', borderColor: '#EF4444', gap: '0.35rem' }}
                  >
                    <X size={15} /> Reject Request
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleApproveMember(req.id)}
                    style={{ background: '#059669', borderColor: '#059669', gap: '0.35rem' }}
                  >
                    <Check size={15} /> Approve Member
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 1: Pending Money Requests */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pendingRequests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <CheckCircle2 size={42} color="var(--mint-primary)" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem' }}>No Pending Requests</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                All family expense requests have been reviewed and approved!
              </p>
            </div>
          ) : (
            pendingRequests.map(req => (
              <div
                key={req.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  borderLeft: '4px solid var(--amber-accent)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '50%',
                        background: 'var(--amber-light)',
                        color: 'var(--amber-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1rem',
                      }}
                    >
                      {req.requester_name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                          {req.title}
                        </span>
                        <span className="badge badge-brass" style={{ fontSize: '0.68rem' }}>
                          {getCategoryName(req.category_id)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Requested by <strong>{req.requester_name}</strong> • {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                      {formatPaise(req.amount)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--amber-accent)', fontWeight: 600 }}>
                      Pending Approval
                    </div>
                  </div>
                </div>

                {req.description && (
                  <div
                    style={{
                      background: 'var(--bg-canvas-subtle)',
                      padding: '0.75rem 0.95rem',
                      borderRadius: '12px',
                      fontSize: '0.82rem',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    "{req.description}"
                  </div>
                )}

                {/* Review Comment Input & Decision Controls */}
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center', paddingTop: '0.25rem' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Add approval comment or note..."
                    value={reviewComment[req.id] || ''}
                    onChange={e => setReviewComment({ ...reviewComment, [req.id]: e.target.value })}
                    style={{ flex: 1, minWidth: '220px', fontSize: '0.78rem' }}
                  />

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setQuestionModalItem(req.id)}
                    title="Ask requester for clarification"
                    style={{ gap: '0.35rem' }}
                  >
                    <HelpCircle size={15} /> Ask Question
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleReject(req.id)}
                    style={{ background: 'rgba(235, 87, 87, 0.12)', color: '#EB5757', borderColor: '#EB5757', gap: '0.35rem' }}
                  >
                    <X size={15} /> Reject
                  </button>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleApprove(req.id)}
                    style={{ gap: '0.35rem' }}
                  >
                    <Check size={15} /> Approve Request
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Pending Transactions */}
      {activeTab === 'pending_tx' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pendingTransactions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <CheckCircle2 size={42} color="var(--mint-primary)" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem' }}>No Pending Transactions</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                All member transactions are reconciled and cleared.
              </p>
            </div>
          ) : (
            pendingTransactions.map(tx => (
              <div key={tx.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{tx.description}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Payment Method: {tx.payment_method} • Date: {tx.transaction_date}
                  </div>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                  {formatPaise(tx.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Resolved Approval History */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {resolvedRequests.map(req => (
            <div
              key={req.id}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem 1.15rem',
                borderLeft: `4px solid ${req.status === 'approved' ? 'var(--mint-primary)' : '#EB5757'}`,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{req.title}</span>
                  <span
                    className={`badge ${req.status === 'approved' ? 'badge-sage' : 'badge-rust'}`}
                    style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}
                  >
                    {req.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Requested by {req.requester_name} • Reviewed: {req.review_comment || 'No comment'}
                </div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {formatPaise(req.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApprovalCenterPage;
