import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import SwotAnalysis from '../components/SwotAnalysis';
import NextStepLink from '../components/NextStepLink';

export default function FinancialAssessmentScreen() {
  const { transactions, invoices, finance, settings, setCurrentScreen } = useApp();
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<number>(0);

  const diagnosis = useMemo(() => {
    return performFinancialDiagnosis(
      transactions,
      invoices,
      finance.cashBalance,
      finance.expense || 100000,
      settings.currency
    );
  }, [transactions, invoices, finance, settings]);

  const actionPlan = useMemo(() => {
    return generateActionPlan(diagnosis, diagnosis.metrics, settings.currency);
  }, [diagnosis, settings.currency]);

  const getHealthColor = (score: number) => {
    if (score >= 70) return Colors.income;
    if (score >= 40) return Colors.warning;
    return Colors.expense;
  };

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
        <Text style={styles.title}>🔍 Financial Assessment</Text>
        <Text style={styles.subtitle}>AI-powered diagnosis & recommendations</Text>
        {/* This whole screen is a current-month snapshot by design — make
            that explicit and point to the real multi-year view so results
            here aren't mistaken for a full history. */}
        <NextStepLink text="This is a current snapshot — see your multi-year trend" onPress={() => setCurrentScreen('trends')} />

        {/* Overall Health Score */}
        <View style={[styles.healthCard, { borderLeftColor: getHealthColor(diagnosis.overallHealth) }]}>
          <View style={styles.healthHeader}>
            <Text style={styles.healthLabel}>Financial Health</Text>
            <View style={[styles.healthBadge, { backgroundColor: getHealthColor(diagnosis.overallHealth) + '22' }]}>
              <Text style={[styles.healthScore, { color: getHealthColor(diagnosis.overallHealth) }]}>
                {diagnosis.overallHealth}/100
              </Text>
            </View>
          </View>
          <Text style={styles.healthStatus}>
            Status: <Text style={{ fontWeight: '700', color: getHealthColor(diagnosis.overallHealth) }}>
              {diagnosis.healthStatus.toUpperCase()}
            </Text>
          </Text>
          <Text style={styles.healthDescription}>
            {diagnosis.healthStatus === 'critical'
              ? '🚨 Immediate action required to improve financial health'
              : diagnosis.healthStatus === 'warning'
              ? '⚠️ Address key issues to prevent deterioration'
              : '✅ Business in good financial health'}
          </Text>
        </View>

        {/* Key Metrics — reframed as evidence for the diagnosis below rather
            than a standalone headline restating Dashboard's Profit/Cash
            numbers; margin/runway/growth are derived figures Dashboard
            doesn't show, not a repeat of it. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 What's Driving This Diagnosis</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Revenue</Text>
              <Text style={styles.metricValue}>
                {settings.currency}{Math.round(diagnosis.metrics.totalRevenue).toLocaleString()}
              </Text>
              <Text style={styles.metricSubtext}>This month</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Profit Margin</Text>
              <Text style={[styles.metricValue, { color: diagnosis.metrics.profitMargin > 20 ? Colors.income : Colors.warning }]}>
                {diagnosis.metrics.profitMargin.toFixed(1)}%
              </Text>
              <Text style={styles.metricSubtext}>Target: 20%</Text>
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
          <Text style={styles.sectionTitle}>🧭 SWOT Analysis</Text>
          <SwotAnalysis />
        </View>

        {/* Diagnoses */}
        <View style={styles.section}>
          <View style={styles.diagnosisHeader}>
            <Text style={styles.sectionTitle}>🔴 Issues Identified ({diagnosis.diagnoses.length})</Text>
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
              <Text style={styles.noIssuesText}>✅ No major issues identified!</Text>
              <Text style={styles.noIssuesSubtext}>Your finances are in good shape.</Text>
            </View>
          )}
        </View>

        {/* Action Plan Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Recommended Actions</Text>

          {actionPlan.immediateActions.length > 0 && (
            <View style={styles.actionGroup}>
              <Text style={styles.actionGroupTitle}>🚨 Do This Week</Text>
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
              <Text style={styles.actionGroupTitle}>📅 This Month</Text>
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
          <Text style={styles.impactTitle}>💰 Total Potential Impact</Text>
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
            <Text style={styles.budgetButtonText}>📊  Turn this into a budget →</Text>
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
  pad: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 20 },

  healthCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  healthBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  healthScore: { fontSize: 16, fontWeight: '800' },
  healthStatus: { fontSize: 13, color: Colors.textSecondary },
  healthDescription: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricBox: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  metricLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  metricSubtext: { fontSize: 9, color: Colors.textMuted },

  diagnosisHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  diagnosisCount: { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  diagnosisCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  diagnosisCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisProblem: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, flex: 1 },
  severityBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: Colors.bg },
  severityText: { fontSize: 9, fontWeight: '700' },
  diagnosisLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 4 },
  diagnosisText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  navigationButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  navButton: { flex: 1, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 8, alignItems: 'center' },
  navButtonDisabled: { opacity: 0.4 },
  navButtonText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  noIssuesBox: { backgroundColor: Colors.income + '15', borderRadius: 12, padding: 16, alignItems: 'center' },
  noIssuesText: { fontSize: 14, fontWeight: '700', color: Colors.income, marginBottom: 4 },
  noIssuesSubtext: { fontSize: 12, color: Colors.textSecondary },

  actionGroup: { marginBottom: 16 },
  actionGroupTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase' },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    alignItems: 'center',
  },
  actionCardContent: { flex: 1 },
  actionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  actionDescription: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  actionImpact: { fontSize: 11, fontWeight: '600', color: Colors.income },
  actionArrow: { fontSize: 18, color: Colors.primary },

  impactSummary: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 12, borderLeftWidth: 4, borderLeftColor: Colors.income },
  impactTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  impactRow: { flexDirection: 'row', gap: 10 },
  impactBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
  impactLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  impactValue: { fontSize: 16, fontWeight: '800', color: Colors.income },
  actionPlanButton: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  actionPlanButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  budgetButton: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  budgetButtonText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
});
