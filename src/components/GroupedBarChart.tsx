import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../theme/colors';

export interface GroupedBarSeries {
    label: string;
    color: string;
    /** Chronological, same length and order as `labels`. */
    values: number[];
}

interface Props {
    /** X-axis category labels (typically months), oldest first. */
    labels: string[];
    /** 2 (sometimes 3) series plotted as side-by-side columns per label. */
    series: GroupedBarSeries[];
    height?: number;
}

const COLUMN_WIDTH = 40;
const BAR_GAP = 2;      // surface gap between the bars within one group
const GROUP_GAP = 10;   // ≥8px air between adjacent groups

// The recurring "revenue vs. expense, month by month" column chart --
// income and cost are two different-hued series sharing one category axis,
// so this is a genuine two-series categorical case (not a magnitude
// ranking), each series keeping its own fixed color throughout per the
// dataviz skill's "color follows the entity" rule. Bars are capped at the
// mark spec's 24px thickness, rounded only at the data-end (the top, since
// they grow up from a shared baseline) and square at the baseline.
export default function GroupedBarChart({ labels, series, height = 120 }: Props) {
    const maxVal = Math.max(1, ...series.flatMap(s => s.values.map(v => Math.abs(v))));
    const barWidth = Math.min(24, (COLUMN_WIDTH - BAR_GAP * (series.length - 1)) / Math.max(1, series.length));
    const groupWidth = barWidth * series.length + BAR_GAP * (series.length - 1);

    return (
        <View>
            {/* Always horizontally scrollable -- with content narrower than
                the viewport this simply never scrolls, and it sidesteps
                measuring available width just to decide whether to wrap. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chart}>
                    {labels.map((label, li) => (
                        <View key={li} style={[styles.col, { width: groupWidth + GROUP_GAP }]}>
                            <Svg width={groupWidth} height={height}>
                                {series.map((s, si) => {
                                    const raw = s.values[li] ?? 0;
                                    const h = Math.max(2, (Math.abs(raw) / maxVal) * (height - 4));
                                    const x = si * (barWidth + BAR_GAP);
                                    return (
                                        <Path
                                            key={s.label}
                                            d={topRoundedBarPath(x, height - h, barWidth, h, 4)}
                                            fill={s.color}
                                        />
                                    );
                                })}
                            </Svg>
                            <Text style={styles.colLabel} numberOfLines={1}>{label}</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
            <View style={styles.legend}>
                {series.map(s => (
                    <View key={s.label} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                        <Text style={styles.legendText}>{s.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

// Rounded top corners only, square baseline -- the column mark spec.
function topRoundedBarPath(x: number, y: number, width: number, height: number, radius: number): string {
    const r = Math.min(radius, width / 2, height);
    if (width <= 0 || height <= 0) return '';
    return [
        `M${x},${y + height}`,
        `L${x},${y + r}`,
        `Q${x},${y} ${x + r},${y}`,
        `L${x + width - r},${y}`,
        `Q${x + width},${y} ${x + width},${y + r}`,
        `L${x + width},${y + height}`,
        `Z`,
    ].join(' ');
}

const styles = StyleSheet.create({
    chart: { flexDirection: 'row', alignItems: 'flex-end' },
    col: { alignItems: 'center' },
    colLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 4 },
    legend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: Colors.textMuted },
});
