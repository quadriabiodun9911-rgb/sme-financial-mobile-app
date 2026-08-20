import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors } from '../theme/colors';

interface Props {
    /** Chronological series, oldest first. Needs at least 2 points to draw a line. */
    data: number[];
    color: string;
    height?: number;
}

function buildPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => acc + `${i === 0 ? 'M' : 'L'}${p.x},${p.y} `, '').trim();
}

// A single-series trend line with a soft fill underneath -- the "how has
// this number moved" pattern (a cash balance history, a revenue run-rate).
// One series, one hue, no legend (see RadialGauge's comment on the same
// rule). 2px line per the mark spec, a filled gradient area anchored to the
// baseline, and a highlighted end-point since the most recent value is the
// one figure worth a direct label.
export default function TrendSparkline({ data, color, height = 56 }: Props) {
    const [width, setWidth] = useState(0);
    const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

    const gradientId = `sparkline-fill-${color.replace('#', '')}`;

    let linePath = '';
    let areaPath = '';
    let lastPoint: { x: number; y: number } | null = null;

    if (width > 0 && data.length >= 2) {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const span = max - min || 1;
        // Small top/bottom margin so the line never clips against the
        // card edge and the filled area always has visible headroom.
        const padY = height * 0.12;
        const points = data.map((v, i) => ({
            x: (i / (data.length - 1)) * width,
            y: height - padY - ((v - min) / span) * (height - padY * 2),
        }));
        linePath = buildPath(points);
        areaPath = `${linePath} L${width},${height} L0,${height} Z`;
        lastPoint = points[points.length - 1];
    }

    return (
        <View style={[styles.wrap, { height }]} onLayout={onLayout}>
            {width > 0 && data.length >= 2 && (
                <Svg width={width} height={height}>
                    <Defs>
                        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                            <Stop offset="1" stopColor={color} stopOpacity={0} />
                        </LinearGradient>
                    </Defs>
                    <Path d={areaPath} fill={`url(#${gradientId})`} />
                    <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    {lastPoint && (
                        <Circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={color} stroke={Colors.surface} strokeWidth={2} />
                    )}
                </Svg>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { width: '100%' },
});
