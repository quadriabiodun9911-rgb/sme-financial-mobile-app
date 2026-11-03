/**
 * "Should I borrow to buy more stock" -- answered as one decision instead
 * of three disconnected questions. The owner's own financing pre-conditions
 * were: how much additional stock is required, which products justify the
 * investment, what sales/profit it would realistically produce, and
 * whether cash flow can carry the repayment without the loan itself
 * becoming the pressure it was meant to relieve.
 *
 * rankInvestmentCandidates (stockInvestmentPlan.ts) answers "which
 * products" by real cash efficiency; editing quantities against those
 * candidates answers "how much capital"; computeStockInvestmentPlan
 * projects the sales/profit from the item's own recent sell-through pace.
 * The result feeds straight into computeLoanAffordabilityCheck -- the same
 * engine LoanAffordabilityChecker already uses elsewhere -- run twice: once
 * on the business's current monthlyProfit, once with this stock's own
 * projected contribution added in, so the verdict shows whether the stock
 * pays for its own loan or just adds pressure.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Spacing, Radius } from '../theme/tokens';
import Icon, { IconName } from './ui/Icon';
import { InventoryItem, Transaction } from '../types';
import { rankInvestmentCandidates, computeStockInvestmentPlan } from '../utils/stockInvestmentPlan';
import { computeLoanAffordabilityCheck, LoanAffordabilityVerdict } from '../utils/loanAffordabilityCheck';

interface Props {
    currency: string;
    inventory: InventoryItem[];
    transactions: Transaction[];
    currentCashBalance: number;
    monthlyProfit: number;
    existingMonthlyDebtService: number;
    monthlyOperatingBurn: number;
}

const HORIZONS = [30, 60, 90] as const;

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

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

export default function StockInvestmentPlanner({
    currency, inventory, transactions, currentCashBalance,
    monthlyProfit, existingMonthlyDebtService, monthlyOperatingBurn,
}: Props) {
    const [horizonDays, setHorizonDays] = useState<30 | 60 | 90>(30);
    const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});
    const [rate, setRate] = useState('15');
    const [term, setTerm] = useState('12');
    const [loanAmountOverride, setLoanAmountOverride] = useState<string | null>(null);

    const candidates = useMemo(
        () => rankInvestmentCandidates(inventory, transactions).slice(0, 5),
        [inventory, transactions],
    );

    // Default each candidate's suggested add-quantity to "enough to cover
    // the chosen horizon at its own recent pace" -- a starting point the
    // owner edits, not a figure asserted as the right amount to buy.
    useEffect(() => {
        setQtyByItem(prev => {
            const next = { ...prev };
            for (const c of candidates) {
                if (next[c.itemId] == null) {
                    next[c.itemId] = String(Math.max(1, Math.round(c.avgDailyUnitsSold * horizonDays)));
                }
            }
            return next;
        });
    }, [candidates, horizonDays]);

    const plan = useMemo(() => {
        const selections = candidates.map(c => ({ itemId: c.itemId, addQty: parseFloat(qtyByItem[c.itemId]) || 0 }));
        return computeStockInvestmentPlan(inventory, transactions, selections, horizonDays);
    }, [candidates, qtyByItem, inventory, transactions, horizonDays]);

    const loanAmount = loanAmountOverride != null
        ? (parseFloat(loanAmountOverride) || 0)
        : plan.totalCapitalRequired;

    const affordability = useMemo(() => {
        const interestRate = parseFloat(rate) || 0;
        const termMonths = parseFloat(term) || 0;
        if (loanAmount <= 0 || termMonths <= 0) return null;

        const withStock = computeLoanAffordabilityCheck({
            currentCashBalance, monthlyProfit: monthlyProfit + plan.projectedMonthlyProfitContribution,
            existingMonthlyDebtService, monthlyOperatingBurn, loanAmount, interestRate, termMonths, purpose: 'Buy inventory',
        });
        // Same check, but without crediting the new stock's own projected
        // profit -- the "would this loan still be safe if the stock
        // underperforms" comparison the owner's own instinct ("avoid
        // borrowing money that increases sales but puts pressure on cash
        // flow") is actually asking for.
        const withoutStock = computeLoanAffordabilityCheck({
            currentCashBalance, monthlyProfit,
            existingMonthlyDebtService, monthlyOperatingBurn, loanAmount, interestRate, termMonths, purpose: 'Buy inventory',
        });
        return { withStock, withoutStock };
    }, [loanAmount, rate, term, currentCashBalance, monthlyProfit, plan.projectedMonthlyProfitContribution, existingMonthlyDebtService, monthlyOperatingBurn]);

    if (candidates.length === 0) {
        return (
            <View style={s.emptyBox}>
                <Icon name="inbox" size={18} color={Colors.textMuted} />
                <Text style={s.emptyText}>
                    No products with enough recent sales to project a restock plan from yet. Sell a few items through Inventory's "Sell" action first.
                </Text>
            </View>
        );
    }

    return (
        <View>
            <Text style={s.sectionLabel}>1. Which products justify new stock</Text>
            <Text style={s.sectionHint}>Ranked by cash efficiency -- gross profit per naira tied up, your top performers first.</Text>

            <View style={s.horizonRow}>
                {HORIZONS.map(h => (
                    <TouchableOpacity key={h} onPress={() => setHorizonDays(h)} style={[s.horizonChip, horizonDays === h && s.horizonChipActive]}>
                        <Text style={[s.horizonChipText, horizonDays === h && s.horizonChipTextActive]}>{h} days</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {candidates.map(c => (
                <View key={c.itemId} style={s.candidateRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.candidateName}>{c.itemName}</Text>
                        <Text style={s.candidateDetail}>
                            {c.marginPct.toFixed(0)}% margin · {c.cashEfficiency == null ? '—' : `${c.cashEfficiency.toFixed(2)}x efficiency`} · {c.avgDailyUnitsSold.toFixed(1)}/day
                        </Text>
                    </View>
                    <View style={s.qtyField}>
                        <TextInput
                            style={s.qtyInput}
                            value={qtyByItem[c.itemId] ?? ''}
                            onChangeText={v => setQtyByItem(prev => ({ ...prev, [c.itemId]: v }))}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                        <Text style={s.qtyUnit}>units</Text>
                    </View>
                </View>
            ))}

            <Text style={[s.sectionLabel, { marginTop: Spacing.md }]}>2 & 3. Capital required and projected return</Text>
            <View style={s.statRow}>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Capital Required</Text>
                    <Text style={s.statVal}>{fmt(currency, plan.totalCapitalRequired)}</Text>
                </View>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Projected Revenue</Text>
                    <Text style={s.statVal}>{fmt(currency, plan.totalProjectedRevenue)}</Text>
                    <Text style={s.statHint}>over {horizonDays} days</Text>
                </View>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Projected Profit</Text>
                    <Text style={[s.statVal, { color: plan.totalProjectedGrossProfit >= 0 ? Colors.income : Colors.expense }]}>
                        {fmt(currency, plan.totalProjectedGrossProfit)}
                    </Text>
                    <Text style={s.statHint}>over {horizonDays} days</Text>
                </View>
            </View>
            <Text style={s.footnote}>
                Projection is capped by each item's own recent sell-through pace -- not the quantity above, so stocking more than it can realistically sell in {horizonDays} days won't inflate this number.
            </Text>

            <Text style={[s.sectionLabel, { marginTop: Spacing.md }]}>4. Would cash flow carry the repayment?</Text>
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Loan Amount</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.input}
                            value={loanAmountOverride ?? String(Math.round(plan.totalCapitalRequired))}
                            onChangeText={setLoanAmountOverride}
                            keyboardType="decimal-pad"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Rate %</Text>
                    <View style={s.inputWrap}>
                        <TextInput style={s.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="15" placeholderTextColor={Colors.textMuted} />
                    </View>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Term (mo)</Text>
                    <View style={s.inputWrap}>
                        <TextInput style={s.input} value={term} onChangeText={setTerm} keyboardType="decimal-pad" placeholder="12" placeholderTextColor={Colors.textMuted} />
                    </View>
                </View>
            </View>

            {affordability && (
                <>
                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[affordability.withStock.verdict] }]}>
                        <View style={s.verdictLabelRow}>
                            <Icon name={VERDICT_ICON[affordability.withStock.verdict]} size={14} color={VERDICT_COLOR[affordability.withStock.verdict]} />
                            <Text style={[s.verdictLabel, { color: VERDICT_COLOR[affordability.withStock.verdict] }]}>
                                {VERDICT_LABEL[affordability.withStock.verdict]} -- counting this stock's own profit
                            </Text>
                        </View>
                        <Text style={s.verdictReason}>{affordability.withStock.reason}</Text>
                        <Text style={s.verdictStat}>Monthly repayment: {fmt(currency, affordability.withStock.monthlyRepayment)} · Repayment capacity: {isFinite(affordability.withStock.repaymentCapacityMultiple) ? `${affordability.withStock.repaymentCapacityMultiple.toFixed(1)}x` : '∞'}</Text>
                    </View>

                    <View style={[s.verdictBox, s.verdictBoxSecondary, { borderColor: VERDICT_COLOR[affordability.withoutStock.verdict] }]}>
                        <View style={s.verdictLabelRow}>
                            <Icon name={VERDICT_ICON[affordability.withoutStock.verdict]} size={14} color={VERDICT_COLOR[affordability.withoutStock.verdict]} />
                            <Text style={[s.verdictLabel, { color: VERDICT_COLOR[affordability.withoutStock.verdict] }]}>
                                {VERDICT_LABEL[affordability.withoutStock.verdict]} -- if this stock underperforms
                            </Text>
                        </View>
                        <Text style={s.verdictReason}>
                            Using only your current average profit, without crediting this stock's own projected contribution: repayment capacity is {isFinite(affordability.withoutStock.repaymentCapacityMultiple) ? `${affordability.withoutStock.repaymentCapacityMultiple.toFixed(1)}x` : '∞'}.
                        </Text>
                    </View>
                </>
            )}
            {!affordability && (
                <Text style={s.emptyText}>Add at least one item quantity above and a loan term to check affordability.</Text>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    sectionLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    sectionHint: { fontSize: 11, color: Colors.textMuted, marginBottom: Spacing.sm, lineHeight: 15 },

    horizonRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
    horizonChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    horizonChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    horizonChipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    horizonChipTextActive: { color: '#fff' },

    candidateRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm,
        borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing.sm,
    },
    candidateName: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    candidateDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    qtyField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    qtyInput: {
        width: 64, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
        paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: Colors.textPrimary,
        backgroundColor: Colors.bg, textAlign: 'right',
    },
    qtyUnit: { fontSize: 10.5, color: Colors.textMuted },

    statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
    statVal: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary },
    statHint: { fontSize: 9.5, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
    footnote: { fontSize: 10.5, color: Colors.textMuted, marginBottom: Spacing.sm, lineHeight: 14 },

    row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10 },
    affix: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, fontSize: 13.5, color: Colors.textPrimary },

    verdictBox: { borderRadius: Radius.sm, borderWidth: 1.5, padding: Spacing.sm, marginBottom: Spacing.sm },
    verdictBoxSecondary: { borderStyle: 'dashed' },
    verdictLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    verdictLabel: { fontSize: 12.5, fontWeight: '800' },
    verdictReason: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
    verdictStat: { fontSize: 10.5, color: Colors.textMuted, marginTop: 4 },

    emptyBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.md },
    emptyText: { flex: 1, fontSize: 12.5, color: Colors.textMuted, lineHeight: 17 },
});
