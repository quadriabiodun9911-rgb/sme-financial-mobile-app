import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { GLOSSARY } from '../utils/glossary';

interface Props {
    term: keyof typeof GLOSSARY | string;
    // Anchors the popover to the left instead of the right, for terms near
    // the right edge of the screen (e.g. inside a right-aligned value column).
    alignLeft?: boolean;
}

// A small "ⓘ" next to a financial term. Tap to reveal a one-sentence plain-
// language definition in a floating popover — doesn't reflow surrounding
// layout (table rows, stat cards) since the popover is absolutely positioned.
export default function InfoTip({ term, alignLeft }: Props) {
    const [open, setOpen] = useState(false);
    const definition = GLOSSARY[term];
    if (!definition) return null;

    return (
        <View style={s.wrap}>
            <TouchableOpacity onPress={() => setOpen(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.icon}>ⓘ</Text>
            </TouchableOpacity>
            {open && (
                <View style={[s.popover, alignLeft ? { right: 0 } : { left: 0 }]}>
                    <Text style={s.popoverTitle}>{term}</Text>
                    <Text style={s.popoverText}>{definition}</Text>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { position: 'relative' },
    icon: { fontSize: 12, color: Colors.textMuted, marginLeft: 4 },
    popover: {
        position: 'absolute',
        top: 20,
        width: 220,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        padding: 10,
        zIndex: 50,
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    popoverTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    popoverText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
});
