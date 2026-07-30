import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { computeLoanAffordabilityCheck, LoanAffordabilityVerdict } from '../utils/loanAffordabilityCheck';
import DataConfidenceBadge from './DataConfidenceBadge';
import { Transaction } from '../types';

interface Props {
    currency: string;
    currentCashBalance: number;
    monthlyProfit: number;
    existingMonthlyDebtService: number;
    monthlyOperatingBurn: number;
    transactions: Transaction[];
}

const PURPOSES = [
    'Buy inventory', 'Equipment', 'Hire staff', 'Expand location',
    'Marketing', 'Working capital', 'Pay suppliers', 'Other',
];

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

function fmtMonths(n: number): string {
    if (!isFinite(n)) return '∞';
    return `${n.toFixed(1)} mo`;
}

const VERDICT_COLOR: Record<LoanAffordabilityVerdict, string> = {
    'high-risk': Colors.expense,
    caution: Colors.warning,
    safe: Colors.income,
};

const VERDICT_LABEL: Record<LoanAffordabilityVerdict, string> = {
    'high-risk': '🔴 High Risk',
    caution: '🟡 Caution',
    safe: '🟢 Safe',
};

// Answers a different question than the other calculators on this tab:
// not "is this loan worth it" or "roughly what could I borrow" — this
// takes ONE specific loan someone is actually considering and checks it
// against real cash flow, the way a lender's own affordability check
// would, using the business's own numbers rather than a black-box score.
export default function LoanAffordabilityChecker({
    currency, currentCashBalance, monthlyProfit, existingMonthlyDebtService, monthlyOperatingBurn, transactions,
}: Props) {
    const [amount, setAmount] = useState('');
    const [rate, setRate] = useState('15');
    const [term, setTerm] = useState('12');
    const [purpose, setPurpose] = useState(PURPOSES[0]);

    const result = useMemo(() => {
        const loanAmount = parseFloat(amount) || 0;
        const interestRate = parseFloat(rate) || 0;
        const termMonths = parseFloat(term) || 0;
        if (loanAmount <= 0 || termMonths <= 0) return null;
        return computeLoanAffordabilityCheck({
            currentCashBalance, monthlyProfit, existingMonthlyDebtService, monthlyOperatingBurn,
            loanAmount, interestRate, termMonths, purpose,
        });
    }, [amount, rate, term, purpose, currentCashBalance, monthlyProfit, existingMonthlyDebtService, monthlyOperatingBurn]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🎯 Should I Take This Loan?</Text>
            <Text style={s.subtitle}>
                Not "am I approved" — "can my actual cash flow absorb this specific repayment." Checked against your average profit and existing debt, not a guess.
            </Text>

            <DataConfidenceBadge transactions={transactions} />

            <Field label="Loan Amount" currency={currency} value={amount} onChange={setAmount} placeholder="5,000,000" />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Interest Rate" suffix="%" value={rate} onChange={setRate} placeholder="15" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Term" suffix="months" value={term} onChange={setTerm} placeholder="12" />
                </View>
            </View>

            <Text style={s.fieldLabel}>Purpose</Text>
            <View style={s.chipRow}>
                {PURPOSES.map(p => (
                    <TouchableOpacity
                        key={p}
                        style={[s.chip, purpose === p && s.chipSelected]}
                        onPress={() => setPurpose(p)}
                    >
                        <Text style={[s.chipText, purpose === p && s.chipTextSelected]}>{p}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={s.purposeNote}>
                Purpose is recorded for context — it doesn't change this verdict yet, since a genuinely tailored answer (e.g. inventory turnover, expected utilization) needs data this check doesn't have. That's a real next step, not something we'd fake here.
            </Text>

            {result && (
                <>
                    <View style={s.statRow}>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Monthly Repayment</Text>
                            <Text style={s.statVal}>{fmt(currency, result.monthlyRepayment)}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Repayment Capacity</Text>
                            <Text style={s.statVal}>{isFinite(result.repaymentCapacityMultiple) ? `${result.repaymentCapacityMultiple.toFixed(1)}x` : '∞'}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Cash Runway After</Text>
                            <Text style={s.statVal}>{fmtMonths(result.cashRunwayMonthsAfter)}</Text>
                        </View>
                    </View>

                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                        <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                        <Text style={s.verdictReason}>{result.reason}</Text>
                    </View>
                </>
            )}

            {!result && (
                <Text style={s.emptyHint}>Enter a loan amount and term to check whether it's affordable.</Text>
            )}
        </View>
    );
}

function Field({ label, value, onChange, placeholder, currency, suffix }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string;
    currency?: string; suffix?: string;
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
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    chipSelected: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    chipTextSelected: { color: Colors.primary },
    purposeNote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 12, lineHeight: 14 },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
    statVal: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
