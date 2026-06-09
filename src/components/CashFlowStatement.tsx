import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Transaction, Asset } from '../types';
import { Colors } from '../theme/colors';
import { computeProperCashFlow, computeMonthlyTrend } from '../utils/finance';

interface Props {
    transactions: Transaction[];
    assets: Asset[];
    currency: string;
}

type CfView = 'statement' | 'monthly';

export default function CashFlowStatement({ transactions, assets, currency }: Props) {
    const [view, setView] = useState<CfView>('statement');

    const cf    = useMemo(() => computeProperCashFlow(transactions, assets), [transactions, assets]);
    const trend = useMemo(() => computeMonthlyTrend(transactions, 6), [transactions]);
    const maxAbsProfit = Math.max(...trend.map(p => Math.abs(p.profit)), 1);

    return (
        <View>
            <View style={s.toggle}>
                <ToggleBtn label="Cash Summary" active={view === 'statement'} onPress={() => setView('statement')} />
                <ToggleBtn label="Month by Month" active={view === 'monthly'} onPress={() => setView('monthly')} />
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
                        <Text style={s.emptyLine}>To track loan repayments, record them as expense transactions. Owner withdrawals can be recorded as expenses too.</Text>
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
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Monthly Profit / Loss (last 6 months)</Text>
                        {trend.map((pt, i) => {
                            const barW = Math.round((Math.abs(pt.profit) / maxAbsProfit) * 100);
                            const pos  = pt.profit >= 0;
                            return (
                                <View key={i} style={s.monthRow}>
                                    <Text style={s.monthLabel}>{pt.label}</Text>
                                    <View style={s.barTrack}>
                                        <View style={[s.barFill, { width: `${barW}%` as any, backgroundColor: pos ? Colors.income : Colors.expense }]} />
                                    </View>
                                    <Text style={[s.monthVal, { color: pos ? Colors.income : Colors.expense }]}>
                                        {pos ? '+' : ''}{currency}{Math.abs(pt.profit).toLocaleString()}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={s.card}>
                        <Text style={s.cardTitle}>Monthly Breakdown</Text>
                        <View style={s.breakdownHeader}>
                            <Text style={[s.monthLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Month</Text>
                            <Text style={[s.breakVal, { color: Colors.income }]}>Revenue</Text>
                            <Text style={[s.breakVal, { color: Colors.expense }]}>Costs</Text>
                            <Text style={[s.breakVal, { color: Colors.textPrimary }]}>Net</Text>
                        </View>
                        {trend.map((pt, i) => (
                            <View key={i} style={s.breakdownRow}>
                                <Text style={s.monthLabel}>{pt.label}</Text>
                                <Text style={[s.breakVal, { color: Colors.income }]}>+{currency}{pt.income.toLocaleString()}</Text>
                                <Text style={[s.breakVal, { color: Colors.expense }]}>-{currency}{pt.expense.toLocaleString()}</Text>
                                <Text style={[s.breakVal, { color: pt.profit >= 0 ? Colors.income : Colors.expense }]}>
                                    {pt.profit >= 0 ? '+' : ''}{currency}{Math.abs(pt.profit).toLocaleString()}
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

    card:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
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

    monthRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    monthLabel: { fontSize: 12, color: Colors.textMuted, width: 30 },
    barTrack:   { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    barFill:    { height: 8, borderRadius: 4, minWidth: 2 },
    monthVal:   { fontSize: 12, fontWeight: '600', width: 80, textAlign: 'right' },

    breakdownHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
    breakdownRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    breakVal:        { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'right' },
});
