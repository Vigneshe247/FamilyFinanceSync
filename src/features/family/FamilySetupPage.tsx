import React, { useState } from 'react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { createFamilyWithOwner, joinFamilyByCode } from '../../services/familyService';
import { Users, PlusCircle, UserPlus, ArrowRight, ShieldCheck, AlertCircle, Sparkles, Check, Key, Play, ArrowLeft } from 'lucide-react';

export const FamilySetupPage: React.FC = () => {
  const { navigate } = useRouter();
  const { userProfile, refreshMemberships, logout } = useAuth();
  const { createFamily: createLocalFamily, joinFamily: joinLocalFamily } = useFamilyFinance();

  const [selectedOption, setSelectedOption] = useState<'create' | 'join' | null>(null);

  // Form State: Create
  const [familyName, setFamilyName] = useState('');
  const [familyDesc, setFamilyDesc] = useState('');

  // Form State: Join
  const [inviteCode, setInviteCode] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!familyName.trim()) {
      setErrorMessage('Please enter a family name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createFamilyWithOwner(familyName, familyDesc);
      if (res.success && res.family_id) {
        createLocalFamily(familyName.trim(), 'INR', 'Asia/Kolkata');
        await refreshMemberships();
        navigate('/dashboard');
      } else {
        setErrorMessage(res.error || 'Could not create family. Please try again.');
      }
    } catch (err: any) {
      console.error('Error creating family:', err);
      setErrorMessage(err.message || 'An unexpected error occurred while creating family.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!inviteCode.trim()) {
      setErrorMessage('Please enter a valid family invitation code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await joinFamilyByCode(inviteCode);
      if (res.success && res.family_id) {
        joinLocalFamily(inviteCode);
        await refreshMemberships();
        navigate('/dashboard');
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

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '760px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.4)',
              marginBottom: '1rem',
            }}
          >
            <Users size={28} />
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
            Welcome to FamilyFinanceSync
          </h1>
          <p style={{ fontSize: '1rem', color: '#64748B', margin: 0 }}>
            Let's get your family workspace set up, {userProfile?.firstName || 'User'}.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '0.85rem 1.15rem',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '12px',
              color: '#991B1B',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Option Cards */}
        {selectedOption === null && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              {/* Option 1: Create a Family */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  padding: '2rem',
                  border: '2px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                }}
              >
                <div>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '12px',
                      background: '#ECFDF5',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <PlusCircle size={24} />
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: '0 0 0.5rem 0' }}>
                    Create a Family
                  </h2>
                  <p style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
                    Create a new family space and invite your members. You will be assigned as the <strong>Family Head</strong>.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedOption('create')}
                    style={{
                      width: '100%',
                      padding: '0.85rem',
                      background: '#059669',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'background 0.2s',
                    }}
                  >
                    Create a Family <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/family/create')}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: 'none',
                      border: 'none',
                      color: '#059669',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Open dedicated create page
                  </button>
                </div>
              </div>

              {/* Option 2: Join a Family */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  padding: '2rem',
                  border: '2px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                }}
              >
                <div>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '12px',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <UserPlus size={24} />
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: '0 0 0.5rem 0' }}>
                    Join a Family
                  </h2>
                  <p style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
                    Join an existing family using an invitation link or code. You will join as a <strong>Member</strong>.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedOption('join')}
                    style={{
                      width: '100%',
                      padding: '0.85rem',
                      background: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'background 0.2s',
                    }}
                  >
                    Join a Family <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/family/join')}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Open dedicated join page
                  </button>
                </div>
              </div>
            </div>

            {/* Back Option */}
            <div
              style={{
                textAlign: 'center',
                padding: '1.25rem',
                background: '#F1F5F9',
                borderRadius: '14px',
                border: '1px dashed #CBD5E1',
              }}
            >
              <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 0.75rem 0' }}>
                Need to switch accounts or sign in with a different email?
              </p>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.6rem 1.25rem',
                  background: '#FFFFFF',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={16} style={{ color: '#4F46E5' }} /> Back to Sign In
              </button>
            </div>
          </>
        )}

        {/* Option 1 Form: Create a Family */}
        {selectedOption === 'create' && (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2.25rem', border: '1px solid #E2E8F0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlusCircle size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Create a New Family</h2>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>You will be assigned as Family Head</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOption(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Back to options
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.4rem' }}>
                  Family Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vignesh Family, Sharma Household"
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.4rem' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Our household financial tracking group..."
                  value={familyDesc}
                  onChange={e => setFamilyDesc(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {isSubmitting ? 'Creating Family...' : 'Create Family'} <ArrowRight size={18} />
              </button>
            </form>
          </div>
        )}

        {/* Option 2 Form: Join a Family */}
        {selectedOption === 'join' && (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2.25rem', border: '1px solid #E2E8F0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserPlus size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Join Existing Family</h2>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Enter invitation code from your Family Head</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOption(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Back to options
              </button>
            </div>

            <form onSubmit={handleJoinSubmit}>
              <div style={{ marginBottom: '1.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.4rem' }}>
                  Family Invitation Code <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FAM-X7K9-P4QM"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem 0.75rem 2.5rem',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '1rem',
                      fontFamily: 'monospace',
                      letterSpacing: '0.05em',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Key size={18} color="#64748B" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {isSubmitting ? 'Joining Family...' : 'Join Family'} <ArrowRight size={18} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
