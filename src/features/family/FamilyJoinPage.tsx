import React, { useState } from 'react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { requestToJoinFamily } from '../../services/familyService';
import { UserPlus, ShieldCheck, AlertCircle, ArrowLeft, Key, Clock, CheckCircle2 } from 'lucide-react';

export const FamilyJoinPage: React.FC = () => {
  const { navigate } = useRouter();
  const { refreshMemberships } = useAuth();
  const { joinFamily: joinLocalFamily } = useFamilyFinance();

  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingApproval, setPendingApproval] = useState<{ familyName?: string; headEmail?: string } | null>(null);

  const formatCodeInput = (val: string) => {
    let clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.startsWith('FAM')) {
      clean = clean.substring(3);
    }
    return clean.length > 0 ? `FAM-${clean}` : 'FAM-';
  };

  const handleChangeCode = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.length === 0) {
      setInviteCode('');
      return;
    }
    const formatted = formatCodeInput(raw);
    setInviteCode(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanCode = inviteCode.trim();
    if (!cleanCode || cleanCode.replace(/[^A-Z0-9]/g, '').length < 6) {
      setErrorMessage('Please enter a valid family invitation code (e.g. FAM-7K4P9X).');
      return;
    }

  setIsSubmitting(true);
  try {
    const res = await requestToJoinFamily(cleanCode);
    if (res.success) {
      joinLocalFamily(cleanCode);
      if (res.status === 'pending') {
        setPendingApproval({
          familyName: res.family_name || 'Family Workspace',
          headEmail: res.head_email,
        });
      } else {
        await refreshMemberships();
        navigate('/dashboard');
      }
    } else {
      setErrorMessage(res.error || 'Invalid family invitation code.');
    }
  } catch (err: any) {
    console.error('Error joining family:', err);
    setErrorMessage(err.message || 'An unexpected error occurred while joining family.');
  } finally {
    setIsSubmitting(false);
  }
};

  if (pendingApproval) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '520px', width: '100%', background: '#FFFFFF', borderRadius: '20px', padding: '2.5rem', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <Clock size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem' }}>
            Join Request Pending Approval
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            Your request to join <strong>{pendingApproval.familyName}</strong> has been submitted. An email and in-app notification have been dispatched to the Family Head.
          </p>

          <div style={{ padding: '1rem', borderRadius: '12px', background: '#F1F5F9', border: '1px solid #E2E8F0', textAlign: 'left', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', fontWeight: 700, color: '#0F172A' }}>
              <CheckCircle2 size={16} color="#059669" /> What happens next?
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
              <li>The Family Head approves your request in their Approval Center.</li>
              <li>Your device will automatically sync via Realtime and grant access.</li>
            </ul>
          </div>

          <button
            className="btn btn-primary"
            onClick={async () => {
              await refreshMemberships();
              navigate('/dashboard');
            }}
            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', fontWeight: 700 }}
          >
            Go to Dashboard Overview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '520px', width: '100%', background: '#FFFFFF', borderRadius: '20px', padding: '2.5rem', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
        
        <button
          onClick={() => navigate('/family/setup')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'none',
            border: 'none',
            color: '#64748B',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            marginBottom: '1.5rem',
          }}
        >
          <ArrowLeft size={16} /> Back to Setup Options
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserPlus size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Join an Existing Family</h2>
            <p style={{ fontSize: '0.88rem', color: '#64748B', margin: 0 }}>Enter the invitation code shared by your Family Head.</p>
          </div>
        </div>

        {errorMessage && (
          <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
              Family Invitation Code <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Key size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="FAM-XXXX-XXXX"
                value={inviteCode}
                onChange={handleChangeCode}
                required
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem 0.85rem 2.8rem',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.4rem' }}>
              Format: FAM-XXXX-XXXX (Ask your Family Head for this code)
            </p>
          </div>

          <div style={{ padding: '0.85rem 1rem', background: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
              <ShieldCheck size={18} style={{ color: '#2563EB', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.82rem', color: '#1E40AF', lineHeight: 1.4 }}>
                <strong>Role Notice:</strong> Submitting a family code notifies the Family Head for approval before granting member access.
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.9rem',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Submitting Request...' : 'Send Join Request'}
          </button>
        </form>
      </div>
    </div>
  );
};

