import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import Icon from '../components/ui/Icon';
import { computeRiskScore, RISK_BAND_STYLE } from '../utils/finance';
import { computeRiskRadar, RiskLevel } from '../utils/riskRadar';
import { computeReadinessDelta } from '../utils/readinessHistory';
import { GoalStatus } from '../types';

const BAND_COLOR: Record<string, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

const RISK_LEVEL_META: Record<RiskLevel, { color: string; dot: string }> = {
    high:      { color: Colors.expense,   dot: '🔴' },
    medium:    { color: Colors.warning,   dot: '🟡' },
    low:       { color: Colors.income,    dot: '🟢' },
    'no-data': { color: Colors.textMuted, dot: '⚪' },
};

const FACTOR_STATUS_COLOR: Record<string, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };

const GOAL_STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
    on_track:  { label: 'On Track',  color: Colors.income },
    at_risk:   { label: 'At Risk',   color: Colors.warning },
    off_track: { label: 'Off Track', color: Colors.expense },
    achieved:  { label: 'Achieved',  color: Colors.primary },
};

/**
 * The Scoreboard — "how is my business doing right now," in one glance.
 * Every prior audit of this app found the same real signals (health score,
 * risk radar, readiness trend, goal progress) scattered across the
 * Dashboard, Credit-Worthiness, and Business Passport, with Passport itself
 * deliberately framed as a lender-facing report rather than an everyday
 * check-in. This is a thin composition layer like Passport is -- it computes
 * nothing new, it just pulls the same canonical numbers (computeRiskScore,
 * computeRiskRadar, computeReadinessDelta, goals) into one non-lender-framed
 * screen, and links onward to each one's full detail screen rather than
 * duplicating it.
 */
export default function ScoreboardScreen() {
    const { transactions, loans, inventory, finance, settings, goals, readinessHistory, navigate, setCurrentScreen } = useApp();
    const { currency } = settings;

    const risk = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const bandMeta = useMemo(() => ({ ...RISK_BAND_STYLE[risk.band], color: BAND_COLOR[risk.band] }), [risk.band]);
    const readinessDelta = useMemo(() => computeReadinessDelta(readinessHistory), [readinessHistory]);

    const riskRadar = useMemo(
        () => computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? []),
        [transactions, loans, settings?.macroAssumptions],
    );

    const goalCounts = useMemo(() => {
        const counts: Record<GoalStatus, number> = { on_track: 0, at_risk: 0, off_track: 0, achieved: 0 };
        goals.forEach(g => { counts[g.status] = (counts[g.status] ?? 0) + 1; });
        return counts;
    }, [goals]);
    const activeGoals = useMemo(() => goals.filter(g => g.status !== 'achieved').slice(0, 3), [goals]);

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <View style={s.titleRow}>
                    <Icon name="activity" size={20} color={Colors.textPrimary} />
                    <Text style={s.title}>Scoreboard</Text>
                </View>
                <Text style={s.subtitle}>
                    Everything Quad360 already knows about your business, in one glance — updated live, nothing to prepare.
                </Text>

                <LowDataNotice transactionCount={transactions.length} label="your Scoreboard" />

                {/* Health score hero */}
                <View style={[s.scoreCard, { borderColor: bandMeta.color }]}>
                    <Text style={s.scoreCardLabel}>BUSINESS HEALTH SCORE</Text>
                    <View style={s.scoreRow}>
                        <Text style={[s.scoreValue, { color: bandMeta.color }]}>{Math.round(risk.score)}</Text>
                        <View style={[s.bandBadge, { backgroundColor: bandMeta.color + '22' }]}>
                            <Text style={[s.bandBadgeText, { color: bandMeta.color }]}>{bandMeta.emoji} {bandMeta.label} · {risk.grade}</Text>
                        </View>
                    </View>
                    <View style={s.factorChipsRow}>
                        {risk.factors.map(f => (
                            <View key={f.name} style={s.factorChip}>
                                <View style={[s.factorDot, { backgroundColor: FACTOR_STATUS_COLOR[f.status] }]} />
                                <Text style={s.factorChipText}>{f.name}</Text>
                            </View>
                        ))}
                    </View>

                    {readinessHistory.length < 2 ? (
                        <Text style={s.trendNote}>
                            {readinessHistory.length === 0
                                ? 'Quad360 starts tracking your score trend from today — check back in about a week.'
                                : 'First snapshot recorded — check back in about a week to see a trend.'}
                        </Text>
                    ) : readinessDelta && (
                        <Text style={[
                            s.trendNote,
                            { color: readinessDelta.trend === 'improving' ? Colors.income : readinessDelta.trend === 'declining' ? Colors.expense : Colors.textSecondary },
                        ]}>
                            {readinessDelta.trend === 'improving' && `Improved from ${readinessDelta.fromScore} → ${readinessDelta.toScore} over ${readinessDelta.periodLabel}.`}
                            {readinessDelta.trend === 'declining' && `Dropped from ${readinessDelta.fromScore} → ${readinessDelta.toScore} over ${readinessDelta.periodLabel}.`}
                            {readinessDelta.trend === 'stable' && `Holding steady (${readinessDelta.fromScore} → ${readinessDelta.toScore}) over ${readinessDelta.periodLabel}.`}
                        </Text>
                    )}

                    <TouchableOpacity style={s.linkRow} onPress={() => setCurrentScreen('credit-worthiness')}>
                        <Text style={s.linkText}>See full readiness trend & breakdown →</Text>
                    </TouchableOpacity>
                </View>

                {/* Risk Radar */}
                <TouchableOpacity style={s.card} onPress={() => navigate('cfo', { tab: 'risk' })} activeOpacity={0.85}>
                    <View style={s.cardHeaderRow}>
                        <Icon name="radio" size={14} color={Colors.textMuted} />
                        <Text style={s.cardTitle}>Risk Radar</Text>
                        <View style={[s.bandBadge, { backgroundColor: RISK_LEVEL_META[riskRadar.overallLevel].color + '22', marginLeft: 'auto' }]}>
                            <Text style={[s.bandBadgeText, { color: RISK_LEVEL_META[riskRadar.overallLevel].color }]}>
                                {riskRadar.overallLevel === 'high' ? 'High' : riskRadar.overallLevel === 'medium' ? 'Moderate' : 'Low'}
                            </Text>
                        </View>
                    </View>
                    <View style={s.factorChipsRow}>
                        {riskRadar.categories.map(c => (
                            <View key={c.key} style={s.factorChip}>
                                <Text style={s.riskDot}>{RISK_LEVEL_META[c.level].dot}</Text>
                                <Text style={s.factorChipText}>{c.label}</Text>
                            </View>
                        ))}
                    </View>
                    {riskRadar.topRisks.length > 0 ? (
                        <Text style={s.cardBodyText}>
                            <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>Biggest risk: </Text>
                            {riskRadar.topRisks[0].summary}
                        </Text>
                    ) : (
                        <Text style={s.cardBodyText}>Nothing standing out right now — a good window to focus on growth.</Text>
                    )}
                </TouchableOpacity>

                {/* Goals */}
                <TouchableOpacity style={s.card} onPress={() => setCurrentScreen('goals')} activeOpacity={0.85}>
                    <View style={s.cardHeaderRow}>
                        <Icon name="target" size={14} color={Colors.textMuted} />
                        <Text style={s.cardTitle}>Goals</Text>
                    </View>
                    {goals.length === 0 ? (
                        <Text style={s.cardBodyText}>No goals set yet — tap to set your first one.</Text>
                    ) : (
                        <>
                            <View style={s.factorChipsRow}>
                                {(['on_track', 'at_risk', 'off_track', 'achieved'] as GoalStatus[])
                                    .filter(st => goalCounts[st] > 0)
                                    .map(st => (
                                        <View key={st} style={s.factorChip}>
                                            <View style={[s.factorDot, { backgroundColor: GOAL_STATUS_META[st].color }]} />
                                            <Text style={s.factorChipText}>{goalCounts[st]} {GOAL_STATUS_META[st].label}</Text>
                                        </View>
                                    ))}
                            </View>
                            {activeGoals.map(g => (
                                <View key={g.id} style={s.goalRow}>
                                    <Text style={s.goalTitle} numberOfLines={1}>{g.title}</Text>
                                    <View style={s.goalBarTrack}>
                                        <View style={[s.goalBarFill, { width: `${Math.min(100, Math.max(0, g.progress))}%`, backgroundColor: GOAL_STATUS_META[g.status].color }]} />
                                    </View>
                                </View>
                            ))}
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity style={s.linkRow} onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={s.linkText}>See today's priorities & this month's mission on the Dashboard →</Text>
                </TouchableOpacity>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 16 },

    scoreCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1.5, ...Shadow.sm },
    scoreCardLabel: { fontSize: 10.5, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: Spacing.sm },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
    scoreValue: { fontSize: 40, fontWeight: '800' },
    bandBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
    bandBadgeText: { fontSize: 12, fontWeight: '800' },
    trendNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.sm },

    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    cardBodyText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    factorChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
    factorChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bg, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
    factorDot: { width: 7, height: 7, borderRadius: 4 },
    factorChipText: { fontSize: 10.5, fontWeight: '600', color: Colors.textSecondary },
    riskDot: { fontSize: 9 },

    goalRow: { marginTop: Spacing.sm },
    goalTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
    goalBarTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bg, overflow: 'hidden' },
    goalBarFill: { height: '100%', borderRadius: 3 },

    linkRow: { paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
    linkText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },
});
