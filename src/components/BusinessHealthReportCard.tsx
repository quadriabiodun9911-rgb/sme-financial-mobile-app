import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import NextStepLink from './NextStepLink';
import { BusinessHealthReport } from '../utils/diagnosticDimensions';
import { HealthScoreDelta } from '../utils/healthScoreHistory';
import { FinancialGoal, GoalStatus, NavParams, Screen } from '../types';

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
    on_track: 'on track',
    at_risk: 'at risk',
    off_track: 'off track',
    achieved: 'achieved',
};

interface Props {
    report: BusinessHealthReport;
    healthScoreDelta: HealthScoreDelta | null;
    trackedGoal: FinancialGoal | null;
    navigate: (screen: Screen, params?: NavParams) => void;
}

// "Your Business Health Report" -- the one headline finding the owner
// should read first: what was found, why it matters, what to do, and the
// one decision it bears on. Originally Financial Assessment's own card;
// extracted so Scoreboard can show the exact same report (built from the
// exact same buildDiagnosticDimensions call, just fed from Scoreboard's
// own already-computed inputs) directly under its own Business Health
// Score card, instead of a second hand-written version that could drift
// from this one.
export default function BusinessHealthReportCard({ report, healthScoreDelta, trackedGoal, navigate }: Props) {
    const statusColor = report.status === 'critical' ? Colors.expense : report.status === 'warning' ? Colors.warning : Colors.income;

    return (
        <View style={[styles.reportCard, { borderLeftColor: statusColor }]}>
            <View style={styles.reportHeaderRow}>
                <Text style={styles.reportTitle}>Your Business Health Report</Text>
                <View style={[styles.reportStatusBadge, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[styles.reportStatusText, { color: statusColor }]}>{report.statusLabel}</Text>
                </View>
            </View>

            {healthScoreDelta && healthScoreDelta.trend !== 'stable' && (
                <View style={[styles.trendSummaryBox, { borderColor: healthScoreDelta.trend === 'improving' ? Colors.income : Colors.expense }]}>
                    <Icon name={healthScoreDelta.trend === 'improving' ? 'trending-up' : 'trending-down'} size={14} color={healthScoreDelta.trend === 'improving' ? Colors.income : Colors.expense} />
                    <Text style={[styles.trendSummaryText, { color: healthScoreDelta.trend === 'improving' ? Colors.income : Colors.expense }]}>
                        {healthScoreDelta.trend === 'improving'
                            ? `Overall health improved ${healthScoreDelta.fromScore}→${healthScoreDelta.toScore} over ${healthScoreDelta.periodLabel}${healthScoreDelta.improvedCategories.length > 0 ? ` — ${healthScoreDelta.improvedCategories.map(c => c.label).join(', ')} led the way.` : '.'}`
                            : `Overall health dropped ${healthScoreDelta.fromScore}→${healthScoreDelta.toScore} over ${healthScoreDelta.periodLabel}${healthScoreDelta.worsenedCategories.length > 0 ? ` — ${healthScoreDelta.worsenedCategories.map(c => c.label).join(', ')} needs attention.` : '.'}`}
                    </Text>
                </View>
            )}

            <Text style={styles.reportSectionLabel}>What we found</Text>
            <Text style={styles.reportText}>{report.whatWeFound}</Text>

            <View style={styles.narrativeMetricsRow}>
                {report.metrics.map((mt, i) => (
                    <View key={i} style={styles.narrativeMetricTile}>
                        <Text style={styles.narrativeMetricLabel}>{mt.label}</Text>
                        <Text style={[styles.narrativeMetricValue, mt.tone === 'negative' ? { color: Colors.expense } : mt.tone === 'positive' ? { color: Colors.income } : null]}>{mt.value}</Text>
                        {mt.compareLabel && <Text style={styles.diagnosisMetricCompareLabel}>{mt.compareLabel}</Text>}
                    </View>
                ))}
            </View>

            <Text style={styles.reportSectionLabel}>Why this matters</Text>
            <Text style={styles.reportText}>{report.whyThisMatters}</Text>

            {report.investigate.length > 0 && (
                <View style={styles.investigateBox}>
                    <Text style={styles.reportSectionLabel}>What you can investigate</Text>
                    {report.investigate.map((q, i) => (
                        <Text key={i} style={styles.investigateItem}>• {q}</Text>
                    ))}
                </View>
            )}

            <Text style={styles.reportSectionLabel}>What you should do next</Text>
            <Text style={styles.reportStepsHint}>Tap a step to go do it.</Text>
            {report.nextSteps.map((step, i) => (
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

            <View style={styles.reportDecisionBox}>
                {trackedGoal ? (
                    <>
                        <Text style={styles.reportSectionLabel}>Tracking this as a goal</Text>
                        <Text style={styles.reportText}>
                            "{trackedGoal.title}" is {Math.round(trackedGoal.progress)}% there -- {GOAL_STATUS_LABEL[trackedGoal.status]}. This report will keep reflecting its real progress as your numbers change.
                        </Text>
                        <NextStepLink text="View or adjust this goal" onPress={() => navigate('goals', { goalId: trackedGoal.id })} />
                    </>
                ) : report.suggestedGoalType ? (
                    <>
                        <Text style={styles.reportSectionLabel}>Turn this into a tracked plan</Text>
                        <Text style={styles.reportText}>
                            Set this up as a goal with one tap -- prefilled from your own numbers, still yours to adjust before saving. Once it exists, this report tracks its real progress automatically.
                        </Text>
                        <NextStepLink text="Set this up as a goal" onPress={() => navigate('goals', { goalType: report.suggestedGoalType })} />
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
    );
}

const styles = StyleSheet.create({
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
    trendSummaryBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: 1, borderRadius: Radius.sm, padding: 10, marginTop: 10 },
    trendSummaryText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
    reportStep: { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
    reportDecisionBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    reportStepsHint: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
    narrativeMetricsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    narrativeMetricTile: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.sm },
    narrativeMetricLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    narrativeMetricValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
    diagnosisMetricCompareLabel: { fontSize: 9.5, color: Colors.textMuted, marginTop: 2 },
    investigateBox: { marginTop: 2 },
    investigateItem: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 3 },
});
