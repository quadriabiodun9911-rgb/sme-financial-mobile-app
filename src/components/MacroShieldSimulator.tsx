import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption, MacroDriver } from '../types';
import { computeMacroShieldImpact } from '../utils/macroShield';

interface Props {
    currency: string;
    transactions: Transaction[];
    loans: Loan[];
    finance: FinanceData;
    staff: StaffMember[];
    minReserve: number;
    macroAssumptions: MacroAssumption[];
    onAddMacroAssumption: () => void;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

const MAX_SHOCK_PCT = 100;
// Capped lower than the cost sliders -- an 80% annualized revenue decline
// is already a near-total collapse; the engine itself defensively clamps
// further (see macroShield.ts) but the slider shouldn't invite a visitor
// to drag past what's a meaningful scenario to test.
const MAX_REVENUE_IMPACT_PCT = 80;
const STEP = 5;

function roundToStep(n: number, max: number): number {
    const clamped = Math.max(0, Math.min(max, n));
    return Math.round(clamped / STEP) * STEP;
}

// The most recently updated assumption for a driver, or null when the
// owner has never logged one -- the real "what's happening right now"
// signal this whole card should start from, see Macro Assumptions
// (settings.macroAssumptions), never a fabricated default.
function latestOf(assumptions: MacroAssumption[], driver: MacroDriver): MacroAssumption | null {
    const matches = assumptions.filter(a => a.driver === driver);
    if (matches.length === 0) return null;
    return matches.reduce((latest, a) => (a.updatedAt > latest.updatedAt ? a : latest));
}

// MacroShield -- Inflation & FX Shock Simulator. Standard banking apps show
// a live balance; this is the predictive layer on top: starting from what
// the owner has already told Quad360 they're seeing (Macro Assumptions --
// inflation, currency, demand), it shows in real numbers which month that
// would put cash below zero if it isn't offset by raising prices or
// cutting costs, and lets the owner drag further to test a worse case. See
// macroShield.ts for exactly what this reuses, why both cost sliders are
// modeled as a uniform cost increase, and why the revenue slider is a
// plain user-set assumption rather than a derived formula.
export default function MacroShieldSimulator({ currency, transactions, loans, finance, staff, minReserve, macroAssumptions, onAddMacroAssumption }: Props) {
    const inflationAssumption = useMemo(() => latestOf(macroAssumptions, 'inflation'), [macroAssumptions]);
    const fxAssumption = useMemo(() => latestOf(macroAssumptions, 'fx'), [macroAssumptions]);
    const demandAssumption = useMemo(() => latestOf(macroAssumptions, 'demand'), [macroAssumptions]);
    const hasAnyAssumption = !!(inflationAssumption || fxAssumption || demandAssumption);

    // Prefilled once from the owner's own reported figures, not left at a
    // blank 0% forcing them to invent a number -- inflation/FX only make
    // sense here as a rise (a negative reported change isn't a "shock" to
    // test), and demand only prefills the revenue slider when it's
    // reported as WEAKENING (this slider models a decline, not growth).
    const [inflationPct, setInflationPct] = useState(() => inflationAssumption ? roundToStep(inflationAssumption.changePct, MAX_SHOCK_PCT) : 0);
    const [fxDevaluationPct, setFxDevaluationPct] = useState(() => fxAssumption ? roundToStep(fxAssumption.changePct, MAX_SHOCK_PCT) : 0);
    const [revenueImpactPct, setRevenueImpactPct] = useState(() => (demandAssumption && demandAssumption.changePct < 0) ? roundToStep(Math.abs(demandAssumption.changePct), MAX_REVENUE_IMPACT_PCT) : 0);

    const result = useMemo(
        () => computeMacroShieldImpact(transactions, loans, finance, staff, minReserve, { inflationPct, fxDevaluationPct, revenueImpactPct }),
        [transactions, loans, finance, staff, minReserve, inflationPct, fxDevaluationPct, revenueImpactPct],
    );

    const hasShock = inflationPct > 0 || fxDevaluationPct > 0 || revenueImpactPct > 0;

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

    const groundedInLabels = [inflationAssumption, fxAssumption, demandAssumption].filter((a): a is MacroAssumption => !!a).map(a => a.label).join(', ');

    return (
        <View style={s.card}>
            <View style={s.headerRow}>
                <Icon name="shield" size={16} color={Colors.textPrimary} />
                <Text style={s.title}>MacroShield</Text>
            </View>
            <Text style={s.subtitle}>
                Inflation, a weaker currency, or softer demand hit cash flow fast — often before you've had a chance to raise prices or cut costs to compensate. This shows exactly which month your cash would run out if a trend like that keeps going.
            </Text>

            {hasAnyAssumption ? (
                <View style={s.groundedNote}>
                    <Icon name="check-circle" size={12} color={Colors.income} />
                    <Text style={s.groundedNoteText}>Sliders start from what you reported in Macro Assumptions ({groundedInLabels}) — drag any of them to test something different.</Text>
                </View>
            ) : (
                <TouchableOpacity style={s.addPrompt} onPress={onAddMacroAssumption} activeOpacity={0.7}>
                    <Icon name="plus-circle" size={13} color={Colors.primary} />
                    <Text style={s.addPromptText}>Add what you're seeing right now — inflation, currency, demand — in Macro Assumptions, so this starts from something real instead of a guess.</Text>
                </TouchableOpacity>
            )}

            <View style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Prices going up (inflation)</Text>
                    <Text style={s.sliderValue}>{inflationPct}%</Text>
                </View>
                <Slider
                    minimumValue={0}
                    maximumValue={MAX_SHOCK_PCT}
                    step={STEP}
                    value={inflationPct}
                    onValueChange={setInflationPct}
                    minimumTrackTintColor={Colors.warning}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.warning}
                />
                <Text style={s.sliderHint}>Stock, materials, and fuel all cost more to buy.</Text>
            </View>

            <View style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Your currency weakening</Text>
                    <Text style={s.sliderValue}>{fxDevaluationPct}%</Text>
                </View>
                <Slider
                    minimumValue={0}
                    maximumValue={MAX_SHOCK_PCT}
                    step={STEP}
                    value={fxDevaluationPct}
                    onValueChange={setFxDevaluationPct}
                    minimumTrackTintColor={Colors.expense}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.expense}
                />
                <Text style={s.sliderHint}>Anything you import, or price in dollars, gets more expensive.</Text>
            </View>

            <View style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Customers spending less</Text>
                    <Text style={s.sliderValue}>{revenueImpactPct}%</Text>
                </View>
                <Slider
                    minimumValue={0}
                    maximumValue={MAX_REVENUE_IMPACT_PCT}
                    step={STEP}
                    value={revenueImpactPct}
                    onValueChange={setRevenueImpactPct}
                    minimumTrackTintColor={Colors.secondary}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.secondary}
                />
                <Text style={s.sliderHint}>
                    People cut back when money is tight. This one's your own estimate — Quad360 doesn't calculate it from the sliders above.
                </Text>
            </View>

            {!result.available ? (
                <Text style={s.emptyHint}>{result.reason}</Text>
            ) : !hasShock ? (
                <Text style={s.emptyHint}>Move a slider to see exactly which month this would put your cash at risk.</Text>
            ) : (
                <View style={s.resultBox}>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>If nothing changes</Text>
                        <Text style={s.resultValue}>
                            {result.baseline.runOutMonthLabel ? `Runs out in ${result.baseline.runOutMonthLabel}` : 'Cash lasts the full 12 months'}
                        </Text>
                    </View>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>If this happens</Text>
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
                                    ? `That's ${fmt(currency, cashGapAtHorizon)} less than the ${fmt(currency, baselineEndingCash)} you'd otherwise have by then — cash doesn't run out at this level, but it's still a real, growing cost.`
                                    : 'No meaningful difference from this at your current numbers.'}
                            </Text>
                        </View>
                    )}

                    {result.shocked.runOutMonthLabel && (
                        <View style={s.warningBox}>
                            <Text style={s.warningText}>
                                {result.baseline.runOutMonthLabel === null
                                    ? `🔴 This alone would push your cash negative by ${result.shocked.runOutMonthLabel} — something today's numbers, without it, don't show.`
                                    : result.monthsOfRunwayLost !== null && result.monthsOfRunwayLost > 0
                                        ? `🔴 This costs you ${result.monthsOfRunwayLost} month${result.monthsOfRunwayLost !== 1 ? 's' : ''} of runway.`
                                        : `🔴 Cash still runs out, but not meaningfully sooner than it already would.`}
                            </Text>
                        </View>
                    )}

                    {result.shocked.reserveBreach && (
                        <Text style={s.reserveNote}>
                            Falls below your {fmt(currency, result.shocked.reserveBreach.minReserve)} reserve target in {result.shocked.reserveBreach.monthLabel}
                            {result.baseline.reserveBreach ? '' : ' — not currently projected to happen without this'}.
                        </Text>
                    )}

                    <Text style={s.caveat}>
                        This assumes ALL your costs rise together, not just the ones actually affected — a rough, worst-case estimate, not an exact forecast.
                        {revenueImpactPct > 0 && ' The revenue drop is your own estimate, not calculated from the sliders above.'}
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
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.sm },

    groundedNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.income + '14', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md },
    groundedNoteText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
    addPrompt: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.primary + '14', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md },
    addPromptText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

    sliderBlock: { marginBottom: Spacing.sm },
    sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    sliderLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
    sliderValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    sliderHint: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, lineHeight: 14 },

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
