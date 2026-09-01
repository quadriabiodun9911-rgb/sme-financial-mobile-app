import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { Transaction, Loan, FinanceData, StaffMember } from '../types';
import { computeMacroShieldImpact } from '../utils/macroShield';

interface Props {
    currency: string;
    transactions: Transaction[];
    loans: Loan[];
    finance: FinanceData;
    staff: StaffMember[];
    minReserve: number;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

const MAX_SHOCK_PCT = 100;

// MacroShield -- Inflation & FX Shock Simulator. Standard banking apps show
// a live balance; this is the predictive layer on top: drag inflation or a
// currency devaluation up and see, in real numbers, which month it would
// put cash below zero -- not a forecast of what WILL happen, but what
// today's numbers say WOULD happen if a shock like this hit and nothing
// changed. See macroShield.ts for exactly what this reuses and why both
// shocks are modeled as a uniform cost increase.
export default function MacroShieldSimulator({ currency, transactions, loans, finance, staff, minReserve }: Props) {
    const [inflationPct, setInflationPct] = useState(0);
    const [fxDevaluationPct, setFxDevaluationPct] = useState(0);

    const result = useMemo(
        () => computeMacroShieldImpact(transactions, loans, finance, staff, minReserve, { inflationPct, fxDevaluationPct }),
        [transactions, loans, finance, staff, minReserve, inflationPct, fxDevaluationPct],
    );

    const hasShock = inflationPct > 0 || fxDevaluationPct > 0;

    // Whenever the shock isn't severe enough to actually push cash negative
    // within the 12-month horizon, both rows above read identically ("Cash
    // lasts the full 12 months") -- which reads as "nothing happened," even
    // though the shock IS real (higher modeled costs, lower ending cash).
    // This surfaces that already-computed difference instead of silently
    // dropping it -- both endingCash figures come straight from
    // cashFlowMonths, the same 12-month projection the two rows above
    // already read from, not a new calculation.
    const baselineMonths = result.available ? result.baseline.cashFlowMonths : [];
    const shockedMonths = result.available ? result.shocked.cashFlowMonths : [];
    const horizonMonth = baselineMonths[baselineMonths.length - 1];
    const baselineEndingCash = horizonMonth?.endingCash ?? 0;
    const shockedEndingCash = shockedMonths[shockedMonths.length - 1]?.endingCash ?? 0;
    const cashGapAtHorizon = baselineEndingCash - shockedEndingCash;
    const showCashGap = hasShock && result.available
        && !result.baseline.runOutMonthLabel && !result.shocked.runOutMonthLabel
        && !!horizonMonth;

    return (
        <View style={s.card}>
            <View style={s.headerRow}>
                <Icon name="shield" size={16} color={Colors.textPrimary} />
                <Text style={s.title}>MacroShield</Text>
            </View>
            <Text style={s.subtitle}>
                Drag inflation or a currency devaluation up and see exactly which month your cash would run out, if you don't raise prices or cut costs to compensate.
            </Text>

            <View style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Inflation shock</Text>
                    <Text style={s.sliderValue}>{inflationPct}%</Text>
                </View>
                <Slider
                    minimumValue={0}
                    maximumValue={MAX_SHOCK_PCT}
                    step={5}
                    value={inflationPct}
                    onValueChange={setInflationPct}
                    minimumTrackTintColor={Colors.warning}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.warning}
                />
            </View>

            <View style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Currency devaluation</Text>
                    <Text style={s.sliderValue}>{fxDevaluationPct}%</Text>
                </View>
                <Slider
                    minimumValue={0}
                    maximumValue={MAX_SHOCK_PCT}
                    step={5}
                    value={fxDevaluationPct}
                    onValueChange={setFxDevaluationPct}
                    minimumTrackTintColor={Colors.expense}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.expense}
                />
            </View>

            {!result.available ? (
                <Text style={s.emptyHint}>{result.reason}</Text>
            ) : !hasShock ? (
                <Text style={s.emptyHint}>Move a slider to see exactly which month this would put your cash at risk.</Text>
            ) : (
                <View style={s.resultBox}>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>Without this shock</Text>
                        <Text style={s.resultValue}>
                            {result.baseline.runOutMonthLabel ? `Runs out in ${result.baseline.runOutMonthLabel}` : 'Cash lasts the full 12 months'}
                        </Text>
                    </View>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>With this shock</Text>
                        <Text style={[s.resultValue, { color: result.shocked.runOutMonthLabel ? Colors.expense : Colors.income, fontWeight: '800' }]}>
                            {result.shocked.runOutMonthLabel ? `Runs out in ${result.shocked.runOutMonthLabel}` : 'Cash lasts the full 12 months'}
                        </Text>
                    </View>

                    {showCashGap && (
                        <View style={s.warningBox}>
                            <View style={s.resultRow}>
                                <Text style={s.resultLabel}>Cash on hand by {horizonMonth!.monthLabel}</Text>
                                <Text style={s.resultValue}>{fmt(currency, shockedEndingCash)}</Text>
                            </View>
                            <Text style={s.cashGapNote}>
                                {cashGapAtHorizon > 0
                                    ? `That's ${fmt(currency, cashGapAtHorizon)} less than the ${fmt(currency, baselineEndingCash)} you'd otherwise have by then — cash doesn't run out at this shock level, but it is a real, growing cost.`
                                    : 'No meaningful difference from this shock at your current numbers.'}
                            </Text>
                        </View>
                    )}

                    {result.shocked.runOutMonthLabel && (
                        <View style={s.warningBox}>
                            <Text style={s.warningText}>
                                {result.baseline.runOutMonthLabel === null
                                    ? `🔴 This shock alone would push your cash negative by ${result.shocked.runOutMonthLabel} — something today's unshocked numbers don't show.`
                                    : result.monthsOfRunwayLost !== null && result.monthsOfRunwayLost > 0
                                        ? `🔴 This shock costs you ${result.monthsOfRunwayLost} month${result.monthsOfRunwayLost !== 1 ? 's' : ''} of runway.`
                                        : `🔴 Cash still runs out, but not meaningfully sooner than it already would.`}
                            </Text>
                        </View>
                    )}

                    {result.shocked.reserveBreach && (
                        <Text style={s.reserveNote}>
                            Falls below your {fmt(currency, result.shocked.reserveBreach.minReserve)} reserve target in {result.shocked.reserveBreach.monthLabel}
                            {result.baseline.reserveBreach ? '' : ' — currently not projected to happen without this shock'}.
                        </Text>
                    )}

                    <Text style={s.caveat}>
                        Modeled as a uniform increase across all your costs (equivalent to {result.monthlyExpenseGrowthPct.toFixed(1)}%/month compounding) — Quad360 doesn't yet know which specific expenses are priced in foreign currency, so this is a conservative, worst-case estimate, not a precise forecast.
                    </Text>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.md },

    sliderBlock: { marginBottom: Spacing.sm },
    sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    sliderLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
    sliderValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm },

    resultBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    resultLabel: { fontSize: 12.5, color: Colors.textSecondary },
    resultValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },

    warningBox: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    warningText: { fontSize: 12.5, color: Colors.expense, fontWeight: '700', lineHeight: 18 },
    cashGapNote: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginTop: 4 },

    reserveNote: { fontSize: 11.5, color: Colors.warning, marginTop: 6, lineHeight: 16 },

    caveat: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm, lineHeight: 15 },
});
