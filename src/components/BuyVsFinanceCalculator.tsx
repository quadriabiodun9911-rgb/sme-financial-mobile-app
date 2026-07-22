import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { computeBuyVsFinance } from '../utils/buyVsFinance';

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

// The question LoanROICalculator doesn't answer: "is this loan worth it"
// (return vs. interest cost) is a different question from "what does this
// purchase do to my cash runway either way." Both paths can be reasonable
// — this shows the actual liquidity trade-off, not just which is cheaper.
export default function BuyVsFinanceCalculator({ currency, currentCashBalance, monthlyBurn }: Props) {
    const [cost, setCost] = useState('');
    const [rate, setRate] = useState('');
    const [term, setTerm] = useState('24');
    const [downPct, setDownPct] = useState('0');

    const result = useMemo(() => {
        const equipmentCost = parseFloat(cost) || 0;
        const interestRate = parseFloat(rate) || 0;
        const termMonths = parseFloat(term) || 0;
        const downPaymentPct = parseFloat(downPct) || 0;
        if (equipmentCost <= 0 || termMonths <= 0) return null;
        return computeBuyVsFinance({ equipmentCost, currentCashBalance, monthlyBurn, interestRate, termMonths, downPaymentPct });
    }, [cost, rate, term, downPct, currentCashBalance, monthlyBurn]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🏗️ Buy or Finance This Equipment?</Text>
            <Text style={s.subtitle}>
                Paying cash and financing can both be reasonable — the honest comparison is how many months of cash buffer each path leaves you, not just which is cheaper overall.
            </Text>

            <Field label="Equipment Cost" currency={currency} value={cost} onChange={setCost} placeholder="15,000" />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Interest Rate (financed)" suffix="%" value={rate} onChange={setRate} placeholder="12" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Term" suffix="months" value={term} onChange={setTerm} placeholder="24" />
                </View>
            </View>
            <Field label="Down Payment" suffix="%" value={downPct} onChange={setDownPct} placeholder="0" hint="0% if fully financed with no deposit" />

            {result && (
                <View style={s.compareGrid}>
                    <View style={[s.optionCard, result.preservesMoreRunway === 'cash' && s.optionCardWinner]}>
                        <Text style={s.optionTitle}>Pay Cash</Text>
                        <Text style={s.optionRow}>Cash after: <Text style={s.optionVal}>{fmt(currency, result.cashOption.cashAfter)}</Text></Text>
                        <Text style={s.optionRow}>Runway left: <Text style={[s.optionVal, { color: Colors.primary }]}>{fmtMonths(result.cashOption.runwayMonthsAfter)}</Text></Text>
                        <Text style={s.optionRow}>New debt: <Text style={s.optionVal}>{currency}0</Text></Text>
                    </View>
                    <View style={[s.optionCard, result.preservesMoreRunway === 'finance' && s.optionCardWinner]}>
                        <Text style={s.optionTitle}>Finance It</Text>
                        <Text style={s.optionRow}>Cash after: <Text style={s.optionVal}>{fmt(currency, result.financeOption.cashAfter)}</Text></Text>
                        <Text style={s.optionRow}>Runway left: <Text style={[s.optionVal, { color: Colors.primary }]}>{fmtMonths(result.financeOption.runwayMonthsAfter)}</Text></Text>
                        <Text style={s.optionRow}>Monthly payment: <Text style={s.optionVal}>{fmt(currency, result.financeOption.monthlyPayment)}</Text></Text>
                        <Text style={s.optionRow}>Total interest: <Text style={[s.optionVal, { color: Colors.expense }]}>{fmt(currency, result.financeOption.totalInterestPaid)}</Text></Text>
                    </View>
                </View>
            )}

            {result && (
                <Text style={[s.verdict, { color: result.preservesMoreRunway === 'cash' ? Colors.income : result.preservesMoreRunway === 'finance' ? Colors.income : Colors.textMuted }]}>
                    {result.preservesMoreRunway === 'equal'
                        ? 'Both options leave you with roughly the same runway — the choice comes down to whether the interest cost is worth avoiding a large one-off hit to cash.'
                        : result.preservesMoreRunway === 'finance'
                            ? `Financing preserves ~${Math.abs(result.runwayMonthsDifference).toFixed(1)} more months of runway, at a cost of ${fmt(currency, result.financeOption.totalInterestPaid)} in interest over the term.`
                            : `Paying cash actually leaves you with ~${Math.abs(result.runwayMonthsDifference).toFixed(1)} more months of runway than financing would here — the monthly payment would eat into your buffer more than the upfront cost does.`}
                </Text>
            )}

            {!result && (
                <Text style={s.emptyHint}>Enter the equipment cost and financing term to compare.</Text>
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

    compareGrid: { flexDirection: 'row', gap: 10, marginTop: 4 },
    optionCard: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, padding: 12 },
    optionCardWinner: { borderColor: Colors.income },
    optionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    optionRow: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 5, lineHeight: 16 },
    optionVal: { color: Colors.textPrimary, fontWeight: '700' },

    verdict: { fontSize: 12.5, fontWeight: '600', marginTop: 12, lineHeight: 18 },
    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
