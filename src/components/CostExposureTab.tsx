import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { computeCostExposure, CostCategorySignal, ExposureBand } from '../utils/costExposure';
import { computeCostExposureForecast } from '../utils/costExposureForecast';
import { computeExternalRiskInsights, ExternalRiskInsight } from '../utils/externalRiskInsights';
import RadialGauge from './RadialGauge';
import BarList from './BarList';
import GroupedBarChart from './GroupedBarChart';

const BAND_COLOR: Record<ExposureBand, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

function fmtCompact(currency: string, amount: number): string {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

export default function CostExposureTab() {
    const { transactions, settings, navigate } = useApp();
    const currency = settings.currency || '₦';

    const result = useMemo(() => computeCostExposure(transactions), [transactions]);
    const externalRisk = useMemo(
        () => computeExternalRiskInsights(transactions, settings.macroAssumptions ?? []),
        [transactions, settings.macroAssumptions]
    );
    const forecast = useMemo(
        () => computeCostExposureForecast(transactions, settings.macroAssumptions ?? [], 6),
        [transactions, settings.macroAssumptions]
    );

    if (!result.available) {
        return (
            <View style={s.emptyState}>
                <Text style={s.emptyTitle}>Not enough history yet</Text>
                <Text style={s.emptySub}>{result.reason}</Text>
            </View>
        );
    }

    const bandColor = BAND_COLOR[result.band];

    return (
        <View>
            <Text style={s.subtitle}>
                A rising category cost doesn't show up as a single alarming number — it shows up as a slowly growing
                share of every revenue unit. This compares each expense category's share of revenue over {result.periodLabel.toLowerCase()},
                and projects what happens to profit if the fastest-growing one keeps climbing at its own pace.
            </Text>

            {/* Score card */}
            <View style={[s.scoreCard, { borderTopColor: bandColor }]}>
                <Text style={s.scoreLabel}>Cost Exposure</Text>
                <RadialGauge displayValue={String(result.score)} label={result.band} progress={result.score / 100} color={bandColor} size={104} strokeWidth={9} />
                <Text style={s.verdict}>{result.verdict}</Text>
            </View>

            {/* Forward Cost Trajectory — every category still flagged as
                rising, projected forward together (not just the single
                worst one), using the owner's own stated external
                expectations wherever one is linked to a rising category. */}
            {forecast.available && forecast.drivers.length > 0 && (
                <View style={s.impactCard}>
                    <Text style={s.cardTitle}>📈 Forward Cost Trajectory — Next {forecast.horizonMonths} Months</Text>
                    <Text style={s.impactText}>{forecast.verdict}</Text>

                    <GroupedBarChart
                        height={90}
                        labels={forecast.months.map(m => `+${m.monthIndex}mo`)}
                        series={[
                            { label: 'Projected Monthly Profit', color: Colors.expense, values: forecast.months.map(m => m.projectedMonthlyProfit) },
                        ]}
                    />

                    <Text style={[s.cardTitle, { fontSize: 12, marginTop: 14, marginBottom: 8 }]}>What's driving this projection</Text>
                    {forecast.drivers.map(d => (
                        <View key={d.category} style={s.driverRow}>
                            <View style={s.flex1}>
                                <Text style={s.driverCategory}>{d.category}</Text>
                                <Text style={s.driverSource}>
                                    {d.source === 'external'
                                        ? `Projected from your "${d.externalLabel}" assumption`
                                        : 'Projected from its own recent trend'}
                                </Text>
                            </View>
                            <View style={[s.driverBadge, { backgroundColor: d.source === 'external' ? Colors.primary + '20' : Colors.textMuted + '20' }]}>
                                <Text style={[s.driverBadgeText, { color: d.source === 'external' ? Colors.primary : Colors.textMuted }]}>
                                    {d.source === 'external' ? 'External' : 'Internal'}
                                </Text>
                            </View>
                        </View>
                    ))}
                    <TouchableOpacity onPress={() => navigate('budget')}>
                        <Text style={s.impactLink}>Set a budget alert for these categories →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Flags */}
            {result.flags.length > 0 && (
                <View style={s.flagsCard}>
                    <Text style={s.cardTitle}>Categories Growing Faster Than Revenue</Text>
                    {result.flags.map((flag, i) => (
                        <View key={i} style={s.flagRow}>
                            <Text style={s.flagBullet}>•</Text>
                            <Text style={s.flagText}>{flag}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* External Risk — turns "why is this rising" from a headline the
                owner reads elsewhere into a business-specific insight, using
                whatever macro assumptions they've linked to a category that's
                actually rising in their own numbers. */}
            {externalRisk.insights.map((insight, i) => (
                <ExternalRiskCard key={i} insight={insight} currency={currency} />
            ))}

            {result.flags.length > 0 && !externalRisk.hasAssumptions && (
                <TouchableOpacity style={s.macroCta} onPress={() => navigate('macro-assumptions')}>
                    <Text style={s.macroCtaText}>
                        Know why? Tell Quad360 what's happening externally (energy prices, FX, inflation...) to turn this into a specific early warning →
                    </Text>
                </TouchableOpacity>
            )}

            {/* Share of revenue, ranked -- the same categories as the table
                below, but the shape a reader actually wants first: who's
                biggest right now. */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Share of Revenue, Ranked</Text>
                <BarList
                    color={Colors.expense}
                    items={result.signals
                        .slice()
                        .sort((a, b) => b.currentPctOfRevenue - a.currentPctOfRevenue)
                        .map(sig => ({
                            label: sig.category,
                            value: sig.currentPctOfRevenue,
                            displayValue: `${sig.currentPctOfRevenue.toFixed(1)}%`,
                        }))}
                />
            </View>

            {/* Signal comparison table */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Every Category — {result.periodLabel}</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 1.3 }]}>Category</Text>
                    <Text style={s.th}>Prior %</Text>
                    <Text style={s.th}>Now %</Text>
                    <Text style={s.th}>Change</Text>
                </View>
                {result.signals.map(sig => <SignalRow key={sig.category} signal={sig} />)}
            </View>
        </View>
    );
}

function ExternalRiskCard({ insight, currency }: { insight: ExternalRiskInsight; currency: string }) {
    return (
        <View style={s.externalCard}>
            <Text style={s.externalTitle}>{insight.title}</Text>
            <Text style={s.externalText}>{insight.whatChanged}</Text>
            <Text style={s.externalText}>{insight.whyItMatters}</Text>
            {insight.projectedImpact && (
                <Text style={s.externalText}>
                    At that pace, monthly {insight.projectedImpact.category} spend would move from{' '}
                    <Text style={s.impactBold}>{fmtCompact(currency, insight.projectedImpact.currentMonthlySpend)}</Text> to{' '}
                    <Text style={s.impactBold}>{fmtCompact(currency, insight.projectedImpact.projectedNextPeriodMonthlySpend)}</Text>
                    {' '}— cutting monthly profit from{' '}
                    <Text style={s.impactBold}>{fmtCompact(currency, insight.projectedImpact.currentMonthlyProfit)}</Text> to roughly{' '}
                    <Text style={[s.impactBold, { color: Colors.expense }]}>{fmtCompact(currency, insight.projectedImpact.projectedMonthlyProfit)}</Text>.
                </Text>
            )}
            <Text style={s.externalText}>{insight.whatCouldHappenNext}</Text>

            <Text style={s.externalSubhead}>Recommended actions</Text>
            {insight.recommendedActions.map((action, i) => (
                <View key={i} style={s.flagRow}>
                    <Text style={s.flagBullet}>{i + 1}.</Text>
                    <Text style={s.flagText}>{action}</Text>
                </View>
            ))}

            <View style={s.externalFooter}>
                <Text style={s.externalFooterText}>💳 {insight.creditReadinessImpact}</Text>
                <Text style={s.externalFooterText}>🌱 {insight.growthImpact}</Text>
            </View>
        </View>
    );
}

function SignalRow({ signal }: { signal: CostCategorySignal }) {
    const changeColor = signal.pctPointChange <= 0 ? Colors.income : signal.pctPointChange < 2 ? Colors.textSecondary : Colors.expense;

    return (
        <View style={s.tableRow}>
            <Text style={[s.td, { flex: 1.3, color: Colors.textPrimary, fontWeight: '700' }]}>{signal.category}</Text>
            <Text style={s.td}>{signal.priorPctOfRevenue.toFixed(1)}%</Text>
            <Text style={s.td}>{signal.currentPctOfRevenue.toFixed(1)}%</Text>
            <Text style={[s.td, { color: changeColor, fontWeight: '700' }]}>
                {signal.pctPointChange >= 0 ? '+' : ''}{signal.pctPointChange.toFixed(1)}pp
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: 32, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    scoreCard: { backgroundColor: Colors.surface, borderRadius: 14, borderTopWidth: 4, padding: 20, marginBottom: 14, alignItems: 'center' },
    scoreLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
    verdict: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginTop: 12 },

    impactCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.warning },
    impactText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 10 },
    impactBold: { fontWeight: '800', color: Colors.textPrimary },
    impactLink: { fontSize: 12.5, color: Colors.primary, fontWeight: '700', marginTop: 10 },

    flex1: { flex: 1 },
    driverRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    driverCategory: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    driverSource: { fontSize: 11, color: Colors.textMuted },
    driverBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    driverBadgeText: { fontSize: 10, fontWeight: '700' },

    flagsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.expense },
    flagRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    flagBullet: { fontSize: 12, color: Colors.textMuted },
    flagText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    externalCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.warning },
    externalTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    externalText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 8 },
    externalSubhead: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 6, marginBottom: 8 },
    externalFooter: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
    externalFooterText: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },

    macroCta: { backgroundColor: Colors.primary + '12', borderRadius: 12, padding: 14, marginBottom: 14 },
    macroCtaText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700', lineHeight: 18 },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 6 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },
});
