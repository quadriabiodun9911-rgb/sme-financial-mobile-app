import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { FinancialGoal } from '../types';
import { Transaction } from '../types';

interface Props {
    goals: FinancialGoal[];
    transactions: Transaction[];
    currency: string;
    onSetGoal: () => void; // called when no goal exists
}

export default function DailyTargetCard({ goals, transactions, currency, onSetGoal }: Props) {
    // Find the most relevant active goal (revenue_growth or custom, not achieved)
    const activeGoal = goals.find(g => g.status !== 'achieved' && (g.type === 'revenue_growth' || g.type === 'custom' || g.type === 'margin_improvement'));

    if (!activeGoal) {
        return (
            <TouchableOpacity style={s.emptyCard} onPress={onSetGoal}>
                <Text style={s.emptyIcon}>🎯</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.emptyTitle}>Set a daily target</Text>
                    <Text style={s.emptySub}>Tap to set a goal — we'll tell you how much to make each day</Text>
                </View>
                <Text style={s.arrow}>→</Text>
            </TouchableOpacity>
        );
    }

    // Calculate days remaining
    const today = new Date();
    const deadline = new Date(activeGoal.deadline);
    const daysLeft = Math.max(1, Math.ceil((deadline.getTime() - today.getTime()) / 86400000));

    // Daily target
    const remaining = Math.max(0, activeGoal.targetValue - activeGoal.currentValue);
    const dailyTarget = remaining / daysLeft;

    // Today's actual income
    const todayStr = today.toISOString().split('T')[0];
    const todayIncome = transactions
        .filter(t => t.type === 'income' && t.date === todayStr)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const gap = dailyTarget - todayIncome;
    const pct = dailyTarget > 0 ? Math.min(100, (todayIncome / dailyTarget) * 100) : 100;
    const onTrack = todayIncome >= dailyTarget;

    const fmt = (n: number) => {
        if (n >= 1_000_000) return `${currency}${(n/1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${currency}${(n/1_000).toFixed(0)}k`;
        return `${currency}${Math.round(n).toLocaleString()}`;
    };

    return (
        <View style={s.card}>
            <View style={s.headerRow}>
                <Text style={s.label}>🎯 Daily Target — {activeGoal.title}</Text>
                <Text style={s.daysLeft}>{daysLeft}d left</Text>
            </View>

            {/* Progress bar */}
            <View style={s.track}>
                <View style={[s.fill, { width: `${pct}%` as any, backgroundColor: onTrack ? Colors.income : Colors.warning }]} />
            </View>

            {/* Numbers row */}
            <View style={s.row}>
                <View style={s.col}>
                    <Text style={s.colLabel}>Target today</Text>
                    <Text style={s.colValue}>{fmt(dailyTarget)}</Text>
                </View>
                <View style={[s.col, { alignItems: 'center' }]}>
                    <Text style={s.colLabel}>Made so far</Text>
                    <Text style={[s.colValue, { color: onTrack ? Colors.income : Colors.textPrimary }]}>{fmt(todayIncome)}</Text>
                </View>
                <View style={[s.col, { alignItems: 'flex-end' }]}>
                    <Text style={s.colLabel}>{onTrack ? '✅ On track!' : 'Still need'}</Text>
                    <Text style={[s.colValue, { color: onTrack ? Colors.income : Colors.expense }]}>
                        {onTrack ? 'Great job' : fmt(gap)}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, flex: 1 },
    daysLeft: { fontSize: 11, color: Colors.textMuted, backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    track: { height: 8, backgroundColor: Colors.bg, borderRadius: 4, marginBottom: 12, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4 },
    row: { flexDirection: 'row' },
    col: { flex: 1 },
    colLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    colValue: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 2 },
    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, padding: 14, marginBottom: 10 },
    emptyIcon: { fontSize: 22 },
    emptyTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    emptySub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    arrow: { fontSize: 18, color: Colors.primary },
});
