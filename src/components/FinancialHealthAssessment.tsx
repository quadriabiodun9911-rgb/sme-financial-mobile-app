import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction } from '../types';

interface Props {
    finance:      FinanceData;
    transactions: Transaction[];
    assets?:      any[];
    currency:     string;
    minReserve?:  number | string;
    targetMargin?: number | string;
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
    return (
        <View style={s.barRow}>
            <Text style={s.barLabel}>{label}</Text>
            <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: color }]} />
            </View>
            <Text style={[s.barScore, { color }]}>{Math.round(score)}</Text>
        </View>
    );
}

export default function FinancialHealthAssessment({ finance, transactions, currency, minReserve, targetMargin }: Props) {
    const profit      = finance.profit ?? 0;
    const income      = finance.income ?? 0;
    const expense     = finance.expense ?? 0;
    const margin      = isFinite(finance.margin) ? finance.margin : 0;
    const target      = parseFloat(String(targetMargin ?? 20)) || 20;
    const reserve     = parseFloat(String(minReserve ?? 0)) || 0;

    // Simple 0-100 scores
    const profitScore  = Math.min(100, Math.max(0, profit > 0 ? 70 + Math.min(30, (profit / Math.max(income, 1)) * 100) : Math.max(0, 50 + profit / Math.max(income, 1) * 50)));
    const marginScore  = Math.min(100, Math.max(0, (margin / Math.max(target, 1)) * 100));
    const revenueScore = Math.min(100, income > 0 ? Math.min(100, (income / Math.max(expense * 1.2, 1)) * 70) : 0);
    const txCount      = transactions.filter(t => {
        const d = new Date(t.date); const now = new Date();
        return now.getTime() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
    }).length;
    const activityScore = Math.min(100, txCount * 5);
    const overall = Math.round((profitScore + marginScore + revenueScore + activityScore) / 4);

    const color = overall >= 70 ? Colors.income : overall >= 40 ? Colors.warning : Colors.expense;
    const verdict = overall >= 70 ? 'Strong' : overall >= 40 ? 'Fair' : 'Needs Attention';

    return (
        <View style={s.container}>
            <View style={s.scoreRow}>
                <View style={[s.ring, { borderColor: color }]}>
                    <Text style={[s.ringNum, { color }]}>{overall}</Text>
                    <Text style={s.ringSub}>/ 100</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[s.verdict, { color }]}>{verdict}</Text>
                    <Text style={s.subText}>Financial health score based on profit, margin, revenue and activity</Text>
                </View>
            </View>

            <ScoreBar label="Profitability"  score={profitScore}   color={profitScore  >= 60 ? Colors.income : Colors.expense} />
            <ScoreBar label="Margin vs Target" score={marginScore} color={marginScore  >= 60 ? Colors.income : Colors.warning} />
            <ScoreBar label="Revenue Strength" score={revenueScore} color={revenueScore >= 60 ? Colors.income : Colors.warning} />
            <ScoreBar label="30-Day Activity"  score={activityScore} color={activityScore >= 40 ? Colors.income : Colors.textMuted} />

            <View style={s.summaryRow}>
                <View style={s.summaryCell}>
                    <Text style={s.summaryVal}>{currency}{income.toLocaleString('en', { maximumFractionDigits: 0 })}</Text>
                    <Text style={s.summaryKey}>Income</Text>
                </View>
                <View style={s.summaryCell}>
                    <Text style={[s.summaryVal, { color: profit >= 0 ? Colors.income : Colors.expense }]}>
                        {profit >= 0 ? '+' : ''}{currency}{profit.toLocaleString('en', { maximumFractionDigits: 0 })}
                    </Text>
                    <Text style={s.summaryKey}>Profit</Text>
                </View>
                <View style={s.summaryCell}>
                    <Text style={[s.summaryVal, { color: margin >= target ? Colors.income : Colors.warning }]}>{margin.toFixed(1)}%</Text>
                    <Text style={s.summaryKey}>Margin</Text>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container:   { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, gap: 14 },
    scoreRow:    { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
    ring:        { width: 80, height: 80, borderRadius: 40, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
    ringNum:     { fontSize: 24, fontWeight: '900' },
    ringSub:     { fontSize: 10, color: Colors.textMuted },
    verdict:     { fontSize: 18, fontWeight: '800', marginBottom: 4 },
    subText:     { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
    barRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel:    { width: 110, fontSize: 12, color: Colors.textMuted },
    barTrack:    { flex: 1, height: 6, backgroundColor: Colors.border ?? '#1e293b', borderRadius: 3, overflow: 'hidden' },
    barFill:     { height: 6, borderRadius: 3 },
    barScore:    { width: 30, fontSize: 12, fontWeight: '700', textAlign: 'right' },
    summaryRow:  { flexDirection: 'row', marginTop: 4 },
    summaryCell: { flex: 1, alignItems: 'center' },
    summaryVal:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    summaryKey:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
