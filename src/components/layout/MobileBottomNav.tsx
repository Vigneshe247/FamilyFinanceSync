/* =========================================================
   MOBILE BOTTOM NAVIGATION & EXPANDABLE "MORE" SHEET
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  GitPullRequest,
  Menu,
  X,
  Calculator,
  BarChart3,
  CalendarClock,
  ShieldCheck,
  Users,
  KeyRound,
  Sliders,
  Wallet,
  ScrollText,
  Lock,
  ScanLine,
  Landmark,
  Bot,
  RotateCcw,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { currentMember, requests, hasPermission } = useFamilyFinance();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;
  const isHead = currentMember.role === 'FAMILY_HEAD';
  const isCoManager = currentMember.role === 'CO_MANAGER';
  const isChild = currentMember.role === 'CHILD';

  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    setMoreSheetOpen(false);
  };

  return (
    <>
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleSelectTab('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Home</span>
        </button>

        {hasPermission('transactions.view') && (
          <button
            className={`mobile-nav-btn ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => handleSelectTab('transactions')}
          >
            <Receipt size={20} />
            <span>Activity</span>
          </button>
        )}

        {!isChild && hasPermission('budgets.view') && (
          <button
            className={`mobile-nav-btn ${activeTab === 'budgets' ? 'active' : ''}`}
            onClick={() => handleSelectTab('budgets')}
          >
            <PiggyBank size={20} />
            <span>Budget</span>
          </button>
        )}

        {hasPermission('requests.view') && (
          <button
            className={`mobile-nav-btn ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => handleSelectTab('requests')}
            style={{ position: 'relative' }}
          >
            <GitPullRequest size={20} />
            <span>Requests</span>
            {pendingRequestsCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '12px',
                  background: 'var(--rust)',
                  color: '#FFFFFF',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pendingRequestsCount}
              </span>
            )}
          </button>
        )}

        <button
          className={`mobile-nav-btn ${moreSheetOpen ? 'active' : ''}`}
          onClick={() => setMoreSheetOpen(true)}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile "More" Slide-up Sheet */}
      {moreSheetOpen && (
        <div className="drawer-backdrop" onClick={() => setMoreSheetOpen(false)}>
          <div
            className="drawer-panel"
            onClick={e => e.stopPropagation()}
            style={{ width: '85%', maxWidth: '360px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem',
                borderBottom: '1px solid var(--line)',
                background: 'var(--paper-dim)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color="var(--brass)" />
                <span style={{ fontWeight: 700, fontSize: '1rem', fontFamily: 'var(--font-display)' }}>
                  Navigation Menu
                </span>
              </div>
              <button
                className="btn btn-icon btn-sm"
                onClick={() => setMoreSheetOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Planning */}
                <div>
                  <div className="sidebar-group-title">Financial Planning</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <button
                      className={`nav-link-item ${activeTab === 'affordability' ? 'active' : ''}`}
                      onClick={() => handleSelectTab('affordability')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Calculator size={18} />
                        <span>Can I Afford This?</span>
                      </div>
                    </button>

                    <button
                      className={`nav-link-item ${activeTab === 'goals' ? 'active' : ''}`}
                      onClick={() => handleSelectTab('goals')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <PiggyBank size={18} />
                        <span>Savings Goals</span>
                      </div>
                    </button>

                    {!isChild && (
                      <>
                        <button
                          className={`nav-link-item ${activeTab === 'reports' ? 'active' : ''}`}
                          onClick={() => handleSelectTab('reports')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <BarChart3 size={18} />
                            <span>Reports & Analytics</span>
                          </div>
                        </button>
                        <button
                          className={`nav-link-item ${activeTab === 'recurring' ? 'active' : ''}`}
                          onClick={() => handleSelectTab('recurring')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <CalendarClock size={18} />
                            <span>Recurring & Bills</span>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Family Head Controls */}
                {(isHead || isCoManager) && (
                  <div>
                    <div className="sidebar-group-title">Family Control Center</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <button
                        className={`nav-link-item ${activeTab === 'control_center' ? 'active' : ''}`}
                        onClick={() => handleSelectTab('control_center')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <ShieldCheck size={18} />
                          <span>Admin Control Center</span>
                        </div>
                      </button>
                      <button
                        className={`nav-link-item ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => handleSelectTab('members')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <Users size={18} />
                          <span>Members & Roles</span>
                        </div>
                      </button>
                      {isHead && (
                        <button
                          className={`nav-link-item ${activeTab === 'permissions' ? 'active' : ''}`}
                          onClick={() => handleSelectTab('permissions')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <KeyRound size={18} />
                            <span>Permissions Matrix</span>
                          </div>
                        </button>
                      )}
                      <button
                        className={`nav-link-item ${activeTab === 'spending_limits' ? 'active' : ''}`}
                        onClick={() => handleSelectTab('spending_limits')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <Sliders size={18} />
                          <span>Spending Limits</span>
                        </div>
                      </button>
                      <button
                        className={`nav-link-item ${activeTab === 'accounts' ? 'active' : ''}`}
                        onClick={() => handleSelectTab('accounts')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <Wallet size={18} />
                          <span>Accounts & Balances</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Governance */}
                {hasPermission('audit.view') && (
                  <div>
                    <div className="sidebar-group-title">Security & Audit</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <button
                        className={`nav-link-item ${activeTab === 'audit' ? 'active' : ''}`}
                        onClick={() => handleSelectTab('audit')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <ScrollText size={18} />
                          <span>Audit Trail</span>
                        </div>
                      </button>
                      <button
                        className={`nav-link-item ${activeTab === 'security' ? 'active' : ''}`}
                        onClick={() => handleSelectTab('security')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <Lock size={18} />
                          <span>Security Settings</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Future Innovations */}
                <div>
                  <div className="sidebar-group-title">Future Innovations</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <button
                      className={`nav-link-item ${activeTab === 'receipt_ocr' ? 'active' : ''}`}
                      onClick={() => handleSelectTab('receipt_ocr')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <ScanLine size={18} />
                        <span>Smart Receipt OCR</span>
                      </div>
                    </button>
                    <button
                      className={`nav-link-item ${activeTab === 'bank_sync' ? 'active' : ''}`}
                      onClick={() => handleSelectTab('bank_sync')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Landmark size={18} />
                        <span>Open Banking Hub</span>
                      </div>
                    </button>
                    <button
                      className={`nav-link-item ${activeTab === 'ai_insights' ? 'active' : ''}`}
                      onClick={() => handleSelectTab('ai_insights')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Bot size={18} />
                        <span>AI Advisor</span>
                      </div>
                    </button>
                  </div>
                </div>


              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
