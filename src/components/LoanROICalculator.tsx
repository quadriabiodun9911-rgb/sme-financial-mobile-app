import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
    currency: string;
}

// Operationalizes the "Key Principle" already stated below this component:
// only borrow if the return exceeds the cost. Simple-interest cost of
// borrowing (principal × rate), not a full amortization schedule — this is
// a quick gut-check before taking a loan, not a repayment calculator.
export default function LoanROICalculator({ currency }: Props) {
    const [principal, setPrincipal] = useState('');
    const [rate, setRate] = useState('');
    const [annualReturn, setAnnualReturn] = useState('');

    const result = useMemo(() => {
        const p = parseFloat(principal) || 0;
        const r = parseFloat(rate) || 0;
        if (p <= 0 || r < 0) return null;

        // A blank return field means "I don't know yet," not "this earns
        // nothing." Financing for general business development (a vehicle,
        // working capital, a shared asset) often can't be tied to a single
        // annual profit figure — treating an unanswered field as £0 would
        // brand every one of those loans "Bad Debt" by default, which is
        // wrong and misleading, not just cautious.
        const hasReturnEstimate = annualReturn.trim() !== '';
        const ret = parseFloat(annualReturn) || 0;

        const annualCost = p * (r / 100);
        const netBenefit = ret - annualCost;
        const roi = p > 0 ? (ret / p) * 100 : 0;
        const isGoodDebt = ret > annualCost;

        return { annualCost, netBenefit, roi, isGoodDebt, hasReturnEstimate };
    }, [principal, annualReturn, rate]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🧮 Is This Loan Worth It?</Text>
            <Text style={s.subtitle}>Compare the cost of borrowing against what the money will actually earn you.</Text>

            <Field label="Loan Amount" currency={currency} value={principal} onChange={setPrincipal} placeholder="10,000" />
            <Field label="Annual Interest Rate" suffix="%" value={rate} onChange={setRate} placeholder="15" />
            <Field
                label="Expected Extra Annual Profit"
                currency={currency}
                value={annualReturn}
                onChange={setAnnualReturn}
                placeholder="3,000"
                hint="What this loan will let you earn or save each year — e.g. profit from new equipment, stock, or a hire"
            />

            {result && result.hasReturnEstimate && (
                <View style={[s.resultCard, { borderColor: result.isGoodDebt ? Colors.income : Colors.expense }]}>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>Cost of Borrowing / Year</Text>
                        <Text style={[s.resultValue, { color: Colors.expense }]}>{currency}{Math.round(result.annualCost).toLocaleString()}</Text>
                    </View>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>Return on This Money</Text>
                        <Text style={[s.resultValue, { color: Colors.income }]}>{result.roi.toFixed(1)}%</Text>
                    </View>
                    <View style={[s.resultRow, { borderBottomWidth: 0 }]}>
                        <Text style={[s.resultLabel, { fontWeight: '700' }]}>Net Benefit / Year</Text>
                        <Text style={[s.resultValue, s.resultValueBig, { color: result.netBenefit >= 0 ? Colors.income : Colors.expense }]}>
                            {result.netBenefit >= 0 ? '+' : ''}{currency}{Math.round(result.netBenefit).toLocaleString()}
                        </Text>
                    </View>
                    <Text style={[s.verdict, { color: result.isGoodDebt ? Colors.income : Colors.expense }]}>
                        {result.isGoodDebt
                            ? '✓ Good Debt — this pays for its own financing and then some.'
                            : '⚠ Bad Debt — the cost of borrowing is more than this will earn you.'}
                    </Text>
                </View>
            )}

            {result && !result.hasReturnEstimate && (
                <View style={s.neutralCard}>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>Cost of Borrowing / Year</Text>
                        <Text style={[s.resultValue, { color: Colors.expense }]}>{currency}{Math.round(result.annualCost).toLocaleString()}</Text>
                    </View>
                    <Text style={s.neutralText}>
                        Not every loan has a single number attached to it — financing a shared asset, a vehicle, or general working capital for the business often can't be tied to one year's profit. Enter an estimate above if you have one. If you don't, this isn't automatically bad debt — check the impact on your cash runway instead with Buy vs Finance or Can I Afford This Growth below.
                    </Text>
                </View>
            )}

            {!result && (
                <Text style={s.emptyHint}>Enter a loan amount and interest rate to see whether it's worth taking.</Text>
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

    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    resultCard: { borderWidth: 1.5, borderRadius: 10, padding: 14, marginTop: 6 },
    neutralCard: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, padding: 14, marginTop: 6 },
    neutralText: { fontSize: 12, color: Colors.textSecondary, marginTop: 10, lineHeight: 17 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    resultLabel: { fontSize: 12.5, color: Colors.textSecondary },
    resultValue: { fontSize: 14, fontWeight: '700' },
    resultValueBig: { fontSize: 17 },
    verdict: { fontSize: 12.5, fontWeight: '700', marginTop: 10, lineHeight: 18 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
