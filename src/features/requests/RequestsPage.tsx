/* =========================================================
   EXPENSE REQUESTS & APPROVAL WORKFLOW (Sections 15 & 16)
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, formatDate } from '../../utils/currency';
import {
  GitPullRequest,
  CheckCircle,
  XCircle,
  MessageSquare,
  Clock,
  Plus,
  ShieldCheck,
  AlertCircle,
  User,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

interface RequestsPageProps {
  onOpenNewRequest: () => void;
}

export const RequestsPage: React.FC<RequestsPageProps> = ({ onOpenNewRequest }) => {
  const {
    requests,
    categories,
    currentMember,
    hasPermission,
    canApproveRequestAmount,
    approveRequest,
    rejectRequest,
  } = useFamilyFinance();
  const { openViewSettingsModal } = useViewSettings();

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviewModalReqId, setReviewModalReqId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewComment, setReviewComment] = useState('');

  const isHead = currentMember.role === 'FAMILY_HEAD';
  const isCoManager = currentMember.role === 'CO_MANAGER';
  const isChild = currentMember.role === 'CHILD';

  const canApproveAny = hasPermission('requests.approve');

  // Filter requests based on role
  const displayedRequests = requests.filter(req => {
    // Child only sees their own requests
    if (isChild && req.requested_by !== currentMember.user_id) {
      return false;
    }
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const selectedReqForReview = requests.find(r => r.id === reviewModalReqId);

  const openReviewModal = (id: string, action: 'approve' | 'reject') => {
    setReviewModalReqId(id);
    setReviewAction(action);
    setReviewComment(action === 'approve' ? 'Approved for purchase.' : 'Deferred due to current budget priority.');
  };

  const handleConfirmDecision = () => {
    if (!reviewModalReqId) return;
    if (reviewAction === 'approve') {
      approveRequest(reviewModalReqId, reviewComment);
    } else {
      rejectRequest(reviewModalReqId, reviewComment);
    }
    setReviewModalReqId(null);
    setReviewComment('');
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
            Expense Approval Queue
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            {isChild
              ? 'Track the status of your purchase requests'
              : 'Rule-evaluated family approval workflow with automated transactions'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={onOpenNewRequest}>
            <Plus size={15} /> Submit New Request
          </button>
        </div>
      </div>

      {/* Rules Notice for Family Head / Co-Manager */}
      {(isHead || isCoManager) && (
        <div
          style={{
            background: 'var(--paper-card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} color="var(--brass)" />
            <span>
              <strong>Active Approval Rule Engine:</strong> Requests &gt; ₹2,000 require Family Head. Mid-tier (₹500–₹2,000) allowed by Co-Manager. All child expenses mandate parental authorization.
            </span>
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(tab => {
          const count = requests.filter(r => {
            if (isChild && r.requested_by !== currentMember.user_id) return false;
            return tab === 'all' ? true : r.status === tab;
          }).length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }}
            >
              {tab} ({count})
            </button>
          );
        })}
      </div>

      {/* Requests List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {displayedRequests.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--ink-muted)' }}>
            <CheckCircle size={36} color="var(--sage)" style={{ margin: '0 auto 0.75rem' }} />
            <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--ink)' }}>
              No requests in this queue
            </div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              All family members' requests for this filter have been addressed.
            </p>
          </div>
        ) : (
          displayedRequests.map(req => {
            const cat = categories.find(c => c.id === req.category_id);
            const canApproveThis = canApproveAny && canApproveRequestAmount(req.amount);
            const isPending = req.status === 'pending';

            return (
              <div key={req.id} className="card">
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span
                        className={`badge ${
                          req.status === 'approved'
                            ? 'badge-sage'
                            : req.status === 'rejected'
                            ? 'badge-rust'
                            : 'badge-brass'
                        }`}
                      >
                        {req.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                        {formatDate(req.created_at)}
                      </span>
                      <span className="badge badge-sky" style={{ fontSize: '0.72rem' }}>
                        {req.request_type ? req.request_type.replace(/_/g, ' ').toUpperCase() : (cat?.name || 'Request')}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' }}>
                      {req.title}
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>
                      <User size={13} />
                      <span>Requested by <strong>{req.requester_name}</strong></span>
                    </div>

                    <p style={{ marginTop: '0.75rem', fontSize: '0.88rem', color: 'var(--ink-2)', background: 'var(--paper-dim)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                      "{req.description}"
                    </p>

                    {/* Reviewer Comment if resolved */}
                    {req.review_comment && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <MessageSquare size={14} color="var(--brass)" />
                        <span><strong>{req.reviewer_name}:</strong> {req.review_comment}</span>
                      </div>
                    )}
                  </div>

                  {/* Right side: Amount and Decision Actions */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: req.amount > 0 ? '1.65rem' : '1.1rem', color: req.amount > 0 ? 'var(--ink)' : 'var(--ink-muted)' }}>
                      {req.amount > 0 ? formatPaise(req.amount) : 'Action Request'}
                    </div>

                    {isPending && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {canApproveThis ? (
                          <>
                            <button
                              className="btn btn-sage btn-sm"
                              onClick={() => openReviewModal(req.id, 'approve')}
                            >
                              <CheckCircle size={15} /> Approve
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => openReviewModal(req.id, 'reject')}
                            >
                              <XCircle size={15} /> Reject
                            </button>
                          </>
                        ) : isCoManager && req.amount > 200000 ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--rust)', background: 'var(--rust-light)', padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--rust)' }}>
                            Exceeds ₹2,000 threshold (Head only)
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Review Decision Modal */}
      {reviewModalReqId && selectedReqForReview && (
        <div className="modal-backdrop" onClick={() => setReviewModalReqId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                {reviewAction === 'approve' ? 'Approve Expense Request' : 'Reject Expense Request'}
              </h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--paper-dim)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedReqForReview.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
                  Requester: {selectedReqForReview.requester_name} • Amount: <strong>{formatPaise(selectedReqForReview.amount)}</strong>
                </div>
              </div>

              {reviewAction === 'approve' && (
                <div style={{ fontSize: '0.82rem', color: 'var(--sage)', background: 'var(--sage-light)', padding: '0.65rem', borderRadius: 'var(--radius-xs)' }}>
                  ✓ Approving will automatically record a cleared transaction in the ledger, deduct from the operating bank account, update audit logs, and notify the member.
                </div>
              )}

              <div>
                <label className="label">Decision Note / Feedback for Requester</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Add feedback or justification..."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setReviewModalReqId(null)}>
                Cancel
              </button>
              <button
                className={`btn ${reviewAction === 'approve' ? 'btn-sage' : 'btn-danger'}`}
                onClick={handleConfirmDecision}
              >
                {reviewAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
