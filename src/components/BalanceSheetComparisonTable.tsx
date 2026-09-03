import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, Asset, Loan } from '../types';
import { computeAllTimeMonthlyBuckets, isoWeekKey } from '../utils/trendAnalysis';
import { computeBalanceSheetTrend, BalancePeriodGrouping, BalanceSheetTrendPoint, ManualBalances } from '../utils/balanceSheetTrend';
import { StatementCard } from './FormalStatement';

interface Props {
    businessName: string;
    transactions: Transaction[];
    assets: Asset[];
    loans: Loan[];
    currency: string;
    manualBalances?: ManualBalances;
}

const GROUPINGS: { key: BalancePeriodGrouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

const PERIOD_NOUN: Record<BalancePeriodGrouping, string> = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };

type LeafRow = {
    label: string;
    get: (p: BalanceSheetTrendPoint) => number;
    color: (p: BalanceSheetTrendPoint) => string;
    showOnlyIfNonZero?: boolean;
    bold?: boolean; // nested subtotal, e.g. "Total Current Assets" — not collapsible, just emphasized
};

type GroupRow = {
    key: string;
    label: string;
    get: (p: BalanceSheetTrendPoint) => number;
    color: (p: BalanceSheetTrendPoint) => string;
    children: LeafRow[];
};

const ASSET_ROWS: GroupRow = {
    key: 'assets',
    label: 'Total Assets',
    get: p => p.totalAssets,
    color: () => Colors.asset,
    children: [
        { label: 'Cash and Cash Equivalents', get: p => p.cashOnHand, color: p => p.cashOnHand >= 0 ? Colors.income : Colors.expense },
        { label: 'Accounts Receivable', get: p => p.accountsReceivable, color: () => Colors.income },
        { label: 'Inventory', get: p => p.stockValue, color: () => Colors.asset, showOnlyIfNonZero: true },
        { label: 'Total Current Assets', get: p => p.shortTermAssets, color: () => Colors.asset, bold: true },
        { label: 'Property & Equipment', get: p => p.equipmentValue, color: () => Colors.asset },
        { label: 'Property & Equipment (Manual Entry)', get: p => p.manualEquipment, color: () => Colors.asset, showOnlyIfNonZero: true },
        { label: 'Other Assets', get: p => p.otherAssets, color: () => Colors.asset, showOnlyIfNonZero: true },
    ],
};

const LIABILITY_ROWS: GroupRow = {
    key: 'liabilities',
    label: 'Total Liabilities',
    get: p => p.totalLiabilities,
    color: () => Colors.liability,
    children: [
        { label: 'Accounts Payable', get: p => p.accountsPayable, color: () => Colors.liability },
        { label: 'Current Portion of Loans Payable', get: p => p.loansCurrentPortion, color: () => Colors.liability, showOnlyIfNonZero: true },
        { label: 'Other Current Liabilities', get: p => p.otherLiabilities, color: () => Colors.liability, showOnlyIfNonZero: true },
        { label: 'Total Current Liabilities', get: p => p.currentLiabilities, color: () => Colors.liability, bold: true },
        { label: 'Long-Term Loans Payable', get: p => p.loansNonCurrentPortion, color: () => Colors.liability, showOnlyIfNonZero: true },
    ],
};

const GROUPS = [ASSET_ROWS, LIABILITY_ROWS];

// Every row this table can render, flattened once so the frozen label
// column and the scrolling value columns iterate the exact same list --
// guarantees the two stay in lockstep (same order, same count) rather than
// risking two independently-written render loops drifting apart.
type FlatRow =
    | { kind: 'group'; group: GroupRow; isOpen: boolean }
    | { kind: 'child'; child: LeafRow }
    | { kind: 'total' }
    | { kind: 'workingCapital' };

function flatRowKey(row: FlatRow): string {
    if (row.kind === 'group') return row.group.key;
    if (row.kind === 'child') return row.child.label;
    return row.kind;
}

// Every row here is something we can honestly reconstruct for a past date —
// see balanceSheetTrend.ts for exactly what each figure means and its
// limits. Stock/inventory value is the one line left out entirely: this app
// only tracks its current total, with no dated history of stock movements,
// so a trend for it would just be today's number repeated under old dates.
//
// Styled as a formal statement (StatementCard header + ruled ledger rows)
// rather than a generic app card, so it reads as the same kind of document
// as the Balance Sheet above it, just spread across periods instead of one.
export default function BalanceSheetComparisonTable({ businessName, transactions, assets, loans, currency, manualBalances }: Props) {
    const [grouping, setGrouping] = useState<BalancePeriodGrouping>('monthly');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const scrollRef = useRef<ScrollView>(null);

    const monthly = useMemo(() => computeAllTimeMonthlyBuckets(transactions), [transactions]);
    const monthKeys = useMemo(() => monthly.map(m => m.month), [monthly]);

    const points = useMemo(
        () => computeBalanceSheetTrend(grouping, monthKeys, transactions, assets, loans, manualBalances),
        [grouping, monthKeys, transactions, assets, loans, manualBalances]
    );

    const currentKey = useMemo(() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        if (grouping === 'daily') return todayISO;
        if (grouping === 'weekly') return isoWeekKey(todayISO);
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

    const groupingLabel = GROUPINGS.find(g => g.key === grouping)!.label;

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you have some, your balance sheet trend will build up here.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);
    const allExpanded = GROUPS.every(g => expanded.has(g.key));

    const toggleGroup = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const expandAll = () => setExpanded(allExpanded ? new Set() : new Set(GROUPS.map(g => g.key)));

    const flatRows = useMemo<FlatRow[]>(() => {
        const rows: FlatRow[] = [];
        for (const group of GROUPS) {
            const isOpen = expanded.has(group.key);
            rows.push({ kind: 'group', group, isOpen });
            if (isOpen) {
                const visibleChildren = group.children.filter(c => !c.showOnlyIfNonZero || points.some(p => c.get(p) !== 0));
                for (const child of visibleChildren) rows.push({ kind: 'child', child });
            }
        }
        rows.push({ kind: 'total' });
        rows.push({ kind: 'workingCapital' });
        return rows;
    }, [expanded, points]);

    const describeRow = (row: FlatRow) => {
        if (row.kind === 'group') {
            return {
                label: `${row.isOpen ? '⌄' : '›'} ${row.group.label}`,
                indent: false, bold: true, muted: false,
                get: row.group.get, color: row.group.color,
                onPress: () => toggleGroup(row.group.key),
                rowStyle: [s.row] as any[],
            };
        }
        if (row.kind === 'child') {
            return {
                label: row.child.label,
                indent: true, bold: !!row.child.bold, muted: false,
                get: row.child.get, color: row.child.color,
                onPress: undefined as (() => void) | undefined,
                rowStyle: [s.row, row.child.bold && s.subtotalRow] as any[],
            };
        }
        if (row.kind === 'total') {
            return {
                label: "Owners' Equity (Net Worth)",
                indent: false, bold: true, muted: false,
                get: (p: BalanceSheetTrendPoint) => p.netWorth,
                color: (p: BalanceSheetTrendPoint) => p.netWorth >= 0 ? Colors.income : Colors.expense,
                onPress: undefined as (() => void) | undefined,
                rowStyle: [s.row, s.totalRow] as any[],
            };
        }
        return {
            label: 'Working Capital',
            indent: false, bold: false, muted: true,
            get: (p: BalanceSheetTrendPoint) => p.cashBuffer,
            color: (p: BalanceSheetTrendPoint) => p.cashBuffer >= 0 ? Colors.income : Colors.expense,
            onPress: undefined as (() => void) | undefined,
            rowStyle: [s.row, { borderBottomWidth: 0 }] as any[],
        };
    };

    // Opens already scrolled to the most recent period -- points run oldest
    // to newest left-to-right, so without this the owner has to manually
    // scroll all the way across every older column just to see where they
    // stand today.
    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
    }, [grouping, points.length]);

    return (
        <StatementCard
            businessName={businessName}
            title="Balance Sheet Trend"
            subtitle={`${groupingLabel} Breakdown, All Recorded History`}
        >
            <View style={s.controlRow}>
                <View style={s.toggleRow}>
                    {GROUPINGS.map(g => (
                        <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                            <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TouchableOpacity onPress={expandAll}>
                    <Text style={s.expandAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</Text>
                </TouchableOpacity>
            </View>

            <View style={s.tableWrap}>
                {/* Frozen label column -- stays in place while the periods
                    scroll horizontally beneath it, so the row you're
                    reading never scrolls out of view. Rendered from the
                    same flatRows list as the scrolling side below, in the
                    same order, with matching row heights (numberOfLines={1}
                    on the label keeps a long name from wrapping and
                    throwing the two sides out of alignment). */}
                <View>
                    <View style={[s.cell, s.rowLabelCell, s.headerRow]}><Text style={s.rowLabelHeader}>Breakdown</Text></View>
                    {flatRows.map(row => {
                        const d = describeRow(row);
                        const content = (
                            <View style={[d.rowStyle, s.cell, s.rowLabelCell, d.indent && s.rowLabelIndent]}>
                                <Text
                                    style={[s.rowLabel, d.bold && s.rowLabelBold, d.muted && s.rowLabelMuted]}
                                    numberOfLines={1}
                                >
                                    {d.label}
                                </Text>
                            </View>
                        );
                        return d.onPress ? (
                            <TouchableOpacity key={flatRowKey(row)} onPress={d.onPress} activeOpacity={0.6}>{content}</TouchableOpacity>
                        ) : (
                            <View key={flatRowKey(row)}>{content}</View>
                        );
                    })}
                </View>

                <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={true} style={s.scrollArea}>
                    <View>
                        <View style={s.headerRow}>
                            {points.map(p => (
                                <View key={p.key} style={s.cell}><Text style={s.colHeader}>{p.label}{p.key === currentKey ? ' *' : ''}</Text></View>
                            ))}
                        </View>
                        {flatRows.map(row => {
                            const d = describeRow(row);
                            const content = (
                                <View style={d.rowStyle}>
                                    {points.map(p => (
                                        <View key={p.key} style={s.cell}>
                                            <Text style={[s.val, d.bold && s.valBold, d.muted && s.valMuted, { color: d.color(p) }]}>
                                                {fmt(d.get(p))}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            );
                            return d.onPress ? (
                                <TouchableOpacity key={flatRowKey(row)} onPress={d.onPress} activeOpacity={0.6}>{content}</TouchableOpacity>
                            ) : (
                                <View key={flatRowKey(row)}>{content}</View>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
            <Text style={s.hint}>As of the end of each {PERIOD_NOUN[grouping]}. Tap a bold row to expand it.</Text>
            <Text style={s.hint}>Accounts Receivable / Accounts Payable only count what's still unpaid today, so older columns can understate what was actually owed at the time.</Text>
            <Text style={s.hint}>Inventory value and manually-entered figures have no date attached, so they show today's total repeated in every column, not a real trend.</Text>
            <Text style={s.hint}>"Current Portion" / "Long-Term" is a projection from each loan's own rate and term, not a lender-confirmed schedule.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — figures are as of today, not a full {PERIOD_NOUN[grouping]}.</Text>
            )}
        </StatementCard>
    );
}

const s = StyleSheet.create({
    controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
    expandAll: { fontSize: 12, fontWeight: '700', color: Colors.primary },
    toggleRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, alignSelf: 'flex-start', gap: 2 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    tableWrap: { flexDirection: 'row' },
    scrollArea: { flex: 1 },
    headerRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: Colors.textPrimary },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    subtotalRow: { borderTopWidth: 1, borderTopColor: Colors.border },
    totalRow: { borderTopWidth: 2, borderTopColor: Colors.textPrimary, marginTop: 2 },
    cell: { width: 112, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelCell: { width: 210, alignItems: 'flex-start' },
    rowLabelIndent: { paddingLeft: 16 },
    rowLabelHeader: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    rowLabelBold: { fontWeight: '700', color: Colors.textPrimary },
    rowLabelMuted: { color: Colors.textMuted, fontStyle: 'italic', fontSize: 11.5 },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valBold: { fontWeight: '700' },
    valMuted: { color: Colors.textMuted, fontStyle: 'italic', fontSize: 11.5 },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
