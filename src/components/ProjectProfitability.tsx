import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { Transaction } from '../types';
import BarList from './BarList';
import { computeProjectTagProfitability, ProjectTagProfitability as ProjectRow } from '../utils/projectTagProfitability';

interface Props {
    transactions: Transaction[];
    currency: string;
}

type SortKey = 'profit' | 'revenue' | 'cost';

export default function ProjectProfitability({ transactions, currency }: Props) {
    const [sortBy, setSortBy] = useState<SortKey>('profit');
    const summary = useMemo(() => computeProjectTagProfitability(transactions), [transactions]);

    const sortedProjects = useMemo(() => {
        const list = [...summary.projects];
        list.sort((a, b) => {
            if (sortBy === 'revenue') return b.realizedRevenue - a.realizedRevenue;
            if (sortBy === 'cost') return b.totalCost - a.totalCost;
            return b.profit - a.profit;
        });
        return list;
    }, [summary.projects, sortBy]);

    const totals = useMemo(() => ({
        revenue: summary.projects.reduce((s, p) => s + p.realizedRevenue, 0),
        pipeline: summary.projects.reduce((s, p) => s + p.pipelineRevenue, 0),
        cost: summary.projects.reduce((s, p) => s + p.totalCost, 0),
        rdCost: summary.projects.reduce((s, p) => s + p.rdCost, 0),
        profit: summary.projects.reduce((s, p) => s + p.profit, 0),
    }), [summary.projects]);

    if (summary.projects.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No projects tagged yet</Text>
                <Text style={styles.emptyText}>
                    Give a transaction (or an invoice) a Project in its "Optional Details", using the same project name
                    every time you log revenue or spend for it. This view then breaks out each project's own revenue,
                    R&D vs. commercial cost, and profit automatically.
                </Text>
                {summary.unassignedCount > 0 && (
                    <Text style={styles.emptySub}>
                        {summary.unassignedCount} untagged transaction{summary.unassignedCount === 1 ? '' : 's'} so far
                        ({currency}{summary.unassignedIncome.toLocaleString()} income, {currency}{summary.unassignedExpense.toLocaleString()} expense).
                    </Text>
                )}
            </View>
        );
    }

    return (
        <ScrollView style={styles.scroll}>
            <View style={styles.summaryRow}>
                <SummaryCard label="Realized Revenue" value={`${currency}${totals.revenue.toLocaleString()}`} color={Colors.income} />
                <SummaryCard label="Total Cost" value={`${currency}${totals.cost.toLocaleString()}`} color={Colors.expense} />
            </View>
            <View style={styles.summaryRow}>
                <SummaryCard
                    label="Net Profit"
                    value={`${totals.profit >= 0 ? '+' : ''}${currency}${totals.profit.toLocaleString()}`}
                    color={totals.profit >= 0 ? Colors.income : Colors.expense}
                />
                <SummaryCard label="Pipeline (not yet collected)" value={`${currency}${totals.pipeline.toLocaleString()}`} color={Colors.textMuted} />
            </View>

            {summary.unassignedCount > 0 && (
                <View style={styles.unassignedNote}>
                    <Text style={styles.unassignedText}>
                        {summary.unassignedCount} transaction{summary.unassignedCount === 1 ? ' is' : 's are'} not tagged to a project
                        ({currency}{summary.unassignedIncome.toLocaleString()} income, {currency}{summary.unassignedExpense.toLocaleString()} expense) — not counted above.
                    </Text>
                </View>
            )}

            <View style={styles.sortRow}>
                <TouchableOpacity style={[styles.sortBtn, sortBy === 'profit' && styles.sortBtnActive]} onPress={() => setSortBy('profit')}>
                    <Text style={[styles.sortText, sortBy === 'profit' && styles.sortTextActive]}>By Profit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sortBtn, sortBy === 'revenue' && styles.sortBtnActive]} onPress={() => setSortBy('revenue')}>
                    <Text style={[styles.sortText, sortBy === 'revenue' && styles.sortTextActive]}>By Revenue</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sortBtn, sortBy === 'cost' && styles.sortBtnActive]} onPress={() => setSortBy('cost')}>
                    <Text style={[styles.sortText, sortBy === 'cost' && styles.sortTextActive]}>By Cost</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.bestCard}>
                <Text style={styles.summaryLabel}>
                    Projects by {sortBy === 'profit' ? 'Profit' : sortBy === 'revenue' ? 'Revenue' : 'Cost'}
                </Text>
                <View style={{ marginTop: 8 }}>
                    <BarList
                        items={sortedProjects.slice(0, 8).map(p => {
                            const metricValue = sortBy === 'revenue' ? p.realizedRevenue : sortBy === 'cost' ? p.totalCost : p.profit;
                            return { label: p.project, value: metricValue, displayValue: `${metricValue < 0 ? '-' : ''}${currency}${Math.round(Math.abs(metricValue)).toLocaleString()}` };
                        })}
                    />
                </View>
            </View>

            {totals.rdCost > 0 && (
                <View style={styles.bestCard}>
                    <Text style={styles.summaryLabel}>R&D vs. Commercial Spend, All Projects</Text>
                    <RdCommercialBar rd={totals.rdCost} commercial={totals.cost - totals.rdCost} currency={currency} />
                </View>
            )}

            <View>
                {sortedProjects.map((p, idx) => (
                    <ProjectCard key={idx} project={p} currency={currency} />
                ))}
            </View>
        </ScrollView>
    );
}

function ProjectCard({ project: p, currency }: { project: ProjectRow; currency: string }) {
    const unclassified = p.rdCost === 0 && p.commercialCost === 0 && p.unclassifiedCost > 0;
    return (
        <View style={styles.projectCard}>
            <View style={styles.projectHeader}>
                <Text style={styles.projectName} numberOfLines={1}>{p.project}</Text>
                <Text style={[styles.profit, { color: p.profit >= 0 ? Colors.income : Colors.expense }]}>
                    {p.profit >= 0 ? '+' : ''}{currency}{p.profit.toLocaleString()}
                </Text>
            </View>

            <View style={styles.metricsGrid}>
                <Metric label="Revenue" value={`${currency}${p.realizedRevenue.toLocaleString()}`} color={Colors.income} />
                <Metric label="Cost" value={`${currency}${p.totalCost.toLocaleString()}`} color={Colors.expense} />
                <Metric label="Margin" value={`${p.marginPct.toFixed(1)}%`} color={p.marginPct > 30 ? Colors.income : Colors.warning} />
                <Metric label="Entries" value={String(p.transactionCount)} />
            </View>

            {p.pipelineRevenue > 0 && (
                <Text style={styles.pipelineNote}>
                    + {currency}{p.pipelineRevenue.toLocaleString()} invoiced but not yet collected
                </Text>
            )}

            {(p.rdCost > 0 || p.commercialCost > 0) && (
                <View style={styles.rdSplitWrap}>
                    <Text style={styles.rdSplitLabel}>R&D vs. Commercial spend</Text>
                    <RdCommercialBar rd={p.rdCost} commercial={p.commercialCost} currency={currency} compact />
                </View>
            )}

            {unclassified && (
                <Text style={styles.untaggedNote}>
                    {currency}{p.unclassifiedCost.toLocaleString()} of cost here has no R&D/Commercial type set yet.
                </Text>
            )}

            {p.realizedRevenue === 0 && p.pipelineRevenue === 0 && p.totalCost > 0 && (
                <Text style={styles.untaggedNote}>
                    No revenue recorded for this project yet — this is pure investment so far.
                </Text>
            )}
        </View>
    );
}

function RdCommercialBar({ rd, commercial, currency, compact }: { rd: number; commercial: number; currency: string; compact?: boolean }) {
    const total = rd + commercial;
    const rdPct = total > 0 ? (rd / total) * 100 : 0;
    return (
        <View>
            <View style={[styles.rdBarTrack, compact && styles.rdBarTrackCompact]}>
                {rdPct > 0 && <View style={[styles.rdBarFill, { width: `${rdPct}%`, backgroundColor: Colors.secondary }]} />}
            </View>
            <View style={styles.rdSplitLegendRow}>
                <Text style={styles.rdSplitLegendText}>
                    <Text style={{ color: Colors.secondary, fontWeight: '700' }}>● R&D </Text>
                    {currency}{rd.toLocaleString()} ({rdPct.toFixed(0)}%)
                </Text>
                <Text style={styles.rdSplitLegendText}>
                    <Text style={{ color: Colors.primary, fontWeight: '700' }}>● Commercial </Text>
                    {currency}{commercial.toLocaleString()} ({(100 - rdPct).toFixed(0)}%)
                </Text>
            </View>
        </View>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}

function Metric({ label, value, color = Colors.textSecondary }: { label: string; value: string; color?: string }) {
    return (
        <View style={styles.metric}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
    empty: { padding: 24, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
    emptySub: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', marginTop: 10, fontStyle: 'italic' },

    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    summaryLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
    summaryValue: { fontSize: 17, fontWeight: 'bold' },

    unassignedNote: { backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    unassignedText: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },

    sortRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    sortBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: Colors.border, alignItems: 'center' },
    sortBtnActive: { backgroundColor: Colors.primary },
    sortText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
    sortTextActive: { color: '#fff' },

    bestCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },

    projectCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: Colors.primary, ...Shadow.sm },
    projectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    projectName: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, flex: 1 },
    profit: { fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    metric: { flex: 1, minWidth: '22%', backgroundColor: Colors.bg, borderRadius: 6, padding: 8, alignItems: 'center' },
    metricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    metricValue: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
    pipelineNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
    untaggedNote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },

    rdSplitWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    rdSplitLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 },
    rdBarTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.primary + '33', overflow: 'hidden', flexDirection: 'row' },
    rdBarTrackCompact: { height: 6, borderRadius: 3 },
    rdBarFill: { height: '100%' },
    rdSplitLegendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    rdSplitLegendText: { fontSize: 10.5, color: Colors.textSecondary },
});
