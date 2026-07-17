import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, Asset, Loan } from '../types';
import { computeMonthlyTrend } from '../utils/trendAnalysis';
import { computeBalanceSheetTrend, BalancePeriodGrouping, BalanceSheetTrendPoint, ManualBalances } from '../utils/balanceSheetTrend';

interface Props {
    transactions: Transaction[];
    assets: Asset[];
    loans: Loan[];
    currency: string;
    manualBalances?: ManualBalances;
}

const GROUPINGS: { key: BalancePeriodGrouping; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

type LeafRow = {
    label: string;
    get: (p: BalanceSheetTrendPoint) => number;
    color: (p: BalanceSheetTrendPoint) => string;
    showOnlyIfNonZero?: boolean;
};

type GroupRow = {
    key: string;
    label: string;
    get: (p: BalanceSheetTrendPoint) => number;
    color: (p: BalanceSheetTrendPoint) => string;
    children: LeafRow[];
};

const ASSET_ROWS: GroupRow = {
    key: 'assets',
    label: 'Everything You Own',
    get: p => p.totalAssets,
    color: () => Colors.asset,
    children: [
        { label: 'Cash on Hand', get: p => p.cashOnHand, color: p => p.cashOnHand >= 0 ? Colors.income : Colors.expense },
        { label: 'Money Owed to You', get: p => p.accountsReceivable, color: () => Colors.income },
        { label: 'Equipment Value', get: p => p.equipmentValue, color: () => Colors.asset },
        { label: 'Other Assets', get: p => p.otherAssets, color: () => Colors.asset, showOnlyIfNonZero: true },
    ],
};

const LIABILITY_ROWS: GroupRow = {
    key: 'liabilities',
    label: 'Everything You Owe',
    get: p => p.totalLiabilities,
    color: () => Colors.liability,
    children: [
        { label: 'Bills You Owe', get: p => p.accountsPayable, color: () => Colors.liability },
        { label: 'Loans Outstanding', get: p => p.loansOutstanding, color: () => Colors.liability },
        { label: 'Other Amounts Owed', get: p => p.otherLiabilities, color: () => Colors.liability, showOnlyIfNonZero: true },
    ],
};

const GROUPS = [ASSET_ROWS, LIABILITY_ROWS];

// Every row here is something we can honestly reconstruct for a past date —
// see balanceSheetTrend.ts for exactly what each figure means and its
// limits. Stock/inventory value is the one line left out entirely: this app
// only tracks its current total, with no dated history of stock movements,
// so a trend for it would just be today's number repeated under old dates.
export default function BalanceSheetComparisonTable({ transactions, assets, loans, currency, manualBalances }: Props) {
    const [grouping, setGrouping] = useState<BalancePeriodGrouping>('monthly');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const monthly = useMemo(() => computeMonthlyTrend(transactions), [transactions]);
    const monthKeys = useMemo(() => monthly.map(m => m.month), [monthly]);

    const points = useMemo(
        () => computeBalanceSheetTrend(grouping, monthKeys, transactions, assets, loans, manualBalances),
        [grouping, monthKeys, transactions, assets, loans, manualBalances]
    );

    const currentKey = useMemo(() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you have some, your balance sheet trend will build up here.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);
    const allExpanded = GROUPS.every(g => expanded.has(g.key));

    const toggleGroup = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const expandAll = () => setExpanded(allExpanded ? new Set() : new Set(GROUPS.map(g => g.key)));

    return (
        <View style={s.card}>
            <View style={s.headRow}>
                <Text style={s.title}>Balance Sheet Over Time</Text>
                <TouchableOpacity onPress={expandAll}>
                    <Text style={s.expandAll}>{allExpanded ? '↕ Collapse all' : '↕ Expand all'}</Text>
                </TouchableOpacity>
            </View>
            <View style={s.toggleRow}>
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabelHeader}>Breakdown</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={s.colHeader}>{p.label}{p.key === currentKey ? ' *' : ''}</Text></View>
                        ))}
                    </View>

                    {GROUPS.map(group => {
                        const isOpen = expanded.has(group.key);
                        const visibleChildren = group.children.filter(c => !c.showOnlyIfNonZero || points.some(p => c.get(p) !== 0));
                        return (
                            <React.Fragment key={group.key}>
                                <TouchableOpacity style={[s.row, s.rowShaded]} onPress={() => toggleGroup(group.key)} activeOpacity={0.6}>
                                    <View style={[s.cell, s.rowLabelCell]}>
                                        <Text style={[s.rowLabel, s.rowLabelBold]}>{isOpen ? '⌄' : '›'} {group.label}</Text>
                                    </View>
                                    {points.map(p => (
                                        <View key={p.key} style={s.cell}>
                                            <Text style={[s.val, s.valBold, { color: group.color(p) }]}>{fmt(group.get(p))}</Text>
                                        </View>
                                    ))}
                                </TouchableOpacity>

                                {isOpen && visibleChildren.map(child => (
                                    <View key={child.label} style={s.row}>
                                        <View style={[s.cell, s.rowLabelCell, s.rowLabelIndent]}>
                                            <Text style={s.rowLabel}>{child.label}</Text>
                                        </View>
                                        {points.map(p => (
                                            <View key={p.key} style={s.cell}>
                                                <Text style={[s.val, { color: child.color(p) }]}>{fmt(child.get(p))}</Text>
                                            </View>
                                        ))}
                                    </View>
                                ))}
                            </React.Fragment>
                        );
                    })}

                    <View style={[s.row, s.rowShaded, { borderBottomWidth: 0 }]}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={[s.rowLabel, s.rowLabelBold]}>Net Worth</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}>
                                <Text style={[s.val, s.valBold, { color: p.netWorth >= 0 ? Colors.income : Colors.expense }]}>{fmt(p.netWorth)}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
            <Text style={s.hint}>As of the end of each {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'}. Tap a bold row to expand it.</Text>
            <Text style={s.hint}>Money Owed to You / Bills You Owe only count what's still unpaid today, so older columns can understate what was actually owed at the time.</Text>
            <Text style={s.hint}>Doesn't include stock value — this app only tracks its current total, not a history of it.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — figures are as of today, not a full {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'}.</Text>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    expandAll: { fontSize: 12, fontWeight: '700', color: Colors.primary },
    toggleRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 14, alignSelf: 'flex-start', gap: 2 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    rowShaded: { backgroundColor: Colors.bg },
    cell: { width: 112, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelCell: { width: 148, alignItems: 'flex-start' },
    rowLabelIndent: { paddingLeft: 16 },
    rowLabelHeader: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    rowLabelBold: { fontWeight: '700', color: Colors.textPrimary },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valBold: { fontWeight: '700' },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
