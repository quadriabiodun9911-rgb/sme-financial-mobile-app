import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { DimensionItem } from '../utils/profitability';

interface Props {
    byCategory: DimensionItem[];
    byVendor: DimensionItem[];
    currency: string;
}

function fmt(value: number, currency: string): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${currency}${abs.toFixed(0)}`;
}

function marginColor(margin: number): string {
    if (margin >= 40) return Colors.income;
    if (margin >= 20) return Colors.warning;
    return Colors.expense;
}

type Tab = 'category' | 'vendor';

export default function ProfitByDimension({ byCategory, byVendor, currency }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('category');

    const items = activeTab === 'category' ? byCategory : byVendor;

    const totals = useMemo(() => {
        const revenue = items.reduce((s, d) => s + d.revenue, 0);
        const cost    = items.reduce((s, d) => s + d.cost, 0);
        const profit  = revenue - cost;
        const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { revenue, cost, profit, margin };
    }, [items]);

    const maxProfit = useMemo(() => {
        const profits = items.map(d => Math.max(d.profit, 0));
        return profits.length > 0 ? Math.max(...profits) : 1;
    }, [items]);

    const isEmpty = items.length === 0;

    return (
        <View style={styles.card}>
            <Text style={styles.title}>PROFIT BY DIMENSION</Text>

            {/* Tabs */}
            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'category' && styles.tabActive]}
                    onPress={() => setActiveTab('category')}
                >
                    <Text style={[styles.tabText, activeTab === 'category' && styles.tabTextActive]}>
                        By Category
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'vendor' && styles.tabActive]}
                    onPress={() => setActiveTab('vendor')}
                >
                    <Text style={[styles.tabText, activeTab === 'vendor' && styles.tabTextActive]}>
                        By Customer
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {isEmpty ? (
                <Text style={styles.empty}>No data available for this period.</Text>
            ) : (
                <>
                    {items.map((item, idx) => {
                        const barWidth = maxProfit > 0 ? (Math.max(item.profit, 0) / maxProfit) * 100 : 0;
                        const color    = marginColor(item.margin);
                        return (
                            <View key={idx} style={styles.row}>
                                <Text style={styles.rowLabel} numberOfLines={1}>{item.label}</Text>
                                <View style={styles.rowRight}>
                                    <Text style={[styles.rowProfit, { color }]}>
                                        {fmt(item.profit, currency)}
                                    </Text>
                                    <Text style={styles.rowShare}>{item.share.toFixed(0)}%</Text>
                                    <View style={styles.barContainer}>
                                        <View style={[styles.bar, { width: `${barWidth}%`, backgroundColor: color }]} />
                                    </View>
                                </View>
                            </View>
                        );
                    })}

                    <View style={styles.divider} />

                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Margin</Text>
                            <Text style={[styles.summaryValue, { color: marginColor(totals.margin) }]}>
                                {totals.margin.toFixed(1)}%
                            </Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Revenue</Text>
                            <Text style={styles.summaryValue}>{fmt(totals.revenue, currency)}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Costs</Text>
                            <Text style={[styles.summaryValue, { color: Colors.expense }]}>
                                {fmt(totals.cost, currency)}
                            </Text>
                        </View>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    title: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 2,
        marginBottom: 0,
    },
    tab: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        borderRadius: 6,
    },
    tabActive: {
        backgroundColor: Colors.primary,
    },
    tabText: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    tabTextActive: {
        color: Colors.textPrimary,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 10,
    },
    empty: {
        color: Colors.textMuted,
        textAlign: 'center',
        fontSize: 13,
        paddingVertical: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    rowLabel: {
        width: 110,
        color: Colors.textSecondary,
        fontSize: 12,
    },
    rowRight: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowProfit: {
        width: 56,
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'right',
    },
    rowShare: {
        width: 32,
        fontSize: 11,
        color: Colors.textMuted,
        textAlign: 'right',
    },
    barContainer: {
        flex: 1,
        height: 8,
        backgroundColor: Colors.bg,
        borderRadius: 4,
        overflow: 'hidden',
    },
    bar: {
        height: 8,
        borderRadius: 4,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryItem: {
        alignItems: 'center',
        flex: 1,
    },
    summaryLabel: {
        color: Colors.textMuted,
        fontSize: 11,
        marginBottom: 2,
    },
    summaryValue: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
});
