import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon, { IconName } from './ui/Icon';
import { RiskScore } from '../utils/finance';
import { QualityOfGrowthResult } from '../utils/qualityOfGrowth';
import { computeDirectionVsStatus, StatusLevel } from '../utils/directionVsStatus';
import { GrowthDirection } from '../utils/qualityOfGrowth';

interface Props {
    risk: RiskScore;
    growthQuality: QualityOfGrowthResult;
}

const STATUS_COLOR: Record<StatusLevel, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };
const DIRECTION_META: Record<GrowthDirection, { icon: IconName; color: string; label: string }> = {
    improving: { icon: 'trending-up', color: Colors.income, label: 'Improving' },
    stable: { icon: 'minus', color: Colors.textSecondary, label: 'Stable' },
    deteriorating: { icon: 'trending-down', color: Colors.expense, label: 'Deteriorating' },
};

// Direction vs Status — a single health score conflates "how are we doing
// right now" with "which way is it heading". A business can be current on
// everything today while the trend underneath is worsening month over
// month; a single score change alone can't show that split. Pure
// presentation over computeDirectionVsStatus (directionVsStatus.ts), which
// is itself a pure combinator of computeRiskScore and computeQualityOfGrowth
// — nothing here is scored independently, so this can never quietly
// disagree with the Financial Health card or the Quality of Growth tab.
export default function DirectionVsStatusCard({ risk, growthQuality }: Props) {
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const result = computeDirectionVsStatus(risk, growthQuality);

    return (
        <View style={s.card}>
            <View style={s.cardHeaderRow}>
                <Icon name="compass" size={14} color={Colors.textMuted} />
                <Text style={s.cardTitle}>Direction vs Status</Text>
            </View>
            <Text style={s.subtitle}>Status is where each area stands today. Direction is which way it's been moving.</Text>

            <View style={s.headerLabelsRow}>
                <Text style={[s.headerLabel, s.rowLabel]} />
                <Text style={[s.headerLabel, s.statusCol]}>Status</Text>
                <Text style={[s.headerLabel, s.directionCol]}>Direction</Text>
            </View>

            {result.rows.map(row => {
                const isOpen = expandedKey === row.key;
                const dirMeta = row.direction ? DIRECTION_META[row.direction] : null;
                return (
                    <View key={row.key}>
                        <TouchableOpacity style={s.row} onPress={() => setExpandedKey(isOpen ? null : row.key)} activeOpacity={0.7}>
                            <Text style={[s.rowLabelText, s.rowLabel]}>{row.label}</Text>
                            <View style={[s.statusCol, s.pillWrap]}>
                                <View style={[s.dot, { backgroundColor: STATUS_COLOR[row.statusLevel] }]} />
                                <Text style={[s.pillText, { color: STATUS_COLOR[row.statusLevel] }]}>
                                    {row.statusLevel === 'good' ? 'Healthy' : row.statusLevel === 'warning' ? 'Watch' : 'At risk'}
                                </Text>
                            </View>
                            <View style={[s.directionCol, s.pillWrap]}>
                                {dirMeta ? (
                                    <>
                                        <Icon name={dirMeta.icon} size={13} color={dirMeta.color} />
                                        <Text style={[s.pillText, { color: dirMeta.color }]}>{dirMeta.label}</Text>
                                    </>
                                ) : (
                                    <Text style={s.pillTextMuted}>No trend yet</Text>
                                )}
                            </View>
                        </TouchableOpacity>
                        {isOpen && (
                            <View style={s.detailBox}>
                                <Text style={s.detailText}>{row.statusExplanation}</Text>
                                {row.direction && row.directionEvidence && (
                                    <Text style={s.detailText}>
                                        {row.directionFlag ?? `Trending ${row.direction} — ${row.directionEvidence}.`}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                );
            })}

            {!result.directionAvailable && (
                <Text style={s.emptyHint}>{result.directionUnavailableReason}</Text>
            )}
            {result.directionAvailable && result.periodLabel && (
                <Text style={s.footnote}>Direction compares {result.periodLabel}. Tap a row to see why.</Text>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.md },

    headerLabelsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    headerLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    rowLabel: { flex: 1.1 },
    statusCol: { flex: 1 },
    directionCol: { flex: 1 },

    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border },
    rowLabelText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    pillWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '700' },
    pillTextMuted: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic' },

    detailBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.xs, gap: 4 },
    detailText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    emptyHint: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm, lineHeight: 16 },
    footnote: { fontSize: 10.5, color: Colors.textMuted, marginTop: Spacing.sm, fontStyle: 'italic' },
});
