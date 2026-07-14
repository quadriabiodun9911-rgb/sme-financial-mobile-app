import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../theme/colors';

interface MetricTileProps {
    icon?: string;
    label: string;
    value: string;
    valueColor?: string;
    sub?: string;
    onPress?: () => void;
    wide?: boolean;
    style?: StyleProp<ViewStyle>;
}

export default function MetricTile({ icon, label, value, valueColor, sub, onPress, wide, style }: MetricTileProps) {
    const content = (
        <>
            <Text style={styles.label}>{icon ? `${icon} ` : ''}{label}</Text>
            <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
            {sub ? <Text style={styles.sub} numberOfLines={2}>{sub}</Text> : null}
        </>
    );

    const tileStyle = [styles.tile, wide && styles.tileWide, style];

    if (onPress) {
        return (
            <TouchableOpacity style={tileStyle} onPress={onPress} activeOpacity={0.75}>
                {content}
            </TouchableOpacity>
        );
    }
    return <View style={tileStyle}>{content}</View>;
}

const styles = StyleSheet.create({
    tile: {
        flexBasis: '48%',
        flexGrow: 1,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 12,
    },
    tileWide: {
        flexBasis: '100%',
    },
    label: {
        fontSize: 11,
        color: Colors.textMuted,
        marginBottom: 6,
        fontWeight: '600',
    },
    value: {
        fontSize: 17,
        fontWeight: 'bold',
        color: Colors.textPrimary,
    },
    sub: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 3,
        lineHeight: 15,
    },
});
