import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
    missionStatement?: string;
    visionStatement?: string;
    coreValues?: string;
    onEdit: () => void;
}

/**
 * Surfaces the business's own mission/vision/values right where decisions
 * get made — the Weekly Dashboard's priorities and the Clarity screen's
 * strategy — instead of leaving them buried in Settings where they're set
 * once and never seen again. Deliberately just displays the owner's own
 * words; no automated "alignment score" against them, since that would
 * mean fabricating a judgment the app has no real basis to make.
 */
export default function MissionVisionCard({ missionStatement, visionStatement, coreValues, onEdit }: Props) {
    const hasAny = !!(missionStatement?.trim() || visionStatement?.trim() || coreValues?.trim());
    const valueTags = (coreValues ?? '').split(',').map(v => v.trim()).filter(Boolean);

    if (!hasAny) {
        return (
            <TouchableOpacity style={s.emptyCard} onPress={onEdit} activeOpacity={0.7}>
                <Text style={s.emptyIcon}>🧭</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.emptyTitle}>Add your mission, vision & values</Text>
                    <Text style={s.emptyText}>Set a guideline to check your priorities and decisions against — shown here every time you review them.</Text>
                </View>
                <Text style={s.emptyArrow}>›</Text>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity style={s.card} onPress={onEdit} activeOpacity={0.8}>
            <View style={s.header}>
                <Text style={s.headerLabel}>🧭 YOUR GUIDELINE</Text>
                <Text style={s.editHint}>Edit</Text>
            </View>
            {missionStatement?.trim() && (
                <View style={s.row}>
                    <Text style={s.rowLabel}>Mission</Text>
                    <Text style={s.rowText}>{missionStatement}</Text>
                </View>
            )}
            {visionStatement?.trim() && (
                <View style={s.row}>
                    <Text style={s.rowLabel}>Vision</Text>
                    <Text style={s.rowText}>{visionStatement}</Text>
                </View>
            )}
            {valueTags.length > 0 && (
                <View style={s.row}>
                    <Text style={s.rowLabel}>Values</Text>
                    <View style={s.tagRow}>
                        {valueTags.map((v, i) => (
                            <View key={i} style={s.tag}>
                                <Text style={s.tagText}>{v}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.primary + '55',
        padding: 12,
        marginBottom: 12,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    headerLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5 },
    editHint: { fontSize: 11, color: Colors.textMuted },
    row: { marginBottom: 6 },
    rowLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, marginBottom: 2, textTransform: 'uppercase' },
    rowText: { fontSize: 12.5, color: Colors.textPrimary, lineHeight: 18, fontStyle: 'italic' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    tag: { backgroundColor: Colors.primary + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    tagText: { fontSize: 11.5, color: Colors.primary, fontWeight: '600' },
    emptyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        borderStyle: 'dashed',
        padding: 12,
        marginBottom: 12,
    },
    emptyIcon: { fontSize: 20 },
    emptyTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    emptyText: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
    emptyArrow: { fontSize: 18, color: Colors.textMuted },
});
