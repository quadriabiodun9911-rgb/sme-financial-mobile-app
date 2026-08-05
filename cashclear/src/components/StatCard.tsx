import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from './Card';
import { colors } from '../theme/colors';

export default function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
    return (
        <Card style={styles.card}>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
            {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { flex: 1, minWidth: 140 },
    label: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
    value: { color: colors.text, fontSize: 20, fontWeight: '700' },
    sub: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
});
