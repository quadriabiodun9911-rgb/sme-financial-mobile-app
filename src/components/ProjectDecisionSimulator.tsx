import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeProjectDecisionSimulation, ProjectFundingPath, ProjectFundingRecommendation } from '../utils/projectDecisionSimulator';

interface Props {
    currency: string;
    transactions: Transaction[];
    currentCashBalance: number;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

function fmtMonths(n: number): string {
    return `${n.toFixed(1)} mo`;
}

const RECOMMENDATION_META: Record<ProjectFundingRecommendation, { label: string; color: string }> = {
    cash:    { label: '✅ Paying cash is the safer choice', color: Colors.income },
    debt:    { label: '✅ Financing is the safer choice', color: Colors.income },
    either:  { label: '⚖️ Either choice holds up', color: Colors.primary },
    neither: { label: '⚠️ This may not be affordable yet', color: Colors.expense },
};

// The combined question the two calculators above this one on the same
// screen each only answer half of: buyVsFinance.ts compares cash-vs-debt
// but only under today's numbers, financialDecisionSimulator.ts stress-
// tests a new cost but never models debt at all. A "project" (a second
// location, a new product line) usually has both an upfront cost and an
// ongoing monthly cost/benefit, and the choice of how to fund it should
// survive a bad month, not just look fine today -- see
// projectDecisionSimulator.ts for the combined math.
export default function ProjectDecisionSimulator({ currency, transactions, currentCashBalance }: Props) {
    const [upfrontCost, setUpfrontCost] = useState('');
    const [monthlyCost, setMonthlyCost] = useState('');
    const [rate, setRate] = useState('');
    const [term, setTerm] = useState('24');
    const [downPct, setDownPct] = useState('0');

    const result = useMemo(() => {
        const cost = parseFloat(upfrontCost) || 0;
        const additionalMonthlyCost = parseFloat(monthlyCost) || 0;
        const loanInterestRate = parseFloat(rate) || 0;
        const loanTermMonths = parseFloat(term) || 0;
        const downPaymentPct = parseFloat(downPct) || 0;
        if (cost <= 0 || loanTermMonths <= 0) return null;
        return computeProjectDecisionSimulation({
            transactions, currentCashBalance, currency,
            upfrontCost: cost, additionalMonthlyCost, loanInterestRate, loanTermMonths, downPaymentPct,
        });
    }, [upfrontCost, monthlyCost, rate, term, downPct, transactions, currentCashBalance, currency]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🚀 Take On a New Project — Cash or Borrow?</Text>
            <Text style={s.subtitle}>
                A new project usually has both an upfront cost and an ongoing monthly cost. See not just which funding choice is cheaper today, but which one still holds up if revenue drops.
            </Text>

            <Field label="Upfront Project Cost" currency={currency} value={upfrontCost} onChange={setUpfrontCost} placeholder="500,000" />
            <Field label="Added Monthly Cost (optional)" currency={currency} value={monthlyCost} onChange={setMonthlyCost} placeholder="0" hint="Extra rent, staff, or running costs this project adds each month" />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Interest Rate (if financed)" suffix="%" value={rate} onChange={setRate} placeholder="15" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Term" suffix="months" value={term} onChange={setTerm} placeholder="24" />
                </View>
            </View>
            <Field label="Down Payment (if financed)" suffix="%" value={downPct} onChange={setDownPct} placeholder="0" hint="0% if fully financed with no deposit" />

            {!result && <Text style={s.emptyHint}>Enter the project cost and financing term to compare.</Text>}

            {result && !result.available && <Text style={s.emptyHint}>{result.reason}</Text>}

            {result && result.available && (
                <>
                    <View style={s.compareGrid}>
                        <PathColumn label="Pay Cash" path={result.cash} currency={currency} downsideDropPct={result.downsideRevenueDropPct} winner={result.recommendation === 'cash'} />
                        <PathColumn label="Finance It" path={result.debt} currency={currency} downsideDropPct={result.downsideRevenueDropPct} winner={result.recommendation === 'debt'} extra={
                            <Text style={s.optionRow}>Total interest: <Text style={[s.optionVal, { color: Colors.expense }]}>{fmt(currency, result.debt.totalInterestPaid)}</Text></Text>
                        } />
                    </View>

                    <View style={[s.verdictBox, { borderColor: RECOMMENDATION_META[result.recommendation].color }]}>
                        <Text style={[s.verdictLabel, { color: RECOMMENDATION_META[result.recommendation].color }]}>
                            {RECOMMENDATION_META[result.recommendation].label}
                        </Text>
                        <Text style={s.verdictReason}>{result.recommendationReason}</Text>
                    </View>
                </>
            )}
        </View>
    );
}

function PathColumn({ label, path, currency, downsideDropPct, winner, extra }: {
    label: string; path: ProjectFundingPath; currency: string; downsideDropPct: number; winner: boolean; extra?: React.ReactNode;
}) {
    return (
        <View style={[s.optionCard, winner && s.optionCardWinner]}>
            <Text style={s.optionTitle}>{label}</Text>
            <Text style={s.optionRow}>Cash spent upfront: <Text style={s.optionVal}>{fmt(currency, path.upfrontCashSpent)}</Text></Text>
            <Text style={s.optionRow}>Monthly payment: <Text style={s.optionVal}>{fmt(currency, path.monthlyDebtService)}</Text></Text>
            {extra}
            <View style={s.divider} />
            <Text style={s.scenarioLabel}>Normal conditions</Text>
            <Text style={[s.optionRow, path.normal.turnsNegative && s.negativeRow]}>
                Monthly surplus: <Text style={[s.optionVal, path.normal.turnsNegative && s.negativeVal]}>{fmt(currency, path.normal.monthlySurplus)}</Text>
            </Text>
            <Text style={s.scenarioLabel}>If revenue falls {downsideDropPct}%</Text>
            <Text style={[s.optionRow, path.stressed.turnsNegative && s.negativeRow]}>
                Monthly surplus: <Text style={[s.optionVal, path.stressed.turnsNegative && s.negativeVal]}>{fmt(currency, path.stressed.monthlySurplus)}</Text>
            </Text>
            {path.stressed.turnsNegative && path.stressed.monthsUntilDepleted !== null && (
                <Text style={s.depletedWarning}>Cash would run out in ~{fmtMonths(path.stressed.monthsUntilDepleted)}</Text>
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
    negativeRow: { color: Colors.expense },
    negativeVal: { color: Colors.expense },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
    scenarioLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3, marginTop: 2 },
    depletedWarning: { fontSize: 11, color: Colors.expense, fontWeight: '700', marginTop: 2 },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
