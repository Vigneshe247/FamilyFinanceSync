/* =========================================================
   ROLE-SCOPED SETTINGS & CONTROL CENTER (Section 14)
   Adapts dynamically based on member role:
   - FAMILY_HEAD: Full Tenancy, Permissions Matrix, Members, Limits & Audit
   - CO_MANAGER: Family Operations, Accounts, Members & Limits
   - ADULT_MEMBER: Personal Profile, Shared Bills, Goals & Security
   - CHILD: My Allowance, Avatar, Wishlist Goals & Request Alerts
   ========================================================= */

import React, { useState, useRef, useEffect } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise } from '../../utils/currency';
import {
  ShieldCheck,
  Users,
  KeyRound,
  Sliders,
  Wallet,
  ScrollText,
  Lock,
  ArrowRight,
  Globe,
  Coins,
  CheckCircle,
  CreditCard,
  TrendingUp,
  Split,
  Sparkles,
  User,
  Bell,
  Sun,
  Moon,
  Camera,
  Check,
  UploadCloud,
  Target,
  Shield,
  Heart,
  SlidersHorizontal,
  Edit3,
} from 'lucide-react';

interface ControlCenterPageProps {
  setActiveTab: (tab: string) => void;
  onOpenImportModal?: () => void;
}

export const ControlCenterPage: React.FC<ControlCenterPageProps> = ({ setActiveTab, onOpenImportModal }) => {
  const {
    family,
    members,
    accounts,
    auditLogs,
    currentMember,
    updateUserProfile,
    updateFamilyName,
    theme,
    toggleTheme,
  } = useFamilyFinance();



  const role = currentMember?.role || 'FAMILY_HEAD';
  const normRole = (currentMember?.role || '').toLowerCase();
  const isHead = normRole === 'family_head' || normRole.includes('head');
  const isCoManager = normRole.includes('spouse') || normRole.includes('co_manager') || normRole.includes('comanager');
  const isAdult = normRole.includes('adult');
  const isViewer = normRole.includes('viewer');
  const isChild = normRole.includes('child') || normRole === 'son' || normRole === 'daughter';

  const canEditFamilyName = (isHead || isCoManager || isAdult) && !isViewer && !isChild;
  const [isEditingFamilyName, setIsEditingFamilyName] = useState(false);
  const [familyNameInput, setFamilyNameInput] = useState(family.name);

  useEffect(() => {
    setFamilyNameInput(family.name);
  }, [family.name]);

  // Profile Edit State inside Settings
  const [name, setName] = useState(currentMember.user.name);
  const [email, setEmail] = useState(currentMember.user.email);
  const [avatarUrl, setAvatarUrl] = useState(currentMember.user.avatar_url || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const controlFileInputRef = useRef<HTMLInputElement>(null);

  const handleControlDevicePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvt) => {
        const base64Url = uploadEvt.target?.result as string;
        if (base64Url) {
          setAvatarUrl(base64Url);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  const [notifPreferences, setNotifPreferences] = useState({
    emailAlerts: true,
    spendingAlerts: true,
    requestAlerts: true,
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile(name, email, avatarUrl);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const childLimit = currentMember.monthly_allowance || currentMember.monthly_spending_limit;

  // Generate Role-Scoped Admin / Feature Sections
  const getRoleSections = () => {
    if (isHead) {
      return [
        {
          id: 'members',
          title: 'Members & Roles',
          desc: 'Invite family members, assign system roles, and configure allowances.',
          icon: Users,
          badge: `${members.length} Active Members`,
          color: 'var(--brass)',
        },
        {
          id: 'permissions',
          title: 'Permissions Matrix',
          desc: 'Granular role-based capability overrides and view access controls.',
          icon: KeyRound,
          badge: '28 Fine-Grained Keys',
          color: 'var(--sage)',
        },
        {
          id: 'spending_limits',
          title: 'Spending Limits',
          desc: 'Define monthly caps for children and adult family members.',
          icon: Sliders,
          badge: 'Active Caps Defined',
          color: 'var(--sky)',
        },
        {
          id: 'accounts',
          title: 'Accounts & Vaults',
          desc: 'Manage family bank links, cash reserves, and shared cards.',
          icon: Wallet,
          badge: `${accounts.length} Registered Accounts`,
          color: 'var(--amber)',
        },
        {
          id: 'loans',
          title: 'Loans & Liabilities',
          desc: 'Track home, vehicle, and personal loans, interest rates, and EMI schedules.',
          icon: CreditCard,
          badge: 'EMI & Debt Tracker',
          color: 'var(--rust)',
        },
        {
          id: 'investments',
          title: 'Investments & Portfolio',
          desc: 'Mutual funds, stocks, FDs, gold, bonds, and asset allocation breakdown.',
          icon: TrendingUp,
          badge: 'Wealth Allocation',
          color: 'var(--mint-primary)',
        },
        {
          id: 'split_expenses',
          title: 'Shared Bills & Splitting',
          desc: 'Split family utility bills, household dinners, and manage settlement dues.',
          icon: Split,
          badge: 'Settlement Ledger',
          color: 'var(--sky)',
        },
        {
          id: 'ai_insights',
          title: 'AI Financial Assistant',
          desc: 'Interactive Q&A advisor for spending leaks, savings advice, and forecasts.',
          icon: Sparkles,
          badge: 'Autonomous Insights',
          color: 'var(--brass)',
        },
        {
          id: 'audit',
          title: 'Immutable Audit Trail',
          desc: 'Cryptographically ordered log of every financial decision and permission update.',
          icon: ScrollText,
          badge: `${auditLogs.length} Verified Events`,
          color: 'var(--rust)',
        },
        {
          id: 'security',
          title: 'Security & Sessions',
          desc: 'Active member devices, multi-tenant family isolation, and encryption status.',
          icon: Lock,
          badge: 'Encrypted & Isolated',
          color: 'var(--ink)',
        },
      ];
    }

    if (isCoManager) {
      return [
        {
          id: 'members',
          title: 'Members & Roles',
          desc: 'View family members and manage allowances.',
          icon: Users,
          badge: `${members.length} Members`,
          color: 'var(--brass)',
        },
        {
          id: 'spending_limits',
          title: 'Spending Limits',
          desc: 'View and adjust member monthly spending caps.',
          icon: Sliders,
          badge: 'Spending Caps',
          color: 'var(--sky)',
        },
        {
          id: 'accounts',
          title: 'Accounts & Vaults',
          desc: 'Manage family bank accounts and cash reserves.',
          icon: Wallet,
          badge: `${accounts.length} Accounts`,
          color: 'var(--amber)',
        },
        {
          id: 'loans',
          title: 'Loans & EMI Tracker',
          desc: 'View active family loans and payment schedules.',
          icon: CreditCard,
          badge: 'Debt Tracker',
          color: 'var(--rust)',
        },
        {
          id: 'investments',
          title: 'Investments & Wealth',
          desc: 'Portfolio summary and family asset breakdown.',
          icon: TrendingUp,
          badge: 'Portfolio',
          color: 'var(--mint-primary)',
        },
        {
          id: 'split_expenses',
          title: 'Shared Expenses',
          desc: 'Household utility bills & settlements.',
          icon: Split,
          badge: 'Split Ledger',
          color: 'var(--sky)',
        },
        {
          id: 'security',
          title: 'Security & Sessions',
          desc: 'Active login sessions and credential settings.',
          icon: Lock,
          badge: 'Secure Session',
          color: 'var(--ink)',
        },
      ];
    }

    if (isAdult) {
      return [
        {
          id: 'split_expenses',
          title: 'Shared Bills & Splitting',
          desc: 'View shared household expenses, your balance, and bill settlements.',
          icon: Split,
          badge: 'Bill Splits',
          color: 'var(--sky)',
        },
        {
          id: 'goals',
          title: 'Savings Goals',
          desc: 'View family milestones and track personal savings targets.',
          icon: Target,
          badge: 'Goal Progress',
          color: 'var(--mint-primary)',
        },
        {
          id: 'loans',
          title: 'Personal Loans & EMI',
          desc: 'Track personal EMI schedules and credit liabilities.',
          icon: CreditCard,
          badge: 'Personal EMI',
          color: 'var(--rust)',
        },
        {
          id: 'accounts',
          title: 'Connected Accounts',
          desc: 'View your authorized family accounts and bank cards.',
          icon: Wallet,
          badge: 'Authorized Accounts',
          color: 'var(--amber)',
        },
        {
          id: 'ai_insights',
          title: 'AI Financial Advisor',
          desc: 'Get smart spending advice and budgeting tips.',
          icon: Sparkles,
          badge: 'AI Tips',
          color: 'var(--brass)',
        },
        {
          id: 'security',
          title: 'Personal Security',
          desc: 'Manage your credentials, password, and active login sessions.',
          icon: Lock,
          badge: 'Account Security',
          color: 'var(--ink)',
        },
      ];
    }

    // CHILD role
    return [
      {
        id: 'goals',
        title: 'My Wishlist & Goals',
        desc: 'Set savings targets for gadgets, books, or personal milestones.',
        icon: Target,
        badge: 'Savings Target',
        color: 'var(--mint-primary)',
      },
      {
        id: 'requests',
        title: 'Money Requests',
        desc: 'Request extra allowance or approvals for special purchases.',
        icon: Heart,
        badge: 'Pocket Requests',
        color: 'var(--brass)',
      },
      {
        id: 'ai_insights',
        title: 'AI Money Buddy',
        desc: 'Learn smart saving habits with interactive AI tips.',
        icon: Sparkles,
        badge: 'Smart Learning',
        color: 'var(--sky)',
      },
    ];
  };

  const roleSections = getRoleSections();

  return (
    <div className="content-page" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <img
            src={currentMember.user.avatar_url}
            alt={currentMember.user.name}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid var(--mint-primary)',
              boxShadow: '0 4px 12px rgba(52, 199, 121, 0.25)',
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                {isHead && 'Family Head Control Center'}
                {isCoManager && 'Co-Manager Control Center'}
                {isAdult && 'Member Settings & Preferences'}
                {isChild && 'My Account & Allowance Settings'}
              </h1>
              <span
                className="badge badge-sage"
                style={{
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  background: isHead ? 'var(--mint-pill)' : 'var(--paper-dim)',
                  color: isHead ? 'var(--mint-primary)' : 'var(--brass)',
                  border: '1px solid var(--border-card)',
                }}
              >
                {role.replace('_', ' ')}
              </span>
            </div>
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem', marginTop: '0.2rem' }}>
              {isHead && `Centralized administrative governance & security for ${family.name}`}
              {isCoManager && `Co-managing budgets, spending limits & vault accounts for ${family.name}`}
              {isAdult && `Personal profile, preferences, shared bill splits & credentials for ${currentMember.user.name}`}
              {isChild && `Personal pocket balance, wishlist goals & avatar preferences for ${currentMember.user.name}`}
            </p>
          </div>
        </div>

        {/* Data Import trigger for Family Head */}
        {isHead && onOpenImportModal && (
          <button
            className="btn btn-secondary"
            onClick={onOpenImportModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderColor: 'var(--sky-accent)',
              color: 'var(--sky-accent)',
              background: 'rgba(62, 139, 245, 0.08)',
              fontWeight: 700,
            }}
          >
            <UploadCloud size={16} />
            <span>Import Family Data (Excel/PDF)</span>
          </button>
        )}
      </div>

      {/* Tenancy & Role Info Card */}
      <div
        className="card"
        style={{
          marginBottom: '1.75rem',
          background: 'linear-gradient(135deg, var(--paper-card), var(--paper-dim))',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--brass)' }}>
              Family Tenancy & Role Access Scope
            </div>
            {canEditFamilyName ? (
              isEditingFamilyName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <input
                    type="text"
                    className="input"
                    value={familyNameInput}
                    onChange={e => setFamilyNameInput(e.target.value)}
                    style={{ fontSize: '1.05rem', fontWeight: 700, padding: '0.35rem 0.65rem', maxWidth: '280px' }}
                    autoFocus
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      if (familyNameInput.trim()) {
                        updateFamilyName(familyNameInput);
                        setIsEditingFamilyName(false);
                      }
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setFamilyNameInput(family.name);
                      setIsEditingFamilyName(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem' }}>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                    {family.name}
                  </div>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setFamilyNameInput(family.name);
                      setIsEditingFamilyName(true);
                    }}
                    title="Change Family Name"
                    style={{
                      padding: '0.2rem 0.55rem',
                      fontSize: '0.72rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      borderColor: 'var(--mint-primary)',
                      color: 'var(--mint-primary)',
                      background: 'var(--mint-pill)',
                      fontWeight: 700,
                    }}
                  >
                    <Edit3 size={13} />
                    <span>Edit Name</span>
                  </button>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem' }}>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                  {family.name}
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--ink-muted)',
                    background: 'var(--paper-dim)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-card)',
                    fontWeight: 600,
                  }}
                >
                  Read-only (Head & Spouse only)
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Globe size={14} color="var(--mint-primary)" /> Timezone: {family.timezone}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Coins size={14} color="var(--mint-primary)" /> Default Currency: {family.currency} (₹ INR)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Shield size={14} color="var(--mint-primary)" /> Scope: {isHead ? 'Full Administrative' : isChild ? 'Child Personal' : 'Member Scope'}
              </span>
            </div>
          </div>

          {/* Child Allowance Badge or Security Chip */}
          {isChild && childLimit ? (
            <div
              style={{
                background: 'var(--mint-pill)',
                border: '1px solid var(--mint-primary)',
                padding: '0.65rem 1.15rem',
                borderRadius: '16px',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--mint-primary)', fontWeight: 700 }}>
                Monthly Pocket Money Cap
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                {formatPaise(childLimit)}
              </div>
            </div>
          ) : (
            <div className="sync-chip">
              <CheckCircle size={14} />
              <span>Role Privacy Scoping: Enforced</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Left Personal Profile & Preferences Form, Right Role-Scoped Feature Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Left Column: Personal Profile & Settings Form */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', borderBottom: '1px solid var(--line-subtle)', paddingBottom: '0.75rem' }}>
            <User size={18} color="var(--mint-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              Personal Profile & Preferences
            </h2>
          </div>

          {saveSuccess && (
            <div
              style={{
                background: 'var(--mint-light)',
                color: 'var(--mint-primary)',
                padding: '0.65rem 0.85rem',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
            >
              <Check size={16} /> Profile & preference settings updated!
            </div>
          )}

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="label" style={{ fontSize: '0.78rem' }}>Display Name</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="label" style={{ fontSize: '0.78rem' }}>Email Address</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@family.sync"
                required
              />
            </div>

            <div>
              <label className="label" style={{ fontSize: '0.78rem' }}>Profile Photo Selection</label>
              <input
                ref={controlFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleControlDevicePhotoSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => controlFileInputRef.current?.click()}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  borderColor: 'var(--mint-primary)',
                  background: 'var(--mint-pill)',
                  color: 'var(--mint-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                <UploadCloud size={16} /> Choose Photo from Device
              </button>
            </div>

            {/* Display Theme Selector */}
            <div>
              <label className="label" style={{ fontSize: '0.78rem' }}>Display Theme Mode</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => theme !== 'light' && toggleTheme()}
                  className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, justifyContent: 'center', gap: '0.4rem' }}
                >
                  <Sun size={14} /> Light Mode
                </button>
                <button
                  type="button"
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, justifyContent: 'center', gap: '0.4rem' }}
                >
                  <Moon size={14} /> Dark Mode
                </button>
              </div>
            </div>

            {/* Notification Preferences */}
            <div style={{ background: 'var(--paper-dim)', padding: '0.85rem', borderRadius: '14px', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Bell size={14} color="var(--mint-primary)" /> Notification Alerts
              </div>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifPreferences.spendingAlerts}
                  onChange={e => setNotifPreferences({ ...notifPreferences, spendingAlerts: e.target.checked })}
                />
                <span>Spending & transaction alerts</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--ink-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifPreferences.requestAlerts}
                  onChange={e => setNotifPreferences({ ...notifPreferences, requestAlerts: e.target.checked })}
                />
                <span>Money approval request updates</span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}>
              Save Settings & Preferences
            </button>
          </form>
        </div>

        {/* Right Column: Role-Scoped Feature & Setting Modules Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', paddingBottom: '0.25rem' }}>
            <SlidersHorizontal size={18} color="var(--mint-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              {isHead ? 'Administrative Modules & Controls' : 'Role Features & Controls'}
            </h2>
          </div>

          <div className="grid-responsive-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {roleSections.map(section => {
              const IconComp = section.icon;
              return (
                <div
                  key={section.id}
                  className="card"
                  onClick={() => setActiveTab(section.id)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                      <div
                        className="brand-icon-wrap"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '10px',
                          borderColor: section.color,
                        }}
                      >
                        <IconComp size={18} color={section.color} />
                      </div>
                      <span className="badge" style={{ background: 'var(--paper-dim)', border: '1px solid var(--line)', fontSize: '0.68rem' }}>
                        {section.badge}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.25rem' }}>
                      {section.title}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                      {section.desc}
                    </p>
                  </div>

                  <div
                    style={{
                      marginTop: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--mint-primary)',
                    }}
                  >
                    <span>Open Module</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>


      </div>
    </div>
  );
};

export default ControlCenterPage;
