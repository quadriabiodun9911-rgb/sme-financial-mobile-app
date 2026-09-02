import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { Celebration } from '../utils/celebrationEngine';

const DISMISSED_KEY = '@quad360/celebration_dismissed';

interface Props {
    celebration: Celebration | null;
}

// A distinct, positive-reinforcement moment -- separate from the
// Dashboard's existing (more neutral) readiness-trend line -- for a real,
// discrete milestone (see celebrationEngine.ts). Dismissing it remembers
// THIS milestone's key, not "celebrations forever" -- the next genuine one
// still shows once it happens.
export default function CelebrationBanner({ celebration }: Props) {
    const [dismissedKey, setDismissedKey] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        AsyncStorage.getItem(DISMISSED_KEY).then(setDismissedKey).catch(() => setDismissedKey(null));
    }, []);

    if (!celebration || dismissedKey === undefined || dismissedKey === celebration.key) return null;

    const dismiss = () => {
        setDismissedKey(celebration.key);
        AsyncStorage.setItem(DISMISSED_KEY, celebration.key).catch(() => {});
    };

    return (
        <View style={styles.card}>
            <View style={styles.textCol}>
                <Text style={styles.title}>{celebration.title}</Text>
                <Text style={styles.message}>{celebration.message}</Text>
            </View>
            <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
        backgroundColor: Colors.income + '14', borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.income, padding: Spacing.md, marginBottom: Spacing.sm,
        ...Shadow.sm,
    },
    textCol: { flex: 1 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    message: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    closeBtn: { padding: 2 },
});
