import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { FinanceData, Transaction, Invoice } from '../types';
import { computeAgingBuckets } from '../utils/finance';
import { computeCashRunway } from '../utils/cashRunway';
import { generateCashFlowForecast } from '../utils/forecastEngine';
import { buildForecastInput } from '../utils/alertEngine';
import { ScenarioProjection, ScenarioType } from '../types/forecast';
import BarList from './BarList';
import CashFlowStressTester from './CashFlowStressTester';
import RainyDayFundPlanner from './RainyDayFundPlanner';
import Collapsible from './Collapsible';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    invoices: Invoice[];
    currency: string;
    minReserve: string;
    inventoryValue?: number;
}

// Merges what used to be two separately-tabbed screens that both claimed the
// title "Scenario Comparison" and confused users about which one to trust:
// Cash Flow Outlook (an automatic, engine-generated 6-month forecast from
// real transaction history) and Cash Safety (today's reserve position plus
// a manual, user-driven stress test). One flow now: where you stand today,
// what the engine expects to happen automatically, then optional deeper
// manual tools for testing your own what-if assumptions.
export default function CashFlowSafety({ finance, transactions, invoices, currency, minReserve, inventoryValue }: Props) {
    const reserve = parseFloat(minReserve) || 0;
    const surplusShortfall = finance.cashBalance - reserve;
    const coverageRatio = reserve > 0 ? finance.cashBalance / reserve : null;

    const arBuckets = useMemo(() => computeAgingBuckets(transactions, 'income'), [transactions]);
    const apBuckets = useMemo(() => computeAgingBuckets(transactions, 'expense'), [transactions]);

    const totalAR = arBuckets.reduce((s, b) => s + b.total, 0);
    const totalAP = apBuckets.reduce((s, b) => s + b.total, 0);
    const potentialCash = finance.cashBalance + totalAR;
    const upcomingAP = apBuckets[0]?.total ?? 0;
    const cashAfterObligations = finance.cashBalance - upcomingAP;

    // One canonical trailing burn-rate figure, shared with the Runway tab,
    // Weekly Dashboard, Loans & Debt, the stress tester, and the rainy-day
    // planner below — not a separate estimate invented here.
    const { dailyBurn } = computeCashRunway(transactions, finance.cashBalance);

    const forecast = useMemo(
        () => generateCashFlowForecast(buildForecastInput(finance.cashBalance, transactions, invoices, currency)),
        [finance.cashBalance, transactions, invoices, currency]
    );

    const getHealthColor = (val: number, threshold: number) =>
        val >= threshold ? Colors.income : val >= threshold * 0.5 ? Colors.warning : Colors.expense;

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
            {/* ── 1. WHERE YOU STAND TODAY ─────────────────────────────── */}
            <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>Current Cash Balance</Text>
                <Text style={[styles.statusAmount, { color: Colors.income }]}>
                    {currency}{finance.cashBalance.toLocaleString()}
                </Text>
                <View style={[styles.statusBadge, {
                    backgroundColor: surplusShortfall >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                    <Text style={[styles.statusBadgeText, { color: surplusShortfall >= 0 ? Colors.income : Colors.expense }]}>
                        {surplusShortfall >= 0
                            ? `${currency}${surplusShortfall.toLocaleString()} above minimum reserve`
                            : `${currency}${Math.abs(surplusShortfall).toLocaleString()} below minimum reserve`}
                    </Text>
                </View>
            </View>

            <View style={styles.ratioRow}>
                <RatioCard
                    label="Cash Reserve Coverage"
                    value={coverageRatio !== null ? `${coverageRatio.toFixed(2)}×` : 'N/A'}
                    sub={`Min reserve: ${currency}${reserve.toLocaleString()}`}
                    color={getHealthColor(finance.cashBalance, reserve)}
                />
                <RatioCard
                    label="After 30-day AP"
                    value={`${currency}${cashAfterObligations.toLocaleString()}`}
                    sub={`${currency}${upcomingAP.toLocaleString()} due in 30 days`}
                    color={getHealthColor(cashAfterObligations, reserve)}
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Working Capital</Text>
                <Row label="Outstanding Receivables (AR)" value={`${currency}${totalAR.toLocaleString()}`} color={Colors.income} />
                <Row label="Outstanding Payables (AP)" value={`${currency}${totalAP.toLocaleString()}`} color={Colors.expense} />
                <Row label="Net Working Capital" value={`${currency}${(totalAR - totalAP).toLocaleString()}`} color={(totalAR - totalAP) >= 0 ? Colors.income : Colors.expense} />
                <Row label="Potential Cash (if AR collected)" value={`${currency}${potentialCash.toLocaleString()}`} color={Colors.primary} />
            </View>

            {totalAR > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Receivables Aging</Text>
                    <BarList
                        items={arBuckets
                            .map((b, i) => ({
                                label: b.label,
                                value: b.total,
                                displayValue: `${currency}${b.total.toLocaleString()}`,
                                color: i === 0 ? Colors.income : i === 1 ? Colors.warning : Colors.expense,
                            }))
                            .filter(item => item.value > 0)}
                    />
                    <Text style={styles.hint}>Collect aged receivables to improve cash position immediately.</Text>
                </View>
            )}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Cash Flow Actions</Text>
                {surplusShortfall < 0 && (
                    <ActionItem color={Colors.expense} text={`Cash is ${currency}${Math.abs(surplusShortfall).toLocaleString()} below your minimum reserve. Prioritise collecting outstanding AR or reducing near-term expenses.`} />
                )}
                {totalAR > 0 && (
                    <ActionItem color={Colors.warning} text={`Collecting all outstanding receivables (${currency}${totalAR.toLocaleString()}) would bring cash to ${currency}${potentialCash.toLocaleString()}.`} />
                )}
                {upcomingAP > 0 && (
                    <ActionItem color={Colors.warning} text={`${currency}${upcomingAP.toLocaleString()} in payables are due within 30 days. Ensure sufficient liquidity before then.`} />
                )}
                {surplusShortfall >= 0 && totalAR === 0 && (
                    <ActionItem color={Colors.income} text="Cash position is healthy and above reserve. Consider deploying surplus into growth or short-term investments." />
                )}
            </View>

            {/* ── 2. WHAT'S LIKELY TO HAPPEN (AUTOMATIC) ───────────────── */}
            <Text style={styles.sectionLabel}>AUTOMATIC FORECAST</Text>
            <Text style={styles.sectionSub}>
                Built from your real transaction history — updates on its own as you log income and expenses.
            </Text>

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
                    <ScenarioRow key={type} proj={proj} currency={currency} highlight={type === 'base'} currentCashBalance={finance.cashBalance} />
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

            {/* ── 3. GO DEEPER (MANUAL) ────────────────────────────────── */}
            <Text style={styles.sectionLabel}>MANUAL TOOLS</Text>
            <Text style={styles.sectionSub}>
                Type in your own assumptions to test a specific scenario, or plan a reserve against a shock.
            </Text>

            <Collapsible title="Stress-Test Your Cash">
                <CashFlowStressTester
                    currency={currency}
                    currentCashBalance={finance.cashBalance}
                    dailyBurn={dailyBurn}
                    transactions={transactions}
                    inventoryValue={inventoryValue}
                />
            </Collapsible>

            <Collapsible title="Rainy-Day Fund Planner">
                <RainyDayFundPlanner currency={currency} currentCashBalance={finance.cashBalance} dailyBurn={dailyBurn} />
            </Collapsible>
        </View>
    );
}

const PRIORITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
    high: Colors.expense,
    medium: Colors.warning,
    low: Colors.income,
};

function ScenarioRow({ proj, currency, highlight, currentCashBalance }: { proj: ScenarioProjection; currency: string; highlight: boolean; currentCashBalance: number }) {
    // In a scenario where the business takes in more than it spends every
    // single projected month, cash only ever grows from here -- so the
    // "lowest" point the loop finds is trivially today's own starting
    // balance, on today's date. That's correct, not a bug, but two
    // scenarios both showing the exact same figure/date looks like one --
    // this makes the reason explicit instead of leaving it to guesswork.
    const neverDipsBelowToday = Math.round(proj.lowestCash) === Math.round(currentCashBalance);

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
            {neverDipsBelowToday && (
                <Text style={styles.scenarioNote}>
                    Cash is projected to grow every month here, so it never dips below today's balance — that's why the figure above matches what you have right now.
                </Text>
            )}
        </View>
    );
}

function RatioCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
    return (
        <View style={ratioStyles.card}>
            <Text style={ratioStyles.label}>{label}</Text>
            <Text style={[ratioStyles.value, { color }]}>{value}</Text>
            <Text style={ratioStyles.sub}>{sub}</Text>
        </View>
    );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={[rowStyles.value, { color }]}>{value}</Text>
        </View>
    );
}

function ActionItem({ color, text }: { color: string; text: string }) {
    return (
        <View style={[actionStyles.item, { borderLeftColor: color }]}>
            <Text style={actionStyles.text}>{text}</Text>
        </View>
    );
}

const ratioStyles = StyleSheet.create({
    card: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 6, lineHeight: 14 },
    value: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    sub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 13, color: Colors.textSecondary, flex: 1, marginRight: 8 },
    value: { fontSize: 13, fontWeight: '600' },
});

const actionStyles = StyleSheet.create({
    item: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10 },
    text: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});

const styles = StyleSheet.create({
    statusCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    statusLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    statusAmount: { fontSize: 30, fontWeight: 'bold', marginBottom: 8 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
    statusBadgeText: { fontSize: 12, fontWeight: '600' },

    ratioRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },

    card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    cardSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontStyle: 'italic' },

    sectionLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, marginTop: 6, marginBottom: 3 },
    sectionSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 17 },

    headerCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    scoreBlock: { alignItems: 'center', marginBottom: 10 },
    scoreValue: { fontSize: 36, fontWeight: 'bold', color: Colors.textPrimary },
    scoreLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    riskBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, marginBottom: 10 },
    riskDot: { width: 7, height: 7, borderRadius: 4 },
    riskText: { fontSize: 12, fontWeight: '700' },
    headerSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    scenarioRow: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
    scenarioRowHighlight: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0c' },
    scenarioHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    scenarioLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    scenarioDesc: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
    scenarioStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    scenarioStatLabel: { fontSize: 11, color: Colors.textSecondary },
    scenarioStatValue: { fontSize: 13, fontWeight: '700' },
    scenarioNote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },

    warnBadge: { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    warnBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.expense },

    recItem: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10 },
    recTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    recDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
});
