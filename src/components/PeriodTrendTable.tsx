import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

export interface PeriodTrendColumn {
    key: string;
    label: string;
}

export interface PeriodTrendRow {
    key: string;
    label: string;
    indent?: boolean;
    bold?: boolean;
    muted?: boolean;
    // A row with a real value doesn't always sit at a clean subtotal/total
    // boundary -- these three map directly onto the border treatments
    // every one of these tables already used before this was extracted
    // (BalanceSheetComparisonTable's subtotalRow/totalRow/borderBottomWidth:0).
    topBorder?: boolean;
    doubleTopBorder?: boolean;
    noBottomBorder?: boolean;
    onPress?: () => void;
    getValue: (columnKey: string) => string;
    getColor?: (columnKey: string) => string | undefined;
    // A smaller italic line under the main value in the same cell -- e.g.
    // an estimated-full-period projection for a still-in-progress column.
    // Rendered on the scrolling side only; the frozen label column has no
    // equivalent second line.
    getSubValue?: (columnKey: string) => string | null | undefined;
}

interface Props {
    columns: PeriodTrendColumn[];
    rows: PeriodTrendRow[];
    labelColumnWidth?: number;
    columnWidth?: number;
    // Anything that should re-trigger the scroll-to-most-recent-column
    // behavior beyond columns.length changing on its own -- typically the
    // caller's period-grouping selector (daily/weekly/monthly/...), since
    // switching grouping can produce the same column COUNT with entirely
    // different dates.
    scrollDep?: string | number;
}

// Shared shell for every "row labels across many time periods" trend table
// in this app (Balance Sheet Trend, Profit & Loss Period Comparison, Cash
// Flow Comparison, Tax Comparison, Stock/Sales Comparison, MacroShield's
// own detail breakdown) -- a frozen label column that never scrolls, next
// to a horizontally-scrolling ScrollView of just the period columns, both
// built from the SAME `rows` array passed in so the two sides can never
// drift out of alignment. Opens auto-scrolled to the rightmost column
// instead of the oldest, since periods run oldest-to-newest left-to-right
// throughout this app -- without it, the owner has to manually scroll past
// every older column just to see where they stand today.
export default function PeriodTrendTable({ columns, rows, labelColumnWidth = 140, columnWidth = 112, scrollDep }: Props) {
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
    }, [scrollDep, columns.length]);

    const rowContainerStyle = (row: PeriodTrendRow) => [
        s.row,
        row.topBorder && s.topBorderRow,
        row.doubleTopBorder && s.doubleTopBorderRow,
        row.noBottomBorder && s.noBottomBorder,
    ];

    return (
        <View style={s.tableWrap}>
            {/* Frozen label column */}
            <View>
                <View style={[s.cell, s.headerRow, { width: labelColumnWidth, alignItems: 'flex-start' }]}>
                    <Text style={s.rowLabelHeader}>Breakdown</Text>
                </View>
                {rows.map(row => {
                    // A row with getSubValue renders a second line under the
                    // main figure on the scrolling side (see below) -- since
                    // the frozen column and the scrolling columns are two
                    // separate view trees, a row that's taller on one side
                    // than the other drifts the two out of alignment for
                    // every row beneath it. This invisible spacer keeps both
                    // sides the same height without needing to measure
                    // actual rendered heights.
                    const content = (
                        <View style={[rowContainerStyle(row), s.cell, { width: labelColumnWidth, alignItems: 'flex-start' }, row.indent && s.rowLabelIndent]}>
                            <Text style={[s.rowLabel, row.bold && s.rowLabelBold, row.muted && s.rowLabelMuted]} numberOfLines={1}>
                                {row.label}
                            </Text>
                            {row.getSubValue && <Text style={s.subValSpacer}> </Text>}
                        </View>
                    );
                    return row.onPress ? (
                        <TouchableOpacity key={row.key} onPress={row.onPress} activeOpacity={0.6}>{content}</TouchableOpacity>
                    ) : (
                        <View key={row.key}>{content}</View>
                    );
                })}
            </View>

            {/* Scrolling period columns */}
            <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator style={s.scrollArea}>
                <View>
                    <View style={s.headerRow}>
                        {columns.map(col => (
                            <View key={col.key} style={[s.cell, { width: columnWidth }]}>
                                <Text style={s.colHeader}>{col.label}</Text>
                            </View>
                        ))}
                    </View>
                    {rows.map(row => {
                        const content = (
                            <View style={rowContainerStyle(row)}>
                                {columns.map(col => {
                                    const color = row.getColor?.(col.key);
                                    const subValue = row.getSubValue?.(col.key);
                                    return (
                                        <View key={col.key} style={[s.cell, { width: columnWidth }]}>
                                            <Text style={[s.val, row.bold && s.valBold, row.muted && s.valMuted, color ? { color } : null]}>
                                                {row.getValue(col.key)}
                                            </Text>
                                            {subValue ? <Text style={s.subVal}>{subValue}</Text> : null}
                                        </View>
                                    );
                                })}
                            </View>
                        );
                        return row.onPress ? (
                            <TouchableOpacity key={row.key} onPress={row.onPress} activeOpacity={0.6}>{content}</TouchableOpacity>
                        ) : (
                            <View key={row.key}>{content}</View>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    tableWrap: { flexDirection: 'row' },
    scrollArea: { flex: 1 },
    headerRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: Colors.textPrimary },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    topBorderRow: { borderTopWidth: 1, borderTopColor: Colors.border },
    doubleTopBorderRow: { borderTopWidth: 2, borderTopColor: Colors.textPrimary, marginTop: 2 },
    noBottomBorder: { borderBottomWidth: 0 },
    cell: { paddingVertical: 9, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelIndent: { paddingLeft: 16 },
    rowLabelHeader: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    rowLabelBold: { fontWeight: '700', color: Colors.textPrimary },
    rowLabelMuted: { color: Colors.textMuted, fontStyle: 'italic', fontSize: 11.5 },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valBold: { fontWeight: '700' },
    valMuted: { color: Colors.textMuted, fontStyle: 'italic', fontSize: 11.5 },
    subVal: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', fontVariant: ['tabular-nums'], marginTop: 2 },
    subValSpacer: { fontSize: 10.5, marginTop: 2, opacity: 0 },
});
