/* =========================================================
   FAMILY INVITATION GENERATOR MODAL (Module 5)
   Generates secure shareable invite links, family codes & sends Resend emails
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { sendFamilyInvitationToken } from '../../services/familyService';
import { SystemRoleType } from '../../types';
import {
  X,
  Link,
  Copy,
  Check,
  Users,
  ShieldCheck,
  Send,
  Sparkles,
  Clock,
  Mail,
  Loader2,
} from 'lucide-react';

interface InvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InvitationModal: React.FC<InvitationModalProps> = ({ isOpen, onClose }) => {
  const { family, createInvitation, currentMember } = useFamilyFinance();

  const [role, setRole] = useState<SystemRoleType>('spouse');
  const [email, setEmail] = useState('');
  const [allowanceInput, setAllowanceInput] = useState('2000');
  const [isSending, setIsSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ attempted: boolean; sent: boolean; notice?: string }>({ attempted: false, sent: false });
  const [generatedInvite, setGeneratedInvite] = useState<{
    code: string;
    link: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setEmailStatus({ attempted: false, sent: false });

    try {
      const inv = createInvitation(role, email || undefined);
      let inviteLink = inv.invite_link;
      let inviteCode = inv.invite_code;

      if (email.trim() && family.id) {
        const tokenRes = await sendFamilyInvitationToken({
          familyId: family.id,
          familyName: family.name,
          invitedEmail: email.trim(),
          inviterName: currentMember.user.name,
        });

        if (tokenRes.success && tokenRes.inviteToken) {
          inviteLink = `${window.location.origin}/family/invite/${tokenRes.inviteToken}`;
          if (tokenRes.familyCode) inviteCode = tokenRes.familyCode;
          setEmailStatus({
            attempted: true,
            sent: !!tokenRes.emailSent,
            notice: tokenRes.emailNotice,
          });
        }
      }

      setGeneratedInvite({
        code: inviteCode,
        link: inviteLink,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    } catch (err) {
      console.warn('Invitation error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedInvite) return;
    navigator.clipboard.writeText(generatedInvite.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '12px',
                background: 'var(--mint-light)',
                color: 'var(--mint-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Invite Family Member
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Generate secure access link for <strong>{family.name}</strong>
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!generatedInvite ? (
            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div>
                <label className="label">Assigned Role</label>
                <select
                  className="input"
                  value={role}
                  onChange={e => setRole(e.target.value as SystemRoleType)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="spouse">Spouse (Co-manages family finances, records transactions)</option>
                  <option value="child">Daughter / Son (Allowance tracker, personal spending & requests)</option>
                  <option value="grandparent">Grand Parents (Permitted family overview & personal records)</option>
                  <option value="viewer">Viewer (Strictly read-only financial overview)</option>
                </select>
              </div>

              <div>
                <label className="label">Member Email (For automatic invitation email)</label>
                <input
                  type="email"
                  className="input"
                  placeholder="family.member@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              {role === 'child' && (
                <div>
                  <label className="label">Initial Monthly Allowance (₹ INR)</label>
                  <input
                    type="number"
                    className="input"
                    value={allowanceInput}
                    onChange={e => setAllowanceInput(e.target.value)}
                    placeholder="2000"
                  />
                </div>
              )}

              <div
                style={{
                  background: 'var(--bg-canvas-subtle)',
                  padding: '0.95rem 1.15rem',
                  borderRadius: '16px',
                  border: '1px solid var(--border-card)',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.25rem' }}>
                  <ShieldCheck size={16} color="var(--mint-primary)" />
                  <span>Hierarchical Permission Security</span>
                </div>
                <div style={{ color: 'var(--text-muted)', lineHeight: '1.45', paddingLeft: '1.45rem' }}>
                  New members join in a default restricted state. Family Head ({currentMember.user.name}) holds explicit authority over workspace permissions.
                </div>
              </div>

              <div className="modal-footer" style={{ padding: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSending}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ gap: '0.5rem' }} disabled={isSending}>
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isSending ? 'Sending Invitation...' : 'Generate & Send Invite'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {emailStatus.attempted && emailStatus.sent && (
                <div style={{ padding: '0.75rem 1rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', color: '#166534', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Mail size={16} style={{ color: '#16A34A', flexShrink: 0 }} />
                  <span>Invitation email has been sent successfully to <strong>{email}</strong>!</span>
                </div>
              )}

              {emailStatus.attempted && !emailStatus.sent && (
                <div style={{ padding: '0.75rem 1rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', color: '#92400E', fontSize: '0.80rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <Mail size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Invitation link & code ready!</div>
                    <div style={{ marginTop: '2px', color: '#78350F', fontSize: '0.76rem', lineHeight: 1.4 }}>
                      To dispatch automated emails directly to inboxes, add <code>VITE_RESEND_API_KEY</code> in <code>.env</code> or configure Supabase Custom SMTP. You can copy and share the link below directly with your family member.
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  background: 'var(--mint-light)',
                  border: '1px solid var(--mint-primary)',
                  borderRadius: '16px',
                  padding: '1.15rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mint-primary)', fontWeight: 700, letterSpacing: '0.06em' }}>
                  Family Invitation Code
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    letterSpacing: '0.15em',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    margin: '0.4rem 0',
                  }}
                >
                  {generatedInvite.code}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <Clock size={13} /> Expires on {generatedInvite.expiresAt}
                </div>
              </div>

              {/* Shareable Link Box */}
              <div>
                <label className="label">Shareable Family Invitation URL</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input"
                    value={generatedInvite.link}
                    readOnly
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                  />
                  <button className="btn btn-primary" onClick={handleCopyLink} style={{ gap: '0.35rem', whiteSpace: 'nowrap' }}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setGeneratedInvite(null);
                    setEmailStatus({ attempted: false, sent: false });
                  }}
                  style={{ flex: 1 }}
                >
                  Generate Another Code
                </button>
                <button type="button" className="btn btn-primary" onClick={onClose} style={{ flex: 1 }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvitationModal;
