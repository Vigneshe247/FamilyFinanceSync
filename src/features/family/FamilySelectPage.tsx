import React from 'react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { Users, Shield, PlusCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export const FamilySelectPage: React.FC = () => {
  const { navigate } = useRouter();
  const { memberships } = useAuth();
  const { switchActiveFamily, activeFamily } = useFamilyFinance();

  const handleSelectFamily = (familyId: string) => {
    switchActiveFamily(familyId);
    navigate('/dashboard');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '640px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: '14px',
              background: '#059669',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            <Users size={26} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem 0' }}>
            Select Family Workspace
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#64748B', margin: 0 }}>
            You belong to multiple family spaces. Choose which space to access.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {memberships.map(mem => {
            const isSelected = activeFamily?.id === mem.family_id;
            return (
              <div
                key={mem.id}
                onClick={() => handleSelectFamily(mem.family_id)}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  padding: '1.25rem 1.5rem',
                  border: isSelected ? '2px solid #059669' : '1px solid #E2E8F0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '10px',
                      background: mem.role === 'owner' ? '#FEF3C7' : '#E0F2FE',
                      color: mem.role === 'owner' ? '#D97706' : '#0284C7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Shield size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                      {mem.family_name}
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.25rem', textTransform: 'capitalize' }}>
                      Role: <strong>{mem.role}</strong> {mem.description && `• ${mem.description}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isSelected && <span style={{ fontSize: '0.75rem', background: '#D1FAE5', color: '#059669', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: 700 }}>Active</span>}
                  <ArrowRight size={18} color="#64748B" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Button: Create/Join another family */}
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/family/setup')}
            style={{
              background: 'none',
              border: '1px border #CBD5E1',
              color: '#059669',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <PlusCircle size={18} /> Create or Join another Family
          </button>
        </div>
      </div>
    </div>
  );
};
