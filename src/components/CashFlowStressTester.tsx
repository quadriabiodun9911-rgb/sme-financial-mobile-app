import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { computeCashFlowStressTest, StressVerdict } from '../utils/cashFlowStressTest';

interface Props {
    currency: string;
    currentCashBalance: number;
    dailyBurn: number;
}

function fmtDays(n: number): string {
    if (!isFinite(n)) return '∞';
    return `${Math.round(n)} days`;
}

const VERDICT_COLOR: Record<StressVerdict, string> = {
    critical: Colors.expense,
    caution: Colors.warning,
    safe: Colors.income,
};

const VERDICT_LABEL: Record<StressVerdict, string> = {
    critical: '🔴 Critical',
    caution: '🟡 Caution',
    safe: '🟢 Safe',
};

// A "what if" the user sets, not a prediction — Quad360 has no live feed of
// oil prices, freight rates, or FX movements to trigger this on its own.
// The value is turning a headline about shipping delays or fuel spikes
// into a concrete answer against this business's own cash position,
// instead of a vague sense of unease.
export default function CashFlowStressTester({ currency, currentCashBalance, dailyBurn }: Props) {
    const [costIncreasePct, setCostIncreasePct] = useState('0');
    const [delayDays, setDelayDays] = useState('0');
    const [delayedIncome, setDelayedIncome] = useState('0');

    const result = useMemo(() => {
        return computeCashFlowStressTest({
            currentCashBalance,
            dailyBurn,
            costIncreasePct: parseFloat(costIncreasePct) || 0,
            collectionsDelayDays: parseFloat(delayDays) || 0,
            delayedIncome: parseFloat(delayedIncome) || 0,
        });
    }, [currentCashBalance, dailyBurn, costIncreasePct, delayDays, delayedIncome]);

    const hasStress = (parseFloat(costIncreasePct) || 0) > 0 || (parseFloat(delayedIncome) || 0) > 0;

    return (
        <View style={s.card}>
            <Text style={s.title}>⚡ Cash Flow Stress Test</Text>
            <Text style={s.subtitle}>
                Model a shock — rising fuel/input costs, a delayed shipment, slower-paying customers — against your real cash position, before it actually happens.
            </Text>

            <Field label="Cost Increase (fuel, freight, materials)" suffix="%" value={costIncreasePct} onChange={setCostIncreasePct} placeholder="0" hint="e.g. 20 for a 20% rise in what you pay to run the business" />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Payment Delay" suffix="days" value={delayDays} onChange={setDelayDays} placeholder="0" hint="How much later than usual" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Cash At Risk" currency={currency} value={delayedIncome} onChange={setDelayedIncome} placeholder="0" hint="Expected but delayed" />
                </View>
            </View>

            <View style={s.statRow}>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Current Runway</Text>
                    <Text style={s.statVal}>{fmtDays(result.baselineRunwayDays)}</Text>
                </View>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Runway Under Stress</Text>
                    <Text style={[s.statVal, { color: hasStress ? VERDICT_COLOR[result.verdict] : Colors.textPrimary }]}>{fmtDays(result.stressedRunwayDays)}</Text>
                </View>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Runway Lost</Text>
                    <Text style={s.statVal}>{isFinite(result.runwayLostDays) ? `${Math.round(result.runwayLostDays)} days` : '—'}</Text>
                </View>
            </View>

            {hasStress && (
                <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                    <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                    <Text style={s.verdictReason}>{result.reason}</Text>
                </View>
            )}
            {!hasStress && (
                <Text style={s.emptyHint}>Enter a cost increase or delayed cash amount to see the effect on your runway.</Text>
            )}
        </View>
    );
}

function Field({ label, value, onChange, placeholder, currency, suffix, hint }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string;
    currency?: string; suffix?: string; hint?: string;
}) {
    return (
        <View style={s.field}>
            <Text style={s.fieldLabel}>{label}</Text>
            <View style={s.inputWrap}>
                {currency && <Text style={s.affix}>{currency}</Text>}
                <TextInput
                    style={s.input}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textMuted}
                />
                {suffix && <Text style={s.affix}>{suffix}</Text>}
            </View>
            {hint && <Text style={s.fieldHint}>{hint}</Text>}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 17 },

    row: { flexDirection: 'row', gap: 10 },
    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
    statVal: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
});
