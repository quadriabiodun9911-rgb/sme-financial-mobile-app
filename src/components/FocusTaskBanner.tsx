import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow, Spacing, Radius } from '../theme/tokens';
import Icon from './ui/Icon';

interface Props {
    focusTask?: string;
}

/**
 * Carries the specific "why you're here" instruction from wherever a
 * "what to do next" step deep-linked from (Business Health Report, Decision
 * Centre, etc.) via navParams.focusTask. Landing on a screen's generic
 * default view with no reminder of the actual task left the owner to
 * re-derive it from memory -- this renders that task as a banner right
 * under the header instead. Renders nothing when no focusTask was passed,
 * so a screen opened normally looks exactly as it always has.
 */
export default function FocusTaskBanner({ focusTask }: Props) {
    if (!focusTask) return null;
    return (
        <View style={s.box}>
            <Icon name="target" size={14} color={Colors.primary} />
            <Text style={s.text}>{focusTask}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    box: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.primary + '14',
        borderWidth: 1,
        borderColor: Colors.primary + '40',
        borderRadius: Radius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        ...Shadow.sm,
    },
    text: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
});
