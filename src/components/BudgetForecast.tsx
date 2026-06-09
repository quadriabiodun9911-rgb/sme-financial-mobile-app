import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction } from '../types';
import { computeMonthlyTrend } from '../utils/finance';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    currency: string;
    targetMargin: string;
}

type Horizon = 3 | 6 | 12;

export default function BudgetForecast({ finance, transactions, currency, targetMargin }: Props) {
    const [horizon, setHorizon] = useState<Horizon>(6);

    // Derive average monthly growth from last 6 months of real data
    const trend = useMemo(() => computeMonthlyTrend(transactions, 6), [transactions]);

    const monthsWithData = trend.filter(p => p.income > 0 || p.expense > 0).length;

    const avgMonthlyIncome  = monthsWithData > 0
        ? trend.reduce((s, p) => s + p.income,  0) / Math.max(monthsWithData, 1)
        : finance.income / 12;

    const avgMonthlyExpense = monthsWithData > 0
        ? trend.reduce((s, p) => s + p.expense, 0) / Math.max(monthsWithData, 1)
        : finance.expense / 12;

    // Simple linear projection (no magic growth rates)
    const projected = Array.from({ length: horizon }, (_, i) => {
        const month = new Date();
        month.setMonth(month.getMonth() + i + 1);
        const label = month.toLocaleString('default', { month: 'short', year: '2-digit' });
        const income  = avgMonthlyIncome;
        const expense = avgMonthlyExpense;
        return { label, income, expense, profit: income - expense };
    });

    const totalProjectedIncome  = projected.reduce((s, p) => s + p.income,  0);
    const totalProjectedExpense = projected.reduce((s, p) => s + p.expense, 0);
    const totalProjectedProfit  = totalProjectedIncome - totalProjectedExpense;
    const projectedMargin       = totalProjectedIncome > 0
        ? (totalProjectedProfit / totalProjectedIncome) * 100 : 0;

    const maxBar = Math.max(...projected.flatMap(p => [p.income, p.expense]), 1);
    const BAR_H  = 80;

    return (
        <View>
            {/* Horizon picker */}
            <View style={styles.horizonRow}>
                <Text style={styles.horizonLabel}>Forecast horizon:</Text>
                {([3, 6, 12] as Horizon[]).map(h => (
                    <TouchableOpacity
                        key={h}
                        style={[styles.hBtn, horizon === h && styles.hBtnActive]}
                        onPress={() => setHorizon(h)}
                    >
                        <Text style={[styles.hBtnText, horizon === h && styles.hBtnTextActive]}>
                            {h}mo
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {monthsWithData === 0 && (
                <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                        Projection based on overall averages — log transactions with dates to get month-by-month trend.
                    </Text>
                </View>
            )}

            {/* KPI summary */}
            <View style={styles.kpiRow}>
                <KpiCard label={`${horizon}mo Income`}  value={`${currency}${Math.round(totalProjectedIncome).toLocaleString()}`}  color={Colors.income} />
                <KpiCard label={`${horizon}mo Expense`} value={`${currency}${Math.round(totalProjectedExpense).toLocaleString()}`} color={Colors.expense} />
                <KpiCard
                    label="Proj. Margin"
                    value={`${projectedMargin.toFixed(1)}%`}
                    color={projectedMargin >= parseFloat(targetMargin) ? Colors.income : Colors.expense}
                />
            </View>

            {/* Bar chart */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Monthly Projection</Text>
                <View style={styles.chart}>
                    {projected.map((pt, i) => {
                        const incH = Math.round((pt.income / maxBar) * BAR_H);
                        const expH = Math.round((pt.expense / maxBar) * BAR_H);
                        return (
                            <View key={i} style={styles.col}>
                                <View style={styles.bars}>
                                    <View style={[styles.bar, { height: Math.max(incH, 2), backgroundColor: Colors.income, marginRight: 2 }]} />
                                    <View style={[styles.bar, { height: Math.max(expH, 2), backgroundColor: Colors.expense }]} />
                                </View>
                                <Text style={styles.colLabel}>{pt.label}</Text>
                            </View>
                        );
                    })}
                </View>
                <View style={styles.legend}>
                    <LegendDot color={Colors.income}  label="Projected Income" />
                    <LegendDot color={Colors.expense} label="Projected Expense" />
                </View>
            </View>

            {/* Monthly table */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Month-by-Month</Text>
                {projected.map((pt, i) => (
                    <View key={i} style={styles.tableRow}>
                        <Text style={styles.tableMonth}>{pt.label}</Text>
                        <Text style={[styles.tableVal, { color: Colors.income }]}>{currency}{Math.round(pt.income).toLocaleString()}</Text>
                        <Text style={[styles.tableVal, { color: Colors.expense }]}>{currency}{Math.round(pt.expense).toLocaleString()}</Text>
                        <Text style={[styles.tableVal, { color: pt.profit >= 0 ? Colors.income : Colors.expense }]}>
                            {pt.profit >= 0 ? '+' : ''}{currency}{Math.round(pt.profit).toLocaleString()}
                        </Text>
                    </View>
                ))}
                <View style={[styles.tableRow, styles.tableTotal]}>
                    <Text style={[styles.tableMonth, { fontWeight: 'bold', color: Colors.textPrimary }]}>Total</Text>
                    <Text style={[styles.tableVal, { color: Colors.income, fontWeight: 'bold' }]}>{currency}{Math.round(totalProjectedIncome).toLocaleString()}</Text>
                    <Text style={[styles.tableVal, { color: Colors.expense, fontWeight: 'bold' }]}>{currency}{Math.round(totalProjectedExpense).toLocaleString()}</Text>
                    <Text style={[styles.tableVal, { color: totalProjectedProfit >= 0 ? Colors.income : Colors.expense, fontWeight: 'bold' }]}>
                        {totalProjectedProfit >= 0 ? '+' : ''}{currency}{Math.round(totalProjectedProfit).toLocaleString()}
                    </Text>
                </View>
                <Text style={styles.disclaimer}>
                    Based on your {monthsWithData > 0 ? `last ${monthsWithData} months of` : 'overall'} average monthly figures. Assumes no growth or decline.
                </Text>
            </View>
        </View>
    );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={kpiStyles.card}>
            <Text style={kpiStyles.label}>{label}</Text>
            <Text style={[kpiStyles.value, { color }]}>{value}</Text>
        </View>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ fontSize: 10, color: Colors.textMuted }}>{label}</Text>
        </View>
    );
}

const kpiStyles = StyleSheet.create({
    card:  { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
    label: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    value: { fontSize: 13, fontWeight: 'bold' },
});

const styles = StyleSheet.create({
    horizonRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    horizonLabel:{ fontSize: 12, color: Colors.textMuted, flex: 1 },
    hBtn:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    hBtnActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
    hBtnText:    { fontSize: 12, color: Colors.textMuted },
    hBtnTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },

    notice: { backgroundColor: 'rgba(37,99,235,0.1)', borderRadius: 8, padding: 10, marginBottom: 12 },
    noticeText: { fontSize: 11, color: Colors.primary, lineHeight: 16 },

    kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },

    card:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },

    chart:    { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2, marginBottom: 8 },
    col:      { flex: 1, alignItems: 'center' },
    bars:     { flexDirection: 'row', alignItems: 'flex-end' },
    bar:      { width: 8, borderRadius: 2 },
    colLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 3 },
    legend:   { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 4 },

    tableRow:   { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableTotal: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 8 },
    tableMonth: { fontSize: 12, color: Colors.textMuted, width: 52 },
    tableVal:   { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'right' },
    disclaimer: { fontSize: 10, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic', lineHeight: 15 },
});
