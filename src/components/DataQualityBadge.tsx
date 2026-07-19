import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '../theme/colors';
import { computeDataQuality, DataConfidence } from '../utils/dataQuality';
import { Transaction } from '../types';

const CONFIDENCE_META: Record<DataConfidence, { label: string; color: string; icon: string }> = {
    none:    { label: 'No data yet',     color: Colors.textMuted, icon: '○' },
    limited: { label: 'Limited data',    color: Colors.expense,   icon: '⚠' },
    partial: { label: 'Partial history', color: Colors.warning,   icon: '◐' },
    strong:  { label: 'Strong history',  color: Colors.income,    icon: '●' },
};

interface Props {
    transactions: Transaction[];
    style?: StyleProp<ViewStyle>;
}

export default function DataQualityBadge({ transactions, style }: Props) {
    const [expanded, setExpanded] = useState(false);
    const quality = useMemo(() => computeDataQuality(transactions), [transactions]);
    const meta = CONFIDENCE_META[quality.confidence];

    if (quality.confidence === 'none') return null;

    return (
        <TouchableOpacity style={[s.badge, { borderColor: meta.color + '55' }, style]} onPress={() => setExpanded(v => !v)} activeOpacity={0.7}>
            <View style={s.row}>
                <Text style={[s.icon, { color: meta.color }]}>{meta.icon}</Text>
                <Text style={[s.label, { color: meta.color }]}>{meta.label}</Text>
                <Text style={s.summary} numberOfLines={expanded ? undefined : 1}>{quality.summary}</Text>
                <Text style={s.chevron}>{expanded ? '︿' : '﹀'}</Text>
            </View>
            {expanded && (
                <Text style={s.detail}>
                    Figures on this page are only as reliable as this history. Numbers built on months with no data are shown flat, not estimated — check the footnotes on any trend table before relying on a figure for a big decision.
                </Text>
            )}
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    badge: {
        backgroundColor: Colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    icon: { fontSize: 12, fontWeight: 'bold' },
    label: { fontSize: 11.5, fontWeight: '700' },
    summary: { flex: 1, fontSize: 11, color: Colors.textMuted },
    chevron: { fontSize: 10, color: Colors.textMuted },
    detail: { fontSize: 10.5, color: Colors.textMuted, marginTop: 8, lineHeight: 15, fontStyle: 'italic' },
});
