import React, { useState } from 'react';
import { X, ShieldCheck, FileText, CheckCircle2, Lock, Scale } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'privacy';
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, defaultTab = 'terms' }) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(defaultTab);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                background: '#D1FAE5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Legal & Governance
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
                Terms of Service & Data Protection Policy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              padding: '0.35rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '0.88rem',
              fontWeight: 600,
              background: activeTab === 'terms' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'terms' ? '#059669' : '#64748B',
              border: 'none',
              borderBottom: activeTab === 'terms' ? '2px solid #059669' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <FileText size={16} /> Terms & Conditions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '0.88rem',
              fontWeight: 600,
              background: activeTab === 'privacy' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'privacy' ? '#059669' : '#64748B',
              border: 'none',
              borderBottom: activeTab === 'privacy' ? '2px solid #059669' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <Lock size={16} /> Privacy Policy
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, color: '#334155', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {activeTab === 'terms' ? (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                Terms & Conditions
              </h4>
              <p style={{ marginTop: 0, color: '#475569', fontSize: '0.88rem' }}>
                By continuing, you agree to our <strong>Terms & Conditions</strong> and <strong>Privacy Policy</strong>.
              </p>

              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.86rem', color: '#166534', fontWeight: 500 }}>
                  You understand that <strong>FamilyFinanceSync</strong> allows you to record, manage, and share financial information with linked family members based on your selected privacy settings.
                </p>
              </div>

              <h5 style={{ margin: '1rem 0 0.5rem 0', fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>
                You are responsible for:
              </h5>
              <ul style={{ paddingLeft: '1.25rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.86rem', color: '#334155' }}>
                <li><strong>Providing accurate information</strong> during registration and transaction logging.</li>
                <li><strong>Keeping your account secure</strong> and protecting your password and credentials.</li>
                <li><strong>Reviewing who can access your shared family data</strong> across accounts, budgets, and loans.</li>
                <li><strong>Using the application only for lawful purposes</strong> and authorized family financial tracking.</li>
              </ul>

              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '0.85rem 1rem',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '10px',
                  display: 'flex',
                  gap: '0.65rem',
                  alignItems: 'flex-start',
                }}
              >
                <Scale size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#991B1B', lineHeight: 1.5 }}>
                  <strong>Disclaimer:</strong> Financial information is provided for <strong>tracking and management purposes only</strong> and does not constitute financial, investment, tax, or legal advice.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                Privacy Policy & Data Security
              </h4>
              <p style={{ marginTop: 0, color: '#475569', fontSize: '0.88rem' }}>
                Your financial privacy is our highest priority. <strong>FamilyFinanceSync</strong> enforces strict tenant isolation and role-based data encryption.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.86rem' }}>
                    <strong>Private vs Shared Transactions:</strong> Personal transactions tagged as private remain strictly invisible to other family members.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.86rem' }}>
                    <strong>Row-Level Security (RLS):</strong> All Supabase database tables enforce strict RLS policies bound to your verified family ID.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.86rem' }}>
                    <strong>Child Member Protection:</strong> Dependent and child accounts operate under restricted view-only boundaries managed exclusively by the Family Head.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.6rem 1.25rem',
              background: '#059669',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            I Understand & Agree
          </button>
        </div>
      </div>
    </div>
  );
};
