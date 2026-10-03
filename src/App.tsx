import React, { useState, useEffect } from 'react';
import { RouterProvider, useRouter } from './router/Router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useFamilyFinance, FamilyFinanceProvider } from './context/FamilyFinanceContext';
import { usePermissions } from './context/FamilyContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AccessRestricted } from './components/auth/AccessRestricted';
import { TopMenubar } from './components/layout/TopMenubar';
// Auth Pages & Family Setup
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { VerifyEmailPage } from './components/auth/VerifyEmailPage';
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage';
import { FamilySetupPage } from './features/family/FamilySetupPage';
import { FamilySelectPage } from './features/family/FamilySelectPage';
import { FamilyCreatePage } from './features/family/FamilyCreatePage';
import { FamilyJoinPage } from './features/family/FamilyJoinPage';
import { FamilyInvitePage } from './features/family/FamilyInvitePage';

// Feature Views (Section 37: Obsolete features cleanly removed)
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { BudgetsPage } from './features/budgets/BudgetsPage';
import { RequestsPage } from './features/requests/RequestsPage';
import { GoalsPage } from './features/goals/GoalsPage';
import { AffordabilityPage } from './features/affordability/AffordabilityPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { ControlCenterPage } from './features/family/ControlCenterPage';
import { MembersPage } from './features/family/MembersPage';
import { PermissionsMatrixPage } from './features/family/PermissionsMatrixPage';
import { SpendingLimitsPage } from './features/family/SpendingLimitsPage';
import { AccountsVaultPage } from './features/family/AccountsVaultPage';

import { LoansPage } from './features/loans/LoansPage';
import { InvestmentsPage } from './features/investments/InvestmentsPage';
import { SharedExpensesPage } from './features/split/SharedExpensesPage';

// Modals
import { NewTransactionModal } from './components/modals/NewTransactionModal';
import { NewRequestModal } from './components/modals/NewRequestModal';
import { ProfileModal } from './components/profile/ProfileModal';
import { DataImportModal } from './components/modals/DataImportModal';
import { ViewSettingsModal } from './components/modals/ViewSettingsModal';
import { ViewSettingsProvider, useViewSettings } from './context/ViewSettingsContext';

import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  GitPullRequest,
  Users,
  Wallet,
  Loader2,
} from 'lucide-react';

const pathToTabMap: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/transactions': 'transactions',
  '/income': 'transactions',
  '/expenses': 'transactions',
  '/accounts': 'accounts',
  '/budget': 'budgets',
  '/budgets': 'budgets',
  '/requests': 'requests',
  '/goals': 'goals',
  '/affordability': 'affordability',
  '/reports': 'reports',
  '/recurring': 'recurring',
  '/family': 'control_center',
  '/settings': 'control_center',
  '/family/settings': 'control_center',
  '/family/members': 'members',
  '/family/permissions': 'permissions',
  '/spending_limits': 'spending_limits',
  '/loans': 'loans',
  '/investments': 'investments',
  '/split_expenses': 'split_expenses',
};

const tabToPathMap: Record<string, string> = {
  dashboard: '/dashboard',
  transactions: '/transactions',
  accounts: '/accounts',
  budgets: '/budget',
  requests: '/requests',
  goals: '/goals',
  affordability: '/affordability',
  reports: '/reports',
  recurring: '/recurring',
  control_center: '/family',
  members: '/family/members',
  permissions: '/family/permissions',
  spending_limits: '/spending_limits',
  loans: '/loans',
  investments: '/investments',
  split_expenses: '/split_expenses',
};

const AppInner: React.FC = () => {
  const { currentPath, navigate } = useRouter();
  const { isAuthenticated, isEmailVerified, familyCount, loading } = useAuth();

  const [activeTab, setActiveTabState] = useState<string>(() => {
    return pathToTabMap[currentPath] || 'dashboard';
  });

  const [newTxModalOpen, setNewTxModalOpen] = useState(false);
  const [newTxInitialType, setNewTxInitialType] = useState<'expense' | 'income'>('expense');
  const [newRequestModalOpen, setNewRequestModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [requestInitialData, setRequestInitialData] = useState<{
    title: string;
    amountRupees: string;
    categoryId: string;
    description: string;
  } | null>(null);

  const { requests } = useFamilyFinance();
  const { can, isFamilyHead, isChild: isPermChild } = usePermissions();
  const isChild = isPermChild;
  const { isSettingsModalOpen, closeViewSettingsModal, openViewSettingsModal } = useViewSettings();

  // Sync tab with currentPath
  useEffect(() => {
    if (pathToTabMap[currentPath]) {
      setActiveTabState(pathToTabMap[currentPath]);
    }
  }, [currentPath]);

  // Navigate both activeTab and URL route
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const targetPath = tabToPathMap[tab] || '/dashboard';
    navigate(targetPath);
  };

  const handleOpenNewTx = (initialType?: 'expense' | 'income') => {
    setNewTxInitialType(initialType || 'expense');
    setNewTxModalOpen(true);
  };

  // Explicit loading state to prevent flash of login/setup while Supabase session restores (Section 4)
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          background: 'var(--bg-canvas, #F8FAFC)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            background: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.4)',
          }}
        >
          <Wallet size={30} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Loader2 className="animate-spin" size={22} color="#059669" />
          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink, #0F172A)' }}>
            Checking authentication &amp; loading your family...
          </span>
        </div>
      </div>
    );
  }

  // ================= 1. PUBLIC & SETUP ROUTES =================
  if (currentPath === '/login') {
    if (isAuthenticated) {
      if (!isEmailVerified) {
        navigate('/verify-email');
        return null;
      }
      if (familyCount === 0) {
        navigate('/family/setup');
        return null;
      } else if (familyCount > 1) {
        navigate('/family/select');
        return null;
      }
      navigate('/dashboard');
      return null;
    }
    return <LoginPage />;
  }

  if (currentPath === '/register') {
    if (isAuthenticated) {
      if (!isEmailVerified) {
        navigate('/verify-email');
        return null;
      }
      if (familyCount === 0) {
        navigate('/family/setup');
        return null;
      }
      navigate('/dashboard');
      return null;
    }
    return <RegisterPage />;
  }

  if (currentPath === '/verify-email') {
    return <VerifyEmailPage />;
  }

  if (currentPath === '/forgot-password') {
    return <ForgotPasswordPage />;
  }

  if (
    currentPath === '/family/setup' ||
    currentPath === '/family/create' ||
    currentPath === '/family/join' ||
    currentPath === '/family/select'
  ) {
    if (isAuthenticated && !isEmailVerified) {
      navigate('/verify-email');
      return null;
    }
  }

  if (currentPath === '/family/setup') {
    // Returning users with existing active family must never be trapped in setup (Section 3)
    if (isAuthenticated && isEmailVerified && familyCount > 0) {
      navigate('/dashboard');
      return null;
    }
    return <FamilySetupPage />;
  }

  if (currentPath === '/family/create') {
    return <FamilyCreatePage />;
  }

  if (currentPath === '/family/join') {
    return <FamilyJoinPage />;
  }

  if (currentPath.startsWith('/family/invite')) {
    return <FamilyInvitePage />;
  }

  if (currentPath === '/family/select') {
    return <FamilySelectPage />;
  }

  // Force authenticated users with 0 families to complete setup (one-time onboarding)
  if (isAuthenticated && isEmailVerified && familyCount === 0 && currentPath !== '/demo') {
    return <FamilySetupPage />;
  }

  // ================= 2. AUTHENTICATED APP VIEWS =================
  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardPage
            onOpenNewTx={handleOpenNewTx}
            onOpenNewRequest={() => {
              setRequestInitialData(null);
              setNewRequestModalOpen(true);
            }}
            setActiveTab={setActiveTab}
            onOpenImportModal={() => setImportModalOpen(true)}
          />
        );
      case 'transactions':
        return <TransactionsPage onOpenNewTx={handleOpenNewTx} />;
      case 'accounts':
        if (!can('viewAccounts')) {
          return <AccessRestricted onBackToDashboard={() => setActiveTab('dashboard')} message="You don't have permission to access family accounts." />;
        }
        return <AccountsVaultPage />;
      case 'budgets':
        if (!can('viewBudget')) {
          return <AccessRestricted onBackToDashboard={() => setActiveTab('dashboard')} message="You don't have permission to access family budgets." />;
        }
        return <BudgetsPage />;
      case 'requests':
        return (
          <RequestsPage
            onOpenNewRequest={() => {
              setRequestInitialData(null);
              setNewRequestModalOpen(true);
            }}
          />
        );
      case 'goals':
        return <GoalsPage />;
      case 'affordability':
        return (
          <AffordabilityPage
            onOpenNewRequestWithData={data => {
              setRequestInitialData(data);
              setNewRequestModalOpen(true);
            }}
          />
        );
      case 'reports':
        if (!can('viewReports')) {
          return <AccessRestricted onBackToDashboard={() => setActiveTab('dashboard')} message="You don't have permission to view analytics reports." />;
        }
        return <ReportsPage />;
      case 'recurring':
        return <RecurringPage />;
      case 'control_center':
        return <ControlCenterPage setActiveTab={setActiveTab} onOpenImportModal={() => setImportModalOpen(true)} />;
      case 'members':
        if (!can('viewMembers')) {
          return <AccessRestricted onBackToDashboard={() => setActiveTab('dashboard')} message="You don't have permission to view family members." />;
        }
        return <MembersPage onNavigatePermissions={() => setActiveTab('permissions')} />;
      case 'permissions':
        if (!isFamilyHead && !can('managePermissions')) {
          return <AccessRestricted onBackToDashboard={() => setActiveTab('dashboard')} message="Only the Family Head can configure permissions and overrides." />;
        }
        return <PermissionsMatrixPage />;
      case 'spending_limits':
        if (!isFamilyHead && !can('manageBudget')) {
          return <AccessRestricted onBackToDashboard={() => setActiveTab('dashboard')} message="Only the Family Head can configure member spending limits." />;
        }
        return <SpendingLimitsPage />;
      case 'loans':
        return <LoansPage />;
      case 'investments':
        return <InvestmentsPage />;
      case 'split_expenses':
        return <SharedExpensesPage />;
      default:
        return (
          <DashboardPage
            onOpenNewTx={handleOpenNewTx}
            onOpenNewRequest={() => {
              setRequestInitialData(null);
              setNewRequestModalOpen(true);
            }}
            onOpenAffordability={() => setActiveTab('affordability')}
            setActiveTab={setActiveTab}
            onOpenImportModal={() => setImportModalOpen(true)}
          />
        );
    }
  };

  return (
    <ProtectedRoute requireVerification={true}>
      <div className="app-viewport-shell">
        {/* Outer Curved Chassis Envelope */}
        <div className="neo-chassis-container">
          {/* Floating Capsule Navbar */}
          <TopMenubar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onOpenNewTx={handleOpenNewTx}
            onOpenNewRequest={() => {
              setRequestInitialData(null);
              setNewRequestModalOpen(true);
            }}
            onOpenProfileModal={() => setProfileModalOpen(true)}
            onOpenImportModal={() => setImportModalOpen(true)}
            onOpenViewSettings={() => openViewSettingsModal(activeTab as any)}
          />

          {/* Dynamic Page Body */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {renderActiveView()}
          </main>

          {/* Mobile Floating Capsule Navigation Bar (When screen < 900px) */}
          <nav className="mobile-bottom-capsule-nav">
            <button
              className={`mobile-capsule-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Home</span>
            </button>

            <button
              className={`mobile-capsule-item ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transactions')}
            >
              <Receipt size={18} />
              <span>Finances</span>
            </button>

            <button
              className={`mobile-capsule-item ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              <Users size={18} />
              <span>Members</span>
            </button>

            {!isChild && (
              <button
                className={`mobile-capsule-item ${activeTab === 'budgets' ? 'active' : ''}`}
                onClick={() => setActiveTab('budgets')}
              >
                <PiggyBank size={18} />
                <span>Budgets</span>
              </button>
            )}

            <button
              className={`mobile-capsule-item ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              <GitPullRequest size={18} />
              <span>Requests</span>
            </button>
          </nav>
        </div>

        {/* Modals */}
        <NewTransactionModal
          isOpen={newTxModalOpen}
          initialType={newTxInitialType}
          onClose={() => setNewTxModalOpen(false)}
        />

        <NewRequestModal
          isOpen={newRequestModalOpen}
          onClose={() => {
            setNewRequestModalOpen(false);
            setRequestInitialData(null);
          }}
          initialData={requestInitialData}
        />

        {/* Section 3 & 4: Pure Personal Profile Modal */}
        <ProfileModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
        />

        {importModalOpen && (
          <DataImportModal
            isOpen={importModalOpen}
            onClose={() => setImportModalOpen(false)}
          />
        )}

        {/* Dynamic Context-Aware View Settings Modal */}
        <ViewSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={closeViewSettingsModal}
          onNavigateControlCenter={() => setActiveTab('control_center')}
        />

      </div>
    </ProtectedRoute>
  );
};

export const App: React.FC = () => {
  return (
    <RouterProvider>
      <AuthProvider>
        <FamilyFinanceProvider>
          <ViewSettingsProvider>
            <AppInner />
          </ViewSettingsProvider>
        </FamilyFinanceProvider>
      </AuthProvider>
    </RouterProvider>
  );
};

export default App;
