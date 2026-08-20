import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../theme/colors';

interface Props {
    /** Raw value to display in the center (already formatted, e.g. "42" or "∞"). */
    displayValue: string;
    /** Small caption under the value, e.g. "days". */
    label: string;
    /** 0–1 fraction of the ring to fill. Clamped. */
    progress: number;
    color: string;
    size?: number;
    strokeWidth?: number;
}

// A single-series radial gauge -- the "how healthy is this one number"
// pattern (runway, a ratio, a score-out-of-100). One arc, one color, no
// legend needed (see dataviz skill: a single series names itself via the
// card title, doesn't need a legend box). Track uses a neutral ink so the
// filled arc -- carrying the actual status color -- is the only colored
// mark, and rounded stroke caps match the "4px rounded data-ends" mark spec.
export default function RadialGauge({ displayValue, label, progress, color, size = 72, strokeWidth = 7 }: Props) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(1, progress));
    const dashOffset = circumference * (1 - clamped);

    return (
        <View style={[styles.wrap, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={Colors.border}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    // Start the arc at 12 o'clock instead of 3 o'clock.
                    rotation={-90}
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            <View style={styles.center} pointerEvents="none">
                <Text style={[styles.value, { color, fontSize: size * 0.28 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {displayValue}
                </Text>
                <Text style={[styles.label, { fontSize: Math.max(8, size * 0.11) }]}>{label}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center' },
    center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    value: { fontWeight: '800' },
    label: { color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
});
