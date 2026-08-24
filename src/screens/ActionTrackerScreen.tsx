import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan, ActionTactic } from '../utils/actionRecommendationEngine';
import {
  initiateTacticTracking, updateTacticProgress, recordTacticOutcome, measureActualImpact,
  canMeasureOutcome, daysUntilMeasurable, OUTCOME_MEASUREMENT_WINDOW_DAYS,
  TacticExecution, TacticOutcome,
} from '../utils/outcomeTrackingEngine';
import NextStepLink from '../components/NextStepLink';
import { computeCashRunway } from '../utils/cashRunway';
import { getMonthlyExpenseAverage } from '../utils/finance';
import { showAlert } from '../utils/webAlert';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

const EXECUTIONS_KEY = 'quad360_tactic_executions_v1';
const OUTCOMES_KEY = 'quad360_tactic_outcomes_v1';

// finance.income/expense/profit are all-time cumulative totals, not a
// recent-activity figure — comparing them before/after a few-week tactic
// would barely move and drown out the real signal. This gives
// measureActualImpact a trailing-window snapshot instead, the same window
// computeCashRunway already uses elsewhere in the app for "recent" figures.
// Uses the SAME constant canMeasureOutcome gates on below -- if this window
// and that gate ever drifted apart, a "current" snapshot taken before the
// gate's wait was up would still overlap the baseline window it's being
// compared against.
function trailingSnapshot(transactions: { type: string; amount: number; date: string; status?: string; principalPortion?: number }[]) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - OUTCOME_MEASUREMENT_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recent = transactions.filter(t => t.date >= cutoffStr && t.status !== 'pending' && t.status !== 'overdue');
  const income = recent.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0);
  // Loan principal excluded so a tactic's measured "actual impact" isn't
  // thrown off by an unrelated loan payment landing inside the window.
  const expense = recent.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0) - (t.principalPortion || 0), 0);
  return { income, expense, profit: income - expense };
}

export default function ActionTrackerScreen() {
  const { transactions, invoices, finance, settings, setCurrentScreen, loans, inventory } = useApp();
  const [activeTab, setActiveTab] = useState<'immediate' | 'shortterm' | 'strategic'>('immediate');
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  // Actually tracks progress — before this, "Start This Action" just showed
  // an alert and remembered nothing: initiateTacticTracking/
  // updateTacticProgress were imported but never called anywhere, so the
  // Action Tracker never tracked a single action. Now persisted locally so
  // status (planned/in-progress/completed) survives an app reload.
  const [executions, setExecutions] = useState<Record<string, TacticExecution>>({});
  const [executionsLoaded, setExecutionsLoaded] = useState(false);

  // The record of what actually happened after a tactic was marked
  // complete — the "what's worked for this business before" memory. Before
  // this, completing a tactic just flipped a status flag with nothing
  // measuring whether it moved the number it targeted, so the app could
  // never tell a business owner what had actually worked for them.
  const [outcomes, setOutcomes] = useState<TacticOutcome[]>([]);
  const [outcomesLoaded, setOutcomesLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(EXECUTIONS_KEY)
      .then(raw => { if (raw) setExecutions(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setExecutionsLoaded(true));
    AsyncStorage.getItem(OUTCOMES_KEY)
      .then(raw => { if (raw) setOutcomes(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setOutcomesLoaded(true));
  }, []);

  useEffect(() => {
    if (!executionsLoaded) return;
    AsyncStorage.setItem(EXECUTIONS_KEY, JSON.stringify(executions)).catch(() => {});
  }, [executions, executionsLoaded]);

  useEffect(() => {
    if (!outcomesLoaded) return;
    AsyncStorage.setItem(OUTCOMES_KEY, JSON.stringify(outcomes)).catch(() => {});
  }, [outcomes, outcomesLoaded]);

  const startTracking = (action: ActionTactic) => {
    const today = new Date().toISOString().split('T')[0];
    setExecutions(prev => ({ ...prev, [action.id]: initiateTacticTracking(action, today, trailingSnapshot(transactions), diagnosis.overallHealth) }));
  };

  const advanceTracking = (action: ActionTactic, pct: number) => {
    setExecutions(prev => {
      const existing = prev[action.id] ?? initiateTacticTracking(action, new Date().toISOString().split('T')[0], trailingSnapshot(transactions), diagnosis.overallHealth);
      const updated = updateTacticProgress(existing, `${pct}%`, pct);
      // Marking a tactic "completed" here does NOT measure its outcome --
      // see the measurement effect below for why (the trailing-window
      // baseline/current overlap problem) and when it actually gets measured.
      return { ...prev, [action.id]: updated };
    });
  };

  const succeededOutcomes = outcomes.filter(o => o.succeeded);
  const trackRecord = useMemo(() => [...outcomes].reverse().slice(0, 5), [outcomes]);
  // Same trailing-30-day-paid-expenses runway used everywhere else in the
  // app — this used to divide finance.expense (an all-time cumulative
  // total) by 30, which understated daily burn (and so overstated runway)
  // more the longer a business had been recording transactions.
  const cashRunwayDays = useMemo(() => computeCashRunway(transactions, finance.cashBalance).runwayDays, [transactions, finance.cashBalance]);

  const diagnosis = useMemo(() => {
    return performFinancialDiagnosis(
      transactions,
      invoices,
      finance.cashBalance,
      getMonthlyExpenseAverage(finance.expense, transactions),
      settings.currency,
      loans,
      inventory
    );
  }, [transactions, invoices, finance, settings, loans, inventory]);

  // Measures a completed tactic's outcome once -- and only once -- enough
  // time has passed since it started for the comparison to mean anything
  // (canMeasureOutcome; see the note on OUTCOME_MEASUREMENT_WINDOW_DAYS in
  // outcomeTrackingEngine.ts). Runs on every visit to this screen rather
  // than at the moment of completion, since that moment is usually too soon.
  // Uses only what was captured on the execution at start time (baseline,
  // expectedImpact, impactType), not the live action plan -- by the time
  // this fires, the tactic that triggered it may no longer be recommended
  // at all (the underlying problem it addressed may already be resolved).
  useEffect(() => {
    if (!executionsLoaded || !outcomesLoaded) return;
    const today = new Date().toISOString().split('T')[0];
    const newlyMeasurable = Object.values(executions).filter(
      e => e.baseline && canMeasureOutcome(e, today) && !outcomes.some(o => o.tacticId === e.tacticId)
    );
    if (newlyMeasurable.length === 0) return;

    const current = trailingSnapshot(transactions);
    const newOutcomes = newlyMeasurable.map(execution => {
      const tacticLike = {
        id: execution.tacticId,
        title: execution.tacticTitle,
        expectedImpact: execution.expectedImpact ?? 0,
        impactType: execution.impactType ?? 'cash_improvement' as const,
      };
      const actualImpact = measureActualImpact(tacticLike, execution.baseline!, current);
      const health = execution.healthAtStart !== undefined
        ? { before: execution.healthAtStart, after: diagnosis.overallHealth }
        : undefined;
      return recordTacticOutcome(execution, tacticLike, actualImpact, [], [], health);
    });
    setOutcomes(prev => [...prev, ...newOutcomes]);
    // transactions/diagnosis deliberately included -- a fresh visit with
    // updated numbers is exactly what should re-check eligibility and
    // trigger measurement once the window has passed.
  }, [executions, executionsLoaded, outcomesLoaded, transactions, diagnosis.overallHealth]);

  // What this business actually did before feeds back into what gets
  // recommended and how urgently — the closing link of the loop.
  const outcomeHistory = useMemo(
    () => outcomes.map(o => ({ tacticId: o.tacticId, succeeded: o.succeeded, impactPercentage: o.impactPercentage, completionDate: o.completionDate })),
    [outcomes]
  );

  const actionPlan = useMemo(() => {
    return generateActionPlan(diagnosis, diagnosis.metrics, settings.currency, outcomeHistory, settings.primaryGoal);
  }, [diagnosis, settings.currency, outcomeHistory, settings.primaryGoal]);

  // Land on whichever tab actually has actions instead of always defaulting
  // to "Immediate" — a warning-but-not-critical account often has zero
  // immediate/crisis actions, so the default view was an empty page even
  // though This Month and Quarter had real actions waiting.
  const hasAutoSelected = React.useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (actionPlan.immediateActions.length > 0) { hasAutoSelected.current = true; return; }
    if (actionPlan.shortTermActions.length > 0) { setActiveTab('shortterm'); hasAutoSelected.current = true; }
    else if (actionPlan.strategicActions.length > 0) { setActiveTab('strategic'); hasAutoSelected.current = true; }
  }, [actionPlan]);

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return Colors.expense;
    if (priority >= 6) return Colors.warning;
    return Colors.primary;
  };

  const getDifficultyColor = (difficulty: string) => {
    if (difficulty === 'easy') return Colors.income;
    if (difficulty === 'medium') return Colors.warning;
    return Colors.expense;
  };

  const tabData = {
    immediate: { actions: actionPlan.immediateActions, icon: '🚨', label: 'Do This Week' },
    shortterm: { actions: actionPlan.shortTermActions, icon: '📅', label: 'This Month' },
    strategic: { actions: actionPlan.strategicActions, icon: '🎯', label: 'This Quarter' },
  };

  const currentTabData = tabData[activeTab];
  const executionList = Object.values(executions);
  const inProgressCount = executionList.filter(e => e.status === 'in-progress').length;
  const completedCount = executionList.filter(e => e.status === 'completed').length;

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
        {/* Title */}
        <View style={styles.titleRow}>
          <Icon name="zap" size={20} color={Colors.textPrimary} />
          <Text style={styles.title}>Action Tracker</Text>
        </View>
        <Text style={styles.subtitle}>Prioritized tactics to reach your goals</Text>

        {/* Total Impact Banner */}
        <View style={styles.impactBanner}>
          <View style={styles.impactBannerTextRow}>
            <Icon name="dollar-sign" size={13} color={Colors.textSecondary} />
            <Text style={styles.impactBannerText}>
              {actionPlan.immediateActions.length + actionPlan.shortTermActions.length + actionPlan.strategicActions.length} tactics identified across this week, this month, and this quarter
            </Text>
          </View>
          <Text style={styles.impactBannerValue}>
            +{settings.currency}{Math.round(actionPlan.estimatedTotalImpact).toLocaleString()} potential
          </Text>
          {(inProgressCount > 0 || completedCount > 0) && (
            <View style={styles.impactBannerTrackedRow}>
              {completedCount > 0 && (
                <View style={styles.trackedItem}>
                  <Icon name="check-circle" size={11} color={Colors.textSecondary} />
                  <Text style={styles.impactBannerTracked}>{completedCount} completed</Text>
                </View>
              )}
              {inProgressCount > 0 && (
                <View style={styles.trackedItem}>
                  <View style={styles.progressDot} />
                  <Text style={styles.impactBannerTracked}>{inProgressCount} in progress</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Track Record — what's actually worked for this business before,
            not just what's planned. Empty until at least one tactic has
            been carried through to completion and measured. */}
        {trackRecord.length > 0 && (
          <View style={styles.trackRecordCard}>
            <View style={[styles.titleRow, { marginBottom: 3 }]}>
              <Icon name="trending-up" size={15} color={Colors.textPrimary} />
              <Text style={styles.trackRecordTitle}>What's Worked For You Before</Text>
            </View>
            <Text style={styles.trackRecordSub}>
              {succeededOutcomes.length} of {outcomes.length} completed tactic{outcomes.length === 1 ? '' : 's'} hit at least 60% of its target impact.
            </Text>
            {trackRecord.map((o, i) => (
              <View key={o.tacticId + i} style={styles.trackRecordRow}>
                <View style={{ marginRight: 8, marginTop: 1 }}>
                  <Icon name={o.succeeded ? 'check-circle' : 'alert-triangle'} size={16} color={o.succeeded ? Colors.income : Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackRecordTacticTitle}>{o.tacticTitle}</Text>
                  <Text style={styles.trackRecordDetail}>
                    {o.succeeded
                      ? `Delivered ${settings.currency}${Math.round(o.actualImpact).toLocaleString()} — worth doing again.`
                      : o.expectedImpact > 0
                        ? `Delivered ${settings.currency}${Math.round(o.actualImpact).toLocaleString()} of a ${settings.currency}${Math.round(o.expectedImpact).toLocaleString()} target.`
                        : `Not enough of a baseline yet to measure this one reliably.`}
                  </Text>
                  {o.healthDelta !== undefined && (
                    <Text style={[styles.trackRecordHealth, { color: o.healthDelta >= 0 ? Colors.income : Colors.expense }]}>
                      Business health: {o.healthBefore} → {o.healthAfter} ({o.healthDelta >= 0 ? '+' : ''}{o.healthDelta})
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'immediate' && styles.tabActive]}
            onPress={() => setActiveTab('immediate')}
          >
            <View style={styles.tabLabelRow}>
              <Icon name="alert-circle" size={11} color={activeTab === 'immediate' ? '#fff' : Colors.textSecondary} />
              <Text style={[styles.tabLabel, activeTab === 'immediate' && styles.tabLabelActive]}>
                Immediate
              </Text>
            </View>
            <Text style={[styles.tabCount, activeTab === 'immediate' && styles.tabCountActive]}>
              {tabData.immediate.actions.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'shortterm' && styles.tabActive]}
            onPress={() => setActiveTab('shortterm')}
          >
            <View style={styles.tabLabelRow}>
              <Icon name="calendar" size={11} color={activeTab === 'shortterm' ? '#fff' : Colors.textSecondary} />
              <Text style={[styles.tabLabel, activeTab === 'shortterm' && styles.tabLabelActive]}>
                This Month
              </Text>
            </View>
            <Text style={[styles.tabCount, activeTab === 'shortterm' && styles.tabCountActive]}>
              {tabData.shortterm.actions.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'strategic' && styles.tabActive]}
            onPress={() => setActiveTab('strategic')}
          >
            <View style={styles.tabLabelRow}>
              <Icon name="target" size={11} color={activeTab === 'strategic' ? '#fff' : Colors.textSecondary} />
              <Text style={[styles.tabLabel, activeTab === 'strategic' && styles.tabLabelActive]}>
                Quarter
              </Text>
            </View>
            <Text style={[styles.tabCount, activeTab === 'strategic' && styles.tabCountActive]}>
              {tabData.strategic.actions.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Actions List */}
        <View style={styles.actionsList}>
          {currentTabData.actions.length > 0 ? (
            currentTabData.actions.map((action, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.actionItem,
                  expandedActionId === action.id && styles.actionItemExpanded,
                ]}
                onPress={() =>
                  setExpandedActionId(expandedActionId === action.id ? null : action.id)
                }
                activeOpacity={0.7}
              >
                {/* Collapsed View */}
                <View style={styles.actionItemHeader}>
                  <View style={styles.actionItemLeft}>
                    <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(action.priority) }]} />
                    <View style={styles.actionItemTitleContainer}>
                      <Text style={styles.actionItemTitle}>{action.title}</Text>
                      <View style={styles.actionItemMeta}>
                        <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(action.difficulty) + '22', borderColor: getDifficultyColor(action.difficulty) }]}>
                          <Text style={[styles.difficultyText, { color: getDifficultyColor(action.difficulty) }]}>
                            {action.difficulty}
                          </Text>
                        </View>
                        <Text style={styles.timeframeText}>{action.timelineWeeks} weeks</Text>
                        {executions[action.id] && (
                          <View style={[styles.statusBadge, { backgroundColor: (executions[action.id].status === 'completed' ? Colors.income : Colors.primary) + '22' }]}>
                            <View style={styles.statusBadgeRow}>
                              <Icon
                                name={executions[action.id].status === 'completed' ? 'check-circle' : 'circle'}
                                size={9}
                                color={executions[action.id].status === 'completed' ? Colors.income : Colors.primary}
                              />
                              <Text style={[styles.statusBadgeText, { color: executions[action.id].status === 'completed' ? Colors.income : Colors.primary }]}>
                                {executions[action.id].status === 'completed' ? `Completed` : `${executions[action.id].progressPercentage}% in progress`}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={{ marginTop: 4 }}>
                    <Icon name={expandedActionId === action.id ? 'chevron-down' : 'chevron-right'} size={14} color={Colors.textMuted} />
                  </View>
                </View>

                {/* Expanded View */}
                {expandedActionId === action.id && (
                  <View style={styles.actionItemDetails}>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailText}>{action.description}</Text>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Expected Impact</Text>
                      <Text style={[styles.detailValue, { color: action.impactType === 'revenue' ? Colors.income : Colors.expense }]}>
                        +{settings.currency}{Math.round(action.expectedImpact).toLocaleString()}
                      </Text>
                      <Text style={styles.detailSubtext}>
                        {action.impactType === 'revenue' ? 'Revenue increase' : action.impactType === 'expense_reduction' ? 'Monthly savings' : 'Cash improvement'}
                      </Text>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Rationale</Text>
                      <Text style={styles.detailText}>{action.rationale}</Text>
                    </View>

                    {action.pastAttempt && (
                      <View style={[styles.detailSection, { backgroundColor: (action.pastAttempt.succeeded ? Colors.income : Colors.warning) + '12', borderLeftWidth: 3, borderLeftColor: action.pastAttempt.succeeded ? Colors.income : Colors.warning }]}>
                        <View style={styles.detailLabelRow}>
                          <Icon name={action.pastAttempt.succeeded ? 'check-circle' : 'alert-triangle'} size={11} color={action.pastAttempt.succeeded ? Colors.income : Colors.warning} />
                          <Text style={[styles.detailLabel, { color: action.pastAttempt.succeeded ? Colors.income : Colors.warning }]}>
                            You tried this before
                          </Text>
                        </View>
                        <Text style={styles.detailText}>
                          {action.pastAttempt.succeeded
                            ? `It worked — hit ${action.pastAttempt.impactPercentage.toFixed(0)}% of target on ${action.pastAttempt.completionDate}. Bumped up in priority.`
                            : `It underperformed — only ${Math.max(0, action.pastAttempt.impactPercentage).toFixed(0)}% of target on ${action.pastAttempt.completionDate}. Lowered in priority; consider a different approach this time.`}
                        </Text>
                      </View>
                    )}

                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Steps ({action.steps.length})</Text>
                      {action.steps.map((step, stepIdx) => (
                        <View key={stepIdx} style={styles.stepItem}>
                          <Text style={styles.stepNumber}>{stepIdx + 1}.</Text>
                          <Text style={styles.stepText}>{step}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Success Probability</Text>
                      <View style={styles.probabilityBar}>
                        <View
                          style={[
                            styles.probabilityFill,
                            {
                              width: `${action.successProbability * 100}%`,
                              backgroundColor: action.successProbability > 0.7 ? Colors.income : action.successProbability > 0.4 ? Colors.warning : Colors.expense,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.probabilityText}>
                        {(action.successProbability * 100).toFixed(0)}% likely to succeed
                      </Text>
                    </View>

                    {action.blockers && action.blockers.length > 0 && (
                      <View style={[styles.detailSection, { backgroundColor: Colors.expense + '12', borderLeftWidth: 3, borderLeftColor: Colors.expense }]}>
                        <View style={styles.detailLabelRow}>
                          <Icon name="alert-triangle" size={11} color={Colors.expense} />
                          <Text style={[styles.detailLabel, { color: Colors.expense }]}>Potential Blockers</Text>
                        </View>
                        {action.blockers.map((blocker, idx) => (
                          <Text key={idx} style={styles.blockerText}>• {blocker}</Text>
                        ))}
                      </View>
                    )}

                    {action.prerequisite && (
                      <View style={[styles.detailSection, { backgroundColor: Colors.primary + '12', borderLeftWidth: 3, borderLeftColor: Colors.primary }]}>
                        <View style={styles.detailLabelRow}>
                          <Icon name="link" size={11} color={Colors.primary} />
                          <Text style={[styles.detailLabel, { color: Colors.primary }]}>Prerequisite</Text>
                        </View>
                        <Text style={styles.detailText}>Complete this first: {action.prerequisite}</Text>
                      </View>
                    )}

                    {!executions[action.id] ? (
                      <TouchableOpacity
                        style={styles.startButton}
                        onPress={() => {
                          startTracking(action);
                          const steps = action.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
                          showAlert(action.title, steps || 'No steps listed for this action.');
                        }}
                      >
                        <View style={styles.btnIconRow}>
                          <Icon name="play" size={12} color="#fff" />
                          <Text style={styles.startButtonText}>Start This Action</Text>
                        </View>
                      </TouchableOpacity>
                    ) : executions[action.id].status !== 'completed' ? (
                      <View style={styles.trackRow}>
                        <TouchableOpacity style={styles.trackBtn} onPress={() => advanceTracking(action, 50)}>
                          <Text style={styles.trackBtnText}>Halfway There</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.trackBtn, styles.trackBtnComplete]} onPress={() => advanceTracking(action, 100)}>
                          <View style={styles.btnIconRow}>
                            <Icon name="check" size={12} color="#fff" />
                            <Text style={[styles.trackBtnText, { color: '#fff' }]}>Mark Complete</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ) : outcomes.some(o => o.tacticId === action.id) ? (
                      <View style={styles.completedBanner}>
                        <View style={styles.btnIconRow}>
                          <Icon name="check-circle" size={13} color={Colors.income} />
                          <Text style={styles.completedBannerText}>Completed — impact measured, see Track Record above.</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.completedBanner}>
                        <View style={styles.btnIconRow}>
                          <Icon name="clock" size={13} color={Colors.income} />
                          <Text style={styles.completedBannerText}>
                            {`Completed — measuring real impact in ${daysUntilMeasurable(executions[action.id])} day${daysUntilMeasurable(executions[action.id]) === 1 ? '' : 's'} (needs a full ${OUTCOME_MEASUREMENT_WINDOW_DAYS}-day window to compare against).`}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No actions in this timeframe</Text>
              <Text style={styles.emptyStateSubtext}>Check another period</Text>
            </View>
          )}
        </View>

        {/* Key Metrics to Track */}
        <View style={styles.section}>
          <View style={[styles.titleRow, { marginBottom: Spacing.md }]}>
            <Icon name="bar-chart-2" size={14} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Key Metrics to Monitor</Text>
          </View>
          <View style={styles.metricsToTrack}>
            <View style={styles.metricToTrackBox}>
              <View style={styles.metricToTrackIconWrap}>
                <Icon name="dollar-sign" size={22} color={Colors.textMuted} />
              </View>
              <Text style={styles.metricToTrackName}>Cash Position</Text>
              <Text style={styles.metricToTrackValue}>{settings.currency}{Math.round(finance.cashBalance).toLocaleString()}</Text>
            </View>
            <View style={styles.metricToTrackBox}>
              <View style={styles.metricToTrackIconWrap}>
                <Icon name="trending-up" size={22} color={Colors.textMuted} />
              </View>
              <Text style={styles.metricToTrackName}>Runway</Text>
              <Text style={styles.metricToTrackValue}>{Number.isFinite(cashRunwayDays) ? cashRunwayDays : '∞'} days</Text>
            </View>
            <View style={styles.metricToTrackBox}>
              <View style={styles.metricToTrackIconWrap}>
                <Icon name="bar-chart-2" size={22} color={Colors.textMuted} />
              </View>
              <Text style={styles.metricToTrackName}>Profit</Text>
              <Text style={[styles.metricToTrackValue, { color: finance.profit > 0 ? Colors.income : Colors.expense }]}>
                {settings.currency}{Math.round(finance.profit).toLocaleString()}
              </Text>
            </View>
          </View>
          <NextStepLink text="See these numbers projected forward" onPress={() => setCurrentScreen('cashflow')} />
        </View>
      </ScrollView>
      <FooterNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  pad: { padding: Spacing.lg, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.lg },

  impactBanner: {
    backgroundColor: Colors.primary + '15',
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  impactBannerTextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginBottom: Spacing.xs },
  impactBannerText: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  impactBannerValue: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  impactBannerTrackedRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  trackedItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  impactBannerTracked: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  trackRecordCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  trackRecordTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
  trackRecordSub: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  trackRecordRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  trackRecordTacticTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  trackRecordDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  trackRecordHealth: { fontSize: 11, fontWeight: '700', marginTop: 3 },

  tabContainer: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  tab: { flex: 1, paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  tabLabelActive: { color: '#fff' },
  tabCount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  tabCountActive: { color: '#fff' },

  actionsList: { marginBottom: Spacing.xxl },
  actionItem: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: Colors.primary, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  actionItemExpanded: { borderLeftColor: Colors.primary },
  actionItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  actionItemLeft: { flex: 1, flexDirection: 'row', gap: 10 },
  priorityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  actionItemTitleContainer: { flex: 1 },
  actionItemTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  actionItemMeta: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  difficultyBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  difficultyText: { fontSize: 9, fontWeight: '700' },
  timeframeText: { fontSize: 10, color: Colors.textMuted },

  actionItemDetails: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing.md },
  detailSection: { gap: 4 },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  detailText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  detailValue: { fontSize: 18, fontWeight: '800' },
  detailSubtext: { fontSize: 10, color: Colors.textMuted },
  stepItem: { flexDirection: 'row', paddingVertical: 6, gap: Spacing.sm },
  stepNumber: { fontSize: 11, fontWeight: '700', color: Colors.primary, minWidth: 20 },
  stepText: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  probabilityBar: { height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden', marginVertical: 4 },
  probabilityFill: { height: '100%' },
  probabilityText: { fontSize: 10, color: Colors.textMuted },
  blockerText: { fontSize: 11, color: Colors.expense, marginVertical: 3 },
  startButton: { backgroundColor: Colors.income, borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center', marginTop: 4 },
  startButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 6 },
  statusBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  trackRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  trackBtn: { flex: 1, borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
  trackBtnComplete: { backgroundColor: Colors.income, borderColor: Colors.income },
  trackBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  completedBanner: { backgroundColor: Colors.income + '18', borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center', marginTop: 4 },
  completedBannerText: { fontSize: 13, fontWeight: '700', color: Colors.income },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  emptyStateSubtext: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },

  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  metricsToTrack: { flexDirection: 'row', gap: 10 },
  metricToTrackBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  metricToTrackIconWrap: { marginBottom: 6 },
  metricToTrackName: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  metricToTrackValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
});
