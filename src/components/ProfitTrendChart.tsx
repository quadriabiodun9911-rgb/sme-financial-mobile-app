import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';

interface MonthBar {
    month: string;  // e.g. "Jun"
    profit: number;
}

interface Props {
    data: MonthBar[];
    currency: string;
    onPress?: () => void;
}

function fmt(n: number, currency: string): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${n < 0 ? '-' : ''}${currency}${(abs / 1_000).toFixed(0)}k`;
    return `${n < 0 ? '-' : ''}${currency}${abs.toLocaleString()}`;
}

export default function ProfitTrendChart({ data, currency, onPress }: Props) {
    if (data.length === 0) return null;

    const maxAbs = Math.max(...data.map(d => Math.abs(d.profit)), 1);
    const BAR_HEIGHT = 80;

    // streak detection: how many consecutive months of positive profit
    const streak = (() => {
        let count = 0;
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].profit > 0) count++;
            else break;
        }
        return count;
    })();

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.title}>6-Month Profit Trend</Text>
                    {streak >= 2 && (
                        <Text style={styles.streak}>🔥 {streak} profitable months in a row</Text>
                    )}
                </View>
                {onPress && <Text style={styles.link}>Details →</Text>}
            </View>

            <View style={styles.chartArea}>
                {data.map((bar, i) => {
                    const isProfit = bar.profit >= 0;
                    const ratio = Math.abs(bar.profit) / maxAbs;
                    const barH = Math.max(ratio * BAR_HEIGHT, 3);
                    const isLast = i === data.length - 1;
                    return (
                        <View key={bar.month} style={styles.barCol}>
                            {/* positive bar grows upward */}
                            <View style={styles.barPositiveArea}>
                                {isProfit && (
                                    <View style={[styles.bar, {
                                        height: barH,
                                        backgroundColor: isLast ? Colors.income : Colors.income + '99',
                                    }]} />
                                )}
                            </View>
                            {/* zero line */}
                            <View style={styles.zeroline} />
                            {/* negative bar grows downward */}
                            <View style={styles.barNegativeArea}>
                                {!isProfit && (
                                    <View style={[styles.bar, {
                                        height: barH,
                                        backgroundColor: isLast ? Colors.expense : Colors.expense + '99',
                                    }]} />
                                )}
                            </View>
                            <Text style={[styles.barLabel, isLast && { color: Colors.textPrimary, fontWeight: '700' }]}>
                                {bar.month}
                            </Text>
                            {isLast && (
                                <Text style={[styles.barValue, { color: isProfit ? Colors.income : Colors.expense }]}>
                                    {fmt(bar.profit, currency)}
                                </Text>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
                    <Text style={styles.legendText}>Profit</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
                    <Text style={styles.legendText}>Loss</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card:        { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    title:       { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    streak:      { fontSize: 11, color: Colors.warning, marginTop: 3 },
    link:        { fontSize: 12, color: Colors.primary },
    chartArea:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 8 },
    barCol:      { flex: 1, alignItems: 'center' },
    barPositiveArea: { height: 80, justifyContent: 'flex-end' },
    barNegativeArea: { height: 40, justifyContent: 'flex-start' },
    bar:         { width: '80%', borderRadius: 3, minHeight: 3 },
    zeroline:    { height: 1, width: '100%', backgroundColor: Colors.border },
    barLabel:    { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
    barValue:    { fontSize: 10, fontWeight: '700', marginTop: 1 },
    legend:      { flexDirection: 'row', gap: 14, justifyContent: 'flex-end' },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot:   { width: 8, height: 8, borderRadius: 4 },
    legendText:  { fontSize: 10, color: Colors.textMuted },
});
