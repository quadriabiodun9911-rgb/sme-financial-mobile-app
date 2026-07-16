import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { initiateTacticTracking, updateTacticProgress } from '../utils/outcomeTrackingEngine';
import NextStepLink from '../components/NextStepLink';

export default function ActionTrackerScreen() {
  const { transactions, invoices, finance, settings, setCurrentScreen } = useApp();
  const [activeTab, setActiveTab] = useState<'immediate' | 'shortterm' | 'strategic'>('immediate');
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

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

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
        {/* Title */}
        <Text style={styles.title}>⚡ Action Tracker</Text>
        <Text style={styles.subtitle}>Prioritized tactics to reach your goals</Text>

        {/* Total Impact Banner */}
        <View style={styles.impactBanner}>
          <Text style={styles.impactBannerText}>
            💰 {actionPlan.immediateActions.length + actionPlan.shortTermActions.length} high-impact actions ready to execute
          </Text>
          <Text style={styles.impactBannerValue}>
            +{settings.currency}{Math.round(actionPlan.estimatedTotalImpact).toLocaleString()} potential
          </Text>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'immediate' && styles.tabActive]}
            onPress={() => setActiveTab('immediate')}
          >
            <Text style={[styles.tabLabel, activeTab === 'immediate' && styles.tabLabelActive]}>
              🚨 Immediate
            </Text>
            <Text style={[styles.tabCount, activeTab === 'immediate' && styles.tabCountActive]}>
              {tabData.immediate.actions.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'shortterm' && styles.tabActive]}
            onPress={() => setActiveTab('shortterm')}
          >
            <Text style={[styles.tabLabel, activeTab === 'shortterm' && styles.tabLabelActive]}>
              📅 This Month
            </Text>
            <Text style={[styles.tabCount, activeTab === 'shortterm' && styles.tabCountActive]}>
              {tabData.shortterm.actions.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'strategic' && styles.tabActive]}
            onPress={() => setActiveTab('strategic')}
          >
            <Text style={[styles.tabLabel, activeTab === 'strategic' && styles.tabLabelActive]}>
              🎯 Quarter
            </Text>
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
                      </View>
                    </View>
                  </View>
                  <Text style={styles.expandIcon}>{expandedActionId === action.id ? '▼' : '▶'}</Text>
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
                        <Text style={[styles.detailLabel, { color: Colors.expense }]}>⚠️ Potential Blockers</Text>
                        {action.blockers.map((blocker, idx) => (
                          <Text key={idx} style={styles.blockerText}>• {blocker}</Text>
                        ))}
                      </View>
                    )}

                    {action.prerequisite && (
                      <View style={[styles.detailSection, { backgroundColor: Colors.primary + '12', borderLeftWidth: 3, borderLeftColor: Colors.primary }]}>
                        <Text style={[styles.detailLabel, { color: Colors.primary }]}>🔗 Prerequisite</Text>
                        <Text style={styles.detailText}>Complete this first: {action.prerequisite}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.startButton}
                      onPress={() => {
                        const steps = action.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
                        Alert.alert(action.title, steps || 'No steps listed for this action.');
                      }}
                    >
                      <Text style={styles.startButtonText}>▶ Start This Action</Text>
                    </TouchableOpacity>
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
          <Text style={styles.sectionTitle}>📊 Key Metrics to Monitor</Text>
          <View style={styles.metricsToTrack}>
            <View style={styles.metricToTrackBox}>
              <Text style={styles.metricToTrackIcon}>💰</Text>
              <Text style={styles.metricToTrackName}>Cash Position</Text>
              <Text style={styles.metricToTrackValue}>{settings.currency}{Math.round(finance.cashBalance).toLocaleString()}</Text>
            </View>
            <View style={styles.metricToTrackBox}>
              <Text style={styles.metricToTrackIcon}>📈</Text>
              <Text style={styles.metricToTrackName}>Runway</Text>
              <Text style={styles.metricToTrackValue}>{Math.floor(finance.cashBalance / (Math.max(finance.expense / 30, 1) || 1)) || '?'} days</Text>
            </View>
            <View style={styles.metricToTrackBox}>
              <Text style={styles.metricToTrackIcon}>💹</Text>
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
  pad: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },

  impactBanner: {
    backgroundColor: Colors.primary + '15',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  impactBannerText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  impactBannerValue: { fontSize: 18, fontWeight: '800', color: Colors.primary },

  tabContainer: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  tabLabelActive: { color: '#fff' },
  tabCount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  tabCountActive: { color: '#fff' },

  actionsList: { marginBottom: 24 },
  actionItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  actionItemExpanded: { borderLeftColor: Colors.primary },
  actionItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  actionItemLeft: { flex: 1, flexDirection: 'row', gap: 10 },
  priorityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  actionItemTitleContainer: { flex: 1 },
  actionItemTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  actionItemMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  difficultyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  difficultyText: { fontSize: 9, fontWeight: '700' },
  timeframeText: { fontSize: 10, color: Colors.textMuted },
  expandIcon: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },

  actionItemDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, gap: 12 },
  detailSection: { gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  detailText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  detailValue: { fontSize: 18, fontWeight: '800' },
  detailSubtext: { fontSize: 10, color: Colors.textMuted },
  stepItem: { flexDirection: 'row', paddingVertical: 6, gap: 8 },
  stepNumber: { fontSize: 11, fontWeight: '700', color: Colors.primary, minWidth: 20 },
  stepText: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  probabilityBar: { height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden', marginVertical: 4 },
  probabilityFill: { height: '100%' },
  probabilityText: { fontSize: 10, color: Colors.textMuted },
  blockerText: { fontSize: 11, color: Colors.expense, marginVertical: 3 },
  startButton: { backgroundColor: Colors.income, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  startButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  emptyStateSubtext: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
  metricsToTrack: { flexDirection: 'row', gap: 10 },
  metricToTrackBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
  metricToTrackIcon: { fontSize: 24, marginBottom: 6 },
  metricToTrackName: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  metricToTrackValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
});
