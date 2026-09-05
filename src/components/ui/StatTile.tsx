import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { Radius, Shadow, Spacing, Type } from '../../theme/tokens';
import Icon, { IconName } from './Icon';

interface StatTileProps {
    icon: IconName;
    iconColor?: string;
    label: string;
    value: string;
    valueColor?: string;
    sub?: string;
}

// Replaces the "emoji + number in a box" pattern repeated across Dashboard's
// vital-signs and monthly-snapshot grids with one consistent tile: a tinted
// icon badge, a value in the display scale, and an optional sub-line —
// close to how Mercury/Ramp present a metric tile.
export default function StatTile({ icon, iconColor = Colors.primary, label, value, valueColor, sub }: StatTileProps) {
    return (
        <View style={styles.tile}>
            <View style={[styles.iconBadge, { backgroundColor: iconColor + '1f' }]}>
                <Icon name={icon} size={16} color={iconColor} />
            </View>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
            {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    tile: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.lg,
        minWidth: 140,
        ...Shadow.sm,
    },
    iconBadge: {
        width: 30, height: 30, borderRadius: Radius.sm,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: Spacing.sm,
    },
    label: { ...Type.caption, color: Colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
    value: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
    sub: { ...Type.caption, color: Colors.textMuted, marginTop: 4, fontWeight: '500' },
});
