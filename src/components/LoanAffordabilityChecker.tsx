import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { computeLoanAffordabilityCheck, LoanAffordabilityVerdict } from '../utils/loanAffordabilityCheck';
import { computeTenorCycleCheck } from '../utils/tenorCycleMatch';
import { computeRepaymentSeasonalAlignment } from '../utils/repaymentSeasonalAlignment';
import { computeRepaymentWeekdayAlignment } from '../utils/repaymentWeekdayAlignment';
import DataConfidenceBadge from './DataConfidenceBadge';
import Icon, { IconName } from './ui/Icon';
import { Transaction, InventoryItem } from '../types';

interface Props {
    currency: string;
    currentCashBalance: number;
    monthlyProfit: number;
    existingMonthlyDebtService: number;
    monthlyOperatingBurn: number;
    transactions: Transaction[];
    // Feeds the same "Before You Take This On" checks the Add Loan form
    // (LoansScreen.tsx) already shows for a loan actually being recorded --
    // this checker asks the same question for a loan still being sized, so
    // it shouldn't lack the one tenor/seasonality check that form has.
    inventory?: InventoryItem[];
    // Same optional trend/reconciliation context DataConfidenceBadge takes
    // everywhere else it's wired up (see that component's own doc comment) --
    // computed by the caller, never fabricated here.
    dataConfidenceTrend?: string | null;
    reconciliation?: { lastReconciledAt?: string; lastReconciliationMatchedPct?: number };
    // See GrowthAffordabilityCalculator's own doc comment -- same
    // "Check a New Spend" hand-off pattern, applied to this calculator's
    // loan Amount field.
    prefillAmount?: { amount: number } | null;
    onPrefillConsumed?: () => void;
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
    'high-risk': 'High Risk',
    caution: 'Caution',
    safe: 'Safe',
};
const VERDICT_ICON: Record<LoanAffordabilityVerdict, IconName> = {
    'high-risk': 'alert-circle',
    caution: 'alert-triangle',
    safe: 'check-circle',
};

// Answers a different question than the other calculators on this tab:
// not "is this loan worth it" or "roughly what could I borrow" — this
// takes ONE specific loan someone is actually considering and checks it
// against real cash flow, the way a lender's own affordability check
// would, using the business's own numbers rather than a black-box score.
export default function LoanAffordabilityChecker({
    currency, currentCashBalance, monthlyProfit, existingMonthlyDebtService, monthlyOperatingBurn, transactions,
    inventory, dataConfidenceTrend, reconciliation, prefillAmount, onPrefillConsumed,
}: Props) {
    const [amount, setAmount] = useState('');
    const [rate, setRate] = useState('15');
    const [term, setTerm] = useState('12');
    const [purpose, setPurpose] = useState(PURPOSES[0]);

    useEffect(() => {
        if (!prefillAmount) return;
        setAmount(prefillAmount.amount > 0 ? String(Math.round(prefillAmount.amount)) : '');
        onPrefillConsumed?.();
    }, [prefillAmount]);

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

    // Same checks LoansScreen's Add Loan form already runs for a loan
    // actually being recorded -- reused here, not reimplemented, so sizing
    // a loan in Decide/Loans & Debt gets the identical "before you take
    // this on" signal a loan entered for real would get.
    const tenorCheck = useMemo(() => {
        const termMonths = parseFloat(term);
        return result && !isNaN(termMonths) ? computeTenorCycleCheck(termMonths, transactions, inventory ?? []) : null;
    }, [result, term, transactions, inventory]);
    const seasonalCheck = useMemo(
        () => result ? computeRepaymentSeasonalAlignment(transactions, result.monthlyRepayment) : null,
        [result, transactions],
    );
    const weekdayCheck = useMemo(() => result ? computeRepaymentWeekdayAlignment(transactions) : null, [result, transactions]);

    return (
        <View style={s.card}>
            <Text style={s.title}>🎯 Should I Take This Loan?</Text>
            <Text style={s.subtitle}>
                Not "am I approved" — "can my actual cash flow absorb this specific repayment." Checked against your average profit and existing debt, not a guess.
            </Text>

            <DataConfidenceBadge transactions={transactions} trend={dataConfidenceTrend} reconciliation={reconciliation} />

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
                            <Text style={s.statHint}>monthly profit ÷ total debt payments</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Cash Runway After</Text>
                            <Text style={s.statVal}>{fmtMonths(result.cashRunwayMonthsAfter)}</Text>
                        </View>
                    </View>

                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                        <View style={s.verdictLabelRow}>
                            <Icon name={VERDICT_ICON[result.verdict]} size={14} color={VERDICT_COLOR[result.verdict]} />
                            <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                        </View>
                        <Text style={s.verdictReason}>{result.reason}</Text>
                    </View>

                    {(tenorCheck || seasonalCheck?.available || weekdayCheck?.available) && (
                        <>
                            <Text style={s.beforeTakingTitle}>Before You Take This On</Text>
                            {tenorCheck && (
                                <View style={[s.tenorNote, tenorCheck.status === 'shorter_than_cycle' && s.tenorNoteWarn]}>
                                    <View style={s.tenorNoteLabelRow}>
                                        <Icon name={tenorCheck.status === 'shorter_than_cycle' ? 'alert-triangle' : 'check-circle'} size={13} color={tenorCheck.status === 'shorter_than_cycle' ? Colors.warning : Colors.income} />
                                        <Text style={s.tenorNoteLabel}>Tenor vs. Cash Cycle</Text>
                                    </View>
                                    <Text style={s.tenorNoteText}>{tenorCheck.message}</Text>
                                </View>
                            )}
                            {seasonalCheck?.available && (
                                <View style={[s.tenorNote, !seasonalCheck.aligned && s.tenorNoteWarn]}>
                                    <View style={s.tenorNoteLabelRow}>
                                        <Icon name={seasonalCheck.aligned ? 'check-circle' : 'alert-triangle'} size={13} color={seasonalCheck.aligned ? Colors.income : Colors.warning} />
                                        <Text style={s.tenorNoteLabel}>Repayment vs. Sales Pattern</Text>
                                    </View>
                                    <Text style={s.tenorNoteText}>{seasonalCheck.message}</Text>
                                </View>
                            )}
                            {weekdayCheck?.available && (
                                <View style={[s.tenorNote, weekdayCheck.concentrated && s.tenorNoteWarn]}>
                                    <View style={s.tenorNoteLabelRow}>
                                        <Icon name={weekdayCheck.concentrated ? 'alert-triangle' : 'check-circle'} size={13} color={weekdayCheck.concentrated ? Colors.warning : Colors.income} />
                                        <Text style={s.tenorNoteLabel}>Repayment vs. Weekday Cash Flow</Text>
                                    </View>
                                    <Text style={s.tenorNoteText}>{weekdayCheck.message}</Text>
                                </View>
                            )}
                        </>
                    )}
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
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
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
    statHint: { fontSize: 9.5, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12, ...Shadow.sm },
    verdictLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    verdictLabel: { fontSize: 13, fontWeight: '800' },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    beforeTakingTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginTop: 14, marginBottom: 8 },
    tenorNote: { borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, padding: 10, marginBottom: 8 },
    tenorNoteWarn: { borderColor: Colors.warning + '88', backgroundColor: Colors.warning + '14' },
    tenorNoteLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
    tenorNoteLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textPrimary },
    tenorNoteText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
