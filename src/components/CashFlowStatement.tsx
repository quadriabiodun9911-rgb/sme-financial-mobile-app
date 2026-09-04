import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Transaction, Asset } from '../types';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { computeProperCashFlow } from '../utils/finance';
import { computeCashFlowTrend, CashFlowPeriodGrouping } from '../utils/cashFlowTrend';
import BarList from './BarList';

interface Props {
    transactions: Transaction[];
    assets: Asset[];
    currency: string;
}

type CfView = 'statement' | 'monthly';
type Grouping = CashFlowPeriodGrouping;

const GROUPINGS: { key: Grouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

const PERIOD_NOUN: Record<Grouping, string> = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };
// Both charts below are a vertical list, one row per period -- fine at 6-12
// rows, unreadable at the hundreds of rows "every day, all recorded
// history" could produce. Capped to a sensible trailing window per
// granularity instead, the same way the fixed "last 6 months" behavior this
// replaces was itself always a trailing window, just a single hardcoded one.
const WINDOW: Record<Grouping, number> = { daily: 30, weekly: 12, monthly: 12, quarterly: 8, yearly: 20 };

export default function CashFlowStatement({ transactions, assets, currency }: Props) {
    const [view, setView] = useState<CfView>('statement');
    const [grouping, setGrouping] = useState<Grouping>('monthly');

    const cf = useMemo(() => computeProperCashFlow(transactions, assets), [transactions, assets]);

    // Cash actually moving per period (money in vs money out, only paid
    // transactions), not the accrual Revenue/Expense/Profit figures Reports
    // > Profit & Loss already shows -- this used to reuse that P&L trend
    // wholesale, which put "By Period" inside a cash flow statement but
    // showed the wrong kind of number entirely. Same source as the Cash
    // Flow Trend table under Reports > Accrual, so the two never disagree.
    const trend = useMemo(() => computeCashFlowTrend(grouping, transactions), [grouping, transactions]);

    const windowedTrend = useMemo(() => trend.slice(-WINDOW[grouping]), [trend, grouping]);
    const maxAbsNetCashFlow = Math.max(...windowedTrend.map(p => Math.abs(p.netCashFlow)), 1);

    return (
        <View>
            <View style={s.toggle}>
                <ToggleBtn label="Cash Summary" active={view === 'statement'} onPress={() => setView('statement')} />
                <ToggleBtn label="By Period" active={view === 'monthly'} onPress={() => setView('monthly')} />
            </View>

            {view === 'statement' && (
                <View>
                    {/* Operating Activities */}
                    <SectionCard title="Cash from Running the Business">
                        <CFRow label="Net Profit Earned"                               value={cf.netProfit}     currency={currency} />
                        <CFRow label="  Add Back: Asset Wear & Tear (not real cash)"   value={cf.depreciation} currency={currency} indent />
                        <CFRow label="  Add: More Bills Owed to Suppliers (saves cash)" value={cf.changeInAP}  currency={currency} indent />
                        <CFRow label="  Less: More Customers Owe You (cash not received yet)" value={cf.changeInAR} currency={currency} indent />
                        <CFRow label="Total Cash from Business Operations"             value={cf.operatingCF}  currency={currency} total />
                        <Text style={s.hint}>
                            Customers still owe you: {currency}{cf.uncollectedAR.toLocaleString()} · You still owe suppliers: {currency}{cf.unpaidAP.toLocaleString()}
                        </Text>
                    </SectionCard>

                    {/* Investing Activities */}
                    <SectionCard title="Cash Spent on / from Equipment & Property">
                        {cf.assetPurchases > 0
                            ? <CFRow label="Bought Equipment or Property" value={-cf.assetPurchases} currency={currency} />
                            : <Text style={s.emptyLine}>No assets in the register yet — add assets in the Assets tab</Text>
                        }
                        {cf.assetDisposals > 0 && (
                            <CFRow label="Sold Equipment or Property" value={cf.assetDisposals} currency={currency} />
                        )}
                        <CFRow label="Total Cash In/Out from Assets" value={cf.investingCF} currency={currency} total />
                    </SectionCard>

                    {/* Financing Activities */}
                    <SectionCard title="Cash from Loans & Owner Contributions">
                        {cf.principalRepayments > 0
                            ? <CFRow label="Loan Principal Repaid" value={-cf.principalRepayments} currency={currency} />
                            : <Text style={s.emptyLine}>No loan principal repayments recorded yet — record a loan payment in the Loans tab to see it here.</Text>
                        }
                        <Text style={s.hint}>
                            Only principal repayments show here — the interest portion of a loan payment is already counted in Operating Activities above, as a real cost of doing business. New loan draws and owner contributions aren't tracked as financing yet; record them as income transactions if you want them reflected in cash flow.
                        </Text>
                        <CFRow label="Total Cash from Financing" value={cf.financingCF} currency={currency} total />
                    </SectionCard>

                    {/* Net change */}
                    <View style={[s.card, s.netCard]}>
                        <Text style={s.netLabel}>Overall Cash Change This Period</Text>
                        <Text style={[s.netValue, { color: cf.netCashChange >= 0 ? Colors.income : Colors.expense }]}>
                            {cf.netCashChange >= 0 ? '+' : ''}{currency}{cf.netCashChange.toLocaleString()}
                        </Text>
                        <View style={s.netBreakRow}>
                            <NetChip label="Operations" value={cf.operatingCF} currency={currency} />
                            <NetChip label="Assets"     value={cf.investingCF}  currency={currency} />
                            <NetChip label="Financing"  value={cf.financingCF}  currency={currency} />
                        </View>
                    </View>
                </View>
            )}

            {view === 'monthly' && (
                <View>
                    <View style={s.groupingRow}>
                        {GROUPINGS.map(g => (
                            <TouchableOpacity key={g.key} style={[s.groupingBtn, grouping === g.key && s.groupingBtnActive]} onPress={() => setGrouping(g.key)}>
                                <Text style={[s.groupingText, grouping === g.key && s.groupingTextActive]}>{g.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={s.card}>
                        <Text style={s.cardTitle}>Net Cash Flow (last {windowedTrend.length} {PERIOD_NOUN[grouping]}{windowedTrend.length === 1 ? '' : 's'})</Text>
                        <BarList
                            maxValue={maxAbsNetCashFlow}
                            items={windowedTrend.map(pt => {
                                const pos = pt.netCashFlow >= 0;
                                return {
                                    label: pt.label,
                                    value: Math.abs(pt.netCashFlow),
                                    displayValue: `${pos ? '+' : '-'}${currency}${Math.abs(pt.netCashFlow).toLocaleString()}`,
                                    // Diverging by sign (net cash in vs out), not a
                                    // rank -- each row keeps its own status color.
                                    color: pos ? Colors.income : Colors.expense,
                                };
                            })}
                        />
                        <Text style={s.hint}>
                            Only money that actually moved (paid transactions) — not the same as Revenue/Expenses on Profit &amp; Loss, which also counts unpaid ones.
                        </Text>
                    </View>

                    <View style={s.card}>
                        <Text style={s.cardTitle}>Breakdown</Text>
                        <View style={s.breakdownHeader}>
                            <Text style={[s.monthLabel, { fontWeight: '700', color: Colors.textPrimary }]}>{PERIOD_NOUN[grouping][0].toUpperCase()}{PERIOD_NOUN[grouping].slice(1)}</Text>
                            <Text style={[s.breakVal, { color: Colors.income }]}>Cash In</Text>
                            <Text style={[s.breakVal, { color: Colors.expense }]}>Cash Out</Text>
                            <Text style={[s.breakVal, { color: Colors.textPrimary }]}>Net</Text>
                        </View>
                        {windowedTrend.map((pt, i) => (
                            <View key={i} style={s.breakdownRow}>
                                <Text style={s.monthLabel}>{pt.label}</Text>
                                <Text style={[s.breakVal, { color: Colors.income }]}>+{currency}{pt.cashIn.toLocaleString()}</Text>
                                <Text style={[s.breakVal, { color: Colors.expense }]}>-{currency}{pt.cashOut.toLocaleString()}</Text>
                                <Text style={[s.breakVal, { color: pt.netCashFlow >= 0 ? Colors.income : Colors.expense }]}>
                                    {pt.netCashFlow >= 0 ? '+' : ''}{currency}{Math.abs(pt.netCashFlow).toLocaleString()}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>{title}</Text>
            {children}
        </View>
    );
}

function ToggleBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity style={[s.toggleBtn, active && s.toggleActive]} onPress={onPress}>
            <Text style={[s.toggleText, active && s.toggleTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

function CFRow({ label, value, currency, total = false, indent = false }: {
    label: string; value: number; currency: string; total?: boolean; indent?: boolean;
}) {
    const color = value >= 0 ? Colors.income : Colors.expense;
    return (
        <View style={[s.cfRow, total && s.cfTotal]}>
            <Text style={[s.cfLabel, total && s.cfTotalLabel, indent && s.cfIndent]}>{label}</Text>
            <Text style={[s.cfValue, { color }, total && s.cfTotalValue]}>
                {value >= 0 ? '+' : ''}{currency}{Math.abs(value).toLocaleString()}
            </Text>
        </View>
    );
}

function NetChip({ label, value, currency }: { label: string; value: number; currency: string }) {
    const col = value >= 0 ? Colors.income : value === 0 ? Colors.textMuted : Colors.expense;
    return (
        <View style={s.chip}>
            <Text style={s.chipLabel}>{label}</Text>
            <Text style={[s.chipValue, { color: col }]}>
                {value >= 0 ? '+' : ''}{currency}{Math.abs(value).toLocaleString()}
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    toggle:          { flexDirection: 'row', gap: 8, marginBottom: 12 },
    toggleBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    toggleActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleText:      { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
    toggleTextActive:{ color: Colors.textPrimary, fontWeight: 'bold' },

    groupingRow:        { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 12, alignSelf: 'flex-start', gap: 2 },
    groupingBtn:        { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    groupingBtnActive:  { backgroundColor: Colors.primary },
    groupingText:       { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    groupingTextActive: { color: '#fff' },

    card:      { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },

    cfRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    cfTotal:      { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 10 },
    cfLabel:      { fontSize: 13, color: Colors.textSecondary, flex: 1, marginRight: 8 },
    cfTotalLabel: { fontWeight: '700', color: Colors.textPrimary },
    cfIndent:     { paddingLeft: 12, color: Colors.textMuted },
    cfValue:      { fontSize: 13, fontWeight: '600' },
    cfTotalValue: { fontSize: 15, fontWeight: 'bold' },

    hint:      { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 8 },
    emptyLine: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', paddingVertical: 6 },

    netCard:     { alignItems: 'center', paddingVertical: 20 },
    netLabel:    { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
    netValue:    { fontSize: 30, fontWeight: 'bold', marginBottom: 12 },
    netBreakRow: { flexDirection: 'row', gap: 8 },
    chip:        { flex: 1, alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, padding: 8 },
    chipLabel:   { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    chipValue:   { fontSize: 12, fontWeight: '700' },

    monthLabel: { fontSize: 11, color: Colors.textMuted, width: 62 },

    breakdownHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
    breakdownRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    breakVal:        { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'right' },
});
