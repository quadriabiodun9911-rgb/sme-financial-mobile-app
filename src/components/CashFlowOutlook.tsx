import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction, Invoice } from '../types';
import { generateCashFlowForecast } from '../utils/forecastEngine';
import { buildForecastInput } from '../utils/alertEngine';
import { ScenarioProjection, ScenarioType } from '../types/forecast';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    invoices: Invoice[];
    currency: string;
}

// Surfaces the 6-month, 3-scenario projection ForecastEngine already
// computes for the alert bell (see alertEngine.ts) but which never
// otherwise reaches a screen -- only baseCase.runsOutOfCash/runOutDate leak
// out, embedded in one alert's text. This is the one place the full
// scenario comparison, health score, and engine recommendations are shown.
export default function CashFlowOutlook({ finance, transactions, invoices, currency }: Props) {
    const forecast = useMemo(
        () => generateCashFlowForecast(buildForecastInput(finance.cashBalance, transactions, invoices, currency)),
        [finance.cashBalance, transactions, invoices, currency]
    );

    const healthColor =
        forecast.healthScore >= 70 ? Colors.income : forecast.healthScore >= 40 ? Colors.warning : Colors.expense;
    const riskColor =
        forecast.riskLevel === 'low' ? Colors.income : forecast.riskLevel === 'medium' ? Colors.warning : Colors.expense;

    const scenarios: { type: ScenarioType; proj: ScenarioProjection }[] = [
        { type: 'pessimistic', proj: forecast.pessimistic },
        { type: 'base', proj: forecast.baseCase },
        { type: 'optimistic', proj: forecast.optimistic },
    ];

    return (
        <View>
            <View style={styles.headerCard}>
                <View style={styles.scoreBlock}>
                    <Text style={styles.scoreValue}>{forecast.healthScore}</Text>
                    <Text style={styles.scoreLabel}>Cash Health Score</Text>
                </View>
                <View style={[styles.riskBadge, { backgroundColor: healthColor + '18' }]}>
                    <View style={[styles.riskDot, { backgroundColor: healthColor }]} />
                    <Text style={[styles.riskText, { color: healthColor }]}>
                        {forecast.healthScore >= 70 ? 'Healthy' : forecast.healthScore >= 40 ? 'Watch' : 'At Risk'}
                    </Text>
                </View>
                <Text style={styles.headerSub}>
                    {forecast.forecastPeriod.months}-month outlook · risk level{' '}
                    <Text style={{ color: riskColor, fontWeight: '700' }}>{forecast.riskLevel}</Text>
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Scenario Comparison</Text>
                <Text style={styles.cardSub}>
                    How your cash position could play out over the next {forecast.forecastPeriod.months} months.
                </Text>
                {scenarios.map(({ type, proj }) => (
                    <ScenarioRow key={type} proj={proj} currency={currency} highlight={type === 'base'} />
                ))}
            </View>

            {forecast.recommendations.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>What This Means For You</Text>
                    {forecast.recommendations.map(rec => (
                        <View key={rec.id} style={[styles.recItem, { borderLeftColor: PRIORITY_COLOR[rec.priority] }]}>
                            <Text style={styles.recTitle}>{rec.title}</Text>
                            <Text style={styles.recDesc}>{rec.description}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

const PRIORITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
    high: Colors.expense,
    medium: Colors.warning,
    low: Colors.income,
};

function ScenarioRow({ proj, currency, highlight }: { proj: ScenarioProjection; currency: string; highlight: boolean }) {
    return (
        <View style={[styles.scenarioRow, highlight && styles.scenarioRowHighlight]}>
            <View style={styles.scenarioHead}>
                <Text style={styles.scenarioLabel}>{proj.label}</Text>
                {proj.runsOutOfCash && (
                    <View style={styles.warnBadge}>
                        <Text style={styles.warnBadgeText}>Runs out {proj.runOutDate}</Text>
                    </View>
                )}
            </View>
            <Text style={styles.scenarioDesc}>{proj.description}</Text>
            <View style={styles.scenarioStats}>
                <Text style={styles.scenarioStatLabel}>Lowest projected cash</Text>
                <Text
                    style={[
                        styles.scenarioStatValue,
                        { color: proj.lowestCash < 0 ? Colors.expense : Colors.textPrimary },
                    ]}
                >
                    {currency}{Math.round(proj.lowestCash).toLocaleString()} ({proj.lowestCashMonth})
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    headerCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 20, marginBottom: 12, alignItems: 'center' },
    scoreBlock: { alignItems: 'center', marginBottom: 10 },
    scoreValue: { fontSize: 36, fontWeight: 'bold', color: Colors.textPrimary },
    scoreLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    riskBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, marginBottom: 10 },
    riskDot: { width: 7, height: 7, borderRadius: 4 },
    riskText: { fontSize: 12, fontWeight: '700' },
    headerSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    cardSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },

    scenarioRow: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
    scenarioRowHighlight: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0c' },
    scenarioHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    scenarioLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    scenarioDesc: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
    scenarioStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    scenarioStatLabel: { fontSize: 11, color: Colors.textSecondary },
    scenarioStatValue: { fontSize: 13, fontWeight: '700' },

    warnBadge: { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    warnBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.expense },

    recItem: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10 },
    recTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    recDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
});
