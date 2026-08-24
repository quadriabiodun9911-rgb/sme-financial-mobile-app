import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import Icon from './ui/Icon';

interface Props {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

// A deeper/manual tool tucked behind a tap so the automatic, headline
// content above it doesn't get buried by a long default scroll.
export default function Collapsible({ title, defaultOpen = false, children }: Props) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <View style={s.wrap}>
            <TouchableOpacity style={s.header} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
                <Text style={s.title}>{title}</Text>
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
            </TouchableOpacity>
            {open && <View style={s.body}>{children}</View>}
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { backgroundColor: Colors.bg, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    title: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    body: { padding: 8, paddingTop: 0 },
});
