import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeInventorySalesTrend, InventorySalesGrouping } from '../utils/inventorySalesTrend';

interface Props {
    transactions: Transaction[];
    currency: string;
}

const GROUPINGS: { key: InventorySalesGrouping; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

// Stock quantity has no dated history in this app, so "stock value over
// time" can't be shown honestly (see inventorySalesTrend.ts). What's here
// instead: sales actually recorded through the Sell button, which ARE
// dated facts — a genuinely new slice of revenue, not a repeat of P&L.
export default function StockSalesComparisonTable({ transactions, currency }: Props) {
    const [grouping, setGrouping] = useState<InventorySalesGrouping>('monthly');
    const points = useMemo(() => computeInventorySalesTrend(grouping, transactions), [grouping, transactions]);

    const currentKey = useMemo(() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

    const hasAnyStockSales = points.some(p => p.stockSold > 0);

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you record sales, they'll build up here.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);

    return (
        <View style={s.card}>
            <Text style={s.title}>Stock Sold Over Time</Text>
            <View style={s.toggleRow}>
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {!hasAnyStockSales && (
                <Text style={[s.emptyText, { marginBottom: 10 }]}>
                    No sales recorded through Inventory's "Sell" button yet — use it when you sell stock to start tracking this.
                </Text>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabelHeader}>Breakdown</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={s.colHeader}>{p.label}{p.key === currentKey ? ' *' : ''}</Text></View>
                        ))}
                    </View>

                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Stock Sold</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={[s.val, { color: Colors.income }]}>{fmt(p.stockSold)}</Text></View>
                        ))}
                    </View>

                    <View style={[s.row, { borderBottomWidth: 0 }]}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>% of Total Revenue</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={s.valMuted}>{p.pctOfRevenue.toFixed(0)}%</Text></View>
                        ))}
                    </View>
                </View>
            </ScrollView>
            <Text style={s.hint}>Only sales recorded through Inventory's Sell button — revenue logged any other way isn't counted here.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — not a full {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'} yet, so it's not a fair comparison against earlier columns.</Text>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    toggleRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 14, alignSelf: 'flex-start', gap: 2 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    cell: { width: 98, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelCell: { width: 140, alignItems: 'flex-start' },
    rowLabelHeader: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valMuted: { fontSize: 12.5, color: Colors.textMuted, fontVariant: ['tabular-nums'] },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
