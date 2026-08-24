import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { computeDataQuality, DataConfidence } from '../utils/dataQuality';
import { Transaction } from '../types';

interface Props {
    transactions: Transaction[];
}

const CONFIG: Record<DataConfidence, { emoji: string; label: string; color: string }> = {
    none:    { emoji: '⚪', label: 'No data yet', color: Colors.textMuted },
    limited: { emoji: '🔴', label: 'Limited data', color: Colors.expense },
    partial: { emoji: '🟡', label: 'Partial data', color: Colors.warning },
    strong:  { emoji: '🟢', label: 'Strong data', color: Colors.income },
};

// Moniepoint's case study names this directly: their credit assessment
// got better because it accumulated years of real transaction history
// competitors couldn't replicate by copying features. The same logic
// applies to every score/verdict Quad360 shows — the number is only as
// good as the data behind it. Every score-bearing screen should say so
// consistently, not just internally guard against acting on thin data.
export default function DataConfidenceBadge({ transactions }: Props) {
    const quality = useMemo(() => computeDataQuality(transactions), [transactions]);
    const cfg = CONFIG[quality.confidence];

    return (
        <View style={[s.badge, { borderColor: cfg.color }]}>
            <Text style={s.emoji}>{cfg.emoji}</Text>
            <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: cfg.color }]}>{cfg.label}</Text>
                <Text style={s.summary}>{quality.summary}</Text>
                <Text style={s.summary}>{quality.classificationSummary}</Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    badge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 12 },
    emoji: { fontSize: 14 },
    label: { fontSize: 11.5, fontWeight: '800' },
    summary: { fontSize: 10.5, color: Colors.textMuted, marginTop: 1 },
});
