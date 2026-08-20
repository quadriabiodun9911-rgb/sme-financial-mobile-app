import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../theme/colors';

export interface BarListItem {
    /** Row label (e.g. a customer name, a bucket, a category). */
    label: string;
    /** Raw magnitude this bar's length encodes. */
    value: number;
    /** Pre-formatted value shown at the bar's end (e.g. "₦42,000" or "18%"). */
    displayValue: string;
    /**
     * Overrides the sequential rank-hue for this one row -- for a diverging
     * case (e.g. this month's profit vs last month's, positive/negative)
     * where the row's sign is the thing that matters, not its rank. Leave
     * unset for an ordinary ranked/magnitude list.
     */
    color?: string;
}

interface Props {
    items: BarListItem[];
    /** Base hue for the sequential (rank-driven) ramp. Defaults to the app's accent. */
    color?: string;
    /** Denominator for bar length -- defaults to the largest |value| in the list. */
    maxValue?: number;
    /** Bar thickness in px. Capped at the 24px mark-spec ceiling. */
    barHeight?: number;
}

const LABEL_WIDTH = 96;
const VALUE_WIDTH = 76;
const GAP = 8;

// A horizontal ranked/comparison bar list -- the "who's biggest" pattern
// (best customers, best products, cost-exposure categories, aging buckets,
// debt/asset comparisons). Magnitude is sequential, not categorical
// identity: per the dataviz skill, a ranked list takes ONE hue with
// monotone lightness by rank rather than a rainbow of per-row colors.
// There's no lightness ramp exposed on Colors, so rank is expressed as
// fill-opacity against the surface instead (rank 1 = full-opacity/darkest
// mark, later rows progressively lighter) -- the same visual effect as an
// OKLCH light->dark step, without inventing hex values outside the theme
// tokens. A row's `color` prop opts it out of the rank ramp entirely for
// the diverging case (e.g. a signed month-over-month change).
//
// Track width is measured once on the outer row (not per-bar) so every
// row's SVG renders at the same width regardless of how long that row's
// own displayValue text happens to be.
export default function BarList({ items, color = Colors.primary, maxValue, barHeight = 10 }: Props) {
    const [containerWidth, setContainerWidth] = useState(0);
    const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

    const h = Math.min(barHeight, 24);
    const radius = 4;
    const denom = maxValue ?? Math.max(...items.map(i => Math.abs(i.value)), 1);
    const trackWidth = Math.max(0, containerWidth - LABEL_WIDTH - VALUE_WIDTH - GAP * 2);

    return (
        <View onLayout={onLayout}>
            {items.map((item, i) => {
                const rankOpacity = items.length <= 1 ? 1 : 1 - (i / (items.length - 1)) * 0.55;
                const fill = item.color ?? color;
                const pct = denom > 0 ? Math.max(0, Math.min(1, Math.abs(item.value) / denom)) : 0;

                return (
                    <View key={`${item.label}-${i}`} style={styles.row}>
                        <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
                        <View style={styles.trackWrap}>
                            {trackWidth > 0 && (
                                <Svg width={trackWidth} height={h}>
                                    <Path d={trackPath(trackWidth, h, radius)} fill={Colors.border} />
                                    {pct > 0 && (
                                        <Path
                                            d={barPath(Math.max(pct * trackWidth, h), h, radius)}
                                            fill={fill}
                                            fillOpacity={item.color ? 1 : rankOpacity}
                                        />
                                    )}
                                </Svg>
                            )}
                        </View>
                        <Text style={[styles.value, { color: item.color ?? Colors.textPrimary }]} numberOfLines={1}>
                            {item.displayValue}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

// A left-anchored bar: square at the baseline (left edge, where it grows
// from), 4px rounded at the data-end (right edge) -- per the mark spec.
function barPath(width: number, height: number, radius: number): string {
    const r = Math.min(radius, width / 2, height / 2);
    if (width <= 0 || height <= 0) return '';
    return [
        `M0,0`,
        `L${width - r},0`,
        `Q${width},0 ${width},${r}`,
        `L${width},${height - r}`,
        `Q${width},${height} ${width - r},${height}`,
        `L0,${height}`,
        `Z`,
    ].join(' ');
}

// The full-width recessive track behind every bar -- rounded both ends so
// the fill's rounded end never pokes past a square track corner.
function trackPath(width: number, height: number, radius: number): string {
    const r = Math.min(radius, width / 2, height / 2);
    if (width <= 0 || height <= 0) return '';
    return [
        `M${r},0`,
        `L${width - r},0`,
        `Q${width},0 ${width},${r}`,
        `L${width},${height - r}`,
        `Q${width},${height} ${width - r},${height}`,
        `L${r},${height}`,
        `Q0,${height} 0,${height - r}`,
        `L0,${r}`,
        `Q0,0 ${r},0`,
        `Z`,
    ].join(' ');
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: GAP },
    label: { fontSize: 11, color: Colors.textMuted, width: LABEL_WIDTH },
    trackWrap: { flex: 1 },
    value: { fontSize: 11.5, fontWeight: '700', width: VALUE_WIDTH, textAlign: 'right' },
});
