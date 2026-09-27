import React, { useState } from 'react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { createFamilyWithOwner, generateFamilyCode } from '../../services/familyService';
import { PlusCircle, ShieldCheck, AlertCircle, ArrowLeft, Users, Key, RefreshCw, Sparkles, Copy, Check } from 'lucide-react';

export const FamilyCreatePage: React.FC = () => {
  const { navigate } = useRouter();
  const { userProfile, refreshMemberships } = useAuth();
  const { createFamily: createLocalFamily } = useFamilyFinance();

  const [familyName, setFamilyName] = useState('');
  const [familyDesc, setFamilyDesc] = useState('');
  const [familyCode, setFamilyCode] = useState(() => generateFamilyCode());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdResult, setCreatedResult] = useState<{ name: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanName = familyName.trim();
    if (!cleanName) {
      setErrorMessage('Please enter a family name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createFamilyWithOwner(cleanName, familyDesc);
      if (res.success && res.family_id) {
        const code = res.invite_code || generateFamilyCode();
        createLocalFamily(cleanName, 'INR', 'Asia/Kolkata', 'India', code);
        await refreshMemberships();
        setCreatedResult({ name: cleanName, code });
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

  const handleCopyCode = () => {
    if (!createdResult) return;
    navigator.clipboard.writeText(createdResult.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (createdResult) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '520px', width: '100%', background: '#FFFFFF', borderRadius: '20px', padding: '2.5rem', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <Sparkles size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem' }}>
            Family Created Successfully 🎉
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            Your family workspace <strong>{createdResult.name}</strong> is live.
          </p>

          <div style={{ padding: '1.25rem', borderRadius: '14px', background: '#F8FAFC', border: '1px dashed #CBD5E1', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Your Unique Family Code
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '2px', color: '#059669', marginBottom: '0.5rem' }}>
              {createdResult.code}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 0.85rem' }}>
              Share this code with family members to let them join.
            </p>
            <button
              type="button"
              onClick={handleCopyCode}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {copied ? <Check size={15} color="#059669" /> : <Copy size={15} />}
              <span>{copied ? 'Copied Code!' : 'Copy Code'}</span>
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => navigate('/dashboard')}
            style={{ width: '100%', padding: '0.9rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', border: 'none', color: '#FFF' }}
          >
            Go to Family Dashboard
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
          <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PlusCircle size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Create a New Family</h2>
            <p style={{ fontSize: '0.88rem', color: '#64748B', margin: 0 }}>You will become the Family Head of this workspace.</p>
          </div>
        </div>

        {errorMessage && (
          <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
              Family Name <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Sharma Family, The Smiths"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              required
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
              Description / Notes (Optional)
            </label>
            <textarea
              placeholder="e.g. Shared household expenses & budgeting"
              value={familyDesc}
              onChange={(e) => setFamilyDesc(e.target.value)}
              rows={3}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>

          <div style={{ padding: '0.85rem 1rem', background: '#F0FDF4', borderRadius: '10px', border: '1px solid #BBF7D0', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
              <ShieldCheck size={18} style={{ color: '#16A34A', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.82rem', color: '#166534', lineHeight: 1.4 }}>
                <strong>Role Notice:</strong> Creating this family will assign your account as <strong>Family Head</strong> with administrative control over budgets, members, and approval rules.
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
              background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Creating Family...' : 'Create Family Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
};

