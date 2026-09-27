import React, { useEffect, useState } from 'react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { getInvitationDetails, acceptFamilyInvitationToken, FamilyInvitation } from '../../services/familyService';
import { Mail, ShieldCheck, AlertCircle, CheckCircle, ArrowRight, Loader2, Users } from 'lucide-react';

export const FamilyInvitePage: React.FC = () => {
  const { currentPath, navigate } = useRouter();
  const { isAuthenticated, refreshMemberships } = useAuth();

  const [inviteToken, setInviteToken] = useState<string>('');
  const [invitation, setInvitation] = useState<FamilyInvitation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    // Extract token from path e.g. /family/invite/abc123token
    const match = currentPath.match(/\/family\/invite\/([^/]+)/);
    const token = match ? match[1] : '';
    setInviteToken(token);

    if (!token) {
      setErrorMessage('Invalid invitation link.');
      setLoading(false);
      return;
    }

    getInvitationDetails(token)
      .then((res) => {
        if (res.success && res.invitation) {
          setInvitation(res.invitation);
        } else {
          setErrorMessage(res.error || 'Invitation not found or link has expired.');
        }
      })
      .catch((err) => {
        setErrorMessage(err.message || 'Error loading invitation details.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentPath]);

  const handleAcceptInvitation = async () => {
    if (!inviteToken) return;
    setSubmitting(true);
    setErrorMessage('');

    try {
      const res = await acceptFamilyInvitationToken(inviteToken);
      if (res.success) {
        setSuccessMessage(`Successfully joined ${res.name || 'family workspace'}!`);
        await refreshMemberships();
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else {
        setErrorMessage(res.error || 'Failed to accept invitation.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while accepting invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: '#4F46E5', marginBottom: '1rem' }} />
          <p style={{ color: '#64748B', fontSize: '0.95rem' }}>Verifying invitation token...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '520px', width: '100%', background: '#FFFFFF', borderRadius: '20px', padding: '2.5rem', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px -5px rgba(79,70,229,0.3)', marginBottom: '1rem' }}>
            <Mail size={28} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem 0' }}>Family Invitation</h1>
          {invitation && (
            <p style={{ fontSize: '0.95rem', color: '#64748B', margin: 0 }}>
              You have been invited to join <strong>{invitation.family_name}</strong>
            </p>
          )}
        </div>

        {errorMessage && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', color: '#166534', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <CheckCircle size={20} style={{ flexShrink: 0, color: '#16A34A' }} />
            <span>{successMessage} Redirecting to your dashboard...</span>
          </div>
        )}

        {invitation && !successMessage && (
          <div>
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.88rem' }}>
                <span style={{ color: '#64748B' }}>Workspace:</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{invitation.family_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.88rem' }}>
                <span style={{ color: '#64748B' }}>Role:</span>
                <span style={{ fontWeight: 700, color: '#4F46E5', background: '#EEF2FF', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>Member</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                <span style={{ color: '#64748B' }}>Family Code:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>{invitation.family_code}</span>
              </div>
            </div>

            <div style={{ padding: '0.85rem 1rem', background: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                <ShieldCheck size={18} style={{ color: '#2563EB', marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '0.82rem', color: '#1E40AF', lineHeight: 1.4 }}>
                  Joining this workspace will grant access to shared budget tracking, transaction history, and family financial goals according to set permissions.
                </div>
              </div>
            </div>

            {isAuthenticated ? (
              <button
                onClick={handleAcceptInvitation}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                  opacity: submitting ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {submitting ? 'Accepting Invitation...' : 'Accept Invitation & Join Family'}
                {!submitting && <ArrowRight size={18} />}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={() => navigate('/login')}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '1rem',
                    cursor: 'pointer',
                  }}
                >
                  Sign In to Accept Invitation
                </button>
                <button
                  onClick={() => navigate('/register')}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                  }}
                >
                  Create New Account
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
