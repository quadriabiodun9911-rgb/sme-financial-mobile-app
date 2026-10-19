import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { compareLoanOffers, LoanOfferResult } from '../utils/loanOfferComparison';

interface Props {
    currency: string;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

// "The headline rate tells you the price of the interest. It does not
// tell you the price of the loan." A lower rate with a bigger arrangement
// fee can cost more in total than a higher rate with a smaller one, once
// both are amortized over the real term -- this puts the margin and every
// fee on one page, the same loan amount and term, so the comparison is
// never just rate vs. rate.
export default function LoanOfferComparison({ currency }: Props) {
    const [principal, setPrincipal] = useState('');
    const [term, setTerm] = useState('36');
    const [benchmarkRate, setBenchmarkRate] = useState('');

    const [marginA, setMarginA] = useState('');
    const [feeA, setFeeA] = useState('');
    const [otherFeesA, setOtherFeesA] = useState('');

    const [marginB, setMarginB] = useState('');
    const [feeB, setFeeB] = useState('');
    const [otherFeesB, setOtherFeesB] = useState('');

    const result = useMemo(() => {
        const p = parseFloat(principal) || 0;
        const t = parseFloat(term) || 0;
        const bench = parseFloat(benchmarkRate) || 0;
        const mA = parseFloat(marginA);
        const mB = parseFloat(marginB);
        if (p <= 0 || t <= 0 || isNaN(mA) || isNaN(mB)) return null;

        return compareLoanOffers([
            { label: 'Offer A', principal: p, termMonths: t, benchmarkRatePct: bench, marginPct: mA, arrangementFeePct: parseFloat(feeA) || 0, otherFees: parseFloat(otherFeesA) || 0 },
            { label: 'Offer B', principal: p, termMonths: t, benchmarkRatePct: bench, marginPct: mB, arrangementFeePct: parseFloat(feeB) || 0, otherFees: parseFloat(otherFeesB) || 0 },
        ]);
    }, [principal, term, benchmarkRate, marginA, feeA, otherFeesA, marginB, feeB, otherFeesB]);

    return (
        <View style={s.card}>
            <Text style={s.title}>⚖️ Compare Two Loan Offers</Text>
            <Text style={s.subtitle}>
                The instinct is to take the lower rate. Put the margin and every fee on the same page, costed over the term you'll actually borrow for, and the cheaper loan isn't always the one with the lower headline rate.
            </Text>

            <Field label="Loan Amount (both offers)" currency={currency} value={principal} onChange={setPrincipal} placeholder="250,000" />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Term" suffix="months" value={term} onChange={setTerm} placeholder="36" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Reference Rate" suffix="%" value={benchmarkRate} onChange={setBenchmarkRate} placeholder="0" hint="Bank Rate, SONIA, MPR — 0 if quoted as one flat rate" />
                </View>
            </View>

            <View style={s.offersRow}>
                <View style={s.offerCol}>
                    <Text style={s.offerColLabel}>Offer A</Text>
                    <Field label="Margin" suffix="%" value={marginA} onChange={setMarginA} placeholder="3.0" />
                    <Field label="Arrangement Fee" suffix="%" value={feeA} onChange={setFeeA} placeholder="2.0" />
                    <Field label="Other Fees" currency={currency} value={otherFeesA} onChange={setOtherFeesA} placeholder="0" />
                </View>
                <View style={s.offerCol}>
                    <Text style={s.offerColLabel}>Offer B</Text>
                    <Field label="Margin" suffix="%" value={marginB} onChange={setMarginB} placeholder="3.5" />
                    <Field label="Arrangement Fee" suffix="%" value={feeB} onChange={setFeeB} placeholder="0.5" />
                    <Field label="Other Fees" currency={currency} value={otherFeesB} onChange={setOtherFeesB} placeholder="0" />
                </View>
            </View>

            {result && (
                <>
                    <View style={s.compareGrid}>
                        {result.offers.map(o => (
                            <OfferCard key={o.label} offer={o} currency={currency} isCheapest={result.cheapest?.label === o.label} />
                        ))}
                    </View>

                    <Text style={[s.verdict, { color: Colors.income }]}>
                        {result.cheapest?.label} costs {fmt(currency, result.cheapest?.totalCost ?? 0)} in total over the term
                        {result.savingsVsNextBest ? ` — ${fmt(currency, result.savingsVsNextBest)} less than the other offer.` : '.'}
                    </Text>
                    {result.lowestRateIsNotCheapest && (
                        <View style={s.warnBox}>
                            <Text style={s.warnText}>
                                The lower headline rate is NOT the cheaper loan here — its fee outweighs the saving on interest over this term.
                            </Text>
                        </View>
                    )}
                </>
            )}

            {!result && (
                <Text style={s.emptyHint}>Enter the loan amount, term, and each offer's margin to compare.</Text>
            )}
        </View>
    );
}

function OfferCard({ offer, currency, isCheapest }: { offer: LoanOfferResult; currency: string; isCheapest: boolean }) {
    return (
        <View style={[s.optionCard, isCheapest && s.optionCardWinner]}>
            <Text style={s.optionTitle}>{offer.label}{isCheapest ? ' ✓ cheaper' : ''}</Text>
            <Text style={s.optionRow}>Rate: <Text style={s.optionVal}>{offer.effectiveAnnualRatePct.toFixed(2)}%</Text></Text>
            <Text style={s.optionRow}>Monthly repayment: <Text style={s.optionVal}>{fmt(currency, offer.monthlyRepayment)}</Text></Text>
            <Text style={s.optionRow}>Total interest: <Text style={s.optionVal}>{fmt(currency, offer.totalInterestOverTerm)}</Text></Text>
            <Text style={s.optionRow}>Fees: <Text style={s.optionVal}>{fmt(currency, offer.arrangementFee + offer.otherFees)}</Text></Text>
            <Text style={s.optionRow}>Net cash received: <Text style={s.optionVal}>{fmt(currency, offer.netCashReceivedIfFeesDeducted)}</Text></Text>
            <Text style={s.optionRowTotal}>Total cost: <Text style={[s.optionVal, { color: isCheapest ? Colors.income : Colors.expense }]}>{fmt(currency, offer.totalCost)}</Text></Text>
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

    offersRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    offerCol: { flex: 1 },
    offerColLabel: { fontSize: 12.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },

    compareGrid: { flexDirection: 'row', gap: 10, marginTop: 4 },
    optionCard: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12 },
    optionCardWinner: { borderColor: Colors.income, borderWidth: 1.5 },
    optionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    optionRow: { fontSize: 11.5, color: Colors.textSecondary, marginBottom: 4 },
    optionRowTotal: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border, fontWeight: '700' },
    optionVal: { fontWeight: '700', color: Colors.textPrimary },

    verdict: { fontSize: 13, fontWeight: '700', marginTop: 12, lineHeight: 18 },
    warnBox: { backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning + '55', borderRadius: 10, padding: 10, marginTop: 8 },
    warnText: { fontSize: 12, color: Colors.textPrimary, lineHeight: 17, fontWeight: '600' },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
