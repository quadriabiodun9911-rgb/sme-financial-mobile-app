import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Spacing } from '../theme/tokens';
import { RatioReading, RatioTier } from '../utils/financialRatiosEngine';

const TIER_COLOR: Record<RatioTier, string> = {
    strong: Colors.income, moderate: Colors.warning, weak: Colors.expense, unavailable: Colors.textMuted,
};

// A single plain-language ratio reading -- shared by every Reports tab that
// now shows one of financialRatiosEngine.ts's "genuinely new" readings
// (Operating Margin on P&L, Cash Ratio on Working Capital Health, Debt-to
// -Cash-Flow on Loans & Debt), instead of each tab reinventing the same
// tier-badge-plus-sentence layout the Finance tab used to own alone.
export default function RatioReadingRow({ reading }: { reading: RatioReading }) {
    const color = TIER_COLOR[reading.tier];
    return (
        <View style={[s.row, { borderLeftColor: color }]}>
            <View style={{ flex: 1 }}>
                <View style={s.labelRow}>
                    <Text style={s.label}>{reading.label}</Text>
                    <Text style={[s.tierLabel, { color }]}>{reading.tierLabel}</Text>
                </View>
                <Text style={s.plain}>{reading.plainLanguage}</Text>
            </View>
            <Text style={[s.value, { color }]}>{reading.displayValue}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        borderLeftWidth: 3, paddingLeft: Spacing.sm, paddingVertical: 6, marginTop: Spacing.xs,
    },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    label: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    tierLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    plain: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
    value: { fontSize: 14, fontWeight: '800' },
});
