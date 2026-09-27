/* =========================================================
   SAVINGS GOALS & MILESTONES (Section 18)
   ========================================================= */

import React, { useState } from 'react';
import { useFamilyFinance } from '../../context/FamilyFinanceContext';
import { formatPaise, formatDate, rupeesToPaise } from '../../utils/currency';
import confetti from 'canvas-confetti';
import {
  PiggyBank,
  Plus,
  Target,
  Calendar,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  Plane,
  HeartHandshake,
  Settings,
} from 'lucide-react';
import { useViewSettings } from '../../context/ViewSettingsContext';

export const GoalsPage: React.FC = () => {
  const {
    savingsGoals,
    familyGoals,
    privateGoals,
    activeFamily,
    allFamilies,
    activeUserId,
    contributeToGoal,
    createGoal,
    hasPermission,
  } = useFamilyFinance();

  const [goalsTab, setGoalsTab] = useState<'family' | 'private'>('family');
  const [goalVisibility, setGoalVisibility] = useState<'family' | 'private'>('family');
  const [targetFamilyId, setTargetFamilyId] = useState<string>(activeFamily.id);
  const { openViewSettingsModal } = useViewSettings();

  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [contributeRupees, setContributeRupees] = useState('');
  const [newGoalModalOpen, setNewGoalModalOpen] = useState(false);

  // New goal state
  const [goalName, setGoalName] = useState('');
  const [goalTargetRupees, setGoalTargetRupees] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('2027-12-31');
  const [goalDescription, setGoalDescription] = useState('');

  const canCreate = hasPermission('goals.create');
  const canContribute = hasPermission('goals.update');

  const selectedGoalForContribution = savingsGoals.find(g => g.id === contributeGoalId);

  const handleContributeSubmit = () => {
    if (!contributeGoalId) return;
    const paise = rupeesToPaise(contributeRupees);
    if (paise <= 0) return;

    contributeToGoal(contributeGoalId, paise);

    // Fire celebration confetti!
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#A9832E', '#3E6E56', '#DCC48A', '#2B6CB0'],
    });

    setContributeGoalId(null);
    setContributeRupees('');
  };

  const handleCreateGoalSubmit = () => {
    const targetPaise = rupeesToPaise(goalTargetRupees);
    if (!goalName.trim() || targetPaise <= 0) return;

    createGoal({
      name: goalName.trim(),
      description: goalDescription.trim(),
      target_amount: targetPaise,
      target_date: goalTargetDate,
      created_by: activeUserId,
      visibility: goalVisibility,
      family_id: goalVisibility === 'family' ? targetFamilyId : null,
      status: 'in_progress',
    } as any);

    setNewGoalModalOpen(false);
    setGoalName('');
    setGoalTargetRupees('');
    setGoalDescription('');
  };

  const displayedGoals = goalsTab === 'family' ? familyGoals : privateGoals;
  const totalSavedPaise = displayedGoals.reduce((sum, g) => sum + g.current_amount, 0);
  const totalTargetPaise = displayedGoals.reduce((sum, g) => sum + g.target_amount, 0);

  return (
    <div className="content-page">
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
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
            Family Savings Goals
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            Multi-year wealth building for family education, emergency safety, and milestones
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canCreate && (
            <button className="btn btn-primary btn-sm" onClick={() => setNewGoalModalOpen(true)}>
              <Plus size={15} /> Create Savings Goal
            </button>
          )}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid-responsive-cards" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--sage)' }}>
          <div className="stat-label">
            <span>Total Accumulated Savings</span>
            <PiggyBank size={16} color="var(--sage)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sage)' }}>
            {formatPaise(totalSavedPaise)}
          </div>
          <div className="stat-meta">Active reserve across all goals</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--brass)' }}>
          <div className="stat-label">
            <span>Total Target Capital</span>
            <Target size={16} color="var(--brass)" />
          </div>
          <div className="stat-value">{formatPaise(totalTargetPaise)}</div>
          <div className="stat-meta">Combined milestone objectives</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid var(--sky)' }}>
          <div className="stat-label">
            <span>Overall Progress</span>
            <Sparkles size={16} color="var(--sky)" />
          </div>
          <div className="stat-value">
            {totalTargetPaise > 0 ? Math.round((totalSavedPaise / totalTargetPaise) * 100) : 0}%
          </div>
          <div className="stat-meta">On track with monthly deposits</div>
        </div>
      </div>

            {/* Section 24: Family vs Private Goals Toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setGoalsTab('family')}
          style={{
            borderRadius: '9999px',
            padding: '0.45rem 1rem',
            fontWeight: 700,
            fontSize: '0.8rem',
            background: goalsTab === 'family' ? 'var(--mint-primary)' : 'var(--bg-canvas-subtle)',
            color: goalsTab === 'family' ? '#FFFFFF' : 'var(--text-main)',
            border: goalsTab === 'family' ? '1px solid var(--mint-primary)' : '1px solid var(--border-subtle)',
          }}
        >
          Family Goals ({familyGoals.length})
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setGoalsTab('private')}
          style={{
            borderRadius: '9999px',
            padding: '0.45rem 1rem',
            fontWeight: 700,
            fontSize: '0.8rem',
            background: goalsTab === 'private' ? '#D97706' : 'var(--bg-canvas-subtle)',
            color: goalsTab === 'private' ? '#FFFFFF' : 'var(--text-main)',
            border: goalsTab === 'private' ? '1px solid #D97706' : '1px solid var(--border-subtle)',
          }}
        >
          Private Goals ({privateGoals.length})
        </button>
      </div>

      {/* Goals Grid */}
      <div className="grid-3col">
        {displayedGoals.map(goal => {
          const pct = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
          const remainingPaise = Math.max(0, goal.target_amount - goal.current_amount);
          const isCompleted = goal.current_amount >= goal.target_amount;

          return (
            <div key={goal.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div className="brand-icon-wrap" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)' }}>
                    {goal.name.includes('Education') ? (
                      <GraduationCap size={22} color="var(--brass)" />
                    ) : goal.name.includes('Emergency') ? (
                      <ShieldCheck size={22} color="var(--sage)" />
                    ) : (
                      <Plane size={22} color="var(--sky)" />
                    )}
                  </div>

                  <span
                    className={`badge ${isCompleted ? 'badge-sage' : 'badge-brass'}`}
                    style={{ fontSize: '0.78rem' }}
                  >
                    {isCompleted ? 'COMPLETED' : `${pct}% REACHED`}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)' }}>
                  {goal.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '0.25rem', minHeight: '36px' }}>
                  {goal.description}
                </p>

                {/* Progress bar */}
                <div style={{ margin: '1.25rem 0 0.75rem' }}>
                  <div className="progress-bar-container" style={{ height: '10px' }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: isCompleted ? 'var(--sage)' : 'var(--brass)',
                      }}
                    ></div>
                  </div>
                </div>

                {/* Metrics */}
                <div
                  style={{
                    background: 'var(--paper-dim)',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink-muted)' }}>Target:</span>
                    <span style={{ fontWeight: 700 }}>{formatPaise(goal.target_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink-muted)' }}>Current Saved:</span>
                    <span style={{ fontWeight: 700, color: 'var(--sage)' }}>{formatPaise(goal.current_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink-muted)' }}>Remaining:</span>
                    <span style={{ fontWeight: 700, color: 'var(--rust)' }}>{formatPaise(remainingPaise)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '0.35rem', marginTop: '0.2rem', fontSize: '0.75rem', fontFamily: 'var(--font-sans)', color: 'var(--ink-muted)' }}>
                    <span>Target Deadline:</span>
                    <span>{formatDate(goal.target_date)}</span>
                  </div>
                </div>
              </div>

              {/* Action */}
              {canContribute && !isCompleted && (
                <div style={{ marginTop: '1.25rem' }}>
                  <button
                    className="btn btn-brass btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      setContributeGoalId(goal.id);
                      setContributeRupees('5000');
                    }}
                  >
                    <Plus size={14} /> Contribute Funds
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Contribute Modal */}
      {contributeGoalId && selectedGoalForContribution && (
        <div className="modal-backdrop" onClick={() => setContributeGoalId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                Contribute to {selectedGoalForContribution.name}
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="label">Contribution Amount (₹ INR)</label>
                <input
                  type="number"
                  className="input"
                  value={contributeRupees}
                  onChange={e => setContributeRupees(e.target.value)}
                  placeholder="e.g. 5000"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[1000, 2500, 5000, 10000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setContributeRupees(String(amt))}
                  >
                    +₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setContributeGoalId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleContributeSubmit}>
                Confirm Contribution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Goal Modal */}
      {newGoalModalOpen && (
        <div className="modal-backdrop" onClick={() => setNewGoalModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Create New Savings Goal</h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="label">Goal Name</label>
                <input
                  type="text"
                  className="input"
                  value={goalName}
                  onChange={e => setGoalName(e.target.value)}
                  placeholder="e.g. New Electric Car / Solar Panels"
                />
              </div>
              <div>
                <label className="label">Target Amount (₹ INR)</label>
                <input
                  type="number"
                  className="input"
                  value={goalTargetRupees}
                  onChange={e => setGoalTargetRupees(e.target.value)}
                  placeholder="e.g. 150000"
                />
              </div>
              <div>
                <label className="label">Target Completion Date</label>
                <input
                  type="date"
                  className="input"
                  value={goalTargetDate}
                  onChange={e => setGoalTargetDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Purpose / Description</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={goalDescription}
                  onChange={e => setGoalDescription(e.target.value)}
                  placeholder="Why is the family saving for this milestone?"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setNewGoalModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateGoalSubmit}>
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
