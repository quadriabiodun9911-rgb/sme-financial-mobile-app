import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { getMonthlyExpenseAverage, computeRiskScore, RISK_BAND_STYLE } from '../utils/finance';
import SwotAnalysis from '../components/SwotAnalysis';
import NextStepLink from '../components/NextStepLink';
import Icon, { IconName } from '../components/ui/Icon';
import DataConfidenceBadge from '../components/DataConfidenceBadge';
import { describeDataConfidenceTrend } from '../utils/dataConfidenceHistory';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { loadDismissedDiagnosisIds, dismissDiagnosis, undismissDiagnosis } from '../utils/diagnosisDismissal';
import {
  DiagnosisSnapshot,
  loadDiagnosisHistory,
  saveDiagnosisHistory,
  buildDiagnosisSnapshot,
  shouldRecordDiagnosisSnapshot,
  appendDiagnosisSnapshot,
  describeDiagnosisFollowUp,
  findResolvedDiagnoses,
} from '../utils/diagnosisHistory';
import { computeQualityOfGrowth } from '../utils/qualityOfGrowth';
import { computeDirectionVsStatus } from '../utils/directionVsStatus';
import { computeRiskRadar } from '../utils/riskRadar';
import { computeBusinessExposure, computeBusinessResilience } from '../utils/businessExposure';
import { computeFinancialResilience } from '../utils/cashReservePlanning';
import { computeFinancingReadinessScore } from '../utils/finance';
import { computeLendingCapacityEstimate } from '../utils/lendingCapacity';
import { computeDataQuality } from '../utils/dataQuality';
import { buildFinancingFitInput } from '../utils/financingFit';
import { computeInventoryValue } from '../utils/stockVelocity';
import { buildDiagnosticDimensions } from '../utils/diagnosticDimensions';
import { GoalStatus } from '../types';

// Same four states GoalsScreen's own goal cards use (goals.ts
// computeGoalStatus) -- read here only to narrate an already-computed
// status, never to re-derive one.
const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: 'on track',
  at_risk: 'at risk',
  off_track: 'off track',
  achieved: 'achieved',
};

export default function FinancialAssessmentScreen() {
  const { transactions, invoices, finance, settings, setCurrentScreen, navigate, loans, inventory, assets, budgets, dataConfidenceHistory, user, goals } = useApp();
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<number>(0);
  const dataConfidenceTrend = useMemo(() => describeDataConfidenceTrend(dataConfidenceHistory), [dataConfidenceHistory]);

  // "Mark as intentional" -- see diagnosisDismissal.ts for why this exists
  // (the engine's template rules can't tell a deliberate business choice
  // apart from a genuine problem that happens to cross the same threshold).
  // Loaded once on mount; dismissDiagnosis/undismissDiagnosis below update
  // this state directly from their own return value rather than re-reading
  // storage, so the diagnosis recomputes immediately on tap.
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  useEffect(() => {
    loadDismissedDiagnosisIds().then(setDismissedIds);
  }, []);

  const diagnosis = useMemo(() => {
    return performFinancialDiagnosis(
      transactions,
      invoices,
      finance.cashBalance,
      getMonthlyExpenseAverage(finance.expense, transactions),
      settings.currency,
      loans,
      inventory,
      assets,
      settings.industry,
      dismissedIds
    );
  }, [transactions, invoices, finance, settings, loans, inventory, assets, dismissedIds]);

  // Follow-up: "how will Quad360 determine whether this improved" made
  // concrete, not just a static `trigger` sentence. Weekly snapshots of
  // this diagnosis run (same cadence/storage pattern as readinessHistory.ts)
  // let a later visit compare "then" against "now" per diagnosis, and
  // notice when one stops appearing at all.
  const [diagnosisHistory, setDiagnosisHistory] = useState<DiagnosisSnapshot[]>([]);
  useEffect(() => {
    loadDiagnosisHistory().then(setDiagnosisHistory);
  }, []);
  useEffect(() => {
    if (diagnosis.diagnoses.length === 0) return;
    if (!shouldRecordDiagnosisSnapshot(diagnosisHistory)) return;
    const next = appendDiagnosisSnapshot(diagnosisHistory, buildDiagnosisSnapshot(diagnosis.diagnoses));
    setDiagnosisHistory(next);
    saveDiagnosisHistory(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosis.diagnoses]);

  // Resolved since last check -- diagnoses history has seen but the
  // current run (the FULL list, dismissed included -- see
  // performFinancialDiagnosis's own doc comment on why `diagnoses` stays
  // the full list -- so a dismissed-not-fixed issue is never misreported
  // as resolved) no longer produces at all.
  const resolvedDiagnoses = useMemo(
    () => findResolvedDiagnoses(diagnosisHistory, new Set(diagnosis.diagnoses.map(d => d.id))),
    [diagnosisHistory, diagnosis.diagnoses]
  );

  const toggleDismissSelected = async () => {
    const current = diagnosis.diagnoses[selectedDiagnosis];
    if (!current) return;
    const next = dismissedIds.includes(current.id)
      ? await undismissDiagnosis(current.id)
      : await dismissDiagnosis(current.id);
    setDismissedIds(next);
  };

  const actionPlan = useMemo(() => {
    return generateActionPlan(diagnosis, diagnosis.metrics, settings.currency, [], settings.primaryGoal);
  }, [diagnosis, settings.currency, settings.primaryGoal]);

  // Same canonical score CreditWorthinessScreen and the Funding Readiness
  // Pack show — reused here (not recomputed) so the Readiness pillar below
  // never disagrees with "How prepared are you for external capital?"
  // asked anywhere else in the app.
  const risk = useMemo(
    () => computeRiskScore(finance, loans, transactions, inventory),
    [finance, loans, transactions, inventory]
  );
  const riskFactor = (name: string) => risk.factors.find(f => f.name === name);
  const performanceFactor = riskFactor('Profitability');
  const cashFactor = riskFactor('Liquidity');

  // The 8-Dimension Diagnosis -- each of these is the exact same call the
  // screen that canonically owns it already makes (Scoreboard, Risk
  // Management, Credit-Worthiness), reused here rather than recomputed, so
  // this screen's own dimension cards can never disagree with the full
  // detail one tap away. See diagnosticDimensions.ts for why 4 of the 8 are
  // owned here directly and 4 are a grounded summary + link.
  const growthQuality = useMemo(() => computeQualityOfGrowth(transactions, assets, loans), [transactions, assets, loans]);
  const directionVsStatus = useMemo(() => computeDirectionVsStatus(risk, growthQuality), [risk, growthQuality]);
  const exposure = useMemo(
    () => computeBusinessExposure(transactions, loans, inventory, settings?.macroAssumptions ?? [], finance, settings?.nextTaxDeadline, settings.currency),
    [transactions, loans, inventory, settings?.macroAssumptions, finance, settings?.nextTaxDeadline, settings.currency]
  );
  const resilience = useMemo(() => computeBusinessResilience(exposure), [exposure]);
  const riskRadar = useMemo(
    () => computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? [], new Date(), assets),
    [transactions, loans, settings?.macroAssumptions, assets]
  );
  const financialResilience = useMemo(() => computeFinancialResilience(transactions, finance.cashBalance), [transactions, finance.cashBalance]);
  const financingReadinessScore = useMemo(() => computeFinancingReadinessScore(risk.factors).score, [risk.factors]);
  const lendingCapacity = useMemo(() => {
    if (transactions.length < 5) return null;
    const fitInput = buildFinancingFitInput(transactions, loans, settings, user);
    const dataQuality = computeDataQuality(transactions, settings.industry);
    const inventoryValue = computeInventoryValue(inventory);
    return computeLendingCapacityEstimate({
      overallCreditScore: financingReadinessScore,
      avgMonthlyRevenue: fitInput.avgMonthlyRevenue,
      dscr: diagnosis.metrics.dscr,
      hasReliableData: dataQuality.confidence !== 'none' && dataQuality.confidence !== 'limited',
      inventoryValue,
    });
  }, [transactions, loans, settings, user, financingReadinessScore, diagnosis.metrics.dscr, inventory]);

  const { dimensions: diagnosticDimensions, report: businessHealthReport } = useMemo(
    () => buildDiagnosticDimensions({
      diagnosis,
      currency: settings.currency,
      directionVsStatus,
      riskRadar,
      resilience,
      reserveCoverageMonths: financialResilience.available ? financialResilience.reserveCoverageMonths : null,
      financingReadinessScore,
      lendingCapacity,
      transactions,
      loans,
      invoices,
      budgets,
    }),
    [diagnosis, settings.currency, directionVsStatus, riskRadar, resilience, financialResilience, financingReadinessScore, lendingCapacity, transactions, loans, invoices, budgets]
  );
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);

  // If the owner already set up a goal matching what this report would
  // suggest, show its real, already-tracked progress instead of asking
  // them to re-derive the same plan by hand -- the report "monitors" that
  // goal simply by reading its own live progress/status, never a second
  // computation of its own.
  const trackedGoalForReport = useMemo(
    () => (businessHealthReport.suggestedGoalType
      ? goals.find(g => g.type === businessHealthReport.suggestedGoalType && g.status !== 'achieved') ?? null
      : null),
    [goals, businessHealthReport.suggestedGoalType]
  );

  // Total identified financial impact across every issue the diagnosis
  // found — the honest answer to "where could money be leaking?" instead
  // of a made-up figure. Zero issues means zero, not a fabricated number.
  const moneyAtRisk = useMemo(
    () => diagnosis.diagnoses.reduce((sum, d) => sum + Math.max(0, d.financialImpact), 0),
    [diagnosis]
  );

  const factorStatusColor = (status: 'good' | 'warning' | 'danger' | undefined) =>
    status === 'good' ? Colors.income : status === 'warning' ? Colors.warning : status === 'danger' ? Colors.expense : Colors.textMuted;

  // Short status notes for the Performance/Cash pillars, derived only from
  // the factor's status (not its raw explanation string). computeRiskScore's
  // explanation text embeds its own margin/runway number computed from
  // all-time totals, while the pillar's headline number above uses this
  // month's figures (diagnosis.metrics) — two real, differently-scoped
  // numbers that can legitimately disagree. Showing both together read as a
  // contradiction, so the note stays qualitative instead of repeating a
  // second number.
  const performanceNote = performanceFactor?.status === 'good'
    ? 'Comfortably above the 20% healthy-margin benchmark.'
    : performanceFactor?.status === 'warning'
    ? 'Below the 20% healthy-margin benchmark.'
    : performanceFactor?.status === 'danger'
    ? 'Thin margins, or a loss, this period.'
    : 'Not enough data yet.';
  const cashNote = cashFactor?.status === 'good'
    ? 'A healthy cash buffer.'
    : cashFactor?.status === 'warning'
    ? 'Adequate, but worth building up.'
    : cashFactor?.status === 'danger'
    ? 'Tight — worth watching closely.'
    : 'Not enough data yet.';

  const moneyColor = diagnosis.diagnoses.some(d => d.severity === 'critical')
    ? Colors.expense
    : diagnosis.diagnoses.length > 0
    ? Colors.warning
    : Colors.income;

  const readinessColor = risk.band === 'Excellent' || risk.band === 'Strong'
    ? Colors.income
    : risk.band === 'Moderate'
    ? Colors.warning
    : Colors.expense;

  const getHealthColor = (score: number) => {
    if (score >= 70) return Colors.income;
    if (score >= 40) return Colors.warning;
    return Colors.expense;
  };

  const categoryStatusColor = (status: 'strong' | 'watch' | 'high-risk') =>
    status === 'strong' ? Colors.income : status === 'watch' ? Colors.warning : Colors.expense;

  const categoryStatusLabel = (status: 'strong' | 'watch' | 'high-risk') =>
    status === 'strong' ? 'Strong' : status === 'watch' ? 'Watch' : 'High risk';

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return Colors.expense;
      case 'warning':
        return Colors.warning;
      default:
        return Colors.primary;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
        {/* Title */}
        <View style={styles.titleIconRow}>
          <Icon name="search" size={20} color={Colors.textPrimary} />
          <Text style={styles.title}>Financial Assessment</Text>
        </View>
        <Text style={styles.subtitle}>Know exactly where your business stands — money, performance, cash and readiness — from your own numbers, free.</Text>
        {/* This whole screen is a current-month snapshot by design — make
            that explicit and point to the real multi-year view so results
            here aren't mistaken for a full history. */}
        <NextStepLink text="This is a current snapshot — see your multi-year trend" onPress={() => navigate('reports', { reportSection: 'growth', reportTab: 'history' })} />

        {/* Four-pillar audit strip. Deliberately excludes a "Time" pillar
            (how many hours a month admin costs this business) — there is no
            real time-tracking instrumentation in the app, and a made-up
            hours figure would be exactly the kind of fabricated number this
            app refuses to show elsewhere. Ship the four pillars backed by
            real data; add Time if that data ever exists. */}
        <View style={styles.pillarGrid}>
          <View style={[styles.pillarCard, { borderTopColor: moneyColor }]}>
            <Text style={styles.pillarLabel}>MONEY</Text>
            <Text style={styles.pillarQuestion}>Where could money be leaking?</Text>
            <Text style={[styles.pillarValue, { color: moneyColor }]}>
              {moneyAtRisk > 0 ? `${settings.currency}${Math.round(moneyAtRisk).toLocaleString()}` : 'No leaks found'}
            </Text>
            <Text style={styles.pillarDetail} numberOfLines={2}>
              {diagnosis.diagnoses[0]?.problem ?? 'Nothing standing out right now.'}
            </Text>
          </View>

          <View style={[styles.pillarCard, { borderTopColor: factorStatusColor(performanceFactor?.status) }]}>
            <Text style={styles.pillarLabel}>PERFORMANCE</Text>
            <Text style={styles.pillarQuestion}>Are you actually making money?</Text>
            <Text style={[styles.pillarValue, { color: factorStatusColor(performanceFactor?.status) }]}>
              {diagnosis.metrics.profitMargin.toFixed(1)}% margin
            </Text>
            <Text style={styles.pillarDetail} numberOfLines={2}>{performanceNote}</Text>
          </View>

          <View style={[styles.pillarCard, { borderTopColor: factorStatusColor(cashFactor?.status) }]}>
            <Text style={styles.pillarLabel}>CASH</Text>
            <Text style={styles.pillarQuestion}>Will your cash support your plans?</Text>
            <Text style={[styles.pillarValue, { color: factorStatusColor(cashFactor?.status) }]}>
              {diagnosis.metrics.runwayDays ?? '?'} days runway
            </Text>
            <Text style={styles.pillarDetail} numberOfLines={2}>{cashNote}</Text>
          </View>

          <View style={[styles.pillarCard, { borderTopColor: readinessColor }]}>
            <Text style={styles.pillarLabel}>READINESS</Text>
            <Text style={styles.pillarQuestion}>How ready are you for outside capital?</Text>
            <Text style={[styles.pillarValue, { color: readinessColor }]}>{risk.score}/100</Text>
            <Text style={styles.pillarDetail} numberOfLines={2}>{RISK_BAND_STYLE[risk.band].emoji} {RISK_BAND_STYLE[risk.band].label}</Text>
          </View>
        </View>

        {/* Overall Health Score */}
        <View style={[styles.healthCard, { borderLeftColor: getHealthColor(diagnosis.overallHealth) }]}>
          <View style={styles.healthHeader}>
            <Text style={styles.healthLabel}>Quad360 Financial Health</Text>
            <View style={[styles.healthBadge, { backgroundColor: getHealthColor(diagnosis.overallHealth) + '22' }]}>
              <Text style={[styles.healthScore, { color: getHealthColor(diagnosis.overallHealth) }]}>
                {diagnosis.overallHealth}/100 — {diagnosis.band}
              </Text>
            </View>
          </View>
          <View style={styles.healthDescriptionRow}>
            <Icon
              name={diagnosis.healthStatus === 'critical' ? 'alert-triangle' : diagnosis.healthStatus === 'warning' ? 'alert-circle' : 'check-circle'}
              size={14}
              color={diagnosis.healthStatus === 'critical' ? Colors.expense : diagnosis.healthStatus === 'warning' ? Colors.warning : Colors.income}
            />
            <Text style={styles.healthDescription}>
              {diagnosis.healthStatus === 'critical'
                ? 'Immediate action required to improve financial health'
                : diagnosis.healthStatus === 'warning'
                ? 'Address key issues to prevent deterioration'
                : 'Business in good financial health'}
            </Text>
          </View>

          {/* The per-pillar dot list that used to live here is now the
              8-Dimension Diagnosis below -- same underlying categories
              (Profitability, Liquidity, Working Capital, Debt...) plus the
              four this score alone never covered (trend, risk, decision
              and financing readiness), with a real Output per dimension
              instead of just a status dot. Kept to one structure instead
              of two overlapping ones. */}
          <Text style={styles.healthSeeMoreText}>See what's driving this score in the Business Health Report and 8-Dimension Diagnosis below ↓</Text>
        </View>

        {/* "Your Business Health Report" -- the one headline finding the
            owner should read first: what was found, why it matters, what
            to do, and the one decision it bears on. Built from whichever
            of cash/profitability/debt/trends is most urgent right now --
            never a fifth, separately-written assessment layered on top of
            the 8-Dimension Diagnosis below. */}
        <View style={[styles.reportCard, { borderLeftColor: businessHealthReport.status === 'critical' ? Colors.expense : businessHealthReport.status === 'warning' ? Colors.warning : Colors.income }]}>
          <View style={styles.reportHeaderRow}>
            <Text style={styles.reportTitle}>Your Business Health Report</Text>
            <View style={[styles.reportStatusBadge, { backgroundColor: (businessHealthReport.status === 'critical' ? Colors.expense : businessHealthReport.status === 'warning' ? Colors.warning : Colors.income) + '22' }]}>
              <Text style={[styles.reportStatusText, { color: businessHealthReport.status === 'critical' ? Colors.expense : businessHealthReport.status === 'warning' ? Colors.warning : Colors.income }]}>
                {businessHealthReport.statusLabel}
              </Text>
            </View>
          </View>

          <Text style={styles.reportSectionLabel}>What we found</Text>
          <Text style={styles.reportText}>{businessHealthReport.whatWeFound}</Text>

          <View style={styles.narrativeMetricsRow}>
            {businessHealthReport.metrics.map((mt, i) => (
              <View key={i} style={styles.narrativeMetricTile}>
                <Text style={styles.narrativeMetricLabel}>{mt.label}</Text>
                <Text style={styles.narrativeMetricValue}>{mt.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.reportSectionLabel}>Why this matters</Text>
          <Text style={styles.reportText}>{businessHealthReport.whyThisMatters}</Text>

          <Text style={styles.reportSectionLabel}>What you should do next</Text>
          <Text style={styles.reportStepsHint}>Tap a step to go do it.</Text>
          {businessHealthReport.nextSteps.map((step, i) => (
            step.screen ? (
              <TouchableOpacity key={i} style={styles.stepRow} onPress={() => navigate(step.screen!, { ...step.params, focusTask: step.text })} activeOpacity={0.7}>
                <Icon name="check-circle" size={14} color={Colors.income} />
                <Text style={styles.reportStep}>{step.text}</Text>
                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View key={i} style={styles.stepRow}>
                <Icon name="check-circle" size={14} color={Colors.income} />
                <Text style={styles.reportStep}>{step.text}</Text>
              </View>
            )
          ))}

          {/* Where a diagnosis actually goes once you act on it -- the same
              findings above are already what Insights' Decision Centre is
              built from (decisionCentre.ts reads diagnosis.diagnoses
              directly), which is where "Set a goal" turns a finding into a
              tracked FinancialGoal, and a cost-reduction goal's own "Turn
              into a budget" carries it into Budget. Named explicitly here
              since that chain isn't otherwise visible from this screen. */}
          <View style={styles.reportDecisionBox}>
            {trackedGoalForReport ? (
              <>
                <Text style={styles.reportSectionLabel}>Tracking this as a goal</Text>
                <Text style={styles.reportText}>
                  "{trackedGoalForReport.title}" is {Math.round(trackedGoalForReport.progress)}% there -- {GOAL_STATUS_LABEL[trackedGoalForReport.status]}. This report will keep reflecting its real progress as your numbers change.
                </Text>
                <NextStepLink text="View or adjust this goal" onPress={() => navigate('goals', { goalId: trackedGoalForReport.id })} />
              </>
            ) : businessHealthReport.suggestedGoalType ? (
              <>
                <Text style={styles.reportSectionLabel}>Turn this into a tracked plan</Text>
                <Text style={styles.reportText}>
                  Set this up as a goal with one tap -- prefilled from your own numbers, still yours to adjust before saving. Once it exists, this report tracks its real progress automatically.
                </Text>
                <NextStepLink text="Set this up as a goal" onPress={() => navigate('goals', { goalType: businessHealthReport.suggestedGoalType })} />
              </>
            ) : (
              <>
                <Text style={styles.reportSectionLabel}>Turn this into a tracked plan</Text>
                <Text style={styles.reportText}>
                  Every finding above also lives in your Decision Centre, where you can set it as a goal and -- for a cost-cutting goal -- turn that goal straight into a budget.
                </Text>
                <NextStepLink text="Open your Decision Centre" onPress={() => navigate('insights')} />
              </>
            )}
          </View>
        </View>

        {/* The 8-Dimension Diagnosis -- Quad360's Diagnostic Engine
            connecting the numbers to what they mean, dimension by
            dimension, instead of a wall of ratios. See
            diagnosticDimensions.ts for exactly what each one reuses. */}
        <View style={styles.section}>
          <View style={styles.titleIconRow}>
            <Icon name="layers" size={14} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>The 8-Dimension Diagnosis</Text>
          </View>
          <Text style={styles.dimensionsIntro}>
            Not just numbers — what they mean for the business, why it matters, and what to do next. Tap a dimension for the full picture.
          </Text>
          {diagnosticDimensions.map(dim => {
            const isOpen = expandedDimension === dim.key;
            const color = dim.status === 'info' ? Colors.textMuted : categoryStatusColor(dim.status);
            const badgeWord = dim.status === 'info' ? 'Info' : categoryStatusLabel(dim.status);
            return (
              <TouchableOpacity
                key={dim.key}
                style={[styles.dimensionCard, { borderLeftColor: color }]}
                onPress={() => setExpandedDimension(isOpen ? null : dim.key)}
                activeOpacity={0.8}
              >
                <View style={styles.dimensionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dimensionTitle}>{dim.title}</Text>
                    <Text style={styles.dimensionQuestion}>{dim.question}</Text>
                    <Text style={styles.dimensionDetailText}>{dim.statusLabel}</Text>
                  </View>
                  <View style={[styles.dimensionStatusBadge, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.dimensionStatusText, { color }]} numberOfLines={1}>{badgeWord}</Text>
                  </View>
                  <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                </View>

                {isOpen && (
                  <View style={styles.dimensionBody}>
                    {dim.narrative && (
                      <View style={styles.narrativeBox}>
                        <Text style={[styles.narrativeHeadline, { color }]}>{dim.narrative.headline}</Text>
                        <View style={styles.narrativeMetricsRow}>
                          {dim.narrative.metrics.map((mt, i) => (
                            <View key={i} style={styles.narrativeMetricTile}>
                              <Text style={styles.narrativeMetricLabel}>{mt.label}</Text>
                              <Text style={styles.narrativeMetricValue}>{mt.value}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.narrativeSectionLabel}>What this means</Text>
                        <Text style={styles.narrativeText}>{dim.narrative.whatThisMeans}</Text>
                        <Text style={styles.narrativeSectionLabel}>Why it matters</Text>
                        <Text style={styles.narrativeText}>{dim.narrative.whyItMatters}</Text>
                        <Text style={styles.narrativeSectionLabel}>Recommended next steps</Text>
                        <Text style={styles.reportStepsHint}>Tap a step to go do it.</Text>
                        {dim.narrative.recommendedSteps.map((step, i) => (
                          step.screen ? (
                            <TouchableOpacity
                              key={i}
                              style={styles.stepRow}
                              onPress={() => navigate(step.screen!, { ...step.params, focusTask: step.text })}
                              activeOpacity={0.7}
                            >
                              <Icon name="check-circle" size={14} color={Colors.income} />
                              <Text style={styles.narrativeStep}>{step.text}</Text>
                              <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                            </TouchableOpacity>
                          ) : (
                            <View key={i} style={styles.stepRow}>
                              <Icon name="check-circle" size={14} color={Colors.income} />
                              <Text style={styles.narrativeStep}>{step.text}</Text>
                            </View>
                          )
                        ))}

                        {dim.narrative.suggestedGoalType && (() => {
                          const tracked = goals.find(g => g.type === dim.narrative!.suggestedGoalType && g.status !== 'achieved');
                          return (
                            <View style={styles.dimensionGoalBox}>
                              {tracked ? (
                                <>
                                  <Text style={styles.narrativeSectionLabel}>Tracking this as a goal</Text>
                                  <Text style={styles.narrativeText}>
                                    "{tracked.title}" is {Math.round(tracked.progress)}% there -- {GOAL_STATUS_LABEL[tracked.status]}.
                                  </Text>
                                  <NextStepLink text="View or adjust this goal" onPress={() => navigate('goals', { goalId: tracked.id })} />
                                </>
                              ) : (
                                <NextStepLink
                                  text="Set this up as a goal"
                                  onPress={() => navigate('goals', { goalType: dim.narrative!.suggestedGoalType! })}
                                />
                              )}
                            </View>
                          );
                        })()}
                      </View>
                    )}

                    {/* Outputs already restated as one of the two narrative
                        metric tiles above (same value, e.g. Cash on hand ==
                        Bank balance) are skipped here rather than printed
                        twice in one card. */}
                    {dim.outputs.filter(o => !dim.narrative?.metrics.some(mt => mt.value === o.value)).length > 0 && (
                      <Text style={styles.narrativeSectionLabel}>{dim.narrative ? 'More detail' : 'The numbers'}</Text>
                    )}
                    {dim.outputs.filter(o => !dim.narrative?.metrics.some(mt => mt.value === o.value)).map((o, i) => (
                      <View key={i} style={styles.dimensionOutputRow}>
                        <Text style={styles.dimensionOutputLabel}>{o.label}</Text>
                        <Text style={styles.dimensionOutputValue}>{o.value}</Text>
                      </View>
                    ))}

                    {dim.relatedProblems.length > 0 && (
                      <View style={styles.dimensionRelatedBox}>
                        <Text style={styles.dimensionRelatedTitle}>Flagged in Early Warning Signals below:</Text>
                        {dim.relatedProblems.map((p, i) => (
                          <Text key={i} style={styles.dimensionRelatedItem}>• {p}</Text>
                        ))}
                      </View>
                    )}

                    {dim.seeFullDetail && (
                      <NextStepLink
                        text={dim.seeFullDetail.text}
                        onPress={() => navigate(dim.seeFullDetail!.screen, dim.seeFullDetail!.params)}
                      />
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* How much to trust the score above -- how the diagnosis
            distinguishes "confident based on real history" from "your
            first import, take this as a starting point." */}
        <DataConfidenceBadge transactions={transactions} trend={dataConfidenceTrend} />

        {/* "3 things to fix first" and the Revenue/Cash on Hand/Growth
            metrics grid used to live here, but both are now superseded by
            "Your Business Health Report" above (its own "What you should
            do next" steps) and the 8-Dimension Diagnosis (Cash Health and
            Profitability already show these exact figures) — removed
            rather than left as a third, overlapping summary. */}

        {/* SWOT — same underlying data as Reports > Business Health, shown
            here so a full picture (health, SWOT, root causes, actions)
            comes together in one flow right after a statement import
            instead of being scattered across separate screens. No section
            title here -- SwotAnalysis already renders its own plain
            -language header card; a second "SWOT Analysis" label right
            above it would just repeat the same words twice in a row. */}
        <View style={styles.section}>
          <SwotAnalysis />
        </View>

        {/* Resolved Since Last Check -- the positive half of follow-up:
            not just "is this getting better" but "did this go away
            entirely." Only ever diagnoses this device has actually tracked
            (diagnosisHistory.ts), never a claim about issues from before
            this feature existed. */}
        {resolvedDiagnoses.length > 0 && (
          <View style={styles.resolvedCard}>
            <View style={styles.titleIconRow}>
              <Icon name="check-circle" size={15} color={Colors.income} />
              <Text style={styles.resolvedTitle}>Resolved Since Last Check</Text>
            </View>
            {resolvedDiagnoses.map((r, i) => (
              <Text key={i} style={styles.resolvedItemText}>✓ {r.problem}</Text>
            ))}
          </View>
        )}

        {/* Diagnoses */}
        <View style={styles.section}>
          <View style={styles.diagnosisHeader}>
            <View style={styles.titleIconRow}>
              <Icon name="alert-octagon" size={14} color={Colors.expense} />
              <Text style={styles.sectionTitle}>Early Warning Signals ({diagnosis.diagnoses.length})</Text>
            </View>
            {diagnosis.diagnoses.length > 0 && (
              <Text style={styles.diagnosisCount}>{selectedDiagnosis + 1} of {diagnosis.diagnoses.length}</Text>
            )}
          </View>

          {diagnosis.diagnoses.length > 0 ? (
            <View style={[
              styles.diagnosisCard,
              { borderLeftColor: getSeverityColor(diagnosis.diagnoses[selectedDiagnosis].severity) },
              dismissedIds.includes(diagnosis.diagnoses[selectedDiagnosis].id) && styles.diagnosisCardDismissed,
            ]}>
              <View style={styles.diagnosisCardTop}>
                <View>
                  <Text style={styles.diagnosisProblem}>
                    {diagnosis.diagnoses[selectedDiagnosis].problem}
                  </Text>
                  <View style={styles.severityBadge}>
                    <Text style={[styles.severityText, { color: getSeverityColor(diagnosis.diagnoses[selectedDiagnosis].severity) }]}>
                      {diagnosis.diagnoses[selectedDiagnosis].severity.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.diagnosisLabel}>Root Cause</Text>
              <Text style={styles.diagnosisText}>
                {diagnosis.diagnoses[selectedDiagnosis].rootCause}
              </Text>

              {diagnosis.diagnoses[selectedDiagnosis].keyDriver && (
                <>
                  <Text style={styles.diagnosisLabel}>Key Driver</Text>
                  <Text style={styles.diagnosisText}>
                    {diagnosis.diagnoses[selectedDiagnosis].keyDriver}
                  </Text>
                </>
              )}

              <Text style={styles.diagnosisLabel}>Impact</Text>
              <Text style={styles.diagnosisText}>
                {diagnosis.diagnoses[selectedDiagnosis].impact}
              </Text>

              {diagnosis.diagnoses[selectedDiagnosis].trigger && (
                <>
                  <Text style={styles.diagnosisLabel}>Trigger to Watch</Text>
                  <Text style={[styles.diagnosisText, { color: Colors.warning }]}>
                    ⚠️ {diagnosis.diagnoses[selectedDiagnosis].trigger}
                  </Text>
                </>
              )}

              <Text style={styles.diagnosisLabel}>Opportunity</Text>
              <Text style={[styles.diagnosisText, { color: Colors.income, fontWeight: '600' }]}>
                → {diagnosis.diagnoses[selectedDiagnosis].opportunity}
              </Text>

              {/* Follow-up -- "how will Quad360 determine whether this
                  improved," made concrete with an actual before/after
                  comparison instead of left as a one-time finding. See
                  diagnosisHistory.ts. */}
              {(() => {
                const followUp = describeDiagnosisFollowUp(diagnosis.diagnoses[selectedDiagnosis], diagnosisHistory, settings.currency);
                if (!followUp) return null;
                const followUpColor = followUp.kind === 'improving' ? Colors.income : followUp.kind === 'worsening' ? Colors.expense : Colors.textMuted;
                return (
                  <>
                    <Text style={styles.diagnosisLabel}>Follow-up</Text>
                    <Text style={[styles.diagnosisText, { color: followUpColor }]}>
                      {followUp.kind === 'improving' ? '↓ ' : followUp.kind === 'worsening' ? '↑ ' : followUp.kind === 'new' ? '🆕 ' : '→ '}{followUp.text}
                    </Text>
                  </>
                );
              })()}

              {/* "Mark as intentional" -- for when this diagnosis is a
                  deliberate business choice (e.g. long payment terms offered
                  on purpose to land a big client), not a genuine problem.
                  Dismissing it removes it from the "fix first" list and the
                  narrative text immediately (diagnosis recomputes above),
                  but it stays visible here, muted, with an undo -- marking
                  something intentional by mistake should be a tap to fix,
                  not a silent disappearance. */}
              {dismissedIds.includes(diagnosis.diagnoses[selectedDiagnosis].id) ? (
                <View style={styles.dismissedRow}>
                  <Icon name="check-circle" size={13} color={Colors.textMuted} />
                  <Text style={styles.dismissedText}>Marked as intentional — not counted in "fix first"</Text>
                  <TouchableOpacity onPress={toggleDismissSelected}>
                    <Text style={styles.undoDismissText}>Undo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.markIntentionalBtn} onPress={toggleDismissSelected}>
                  <Icon name="check-circle" size={13} color={Colors.textMuted} />
                  <Text style={styles.markIntentionalText}>This is intentional, not a problem</Text>
                </TouchableOpacity>
              )}

              {diagnosis.diagnoses.length > 1 && (
                <View style={styles.navigationButtons}>
                  <TouchableOpacity
                    style={[styles.navButton, selectedDiagnosis === 0 && styles.navButtonDisabled]}
                    onPress={() => setSelectedDiagnosis(Math.max(0, selectedDiagnosis - 1))}
                    disabled={selectedDiagnosis === 0}
                  >
                    <Text style={styles.navButtonText}>← Previous</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navButton, selectedDiagnosis === diagnosis.diagnoses.length - 1 && styles.navButtonDisabled]}
                    onPress={() => setSelectedDiagnosis(Math.min(diagnosis.diagnoses.length - 1, selectedDiagnosis + 1))}
                    disabled={selectedDiagnosis === diagnosis.diagnoses.length - 1}
                  >
                    <Text style={styles.navButtonText}>Next →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noIssuesBox}>
              <View style={styles.titleIconRow}>
                <Icon name="check-circle" size={16} color={Colors.income} />
                <Text style={styles.noIssuesText}>No major issues identified!</Text>
              </View>
              <Text style={styles.noIssuesSubtext}>Your finances are in good shape.</Text>
            </View>
          )}
        </View>

        {/* Action Plan Summary */}
        <View style={styles.section}>
          <View style={styles.titleIconRow}>
            <Icon name="zap" size={14} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Recommended Actions</Text>
          </View>

          {actionPlan.immediateActions.length > 0 && (
            <View style={styles.actionGroup}>
              <View style={styles.titleIconRow}>
                <Icon name="alert-triangle" size={12} color={Colors.textMuted} />
                <Text style={styles.actionGroupTitle}>Do This Week</Text>
              </View>
              {actionPlan.immediateActions.slice(0, 2).map((action, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.actionCard}
                  onPress={() => setCurrentScreen('action-tracker')}
                >
                  <View style={styles.actionCardContent}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionDescription}>{action.description}</Text>
                    <Text style={[styles.actionImpact, { color: action.impactType === 'revenue' ? Colors.income : Colors.expense }]}>
                      Expected impact: +{settings.currency}{Math.round(action.expectedImpact).toLocaleString()}
                    </Text>
                  </View>
                  <Text style={styles.actionArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {actionPlan.shortTermActions.length > 0 && (
            <View style={styles.actionGroup}>
              <View style={styles.titleIconRow}>
                <Icon name="calendar" size={12} color={Colors.textMuted} />
                <Text style={styles.actionGroupTitle}>This Month</Text>
              </View>
              {actionPlan.shortTermActions.slice(0, 2).map((action, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.actionCard}
                  onPress={() => setCurrentScreen('action-tracker')}
                >
                  <View style={styles.actionCardContent}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionImpact}>
                      Expected impact: +{settings.currency}{Math.round(action.expectedImpact).toLocaleString()}
                    </Text>
                  </View>
                  <Text style={styles.actionArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Total Impact */}
        <View style={styles.impactSummary}>
          <View style={styles.titleIconRow}>
            <Icon name="dollar-sign" size={14} color={Colors.textPrimary} />
            <Text style={styles.impactTitle}>Total Potential Impact</Text>
          </View>
          <View style={styles.impactRow}>
            <View style={styles.impactBox}>
              <Text style={styles.impactLabel}>Revenue</Text>
              <Text style={styles.impactValue}>{settings.currency}{Math.round(actionPlan.estimatedCombinedImpact.revenue).toLocaleString()}</Text>
            </View>
            <View style={styles.impactBox}>
              <Text style={styles.impactLabel}>Savings</Text>
              <Text style={styles.impactValue}>{settings.currency}{Math.round(actionPlan.estimatedCombinedImpact.expenseReduction).toLocaleString()}</Text>
            </View>
            <View style={styles.impactBox}>
              <Text style={styles.impactLabel}>Cash</Text>
              <Text style={styles.impactValue}>{settings.currency}{Math.round(actionPlan.estimatedCombinedImpact.cashImprovement).toLocaleString()}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.actionPlanButton}
            onPress={() => setCurrentScreen('action-tracker')}
          >
            <Text style={styles.actionPlanButtonText}>View Full Action Plan →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.budgetButton}
            onPress={() => setCurrentScreen('budget')}
          >
            <View style={styles.titleIconRow}>
              <Icon name="bar-chart-2" size={13} color={Colors.textPrimary} />
              <Text style={styles.budgetButtonText}>Turn this into a budget →</Text>
            </View>
          </TouchableOpacity>
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
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.xl },

  // Shared icon + label row used for section headers, card titles, and
  // inline status lines throughout this screen.
  titleIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

  healthCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  healthBadge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  healthScore: { fontSize: 16, fontWeight: '800' },
  healthStatus: { fontSize: 13, color: Colors.textSecondary },
  healthDescriptionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  healthDescription: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  reportCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  reportHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reportTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  reportStatusBadge: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  reportStatusText: { fontSize: 12, fontWeight: '800' },
  reportSectionLabel: { fontSize: 10.5, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8 },
  reportText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19, marginTop: 2 },
  reportStep: { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
  reportDecisionBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  reportStepsHint: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  pillarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.xl },
  pillarCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderTopWidth: 3,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 3,
    ...Shadow.sm,
  },
  pillarLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 },
  pillarQuestion: { fontSize: 10.5, color: Colors.textSecondary, lineHeight: 14, marginBottom: 2 },
  pillarValue: { fontSize: 15, fontWeight: '800' },
  pillarDetail: { fontSize: 10, color: Colors.textMuted, lineHeight: 14 },

  categoryList: { gap: Spacing.sm, marginTop: Spacing.xs },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  categoryStatus: { fontSize: 12, fontWeight: '700' },
  healthSeeMoreText: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm },

  dimensionsIntro: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.md },
  dimensionCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm,
  },
  dimensionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dimensionTitle: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary },
  dimensionQuestion: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
  dimensionDetailText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginTop: 3 },
  dimensionStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, maxWidth: 110 },
  dimensionStatusText: { fontSize: 10.5, fontWeight: '800' },
  dimensionBody: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  narrativeBox: { marginBottom: 4, gap: 4 },
  narrativeHeadline: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  narrativeMetricsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  narrativeMetricTile: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.sm },
  narrativeMetricLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  narrativeMetricValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  narrativeSectionLabel: { fontSize: 10.5, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 6 },
  narrativeText: { fontSize: 12.5, color: Colors.textPrimary, lineHeight: 18, marginTop: 1 },
  narrativeStep: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, lineHeight: 18 },
  dimensionGoalBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  dimensionOutputRow: { marginBottom: 2 },
  dimensionOutputLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  dimensionOutputValue: { fontSize: 12.5, color: Colors.textPrimary, lineHeight: 17, marginTop: 1 },
  dimensionRelatedBox: { backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: 4 },
  dimensionRelatedTitle: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, marginBottom: 3 },
  dimensionRelatedItem: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  resolvedCard: {
    backgroundColor: Colors.income + '10',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.income,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  resolvedTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  resolvedItemText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 4 },

  section: { marginBottom: Spacing.xxl },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

  diagnosisHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  diagnosisCount: { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  diagnosisCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: Spacing.md,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  diagnosisCardDismissed: { opacity: 0.6 },
  diagnosisCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisProblem: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, flex: 1 },
  severityBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.bg },
  severityText: { fontSize: 9, fontWeight: '700' },
  diagnosisLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: Spacing.xs },
  diagnosisText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  markIntentionalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: Spacing.sm, paddingVertical: 6, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
  },
  markIntentionalText: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600' },
  dismissedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm,
    paddingVertical: 6, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm,
    backgroundColor: Colors.bg,
  },
  dismissedText: { flex: 1, fontSize: 11.5, color: Colors.textMuted },
  undoDismissText: { fontSize: 11.5, color: Colors.primary, fontWeight: '700' },

  navigationButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  navButton: { flex: 1, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: Radius.sm, alignItems: 'center' },
  navButtonDisabled: { opacity: 0.4 },
  navButtonText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  noIssuesBox: {
    backgroundColor: Colors.income + '15', borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  noIssuesText: { fontSize: 14, fontWeight: '700', color: Colors.income },
  noIssuesSubtext: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.xs },

  actionGroup: { marginBottom: Spacing.lg },
  actionGroupTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    alignItems: 'center',
    ...Shadow.sm,
  },
  actionCardContent: { flex: 1 },
  actionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  actionDescription: { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.xs },
  actionImpact: { fontSize: 11, fontWeight: '600', color: Colors.income },
  actionArrow: { fontSize: 18, color: Colors.primary },

  impactSummary: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, gap: Spacing.md,
    borderLeftWidth: 4, borderLeftColor: Colors.income, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  impactTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  impactRow: { flexDirection: 'row', gap: 10 },
  impactBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
  impactLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: Spacing.xs },
  impactValue: { fontSize: 16, fontWeight: '800', color: Colors.income },
  actionPlanButton: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  actionPlanButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  budgetButton: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  budgetButtonText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
});
