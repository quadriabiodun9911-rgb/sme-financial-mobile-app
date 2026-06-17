import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { generateSwot } from '../utils/swot';
import { Colors } from '../theme/colors';
import { SwotItem } from '../types';

const QUADRANTS = [
    {
        key: 'strengths' as const,
        label: 'Strengths',
        icon: '💪',
        color: Colors.income,
        bg: 'rgba(16,185,129,0.08)',
        border: 'rgba(16,185,129,0.3)',
        subtitle: 'Internal advantages',
    },
    {
        key: 'weaknesses' as const,
        label: 'Weaknesses',
        icon: '⚠️',
        color: Colors.expense,
        bg: 'rgba(239,68,68,0.08)',
        border: 'rgba(239,68,68,0.3)',
        subtitle: 'Internal disadvantages',
    },
    {
        key: 'opportunities' as const,
        label: 'Opportunities',
        icon: '🚀',
        color: Colors.asset,
        bg: 'rgba(59,130,246,0.08)',
        border: 'rgba(59,130,246,0.3)',
        subtitle: 'External growth levers',
    },
    {
        key: 'threats' as const,
        label: 'Threats',
        icon: '🔴',
        color: Colors.warning,
        bg: 'rgba(245,158,11,0.08)',
        border: 'rgba(245,158,11,0.3)',
        subtitle: 'External risk factors',
    },
];

export default function SwotAnalysis() {
    const { finance, transactions, settings } = useApp();

    const swot = useMemo(
        () => generateSwot(finance, transactions, settings),
        [finance, transactions, settings]
    );

    const generatedTime = new Date(swot.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const generatedDate = new Date(swot.generatedAt).toLocaleDateString();

    return (
        <View>
            {/* Header */}
            <View style={styles.headerCard}>
                <Text style={styles.headerTitle}>SWOT Analysis</Text>
                <Text style={styles.headerSub}>
                    Automatically generated from your live P&L, cash flow, and balance sheet data.
                </Text>
                <Text style={styles.timestamp}>Last updated: {generatedDate} at {generatedTime}</Text>
            </View>

            {/* 2×2 SWOT Grid summary */}
            <View style={styles.grid}>
                {QUADRANTS.map(q => (
                    <View key={q.key} style={[styles.gridCell, { backgroundColor: q.bg, borderColor: q.border }]}>
                        <Text style={styles.gridIcon}>{q.icon}</Text>
                        <Text style={[styles.gridLabel, { color: q.color }]}>{q.label}</Text>
                        <Text style={styles.gridCount}>{swot[q.key].length} item{swot[q.key].length !== 1 ? 's' : ''}</Text>
                    </View>
                ))}
            </View>

            {/* Full quadrant detail */}
            {QUADRANTS.map(q => (
                <View key={q.key} style={[styles.quadrantCard, { borderTopColor: q.color, borderColor: q.border }]}>
                    <View style={styles.quadrantHeader}>
                        <Text style={styles.quadrantIcon}>{q.icon}</Text>
                        <View>
                            <Text style={[styles.quadrantLabel, { color: q.color }]}>{q.label}</Text>
                            <Text style={styles.quadrantSub}>{q.subtitle}</Text>
                        </View>
                    </View>
                    {swot[q.key].map((item: SwotItem, i: number) => (
                        <View key={i} style={styles.item}>
                            <View style={[styles.bullet, { backgroundColor: q.color }]} />
                            <View style={styles.itemContent}>
                                <Text style={styles.itemText}>{item.text}</Text>
                                {item.metric && (
                                    <View style={[styles.metricPill, { backgroundColor: q.bg, borderColor: q.border }]}>
                                        <Text style={[styles.metricText, { color: q.color }]}>{item.metric}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    ))}
                </View>
            ))}

            {/* Interpretation guide */}
            <View style={styles.guideCard}>
                <Text style={styles.guideTitle}>How to use this analysis</Text>
                <GuideRow icon="💪→🚀" text="Leverage strengths to pursue opportunities (SO strategy)" />
                <GuideRow icon="⚠️→🚀" text="Address weaknesses to capture opportunities (WO strategy)" />
                <GuideRow icon="💪→🔴" text="Use strengths to defend against threats (ST strategy)" />
                <GuideRow icon="⚠️→🔴" text="Minimise weaknesses to avoid threats (WT strategy)" />
                <Text style={styles.guideDisclaimer}>
                    This analysis is generated from transaction data recorded in Quad360. Results are only as accurate as the data entered.
                </Text>
            </View>
        </View>
    );
}

function GuideRow({ icon, text }: { icon: string; text: string }) {
    return (
        <View style={guideStyles.row}>
            <Text style={guideStyles.icon}>{icon}</Text>
            <Text style={guideStyles.text}>{text}</Text>
        </View>
    );
}

const guideStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
    icon: { fontSize: 13, width: 50 },
    text: { fontSize: 12, color: Colors.textMuted, flex: 1, lineHeight: 18 },
});

const styles = StyleSheet.create({
    headerCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    headerSub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 6 },
    timestamp: { fontSize: 11, color: Colors.muted, fontStyle: 'italic' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    gridCell: {
        width: '48%',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
    },
    gridIcon: { fontSize: 22, marginBottom: 4 },
    gridLabel: { fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
    gridCount: { fontSize: 11, color: Colors.textMuted },

    quadrantCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        borderTopWidth: 3,
        borderWidth: 1,
    },
    quadrantHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    quadrantIcon: { fontSize: 24 },
    quadrantLabel: { fontSize: 15, fontWeight: 'bold' },
    quadrantSub: { fontSize: 11, color: Colors.textMuted },

    item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
    bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, flexShrink: 0 },
    itemContent: { flex: 1 },
    itemText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
    metricPill: {
        alignSelf: 'flex-start',
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
    },
    metricText: { fontSize: 11, fontWeight: '600' },

    guideCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    guideTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    guideDisclaimer: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 8, lineHeight: 16 },
});
