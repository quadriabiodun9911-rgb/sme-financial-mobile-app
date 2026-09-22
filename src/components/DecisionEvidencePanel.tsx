import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { DecisionEvidence } from '../utils/decisionEvidence';

interface Props {
    evidence: DecisionEvidence;
}

// The counter-evidence panel for confirmation bias: it's natural to look
// for numbers that support a decision you're already leaning toward, and
// stop looking once you find them. This puts both sides in front of the
// owner at once, from the same signals the rest of the app already trusts
// (see decisionEvidence.ts) -- not a new opinion, just both halves of one
// already surfaced.
export default function DecisionEvidencePanel({ evidence }: Props) {
    if (!evidence.available) return null;
    if (evidence.supporting.length === 0 && evidence.conflicting.length === 0) return null;

    return (
        <View style={s.card}>
            <Text style={s.title}>⚖️ Before You Decide — The Full Picture</Text>
            <Text style={s.subtitle}>
                It's natural to look for the numbers that support a decision you've already leaned toward. Here's both sides, from your own data.
            </Text>
            <View style={s.columns}>
                <View style={s.col}>
                    <Text style={[s.colTitle, { color: Colors.income }]}>✓ Supports it</Text>
                    {evidence.supporting.length === 0 ? (
                        <Text style={s.emptyText}>No strongly positive signals right now.</Text>
                    ) : evidence.supporting.map((item, i) => (
                        <View key={`${item.source}-${i}`} style={s.item}>
                            <Text style={s.itemSource}>{item.source}</Text>
                            <Text style={s.itemText}>{item.text}</Text>
                        </View>
                    ))}
                </View>
                <View style={s.col}>
                    <Text style={[s.colTitle, { color: Colors.expense }]}>⚠ Argues against it</Text>
                    {evidence.conflicting.length === 0 ? (
                        <Text style={s.emptyText}>No real concerns flagged right now.</Text>
                    ) : evidence.conflicting.map((item, i) => (
                        <View key={`${item.source}-${i}`} style={s.item}>
                            <Text style={s.itemSource}>{item.source}</Text>
                            <Text style={s.itemText}>{item.text}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 17 },
    columns: { flexDirection: 'row', gap: 12 },
    col: { flex: 1 },
    colTitle: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
    item: { marginBottom: 10 },
    itemSource: { fontSize: 9.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1 },
    itemText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
    emptyText: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
});
