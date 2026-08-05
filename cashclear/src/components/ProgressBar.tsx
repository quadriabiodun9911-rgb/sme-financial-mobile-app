import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

export default function ProgressBar({ value, color }: { value: number; color: string }) {
    const clamped = Math.max(0, Math.min(100, value));
    return (
        <View style={styles.track}>
            <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceAlt,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 4,
    },
});
