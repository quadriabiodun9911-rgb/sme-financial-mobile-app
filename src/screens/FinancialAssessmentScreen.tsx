import React, { useMemo, useState } from 'react';
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
import { Radius, Shadow, Spacing } from '../theme/tokens';

export default function FinancialAssessmentScreen() {
  const { transactions, invoices, finance, settings, setCurrentScreen, navigate, loans, inventory } = useApp();
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<number>(0);

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

  // Total identified financial impact across every issue the diagnosis
  // found — the honest answer to "where could money be leaking?" instead
  // of a made-up figure. Zero issues means zero, not a fabricated number.
  const moneyAtRisk = useMemo(
    () => diagnosis.diagnoses.reduce((sum, d) => sum + Math.max(0, d.financialImpact), 0),
    [diagnosis.diagnoses]
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
        <Text style={styles.subtitle}>Your free Business Health & Efficiency Audit — money, performance, cash and readiness, from your own numbers</Text>
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

          {/* Per-pillar breakdown — Profitability, Liquidity, Working
              Capital, Debt, Efficiency, Inventory, Concentration, each
              scored the same way this overall number is, so a single glance
              shows which pillar is actually dragging the score down instead
              of just the one aggregate number. */}
          <View style={styles.categoryList}>
            {diagnosis.categories.map(cat => (
              <View key={cat.key} style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: categoryStatusColor(cat.status) }]} />
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <Text style={[styles.categoryStatus, { color: categoryStatusColor(cat.status) }]}>
                  {categoryStatusLabel(cat.status)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* "3 things to fix first" — the whole point of running a diagnosis
            instead of just showing numbers: a short, ranked list of what to
            actually do about it. */}
        {diagnosis.topOpportunities.length > 0 && (
          <View style={styles.fixFirstCard}>
            <View style={styles.titleIconRow}>
              <Icon name="target" size={15} color={Colors.textPrimary} />
              <Text style={styles.fixFirstTitle}>Here are the {diagnosis.topOpportunities.length} things you should fix first</Text>
            </View>
            {diagnosis.topOpportunities.map((opportunity, idx) => (
              <View key={idx} style={styles.fixFirstRow}>
                <Text style={styles.fixFirstNumber}>{idx + 1}</Text>
                <Text style={styles.fixFirstText}>{opportunity}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Key Metrics — reframed as evidence for the diagnosis below rather
            than a standalone headline restating Dashboard's Profit/Cash
            numbers; margin/runway/growth are derived figures Dashboard
            doesn't show, not a repeat of it. */}
        <View style={styles.section}>
          <View style={styles.titleIconRow}>
            <Icon name="bar-chart-2" size={14} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>What's Driving This Diagnosis</Text>
          </View>
          <View style={styles.metricsGrid}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Revenue</Text>
              <Text style={styles.metricValue}>
                {settings.currency}{Math.round(diagnosis.metrics.totalRevenue).toLocaleString()}
              </Text>
              <Text style={styles.metricSubtext}>This month</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Profit Margin (This Month)</Text>
              <Text style={[styles.metricValue, { color: diagnosis.metrics.profitMargin > 20 ? Colors.income : Colors.warning }]}>
                {diagnosis.metrics.profitMargin.toFixed(1)}%
              </Text>
              <Text style={styles.metricSubtext}>Target: 20% · differs from the all-time margin shown elsewhere</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Runway</Text>
              <Text style={[styles.metricValue, { color: diagnosis.metrics.runwayDays && diagnosis.metrics.runwayDays > 60 ? Colors.income : Colors.expense }]}>
                {diagnosis.metrics.runwayDays || '?'} days
              </Text>
              <Text style={styles.metricSubtext}>Cash remaining</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Growth</Text>
              <Text style={[styles.metricValue, { color: diagnosis.metrics.monthOverMonthGrowth > 0 ? Colors.income : Colors.expense }]}>
                {diagnosis.metrics.monthOverMonthGrowth > 0 ? '+' : ''}{diagnosis.metrics.monthOverMonthGrowth.toFixed(1)}%
              </Text>
              <Text style={styles.metricSubtext}>MoM change</Text>
            </View>
          </View>
        </View>

        {/* SWOT — same underlying data as Reports > Business Health, shown
            here so a full picture (health, SWOT, root causes, actions)
            comes together in one flow right after a statement import
            instead of being scattered across separate screens. */}
        <View style={styles.section}>
          <View style={styles.titleIconRow}>
            <Icon name="compass" size={14} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>SWOT Analysis</Text>
          </View>
          <SwotAnalysis />
        </View>

        {/* Diagnoses */}
        <View style={styles.section}>
          <View style={styles.diagnosisHeader}>
            <View style={styles.titleIconRow}>
              <Icon name="alert-octagon" size={14} color={Colors.expense} />
              <Text style={styles.sectionTitle}>Issues Identified ({diagnosis.diagnoses.length})</Text>
            </View>
            {diagnosis.diagnoses.length > 0 && (
              <Text style={styles.diagnosisCount}>{selectedDiagnosis + 1} of {diagnosis.diagnoses.length}</Text>
            )}
          </View>

          {diagnosis.diagnoses.length > 0 ? (
            <View style={[styles.diagnosisCard, { borderLeftColor: getSeverityColor(diagnosis.diagnoses[selectedDiagnosis].severity) }]}>
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

              <Text style={styles.diagnosisLabel}>Impact</Text>
              <Text style={styles.diagnosisText}>
                {diagnosis.diagnoses[selectedDiagnosis].impact}
              </Text>

              <Text style={styles.diagnosisLabel}>Opportunity</Text>
              <Text style={[styles.diagnosisText, { color: Colors.income, fontWeight: '600' }]}>
                → {diagnosis.diagnoses[selectedDiagnosis].opportunity}
              </Text>

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

  fixFirstCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  fixFirstTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  fixFirstRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fixFirstNumber: {
    fontSize: 12, fontWeight: '800', color: Colors.primary,
    backgroundColor: Colors.primary + '22', borderRadius: 10,
    width: 20, height: 20, textAlign: 'center', lineHeight: 20,
  },
  fixFirstText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

  section: { marginBottom: Spacing.xxl },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricBox: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  metricLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  metricSubtext: { fontSize: 9, color: Colors.textMuted },

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
  diagnosisCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisProblem: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, flex: 1 },
  severityBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: Spacing.sm, borderRadius: 6, backgroundColor: Colors.bg },
  severityText: { fontSize: 9, fontWeight: '700' },
  diagnosisLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: Spacing.xs },
  diagnosisText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

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
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    alignItems: 'center',
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
