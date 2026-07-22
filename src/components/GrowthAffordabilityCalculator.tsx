import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { computeGrowthAffordability, GrowthAffordabilityVerdict } from '../utils/growthAffordability';

interface Props {
    currency: string;
    currentCashBalance: number;
    monthlyBurn: number;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

function fmtMonths(n: number): string {
    if (!isFinite(n)) return '∞';
    return `${n.toFixed(1)} mo`;
}

const VERDICT_COLOR: Record<GrowthAffordabilityVerdict, string> = {
    unsafe: Colors.expense,
    caution: Colors.warning,
    safe: Colors.income,
};

const VERDICT_LABEL: Record<GrowthAffordabilityVerdict, string> = {
    unsafe: '⚠️ Not affordable yet',
    caution: '⚡ Affordable, but tight',
    safe: '✅ Safe to proceed',
};

// Growth expenses (a hire, a new location, more inventory) land immediately;
// the revenue they're supposed to generate almost always arrives later, if
// at all. This checks whether cash survives that gap — the actual question
// behind "should we expand now" — using the same runway math as the rest
// of the app, not a vague go/no-go feeling.
export default function GrowthAffordabilityCalculator({ currency, currentCashBalance, monthlyBurn }: Props) {
    const [upfront, setUpfront] = useState('');
    const [addedCost, setAddedCost] = useState('');
    const [addedRevenue, setAddedRevenue] = useState('');
    const [rampUp, setRampUp] = useState('3');

    const result = useMemo(() => {
        const upfrontCost = parseFloat(upfront) || 0;
        const additionalMonthlyCost = parseFloat(addedCost) || 0;
        const expectedAdditionalMonthlyRevenue = parseFloat(addedRevenue) || 0;
        const rampUpMonths = parseFloat(rampUp) || 0;
        if (upfrontCost <= 0 && additionalMonthlyCost <= 0) return null;
        return computeGrowthAffordability({
            currentCashBalance, monthlyBurn, upfrontCost, additionalMonthlyCost,
            expectedAdditionalMonthlyRevenue, rampUpMonths,
        });
    }, [upfront, addedCost, addedRevenue, rampUp, currentCashBalance, monthlyBurn]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🌱 Can I Afford This Growth?</Text>
            <Text style={s.subtitle}>
                A new hire, location, or product line adds cost today, but the revenue it's meant to bring in usually lands later. This checks whether your cash survives that gap.
            </Text>

            <Field label="Upfront Cost" currency={currency} value={upfront} onChange={setUpfront} placeholder="0" hint="Deposit, fit-out, first equipment payment, etc." />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Added Monthly Cost" currency={currency} value={addedCost} onChange={setAddedCost} placeholder="0" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Ramp-Up" suffix="months" value={rampUp} onChange={setRampUp} placeholder="3" />
                </View>
            </View>
            <Field label="Expected Added Monthly Revenue" currency={currency} value={addedRevenue} onChange={setAddedRevenue} placeholder="0" hint="Be conservative — leave at 0 if you're not sure yet" />

            {result && (
                <>
                    <View style={s.statRow}>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Cash after upfront cost</Text>
                            <Text style={[s.statVal, result.cashAfterUpfront < 0 && { color: Colors.expense }]}>{fmt(currency, result.cashAfterUpfront)}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Runway during ramp-up</Text>
                            <Text style={s.statVal}>{fmtMonths(result.runwayMonthsDuringRampUp)}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Runway once revenue lands</Text>
                            <Text style={s.statVal}>{fmtMonths(result.runwayMonthsAfterRampUp)}</Text>
                        </View>
                    </View>

                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                        <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                        <Text style={s.verdictReason}>{result.reason}</Text>
                    </View>
                </>
            )}

            {!result && (
                <Text style={s.emptyHint}>Enter an upfront cost or added monthly cost to check affordability.</Text>
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

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
