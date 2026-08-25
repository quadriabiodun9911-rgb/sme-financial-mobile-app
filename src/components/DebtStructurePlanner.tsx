import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { compareDebtStructures, DebtStructureKind } from '../utils/debtStructurePlanner';

interface Props {
    currency: string;
    currentCashBalance: number;
    baselineMonthlyNetCashFlow: number;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

const KIND_LABEL: Record<DebtStructureKind | 'neither', string> = {
    no_debt: 'Self-Funded',
    term_loan: 'Term Loan',
    revolving_line: 'Revolving Line',
    neither: 'Neither, as sized',
};

// The question neither "can I afford this one loan" (DSCR) nor "can I
// self-fund this growth" (Growth Affordability, above) answers: which
// STRUCTURE of debt -- a fixed term loan vs. a revolving line drawn only as
// needed -- lets a specific growth plan proceed without projected cash
// ever going negative. Runs the same growth plan through both structures
// month by month and compares their liquidity paths, not just their rates.
export default function DebtStructurePlanner({ currency, currentCashBalance, baselineMonthlyNetCashFlow }: Props) {
    const [capitalNeed, setCapitalNeed] = useState('');
    const [addedCost, setAddedCost] = useState('');
    const [addedRevenue, setAddedRevenue] = useState('');
    const [rampUp, setRampUp] = useState('3');
    const [termRate, setTermRate] = useState('18');
    const [termMonths, setTermMonths] = useState('24');
    const [revolvingRate, setRevolvingRate] = useState('26');
    const [revolvingLimit, setRevolvingLimit] = useState('');

    const comparison = useMemo(() => {
        const capital = parseFloat(capitalNeed) || 0;
        if (capital <= 0) return null;
        const limit = parseFloat(revolvingLimit) || capital;
        return compareDebtStructures(
            {
                currentCashBalance,
                baselineMonthlyNetCashFlow,
                capitalNeed: capital,
                additionalMonthlyCost: parseFloat(addedCost) || 0,
                expectedAdditionalMonthlyRevenue: parseFloat(addedRevenue) || 0,
                rampUpMonths: parseFloat(rampUp) || 0,
                horizonMonths: 12,
            },
            parseFloat(termRate) || 0,
            parseFloat(termMonths) || 1,
            parseFloat(revolvingRate) || 0,
            limit,
            currency,
        );
    }, [capitalNeed, addedCost, addedRevenue, rampUp, termRate, termMonths, revolvingRate, revolvingLimit, currentCashBalance, baselineMonthlyNetCashFlow, currency]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🏗️ What Debt Structure Fits This Growth Plan?</Text>
            <Text style={s.subtitle}>
                Compares a fixed term loan against a revolving line of credit for the SAME growth plan — not which is cheaper, but which keeps your projected cash from ever going negative.
            </Text>

            <Field label="Capital Needed" currency={currency} value={capitalNeed} onChange={setCapitalNeed} placeholder="0" hint="Total upfront cost of the growth plan" />
            <View style={s.row}>
                <View style={{ flex: 1 }}><Field label="Added Monthly Cost" currency={currency} value={addedCost} onChange={setAddedCost} placeholder="0" /></View>
                <View style={{ flex: 1 }}><Field label="Ramp-Up" suffix="months" value={rampUp} onChange={setRampUp} placeholder="3" /></View>
            </View>
            <Field label="Expected Added Monthly Revenue" currency={currency} value={addedRevenue} onChange={setAddedRevenue} placeholder="0" hint="Conservative estimate, lands after ramp-up" />

            <Text style={s.groupLabel}>Term Loan</Text>
            <View style={s.row}>
                <View style={{ flex: 1 }}><Field label="Rate" suffix="%/yr" value={termRate} onChange={setTermRate} placeholder="18" /></View>
                <View style={{ flex: 1 }}><Field label="Term" suffix="months" value={termMonths} onChange={setTermMonths} placeholder="24" /></View>
            </View>

            <Text style={s.groupLabel}>Revolving Line of Credit</Text>
            <View style={s.row}>
                <View style={{ flex: 1 }}><Field label="Rate" suffix="%/yr" value={revolvingRate} onChange={setRevolvingRate} placeholder="26" /></View>
                <View style={{ flex: 1 }}><Field label="Credit Limit" currency={currency} value={revolvingLimit} onChange={setRevolvingLimit} placeholder={capitalNeed || '0'} /></View>
            </View>

            {comparison && (
                <>
                    <View style={s.compareRow}>
                        {[comparison.noDebt, comparison.termLoan, comparison.revolvingLine].map(r => (
                            <View key={r.kind} style={[s.structureBox, r.breached && s.structureBoxBreached]}>
                                <Text style={s.structureLabel}>{KIND_LABEL[r.kind]}</Text>
                                <Text style={[s.structureCash, { color: r.breached ? Colors.expense : Colors.income }]}>{fmt(currency, r.minCash)}</Text>
                                <Text style={s.structureCashLabel}>lowest projected cash</Text>
                                {r.breached ? (
                                    <Text style={s.structureBreached}>⚠️ Goes negative, month {r.minCashMonth}</Text>
                                ) : (
                                    <Text style={s.structureOk}>✅ Stays positive</Text>
                                )}
                                {r.totalInterestPaid > 0 && (
                                    <Text style={s.structureInterest}>{fmt(currency, r.totalInterestPaid)} interest</Text>
                                )}
                            </View>
                        ))}
                    </View>

                    <View style={[s.verdictBox, { borderColor: comparison.recommendation === 'neither' && comparison.noDebt.breached ? Colors.expense : Colors.primary }]}>
                        <Text style={s.verdictLabel}>Recommended: {KIND_LABEL[comparison.recommendation]}</Text>
                        <Text style={s.verdictReason}>{comparison.recommendationReason}</Text>
                    </View>
                </>
            )}

            {!comparison && (
                <Text style={s.emptyHint}>Enter the capital needed for a growth plan to compare debt structures.</Text>
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

    groupLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.3, marginTop: 6, marginBottom: 8 },

    row: { flexDirection: 'row', gap: 10 },
    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    compareRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    structureBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    structureBoxBreached: { borderColor: Colors.expense + '88' },
    structureLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
    structureCash: { fontSize: 13, fontWeight: '800' },
    structureCashLabel: { fontSize: 9.5, color: Colors.textMuted, marginBottom: 4 },
    structureBreached: { fontSize: 9.5, color: Colors.expense, fontWeight: '700', lineHeight: 13 },
    structureOk: { fontSize: 9.5, color: Colors.income, fontWeight: '700' },
    structureInterest: { fontSize: 9.5, color: Colors.textMuted, marginTop: 4 },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
