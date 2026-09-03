import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import PeriodTrendTable, { PeriodTrendRow } from '../components/PeriodTrendTable';
import { computeMacroShieldImpact } from '../utils/macroShield';
import { DEFAULT_THRESHOLDS } from '../utils/alertEngine';

function fmt(currency: string, n: number): string {
    return `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
}

// The Dashboard's MacroShield card answers "which month does this shock run
// you out of cash" in one line -- real, but thin once an owner actually
// wants to see WHERE that damage shows up (revenue, costs, operating cash
// flow, margin, the reserve) month by month, and what to actually do about
// it. This screen is that drill-down: reuses computeMacroShieldImpact
// verbatim (the exact scenario passed in via navParams, so this can never
// show a different shock than the one just explored on the card), laid
// out with the same frozen-column PeriodTrendTable every other trend table
// in this app uses, then links straight into Budget and Action Tracker
// instead of inventing generic advice text.
export default function MacroShieldDetailScreen() {
    const { transactions, loans, finance, staff, settings, navParams, setCurrentScreen } = useApp();
    const currency = settings?.currency ?? '₦';
    const minReserve = parseFloat(settings?.minReserve || '') || DEFAULT_THRESHOLDS.lowCashThreshold;

    const inflationPct = navParams?.macroShieldInflationPct ?? 0;
    const fxDevaluationPct = navParams?.macroShieldFxDevaluationPct ?? 0;
    const revenueImpactPct = navParams?.macroShieldRevenueImpactPct ?? 0;
    const hasShock = inflationPct > 0 || fxDevaluationPct > 0 || revenueImpactPct > 0;

    const result = useMemo(
        () => computeMacroShieldImpact(transactions, loans, finance, staff, minReserve, { inflationPct, fxDevaluationPct, revenueImpactPct }),
        [transactions, loans, finance, staff, minReserve, inflationPct, fxDevaluationPct, revenueImpactPct],
    );

    const shockedMonths = result.available ? result.shocked.cashFlowMonths : [];
    const baselineMonths = result.available ? result.baseline.cashFlowMonths : [];

    const columns = shockedMonths.map((m, i) => ({ key: String(i), label: m.monthLabel }));

    const rows: PeriodTrendRow[] = useMemo(() => {
        if (!result.available || shockedMonths.length === 0) return [];
        const at = (k: string) => shockedMonths[Number(k)];
        const baselineAt = (k: string) => baselineMonths[Number(k)];
        const subVsBaseline = (get: (m: typeof shockedMonths[number]) => number) => (k: string) => {
            const b = baselineAt(k);
            return b ? `vs ${fmt(currency, get(b))} without this` : null;
        };
        return [
            { key: 'revenue', label: 'Revenue', getValue: k => fmt(currency, at(k).inflow), getColor: () => Colors.income, getSubValue: subVsBaseline(m => m.inflow) },
            { key: 'expenses', label: 'Operating Expenses', getValue: k => fmt(currency, at(k).operatingOutflow), getColor: () => Colors.expense, getSubValue: subVsBaseline(m => m.operatingOutflow) },
            {
                key: 'netCashFlow', label: 'Operating Cash Flow', bold: true, topBorder: true,
                getValue: k => fmt(currency, at(k).net),
                getColor: k => at(k).net >= 0 ? Colors.income : Colors.expense,
            },
            {
                key: 'margin', label: 'Margin', muted: true,
                getValue: k => {
                    const m = at(k);
                    return m.inflow > 0 ? `${((m.net / m.inflow) * 100).toFixed(0)}%` : '—';
                },
            },
            {
                key: 'endingCash', label: 'Cash on Hand', bold: true, doubleTopBorder: true,
                getValue: k => fmt(currency, at(k).endingCash),
                getColor: k => at(k).endingCash >= 0 ? Colors.income : Colors.expense,
                getSubValue: subVsBaseline(m => m.endingCash),
            },
            {
                key: 'reserveStatus', label: 'Cash Reserve', muted: true, noBottomBorder: true,
                getValue: k => {
                    if (minReserve <= 0) return 'No reserve target set';
                    return at(k).endingCash < minReserve ? 'Below target' : 'On target';
                },
                getColor: k => (minReserve > 0 && at(k).endingCash < minReserve) ? Colors.expense : Colors.income,
            },
        ];
    }, [result.available, shockedMonths, baselineMonths, currency, minReserve]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={styles.backLink}>← Dashboard</Text>
                </TouchableOpacity>

                <View style={styles.titleRow}>
                    <Icon name="shield" size={20} color={Colors.textPrimary} />
                    <Text style={styles.title}>MacroShield — Full Impact</Text>
                </View>

                {!hasShock ? (
                    <View style={styles.card}>
                        <Text style={styles.emptyText}>
                            No shock is currently set. Go back to the Dashboard, move one of MacroShield's sliders, then tap "See full impact" again.
                        </Text>
                    </View>
                ) : !result.available ? (
                    <View style={styles.card}>
                        <Text style={styles.emptyText}>{result.reason}</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.scenarioCard}>
                            <Text style={styles.scenarioTitle}>Scenario being tested</Text>
                            <View style={styles.scenarioChipsRow}>
                                {inflationPct > 0 && <Text style={styles.scenarioChip}>Inflation +{inflationPct}%</Text>}
                                {fxDevaluationPct > 0 && <Text style={styles.scenarioChip}>Currency weakening +{fxDevaluationPct}%</Text>}
                                {revenueImpactPct > 0 && <Text style={styles.scenarioChip}>Revenue -{revenueImpactPct}%</Text>}
                            </View>
                            <Text style={styles.scenarioSub}>
                                Every figure below already includes this shock, month by month over the next year — compared against what each month would otherwise look like.
                            </Text>
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Month-by-Month Impact</Text>
                            <PeriodTrendTable columns={columns} rows={rows} labelColumnWidth={150} columnWidth={104} scrollDep={`${inflationPct}-${fxDevaluationPct}-${revenueImpactPct}`} />
                            <Text style={styles.hint}>
                                Operating Expenses assumes ALL your costs rise together — a rough, worst-case estimate, not an exact forecast. Cash Reserve compares against your own reserve target in Settings.
                            </Text>
                        </View>

                        <View style={styles.card}>
                            <View style={styles.titleRow}>
                                <Icon name="tool" size={16} color={Colors.textPrimary} />
                                <Text style={styles.cardTitle}>What you can do about it</Text>
                            </View>
                            <Text style={styles.actionIntro}>
                                If a shock like this actually happened, two real levers exist in Quad360 to respond with — not generic advice, your own numbers:
                            </Text>
                            <TouchableOpacity style={styles.actionRow} onPress={() => setCurrentScreen('budget')} activeOpacity={0.75}>
                                <View style={styles.actionIconBox}>
                                    <Icon name="dollar-sign" size={16} color={Colors.primary} />
                                </View>
                                <View style={styles.actionTextCol}>
                                    <Text style={styles.actionTitle}>Cut planned spend in Budget</Text>
                                    <Text style={styles.actionDesc}>Lower a category's monthly limit now, before the shock actually lands, instead of reacting after cash is already tight.</Text>
                                </View>
                                <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionRow} onPress={() => setCurrentScreen('action-tracker')} activeOpacity={0.75}>
                                <View style={styles.actionIconBox}>
                                    <Icon name="check-circle" size={16} color={Colors.primary} />
                                </View>
                                <View style={styles.actionTextCol}>
                                    <Text style={styles.actionTitle}>Start a cost-cutting or revenue tactic</Text>
                                    <Text style={styles.actionDesc}>Action Tracker's recommendations are ranked by real expected impact — start one and Quad360 measures whether it actually offset this.</Text>
                                </View>
                                <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    backLink: { color: Colors.primary, fontSize: 14, marginBottom: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },

    card: {
        backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    emptyText: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },

    scenarioCard: {
        backgroundColor: Colors.primary + '0d', borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg,
        borderWidth: 1, borderColor: Colors.primary + '33',
    },
    scenarioTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
    scenarioChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    scenarioChip: { fontSize: 12.5, fontWeight: '700', color: Colors.primary, backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.primary + '33' },
    scenarioSub: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 15 },

    actionIntro: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 4, marginBottom: Spacing.md },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    actionIconBox: { width: 34, height: 34, borderRadius: Radius.sm, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
    actionTextCol: { flex: 1 },
    actionTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
    actionDesc: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2, lineHeight: 15 },
});
