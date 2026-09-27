import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { requestToJoinFamily } from '../../services/familyService';
import { X, Key, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface JoinFamilyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinFamilyModal: React.FC<JoinFamilyModalProps> = ({ isOpen, onClose }) => {
  const { joinFamily: joinLocalFamily } = useFamilyFinance();

  const [inviteCode, setInviteCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      const res = await requestToJoinFamily(inviteCode);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to submit join request.');
        return;
      }

      joinLocalFamily(inviteCode);

      if (res.status === 'pending') {
        setSuccessMsg(`Request sent! Waiting for Family Head approval.`);
      } else {
        setSuccessMsg('Successfully joined family workspace!');
      }

      setTimeout(() => {
        setSuccessMsg('');
        setInviteCode('');
        onClose();
      }, 1600);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '440px', borderRadius: '24px', padding: '1.75rem' }}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '12px',
                background: 'rgba(37, 99, 235, 0.12)',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Key size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Join Family
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                Enter the family code shared by the family owner.
              </p>
            </div>
          </div>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '12px',
              background: 'rgba(235, 87, 87, 0.12)',
              border: '1px solid rgba(235, 87, 87, 0.25)',
              color: '#EB5757',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '12px',
              background: 'rgba(34, 160, 91, 0.12)',
              border: '1px solid rgba(34, 160, 91, 0.25)',
              color: 'var(--mint-primary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <CheckCircle2 size={16} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
              Family Code
            </label>
            <input
              type="text"
              className="input"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. FAM-7KQ9-M2XP"
              style={{ letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase' }}
              required
              autoFocus
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Don't have a code? Ask the family owner to share their family invitation code.
            </div>
          </div>

          <div
            style={{
              padding: '0.75rem',
              borderRadius: '14px',
              background: 'var(--bg-canvas-subtle)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}
          >
            <strong>Note for Demo Mode:</strong> Entering any code (e.g. <code>VIG-FAM-48291</code>) simulates family membership authorization locally and connects you to that family workspace.
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', fontWeight: 700 }}>
              Join Family
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
