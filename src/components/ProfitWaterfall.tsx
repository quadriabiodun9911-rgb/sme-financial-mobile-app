import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { WaterfallItem } from '../utils/profitability';

interface Props {
    items: WaterfallItem[];
    currency: string;
}

function fmt(value: number, currency: string): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${abs.toFixed(0)}`;
}

export default function ProfitWaterfall({ items, currency }: Props) {
    const base  = items.find(i => i.type === 'base');
    const total = items.find(i => i.type === 'total');
    const rows  = items.filter(i => i.type === 'positive' || i.type === 'negative');

    const maxAbsChange = useMemo(() => {
        const changes = rows.map(i => Math.abs(i.value));
        return changes.length > 0 ? Math.max(...changes) : 1;
    }, [rows]);

    const pctChange = useMemo(() => {
        if (!base || !total || base.value === 0) return null;
        return ((total.value - base.value) / Math.abs(base.value)) * 100;
    }, [base, total]);

    if (!base || !total) return null;

    return (
        <View style={styles.card}>
            <Text style={styles.title}>PROFIT CHANGE THIS MONTH</Text>

            {/* Base row */}
            <View style={styles.baseRow}>
                <Text style={styles.baseLabel}>{base.label}</Text>
                <Text style={styles.baseValue}>{fmt(base.value, currency)}</Text>
            </View>

            <View style={styles.divider} />

            {/* Change rows */}
            {rows.map((item, idx) => {
                const isPositive = item.value >= 0;
                const barWidth   = maxAbsChange > 0
                    ? (Math.abs(item.value) / maxAbsChange) * 100
                    : 0;
                return (
                    <View key={idx} style={styles.row}>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <View style={styles.barContainer}>
                            <View
                                style={[
                                    styles.bar,
                                    { width: `${barWidth}%`, backgroundColor: isPositive ? Colors.income : Colors.expense },
                                ]}
                            />
                        </View>
                        <Text style={[styles.rowValue, { color: isPositive ? Colors.income : Colors.expense }]}>
                            {fmt(item.value, currency)}
                        </Text>
                    </View>
                );
            })}

            <View style={styles.divider} />

            {/* Total row */}
            <View style={[styles.totalRow]}>
                <View>
                    <Text style={styles.totalLabel}>{total.label}</Text>
                    {pctChange !== null && (
                        <Text style={[styles.pctChange, { color: pctChange >= 0 ? Colors.income : Colors.expense }]}>
                            {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}% vs last period
                        </Text>
                    )}
                </View>
                <Text style={[styles.totalValue, { color: total.value >= 0 ? Colors.income : Colors.expense }]}>
                    {fmt(total.value, currency)}
                </Text>
            </View>
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
    baseRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    baseLabel: {
        color: Colors.textSecondary,
        fontSize: 13,
    },
    baseValue: {
        color: Colors.textPrimary,
        fontSize: 15,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 10,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
    },
    rowLabel: {
        color: Colors.textSecondary,
        fontSize: 12,
        width: 110,
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
    rowValue: {
        fontSize: 12,
        fontWeight: '600',
        width: 70,
        textAlign: 'right',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    totalLabel: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    totalValue: {
        fontSize: 18,
        fontWeight: '700',
    },
    pctChange: {
        fontSize: 11,
        marginTop: 2,
    },
});
