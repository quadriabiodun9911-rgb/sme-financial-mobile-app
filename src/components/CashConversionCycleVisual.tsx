import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
    dso: number; // days sales outstanding -- customer payment
    dio: number; // days inventory outstanding
    dpo: number; // days payable outstanding -- supplier payment
    ccc: number; // dso + dio - dpo
}

/**
 * The visual breakdown a plain "Cash Cycle: 47d" stat tile can't show:
 * WHERE the 47 days comes from (32 collecting from customers + 28 sitting
 * in stock, minus 13 the business itself gets from suppliers), not just
 * the final number. Purely a presentation layer over
 * cfoMetrics.ts's computeCashConversionCycle -- no new math, just the
 * visual + narrative the number deserves.
 */
export default function CashConversionCycleVisual({ dso, dio, dpo, ccc }: Props) {
    const maxSegment = Math.max(dso, dio, dpo, 1);
    const segments: { label: string; days: number; color: string; sign: '' | '−' }[] = [
        { label: 'Customer payment', days: dso, color: Colors.warning, sign: '' },
        { label: 'Inventory', days: dio, color: Colors.primary, sign: '' },
        { label: 'Supplier payment', days: dpo, color: Colors.income, sign: '−' },
    ];

    return (
        <View style={s.container}>
            <Text style={s.headlineLabel}>Cash Conversion Cycle</Text>
            <Text style={[s.headline, { color: ccc <= 30 ? Colors.income : ccc <= 60 ? Colors.warning : Colors.expense }]}>
                {Math.round(ccc)} DAYS
            </Text>

            {segments.map(seg => (
                <View key={seg.label} style={s.segmentRow}>
                    <Text style={s.segmentLabel}>{seg.label}</Text>
                    <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${Math.max(4, (seg.days / maxSegment) * 100)}%`, backgroundColor: seg.color }]} />
                    </View>
                    <Text style={s.segmentDays}>{Math.round(seg.days) > 0 ? seg.sign : ''}{Math.round(seg.days)}d</Text>
                </View>
            ))}

            <Text style={s.formula}>
                {Math.round(dso)} + {Math.round(dio)} − {Math.round(dpo)} = {Math.round(ccc)} days
            </Text>

            <Text style={s.narrative}>
                Your business typically has cash tied up for approximately {Math.round(ccc)} days between paying for operating resources and collecting cash from customers.
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { alignItems: 'stretch' },
    headlineLabel: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: 2 },
    headline: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 16 },

    segmentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    segmentLabel: { width: 108, fontSize: 12, color: Colors.textSecondary },
    barTrack: { flex: 1, height: 10, backgroundColor: Colors.bg, borderRadius: 5, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 5 },
    segmentDays: { width: 42, fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },

    formula: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginTop: 6, marginBottom: 10 },
    narrative: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
});
