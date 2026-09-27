/* =========================================================
   MEMBERS & ROLES MANAGEMENT
   Sections 6, 16, 17, 18, 19, 31
   ========================================================= */

import React, { useState, useMemo, useEffect } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { usePermissions } from '../../context/FamilyContext';
import { formatPaise, paiseToRupees, rupeesToPaise } from '../../utils/currency';
import { ROLE_DISPLAY_NAMES, normalizeRole } from '../../utils/permissions';
import { SystemRoleType, FamilyMember } from '../../types';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Mail,
  Sliders,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldPlus,
  AlertTriangle,
  X,
  Phone,
  Calendar,
  MapPin,
  Lock,
  Settings,
  Home,
  Edit3,
  Check,
  Copy,
  Key,
} from 'lucide-react';
import { InvitationModal } from '../../components/modals/InvitationModal';
import { CreateRoleModal } from '../../components/modals/CreateRoleModal';
import { AccessRestricted } from '../../components/auth/AccessRestricted';
import { useViewSettings } from '../../context/ViewSettingsContext';
import {
  getPendingFamilyJoinRequests,
  approveFamilyJoinRequest,
  rejectFamilyJoinRequest,
  FamilyJoinRequestRecord,
} from '../../services/familyService';

interface MembersPageProps {
  onNavigatePermissions?: () => void;
}

export const MembersPage: React.FC<MembersPageProps> = ({ onNavigatePermissions }) => {
  const {
    family,
    activeFamily,
    activeFamilyMembers,
    updateFamilyName,
    members,
    currentMember,
    roles,
    transactions,
    updateMemberRole,
    updateMemberLimit,
    updateMemberSharing,
    removeMember,
    invitations,
    revokeInvitation,
    isDemoMode,
  } = useFamilyFinance();

  const { can, isFamilyHead } = usePermissions();
  const { openViewSettingsModal } = useViewSettings();

  const normRole = (currentMember?.role || '').toLowerCase();
  const isHead = isFamilyHead || normRole === 'family_head' || normRole.includes('head');
  const isCoManager = normRole.includes('spouse') || normRole.includes('co_manager') || normRole.includes('comanager');
  const isAdult = normRole.includes('adult');
  const isViewer = normRole.includes('viewer');
  const isChild = normRole.includes('child') || normRole === 'son' || normRole === 'daughter';

  // Only authorized family members can edit the family name
  const canEditFamilyName = (isHead || isCoManager || isAdult) && !isViewer && !isChild;

  const [isEditingFamilyName, setIsEditingFamilyName] = useState(false);
  const [familyNameInput, setFamilyNameInput] = useState(family?.name || '');
  const [nameSaveFeedback, setNameSaveFeedback] = useState(false);

  useEffect(() => {
    if (family?.name) {
      setFamilyNameInput(family.name);
    }
  }, [family?.name]);

  const handleSaveFamilyName = () => {
    const trimmed = familyNameInput.trim();
    if (!trimmed) return;
    updateFamilyName(trimmed);
    setIsEditingFamilyName(false);
    setNameSaveFeedback(true);
    setTimeout(() => setNameSaveFeedback(false), 2500);
  };

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [createRoleModalOpen, setCreateRoleModalOpen] = useState(false);
  const [editingLimitMemberId, setEditingLimitMemberId] = useState<string | null>(null);
  const [limitRupeesInput, setLimitRupeesInput] = useState('');

  // Remove Member Confirmation Dialog State (Section 31)
  const [memberToRemove, setMemberToRemove] = useState<FamilyMember | null>(null);

  // View Member Profile Modal State
  const [memberToView, setMemberToView] = useState<FamilyMember | null>(null);

  // Pending Family Join Requests (from devices/members using the family code)
  const [pendingJoinRequests, setPendingJoinRequests] = useState<FamilyJoinRequestRecord[]>([]);
  const [joinRequestFeedback, setJoinRequestFeedback] = useState<string>('');
  const [copiedFamilyCode, setCopiedFamilyCode] = useState(false);

  const loadJoinRequests = async () => {
    if (family?.id) {
      const list = await getPendingFamilyJoinRequests(family.id);
      setPendingJoinRequests(list);
    }
  };

  useEffect(() => {
    if (isHead && family?.id) {
      loadJoinRequests();
    }
  }, [family?.id, isHead]);

  const handleApproveJoin = async (requestId: string) => {
    const res = await approveFamilyJoinRequest(requestId);
    if (res.success) {
      setJoinRequestFeedback('Member join request approved! They are now linked to this family workspace.');
      await loadJoinRequests();
      setTimeout(() => setJoinRequestFeedback(''), 4000);
    }
  };

  const handleRejectJoin = async (requestId: string) => {
    const res = await rejectFamilyJoinRequest(requestId);
    if (res.success) {
      setJoinRequestFeedback('Member join request declined.');
      await loadJoinRequests();
      setTimeout(() => setJoinRequestFeedback(''), 4000);
    }
  };

  // Filter all members linked to the active family workspace
  const currentFamilyMembers = useMemo(() => {
    if (activeFamilyMembers && activeFamilyMembers.length > 0) {
      return activeFamilyMembers;
    }
    const targetFamId = family?.id || activeFamily?.id;
    return members.filter(m => {
      if (m.family_id === targetFamId) return true;
      if (!targetFamId && isDemoMode) return true;
      return false;
    });
  }, [activeFamilyMembers, members, family?.id, activeFamily?.id, isDemoMode]);

  if (!can('viewMembers')) {
    return <AccessRestricted message="You don't have permission to view family members." />;
  }

  const pendingInvitations = invitations.filter(inv => inv.status === 'PENDING');

  const handleSaveLimit = (memberId: string) => {
    const paise = rupeesToPaise(limitRupeesInput);
    updateMemberLimit(memberId, paise);
    setEditingLimitMemberId(null);
  };

  const handleConfirmRemove = () => {
    if (!memberToRemove) return;
    removeMember(memberToRemove.id);
    setMemberToRemove(null);
  };

  return (
    <div className="content-page" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
            Family Members & Roles
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Manage family member access, financial sharing settings, and customized roles
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {canEditFamilyName && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setFamilyNameInput(family.name);
                setIsEditingFamilyName(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Edit3 size={14} color="var(--mint-primary)" />
              <span>Edit Family Name</span>
            </button>
          )}

          {isHead && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setCreateRoleModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <ShieldPlus size={15} color="var(--primary)" />
                <span>Create Role</span>
              </button>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => setInviteModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <UserPlus size={15} />
                <span>Invite Family Member</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Family Identity & Workspace Name Card */}
      <div
        className="neo-card"
        style={{
          marginBottom: '1.5rem',
          padding: '1.15rem 1.45rem',
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 340px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.22)',
              flexShrink: 0,
            }}
          >
            <Home size={22} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--mint-primary)',
                }}
              >
                Family Workspace Name
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  background: 'var(--card-bg-subtle)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  fontWeight: 600,
                }}
              >
                {currentFamilyMembers.length} Linked Members
              </span>
              {nameSaveFeedback && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: '#059669',
                    background: 'rgba(5, 150, 105, 0.12)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                  }}
                >
                  ✓ Name Updated
                </span>
              )}
            </div>

            {isEditingFamilyName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="input"
                  value={familyNameInput}
                  onChange={e => setFamilyNameInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveFamilyName();
                    if (e.key === 'Escape') {
                      setFamilyNameInput(family.name);
                      setIsEditingFamilyName(false);
                    }
                  }}
                  placeholder="Enter family name..."
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    padding: '0.35rem 0.65rem',
                    maxWidth: '300px',
                    height: '36px',
                  }}
                  autoFocus
                />
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleSaveFamilyName}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', height: '36px' }}
                >
                  <Check size={14} />
                  <span>Save</span>
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setFamilyNameInput(family.name);
                    setIsEditingFamilyName(false);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', height: '36px' }}
                >
                  <X size={14} />
                  <span>Cancel</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h2
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    margin: 0,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {family.name}
                </h2>

                {canEditFamilyName ? (
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
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      borderColor: 'var(--mint-primary)',
                      color: 'var(--mint-primary)',
                      background: 'rgba(5, 150, 105, 0.08)',
                      fontWeight: 700,
                    }}
                  >
                    <Edit3 size={13} />
                    <span>Change Name</span>
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      background: 'var(--card-bg-subtle)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-card)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontWeight: 600,
                    }}
                    title="Only family members can change the family name"
                  >
                    <Lock size={11} />
                    <span>Family members only</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right side info pill & Family Code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {(family?.family_code || family?.invite_code || activeFamily?.family_code || activeFamily?.invite_code) && (
            <div
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '12px',
                background: 'rgba(5, 150, 105, 0.08)',
                border: '1px solid rgba(5, 150, 105, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Family Code
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, fontFamily: 'monospace', color: '#059669', letterSpacing: '0.5px' }}>
                  {family?.family_code || family?.invite_code || activeFamily?.family_code || activeFamily?.invite_code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const code = family?.family_code || family?.invite_code || activeFamily?.family_code || activeFamily?.invite_code || '';
                  navigator.clipboard.writeText(code);
                  setCopiedFamilyCode(true);
                  setTimeout(() => setCopiedFamilyCode(false), 2000);
                }}
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                title="Copy Family Code"
              >
                {copiedFamilyCode ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                <span>{copiedFamilyCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          <div
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '12px',
              background: 'var(--card-bg-subtle)',
              border: '1px solid var(--border-subtle)',
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Permissions Rule
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: canEditFamilyName ? 'var(--mint-primary)' : 'var(--text-muted)' }}>
              {canEditFamilyName ? '✓ Authorized to change name' : '🔒 Read-only for this role'}
            </div>
          </div>
        </div>
      </div>

      {/* Active Pending Invitations Section */}
      {isHead && pendingInvitations.length > 0 && (
        <div
          className="neo-card"
          style={{
            marginBottom: '1.5rem',
            border: '1px solid rgba(5, 150, 105, 0.3)',
            background: 'rgba(5, 150, 105, 0.05)',
            padding: '1.15rem',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: '#059669',
              marginBottom: '0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Users size={18} /> Active Pending Invitations ({pendingInvitations.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingInvitations.map(inv => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-canvas, #FFF)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 700 }}>Code: {inv.invite_code}</span> • Role:{' '}
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    {ROLE_DISPLAY_NAMES[normalizeRole(inv.invited_role)] || inv.invited_role}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Link: {inv.invite_link}</div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => revokeInvitation(inv.id)}
                  style={{ color: '#EF4444', borderColor: '#EF4444', fontSize: '0.72rem' }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action feedback for join request approval */}
      {joinRequestFeedback && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            background: 'rgba(5, 150, 105, 0.1)',
            border: '1px solid rgba(5, 150, 105, 0.25)',
            color: '#059669',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{joinRequestFeedback}</span>
        </div>
      )}

      {/* Pending Family Code Join Requests from other devices/members */}
      {isHead && pendingJoinRequests.length > 0 && (
        <div
          className="neo-card"
          style={{
            marginBottom: '1.5rem',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            background: 'rgba(16, 185, 129, 0.05)',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: '1rem',
              color: 'var(--mint-primary)',
              marginBottom: '0.45rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <UserPlus size={19} /> Pending Member Join Requests ({pendingJoinRequests.length})
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            These family members entered your unique Family Code on another device and are requesting to link into this workspace. As Family Head, you can approve or decline their access:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {pendingJoinRequests.map(req => (
              <div
                key={req.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-card)',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                    {req.applicant_name || 'New Family Member'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    <Mail size={12} style={{ display: 'inline', marginRight: '0.3rem' }} />
                    {req.applicant_email || 'Linked Device / Code Request'}
                    <span style={{ margin: '0 0.4rem' }}>•</span>
                    Requested {new Date(req.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleApproveJoin(req.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 700 }}
                  >
                    <CheckCircle2 size={14} /> Approve &amp; Link Member
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleRejectJoin(req.id)}
                    style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.4)', fontSize: '0.78rem' }}
                  >
                    <XCircle size={14} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members Grid (Section 16) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {currentFamilyMembers.map(m => {
          const isMe = m.id === currentMember.id;
          const isThisHead = normalizeRole(m.role) === 'family_head';
          const isEditingLimit = editingLimitMemberId === m.id;

          // Member monthly stats
          const memberTxs = transactions.filter(t => t.user_id === m.user_id);
          const memberIncome = memberTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const memberExpense = memberTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

          return (
            <div
              key={m.id}
              className="neo-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: isThisHead ? '4px solid #059669' : undefined,
              }}
            >
              <div>
                {/* Member Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <img
                      src={m.user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=member'}
                      alt={m.user.name}
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                          {m.user.name}
                        </span>
                        {isMe && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px',
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#6366F1',
                            }}
                          >
                            YOU
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '4px',
                            background: 'rgba(5, 150, 105, 0.12)',
                            color: '#059669',
                          }}
                        >
                          ACTIVE
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                        <Mail size={12} />
                        {isMe || isHead ? m.user.email : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Lock size={11} /> Private
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Role Badge / Switcher */}
                  <div>
                    {isHead ? (
                      <select
                        className="select"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 700 }}
                        value={m.role}
                        onChange={e => {
                          const newRole = e.target.value as SystemRoleType;
                          if (newRole === 'FAMILY_HEAD' && !isThisHead) {
                            if (window.confirm(`Transfer Family Head ownership to ${m.user.name}? You will promote them to Family Head.`)) {
                              updateMemberRole(m.id, newRole);
                            }
                          } else {
                            updateMemberRole(m.id, newRole);
                          }
                        }}
                      >
                        <option value="FAMILY_HEAD">👑 Family Head (Owner)</option>
                        <option value="CO_MANAGER">🛡️ Co-Manager</option>
                        <option value="ADULT_MEMBER">👤 Adult Member</option>
                        <option value="spouse">💍 Spouse</option>
                        <option value="son">👦 Son</option>
                        <option value="daughter">👧 Daughter</option>
                        <option value="grandparent">👵 Grand Parent</option>
                        <option value="viewer">👁️ Viewer (Read Only)</option>
                        {roles.filter(r => r.is_custom).map(r => (
                          <option key={r.id} value={r.id}>
                            ⚙️ {r.name} (Custom)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          background: isThisHead ? 'rgba(5, 150, 105, 0.15)' : 'rgba(99, 102, 241, 0.12)',
                          color: isThisHead ? '#059669' : '#6366F1',
                          textTransform: 'uppercase',
                        }}
                      >
                        {ROLE_DISPLAY_NAMES[normalizeRole(m.role)] || m.role.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Monthly Financial Stats (Income & Expense) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.65rem',
                    background: 'var(--bg-canvas, rgba(0,0,0,0.02))',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Monthly Income
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.98rem', color: '#059669', marginTop: '0.15rem' }}>
                      {formatPaise(memberIncome)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Monthly Expenses
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.98rem', color: '#EF4444', marginTop: '0.15rem' }}>
                      {formatPaise(memberExpense)}
                    </div>
                  </div>
                </div>

                {/* Financial Sharing Controls (Section 8 & 16) */}
                <div
                  style={{
                    background: 'var(--bg-card-secondary, rgba(0,0,0,0.015))',
                    border: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Shared Financial Data
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Income Sharing</span>
                    <button
                      type="button"
                      disabled={!isHead && !isMe}
                      onClick={() => updateMemberSharing(m.id, !m.income_sharing_enabled, m.expense_sharing_enabled !== false)}
                      style={{
                        border: 'none',
                        background: m.income_sharing_enabled ? 'rgba(5, 150, 105, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                        color: m.income_sharing_enabled ? '#059669' : '#EF4444',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: (isHead || isMe) ? 'pointer' : 'default',
                      }}
                    >
                      {m.income_sharing_enabled ? '✓ Enabled' : '✕ Disabled'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Expense Sharing</span>
                    <button
                      type="button"
                      disabled={!isHead && !isMe}
                      onClick={() => updateMemberSharing(m.id, m.income_sharing_enabled !== false, !m.expense_sharing_enabled)}
                      style={{
                        border: 'none',
                        background: m.expense_sharing_enabled ? 'rgba(5, 150, 105, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                        color: m.expense_sharing_enabled ? '#059669' : '#EF4444',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: (isHead || isMe) ? 'pointer' : 'default',
                      }}
                    >
                      {m.expense_sharing_enabled ? '✓ Enabled' : '✕ Disabled'}
                    </button>
                  </div>
                </div>

                {/* Allowance or Spending Limit Cap */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-canvas, rgba(0,0,0,0.02))',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      Spending Cap:{' '}
                    </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {formatPaise(m.monthly_spending_limit || 0)}
                    </strong>
                  </div>

                  {isHead && !isEditingLimit && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => {
                        setEditingLimitMemberId(m.id);
                        setLimitRupeesInput(String(paiseToRupees(m.monthly_spending_limit || 0)));
                      }}
                    >
                      <Sliders size={12} /> Adjust Cap
                    </button>
                  )}
                </div>

                {/* Inline Limit Editor */}
                {isEditingLimit && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      display: 'flex',
                      gap: '0.35rem',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="number"
                      className="input"
                      value={limitRupeesInput}
                      onChange={e => setLimitRupeesInput(e.target.value)}
                      placeholder="Amount in ₹"
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveLimit(m.id)}>
                      Save
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingLimitMemberId(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons: [ View ] [ Permissions ] [ Remove ] (Section 16 & 31) */}
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => setMemberToView(m)}
                >
                  <Eye size={13} /> View
                </button>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {onNavigatePermissions && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.78rem' }}
                      onClick={onNavigatePermissions}
                    >
                      <Shield size={13} /> Permissions
                    </button>
                  )}

                  {isHead && !isThisHead && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.4)', fontSize: '0.78rem' }}
                      onClick={() => setMemberToRemove(m)}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= SECTION 31: REMOVE MEMBER CONFIRMATION DIALOG ================= */}
      {memberToRemove && (
        <div className="modal-backdrop" onClick={() => setMemberToRemove(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} color="#EF4444" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#EF4444', margin: 0 }}>
                  Remove Family Member?
                </h3>
              </div>
              <button className="btn btn-icon btn-sm" onClick={() => setMemberToRemove(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', margin: 0 }}>
                Are you sure you want to remove this member?
              </p>

              <div
                style={{
                  background: 'var(--bg-canvas, rgba(0,0,0,0.03))',
                  padding: '1rem',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <img
                  src={memberToRemove.user.avatar_url}
                  alt={memberToRemove.user.name}
                  style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{memberToRemove.user.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Role: {ROLE_DISPLAY_NAMES[normalizeRole(memberToRemove.role)] || memberToRemove.role}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                This will remove their active membership from this family workspace. Their historical financial logs will remain preserved in the ledger for accounting integrity.
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setMemberToRemove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmRemove}
                style={{ fontWeight: 600 }}
              >
                Remove Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Member Profile Modal */}
      {memberToView && (
        <div className="modal-backdrop" onClick={() => setMemberToView(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Family Member Profile</h3>
              <button className="btn btn-icon btn-sm" onClick={() => setMemberToView(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img
                  src={memberToView.user.avatar_url}
                  alt={memberToView.user.name}
                  style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-main)' }}>
                    {memberToView.user.name}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {(isHead || memberToView.id === currentMember.id)
                      ? memberToView.user.email
                      : <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontStyle: 'italic' }}><Lock size={12} /> Private — only visible to owner or Family Head</span>
                    }
                  </div>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '0.35rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: '#6366F1',
                    }}
                  >
                    {ROLE_DISPLAY_NAMES[normalizeRole(memberToView.role)] || memberToView.role}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Phone</span>
                  <div style={{ fontWeight: 600 }}>
                    {(isHead || memberToView.id === currentMember.id)
                      ? (memberToView.user.phone || '+91 98401 23456')
                      : <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.78rem' }}><Lock size={11} /> Private</span>
                    }
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Date of Birth</span>
                  <div style={{ fontWeight: 600 }}>
                    {(isHead || memberToView.id === currentMember.id)
                      ? (memberToView.user.date_of_birth || '24 February 2007')
                      : <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.78rem' }}><Lock size={11} /> Private</span>
                    }
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Location</span>
                  <div style={{ fontWeight: 600 }}>{memberToView.user.location || 'Madurai, Tamil Nadu'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Account Created</span>
                  <div style={{ fontWeight: 600 }}>1 Jan 2026</div>
                </div>
              </div>

              {memberToView.user.bio && (
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>About</span>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>{memberToView.user.bio}</div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setMemberToView(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Custom Role Modal */}
      <CreateRoleModal
        isOpen={createRoleModalOpen}
        onClose={() => setCreateRoleModalOpen(false)}
      />

      {/* Invite Member Modal */}
      <InvitationModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      />
    </div>
  );
};
