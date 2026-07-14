import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { calculateGoalBridge, FinancialGoal } from '../utils/goalBridgeEngine';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';

export default function GoalBridgeScreen() {
  const { transactions, invoices, finance, settings } = useApp();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalType, setGoalType] = useState<'profit' | 'revenue' | 'cash' | 'margin' | 'runway'>('profit');
  const [targetValue, setTargetValue] = useState('1000000');
  const [timelineMonths, setTimelineMonths] = useState('12');
  const [selectedGoal, setSelectedGoal] = useState<FinancialGoal | null>(null);

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

  // Sample goal if none selected
  const exampleGoal: FinancialGoal = selectedGoal || {
    id: 'goal-profit',
    type: 'profit',
    currentValue: finance.profit,
    targetValue: parseInt(targetValue || '1000000') || 1000000,
    timelineMonths: parseInt(timelineMonths || '12') || 12,
    description: `Reach ₦${(parseInt(targetValue || '0') || 0).toLocaleString()} monthly profit`,
  };

  const bridge = useMemo(() => {
    return calculateGoalBridge(exampleGoal, diagnosis.metrics, actionPlan.immediateActions.concat(actionPlan.shortTermActions).concat(actionPlan.strategicActions), settings.currency);
  }, [exampleGoal, diagnosis.metrics, actionPlan, settings.currency]);

  const getFeasibilityColor = (feasibility: string) => {
    if (feasibility === 'easy') return Colors.income;
    if (feasibility === 'medium') return Colors.warning;
    return Colors.expense;
  };

  const handleCreateGoal = () => {
    setSelectedGoal({
      id: `goal-${Date.now()}`,
      type: goalType,
      currentValue: finance[goalType === 'profit' ? 'profit' : goalType === 'revenue' ? 'income' : 'cashBalance'],
      targetValue: parseInt(targetValue || '1000000') || 1000000,
      timelineMonths: parseInt(timelineMonths || '12') || 12,
      description: `Reach ₦${(parseInt(targetValue || '0') || 0).toLocaleString()} ${goalType}`,
    });
    setShowGoalModal(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
        {/* Title */}
        <Text style={styles.title}>🌉 Goal Bridge</Text>
        <Text style={styles.subtitle}>Connect your goal to specific tactics</Text>

        {/* Goal Card */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <View>
              <Text style={styles.goalLabel}>Goal</Text>
              <Text style={styles.goalDescription}>{bridge.goal.description}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowGoalModal(true)}>
              <Text style={styles.editButton}>✏️ Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.goalMetrics}>
            <View style={styles.goalMetricBox}>
              <Text style={styles.goalMetricLabel}>Current</Text>
              <Text style={styles.goalMetricValue}>{settings.currency}{Math.round(bridge.goal.currentValue).toLocaleString()}</Text>
            </View>
            <View style={styles.goalArrow}>
              <Text style={styles.arrowText}>→</Text>
            </View>
            <View style={styles.goalMetricBox}>
              <Text style={styles.goalMetricLabel}>Target</Text>
              <Text style={styles.goalMetricValue}>{settings.currency}{Math.round(bridge.goal.targetValue).toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.gapInfo}>
            <Text style={styles.gapLabel}>Gap to Close</Text>
            <View style={styles.gapRow}>
              <Text style={styles.gapValue}>{settings.currency}{Math.round(Math.abs(bridge.gap)).toLocaleString()}</Text>
              <Text style={styles.gapPercentage}>({Math.abs(bridge.gapPercentage).toFixed(1)}%)</Text>
            </View>
          </View>
        </View>

        {/* Feasibility Assessment */}
        <View style={[styles.assessmentCard, { borderLeftColor: getFeasibilityColor(bridge.feasibility) }]}>
          <View style={styles.assessmentHeader}>
            <Text style={styles.assessmentLabel}>Feasibility Assessment</Text>
            <View style={[styles.feasibilityBadge, { backgroundColor: getFeasibilityColor(bridge.feasibility) + '22', borderColor: getFeasibilityColor(bridge.feasibility) }]}>
              <Text style={[styles.feasibilityText, { color: getFeasibilityColor(bridge.feasibility) }]}>
                {bridge.feasibility.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.assessmentRow}>
            <Text style={styles.assessmentRowLabel}>Required Monthly Improvement:</Text>
            <Text style={styles.assessmentRowValue}>{settings.currency}{Math.round(bridge.requiredMonthlyImprovement).toLocaleString()}</Text>
          </View>

          <View style={styles.assessmentRow}>
            <Text style={styles.assessmentRowLabel}>Realistic Timeline:</Text>
            <Text style={styles.assessmentRowValue}>{bridge.achievableTimeline} months</Text>
            <Text style={styles.timelineNote}>({bridge.goal.timelineMonths} month target)</Text>
          </View>

          <View style={styles.assessmentRow}>
            <Text style={styles.assessmentRowLabel}>Recommended Approach:</Text>
            <Text style={[styles.approachBadge, { backgroundColor: Colors.primary + '22' }]}>
              <Text style={{ color: Colors.primary, fontWeight: '700' }}>
                {bridge.recommendedApproach === 'revenue-focused' ? '📈 Revenue-Focused' : bridge.recommendedApproach === 'expense-focused' ? '💰 Expense-Focused' : '⚖️ Hybrid'}
              </Text>
            </Text>
          </View>

          <View style={styles.assessmentRow}>
            <Text style={styles.assessmentRowLabel}>Success Probability:</Text>
            <View style={styles.probabilityContainer}>
              <View style={styles.probabilityBar}>
                <View
                  style={[
                    styles.probabilityFill,
                    { width: `${bridge.successProbability * 100}%`, backgroundColor: bridge.successProbability > 0.6 ? Colors.income : Colors.warning },
                  ]}
                />
              </View>
              <Text style={styles.probabilityPercent}>{(bridge.successProbability * 100).toFixed(0)}%</Text>
            </View>
          </View>
        </View>

        {/* Tactics Roadmap */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗺️ Tactics Roadmap</Text>
          <View style={styles.roadmap}>
            {bridge.tactics.map((allocation, idx) => (
              <View key={idx} style={styles.roadmapNode}>
                <View style={styles.timelineNodeContainer}>
                  <View style={[styles.timelineNode, { backgroundColor: Colors.primary }]} />
                  {idx < bridge.tactics.length - 1 && <View style={styles.timelineConnector} />}
                </View>
                <View style={styles.roadmapCard}>
                  <Text style={styles.roadmapCardTitle}>{allocation.tactic.title}</Text>
                  <Text style={styles.roadmapCardMonth}>Month {Math.round(allocation.monthStart)}-{Math.round(allocation.monthEnd)}</Text>
                  <Text style={[styles.roadmapCardContribution, { color: allocation.tactic.impactType === 'revenue' ? Colors.income : Colors.expense }]}>
                    +{settings.currency}{Math.round(allocation.contributionToGoal).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Milestones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏁 Milestones</Text>
          {bridge.milestones.map((milestone, idx) => (
            <View key={idx} style={styles.milestoneCard}>
              <View style={styles.milestoneLeft}>
                <View style={[styles.milestoneDot, { backgroundColor: idx === bridge.milestones.length - 1 ? Colors.income : Colors.primary }]} />
                <View style={styles.milestoneContent}>
                  <Text style={styles.milestoneMonth}>Month {milestone.month}</Text>
                  <Text style={styles.milestoneDescription}>{milestone.description}</Text>
                </View>
              </View>
              <Text style={styles.milestoneValue}>{settings.currency}{Math.round(milestone.targetValue).toLocaleString()}</Text>
            </View>
          ))}
        </View>

        {/* Call to Action */}
        <TouchableOpacity style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Start Executing This Plan →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Goal Modal */}
      <Modal visible={showGoalModal} transparent animationType="slide" onRequestClose={() => setShowGoalModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set New Goal</Text>
              <TouchableOpacity onPress={() => setShowGoalModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Goal Type</Text>
              <View style={styles.goalTypeButtons}>
                {(['profit', 'revenue', 'cash', 'margin', 'runway'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.goalTypeButton, goalType === type && styles.goalTypeButtonActive]}
                    onPress={() => setGoalType(type)}
                  >
                    <Text style={[styles.goalTypeButtonText, goalType === type && styles.goalTypeButtonTextActive]}>
                      {type === 'profit' ? '💰 Profit' : type === 'revenue' ? '📈 Revenue' : type === 'cash' ? '💵 Cash' : type === 'margin' ? '📊 Margin' : '⏱️ Runway'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Target Value</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter target value"
                keyboardType="number-pad"
                value={targetValue}
                onChangeText={setTargetValue}
              />

              <Text style={styles.inputLabel}>Timeline (Months)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter timeline in months"
                keyboardType="number-pad"
                value={timelineMonths}
                onChangeText={setTimelineMonths}
              />

              <TouchableOpacity style={styles.modalButton} onPress={handleCreateGoal}>
                <Text style={styles.modalButtonText}>Create Goal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

  goalCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: Colors.primary },
  goalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  goalLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  goalDescription: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  editButton: { fontSize: 18, padding: 4 },

  goalMetrics: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  goalMetricBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
  goalMetricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  goalMetricValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  goalArrow: { paddingHorizontal: 8 },
  arrowText: { fontSize: 16, color: Colors.textMuted },

  gapInfo: { paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  gapLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  gapRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  gapValue: { fontSize: 18, fontWeight: '800', color: Colors.expense },
  gapPercentage: { fontSize: 12, color: Colors.textMuted },

  assessmentCard: { backgroundColor: Colors.surface, borderRadius: 14, borderLeftWidth: 4, padding: 16, marginBottom: 20, gap: 12 },
  assessmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  assessmentLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  feasibilityBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  feasibilityText: { fontSize: 10, fontWeight: '700' },

  assessmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assessmentRowLabel: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  assessmentRowValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  timelineNote: { fontSize: 10, color: Colors.textMuted, marginLeft: 4 },
  approachBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },

  probabilityContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  probabilityBar: { flex: 1, height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden' },
  probabilityFill: { height: '100%' },
  probabilityPercent: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },

  roadmap: { gap: 4 },
  roadmapNode: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  timelineNodeContainer: { alignItems: 'center', width: 30 },
  timelineNode: { width: 12, height: 12, borderRadius: 6 },
  timelineConnector: { width: 2, height: 30, backgroundColor: Colors.border, marginTop: 4 },
  roadmapCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderLeftWidth: 2, borderLeftColor: Colors.primary },
  roadmapCardTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  roadmapCardMonth: { fontSize: 10, color: Colors.textMuted, marginBottom: 6 },
  roadmapCardContribution: { fontSize: 12, fontWeight: '700' },

  milestoneCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: Colors.primary },
  milestoneLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  milestoneDot: { width: 12, height: 12, borderRadius: 6 },
  milestoneContent: { flex: 1 },
  milestoneMonth: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  milestoneDescription: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  milestoneValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

  ctaButton: { backgroundColor: Colors.income, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  ctaButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  modalClose: { fontSize: 18, color: Colors.textMuted },
  modalScroll: { padding: 16 },

  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase' },
  goalTypeButtons: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  goalTypeButton: { flex: 1, minWidth: '48%', backgroundColor: Colors.bg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  goalTypeButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  goalTypeButtonText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  goalTypeButtonTextActive: { color: '#fff' },

  input: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: Colors.textPrimary, marginBottom: 16 },
  modalButton: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  modalButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
