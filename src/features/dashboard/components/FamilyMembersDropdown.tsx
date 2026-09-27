/* =========================================================
   FAMILY MEMBERS DROPDOWN (Bottom Floating Bar Interactive Dropdown)
   - Replaces static link button with an interactive popover dropdown
   - Shows each family member's real monthly income, expense (spending), and net surplus
   - Clicking a member dynamically filters the dashboard & overview chart
   - Features quick "All Family" reset and direct link to Members Admin Panel
   ========================================================= */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FamilyMember, Transaction } from '../../../types';
import { formatPaise } from '../../../utils/currency';
import { ROLE_DISPLAY_NAMES, normalizeRole } from '../../../utils/permissions';
import {
  Users,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
} from 'lucide-react';

interface FamilyMembersDropdownProps {
  members: FamilyMember[];
  transactions: Transaction[];
  totalIncomePaise: number;
  totalExpensePaise: number;
  selectedMemberId: string;
  onSelectMember: (memberId: string) => void;
  onNavigateToMembers?: () => void;
  variant?: 'header' | 'pill';
}

function getRoleEmoji(role: string): string {
  const r = role?.toLowerCase() || '';
  if (r.includes('head')) return '👑';
  if (r.includes('spouse') || r.includes('co_manager')) return '💼';
  if (r.includes('son') || r.includes('child')) return '🎒';
  if (r.includes('daughter')) return '🎒';
  if (r.includes('grand')) return '👵';
  return '👤';
}

export const FamilyMembersDropdown: React.FC<FamilyMembersDropdownProps> = ({
  members,
  transactions,
  totalIncomePaise,
  totalExpensePaise,
  selectedMemberId,
  onSelectMember,
  onNavigateToMembers,
  variant = 'header',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Aggregate monthly stats for each member
  const memberStats = useMemo(() => {
    return members.map(m => {
      const mTx = transactions.filter(t => t.user_id === m.user_id);
      const inc = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const net = inc - exp;
      return {
        member: m,
        income: inc,
        expense: exp,
        net,
        txCount: mTx.length,
      };
    });
  }, [members, transactions]);

  const activeMember = useMemo(() => {
    if (selectedMemberId === 'all' || selectedMemberId === 'shared') return null;
    return members.find(m => m.user_id === selectedMemberId);
  }, [selectedMemberId, members]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* 1. Interactive Button Trigger */}
      {variant === 'pill' ? (
        <button
          type="button"
          className="trust-pill-btn"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.55rem',
            background: selectedMemberId !== 'all' ? 'linear-gradient(135deg, #1E5C4E 0%, #174A3E 100%)' : '#2E6A5B',
            border: selectedMemberId !== 'all' ? '1px solid var(--amber-accent)' : 'none',
            boxShadow: selectedMemberId !== 'all' ? '0 0 12px rgba(229, 161, 30, 0.3)' : '0 4px 14px rgba(34, 90, 77, 0.25)',
          }}
          title="Click to view family members spending & income dropdown"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Users size={16} />
            {activeMember ? (
              <span style={{ fontWeight: 700, color: '#FFFFFF' }}>
                {getRoleEmoji(activeMember.role)} {activeMember.user.name.split(' ')[0]} (Filter Active)
              </span>
            ) : (
              <span>{members.length} Active Family Members</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {activeMember && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onSelectMember('all');
                }}
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  border: 'none',
                  color: '#FFF',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  marginRight: '0.15rem',
                }}
                title="Reset to All Family"
              >
                <X size={11} />
              </button>
            )}
            {isOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </div>
        </button>
      ) : (
        /* Header variant: Sleek capsule dropdown button */
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: selectedMemberId !== 'all' ? 'rgba(229, 161, 30, 0.12)' : 'var(--bg-canvas)',
            border: selectedMemberId !== 'all' ? '1.5px solid var(--amber-accent)' : '1px solid var(--border-card)',
            borderRadius: '9999px',
            padding: '0.28rem 0.75rem',
            fontSize: '0.74rem',
            fontWeight: 700,
            color: selectedMemberId !== 'all' ? 'var(--amber-accent)' : 'var(--text-main)',
            cursor: 'pointer',
            outline: 'none',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            transition: 'all 0.18s ease',
          }}
          title="Click to view family members spending & income dropdown"
        >
          <Users size={13} color={selectedMemberId !== 'all' ? 'var(--amber-accent)' : 'var(--mint-primary)'} />
          {activeMember ? (
            <span>{getRoleEmoji(activeMember.role)} {activeMember.user.name.split(' ')[0]}</span>
          ) : (
            <span>👥 All Family ({members.length})</span>
          )}
          {activeMember && (
            <span
              onClick={e => {
                e.stopPropagation();
                onSelectMember('all');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 15,
                height: 15,
                borderRadius: '50%',
                background: 'rgba(229, 161, 30, 0.25)',
                marginLeft: '0.1rem',
              }}
              title="Reset filter"
            >
              <X size={9} />
            </span>
          )}
          <ChevronDown
            size={13}
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.18s ease',
            }}
          />
        </button>
      )}

      {/* 2. Floating Popover Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            ...(variant === 'pill'
              ? { bottom: 'calc(100% + 10px)', left: 0 }
              : { top: 'calc(100% + 8px)', right: 0 }),
            width: '380px',
            maxWidth: '92vw',
            background: 'var(--card-bg, #16221C)',
            border: '1.5px solid var(--border-card, rgba(52, 199, 121, 0.25))',
            borderRadius: '20px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            zIndex: 1000,
            animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            maxHeight: '440px',
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {/* Popover Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Users size={15} color="var(--mint-primary)" />
                <span>Family Members Spending</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                Click a member to inspect their individual flow & spending
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: 'var(--text-muted)',
                borderRadius: '50%',
                width: 28,
                height: 28,
                minWidth: 28,
                minHeight: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Option 1: All Family Overview */}
          <div
            onClick={() => {
              onSelectMember('all');
              setIsOpen(false);
            }}
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '12px',
              border: selectedMemberId === 'all' ? '1.5px solid var(--mint-primary)' : '1px solid var(--border-subtle)',
              background: selectedMemberId === 'all' ? 'rgba(34, 160, 91, 0.14)' : 'var(--bg-canvas)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '10px',
                  background: 'rgba(34, 160, 91, 0.2)',
                  color: 'var(--mint-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                }}
              >
                👥
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-main)' }}>
                  All Family Overview
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Aggregated Household Ledger
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--mint-primary)', fontWeight: 700 }}>
                +{formatPaise(totalIncomePaise)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--coral-accent)', fontWeight: 700 }}>
                -{formatPaise(totalExpensePaise)}
              </div>
            </div>
          </div>

          {/* Option 2: Shared Operations */}
          <div
            onClick={() => {
              onSelectMember('shared');
              setIsOpen(false);
            }}
            style={{
              padding: '0.6rem 0.85rem',
              borderRadius: '12px',
              border: selectedMemberId === 'shared' ? '1.5px solid var(--sky-accent)' : '1px solid var(--border-subtle)',
              background: selectedMemberId === 'shared' ? 'rgba(62, 139, 245, 0.14)' : 'var(--bg-canvas)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '10px',
                  background: 'rgba(62, 139, 245, 0.2)',
                  color: 'var(--sky-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.95rem',
                }}
              >
                🏠
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-main)' }}>
                  Shared Household
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  Common Bills & Shared Accounts
                </div>
              </div>
            </div>

            {selectedMemberId === 'shared' && (
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--sky-accent)' }}>
                ✓ Selected
              </span>
            )}
          </div>

          {/* List of Individual Family Members */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', paddingLeft: '0.2rem', marginTop: '0.2rem' }}>
              Family Members:
            </div>

            {memberStats.map(({ member: m, income, expense, net }) => {
              const isSelected = selectedMemberId === m.user_id;
              const roleEmoji = getRoleEmoji(m.role);
              const roleName = ROLE_DISPLAY_NAMES[normalizeRole(m.role)] || m.role;

              return (
                <div
                  key={m.id || m.user_id}
                  onClick={() => {
                    onSelectMember(m.user_id);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '12px',
                    border: isSelected ? '1.5px solid var(--amber-accent)' : '1px solid var(--border-subtle)',
                    background: isSelected ? 'rgba(229, 161, 30, 0.14)' : 'var(--bg-canvas)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Left: Avatar & Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ position: 'relative' }}>
                      <img
                        src={m.user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                        alt={m.user.name}
                        style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: '#22A05B',
                          border: '1.5px solid var(--card-bg, #FFF)',
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>{m.user.name}</span>
                        {isSelected && (
                          <span style={{ fontSize: '0.6rem', color: 'var(--amber-accent)', fontWeight: 800 }}>
                            ● Active
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span>{roleEmoji}</span>
                        <span>{roleName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Income & Expense (Spending) */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', fontSize: '0.76rem', color: 'var(--mint-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      <ArrowDownLeft size={12} />
                      <span>{formatPaise(income)}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', fontSize: '0.74rem', color: 'var(--coral-accent)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      <ArrowUpRight size={12} />
                      <span>{formatPaise(expense)}</span>
                    </div>

                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Spent {formatPaise(expense)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Action: Manage in Admin Panel */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigateToMembers?.();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--mint-primary)',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.2rem 0.5rem',
              }}
            >
              <span>Manage Members & Roles in Admin Panel</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
