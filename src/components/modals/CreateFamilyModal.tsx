import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { generateFamilyCode, createFamilyWithOwner } from '../../services/familyService';
import { X, Users, Globe, Shield, Sparkles, Copy, Check } from 'lucide-react';

interface CreateFamilyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateFamilyModal: React.FC<CreateFamilyModalProps> = ({ isOpen, onClose }) => {
  const { createFamily } = useFamilyFinance();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [country, setCountry] = useState('India');
  const [createdInfo, setCreatedInfo] = useState<{ name: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await createFamilyWithOwner(name.trim(), description.trim() || undefined);
    const code = res.invite_code || generateFamilyCode();
    createFamily(name.trim(), description.trim() || undefined, currency, country, code);

    setCreatedInfo({ name: name.trim(), code });
  };

  const handleCopyCode = () => {
    if (!createdInfo) return;
    navigator.clipboard.writeText(createdInfo.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = () => {
    setCreatedInfo(null);
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '480px', borderRadius: '24px', padding: '1.75rem' }}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '12px',
                background: 'rgba(5, 150, 105, 0.12)',
                color: 'var(--mint-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Create New Family
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                You will become the Owner of this family workspace
              </p>
            </div>
          </div>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {createdInfo ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(5, 150, 105, 0.15)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Sparkles size={28} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--text-main)' }}>
              Family Created Successfully 🎉
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
              Your family workspace <strong>{createdInfo.name}</strong> is live.
            </p>

            <div style={{ background: 'var(--bg-canvas-subtle)', padding: '1.15rem', borderRadius: '14px', border: '1px dashed var(--border-subtle)', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                Your Unique Family Code
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '2px', color: 'var(--mint-primary)', marginBottom: '0.5rem' }}>
                {createdInfo.code}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
                Share this code with family members to let them join.
              </p>
              <button
                type="button"
                onClick={handleCopyCode}
                className="btn btn-secondary btn-sm"
                style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
              >
                {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                <span>{copied ? 'Copied Code!' : 'Copy Code'}</span>
              </button>
            </div>

            <button type="button" className="btn btn-primary" onClick={handleFinish} style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Family Name *
              </label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Vignesh Family or Anand Household"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Description
              </label>
              <textarea
                className="input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Primary household wealth, shared utility bills & daily groceries"
                rows={2}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Currency
                </label>
                <select className="select" value={currency} onChange={e => setCurrency(e.target.value)}>
                  <option value="INR">INR (₹) — Indian Rupee</option>
                  <option value="USD">USD ($) — US Dollar</option>
                  <option value="EUR">EUR (€) — Euro</option>
                  <option value="GBP">GBP (£) — British Pound</option>
                  <option value="AED">AED (د.إ) — UAE Dirham</option>
                  <option value="SGD">SGD (S$) — Singapore Dollar</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Country / Region
                </label>
                <input
                  type="text"
                  className="input"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  placeholder="India"
                />
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
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start',
              }}
            >
              <Shield size={16} color="var(--mint-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Family Owner Role:</strong> You will have administrative authority to invite members, manage shared accounts, and configure family settings.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', fontWeight: 700 }}>
                Create Family
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

