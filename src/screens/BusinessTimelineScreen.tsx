import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon, { IconName } from '../components/ui/Icon';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeBusinessTimeline, TimelineEventType } from '../utils/businessTimeline';
import { loadRecentAuditLogs, AuditLogRecord } from '../utils/auditLog';
import { computeOutcomeMetricsRollup, describeMetricChange } from '../utils/outcomeMetricsRollup';

const EVENT_META: Record<TimelineEventType, { icon: IconName; color: string }> = {
    account_created: { icon: 'flag', color: Colors.primary },
    score_change: { icon: 'activity', color: Colors.textSecondary },
    loan_taken: { icon: 'dollar-sign', color: Colors.textSecondary },
    loan_repaid: { icon: 'check-circle', color: Colors.income },
    goal_created: { icon: 'target', color: Colors.textSecondary },
    tactic_outcome: { icon: 'trending-up', color: Colors.textSecondary },
    team_invite: { icon: 'users', color: Colors.textSecondary },
};

function formatEventDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function monthLabel(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function BusinessTimelineScreen() {
    const { transactions, loans, goals, readinessHistory, settings, user, invoices, inventory } = useApp();
    const currency = settings?.currency ?? '₦';
    const [auditEntries, setAuditEntries] = useState<AuditLogRecord[]>([]);

    useEffect(() => {
        let cancelled = false;
        loadRecentAuditLogs(50).then(rows => { if (!cancelled) setAuditEntries(rows); });
        return () => { cancelled = true; };
    }, []);

    const events = useMemo(
        () => computeBusinessTimeline(transactions, loans, goals, readinessHistory, currency, user?.createdAt, auditEntries),
        [transactions, loans, goals, readinessHistory, currency, user?.createdAt, auditEntries],
    );

    // "Proving value" -- real outcome deltas since this business started
    // tracking, not vanity engagement metrics. See outcomeMetricsRollup.ts.
    const rollup = useMemo(
        () => computeOutcomeMetricsRollup(transactions, loans, invoices, inventory, readinessHistory),
        [transactions, loans, invoices, inventory, readinessHistory],
    );
    const outcomeLines = useMemo(() => {
        if (!rollup.hasEnoughHistory) return [];
        return [
            describeMetricChange(rollup.revenue, currency),
            describeMetricChange(rollup.profit, currency),
            describeMetricChange(rollup.margin),
            describeMetricChange(rollup.healthScore),
        ].filter((line): line is string => line !== null);
    }, [rollup, currency]);

    // Group consecutive events under a month header, in chronological order --
    // reads like a story ("January: ... February: ...") rather than a flat list.
    const grouped = useMemo(() => {
        const groups: { label: string; events: typeof events }[] = [];
        for (const event of events) {
            const label = monthLabel(event.date);
            const last = groups[groups.length - 1];
            if (last && last.label === label) last.events.push(event);
            else groups.push({ label, events: [event] });
        }
        return groups;
    }, [events]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <View style={styles.titleRow}>
                    <Icon name="clock" size={20} color={Colors.textPrimary} />
                    <Text style={styles.title}>Business Timeline</Text>
                </View>
                <Text style={styles.subtitle}>
                    The story of your business's finances so far — built from what's actually recorded, not a guess.
                </Text>

                {(outcomeLines.length > 0 || rollup.financingObtained.totalPrincipalEverTaken > 0 || rollup.current.overdueInvoiceCount > 0 || rollup.current.inventoryTurnoverRatio !== null) && (
                    <View style={styles.outcomesCard}>
                        <Text style={styles.outcomesTitle}>Real Outcomes, Not Vanity Metrics</Text>
                        {outcomeLines.length > 0 ? (
                            outcomeLines.map(line => <Text key={line} style={styles.outcomeLine}>• {line}</Text>)
                        ) : (
                            <Text style={styles.outcomeLine}>Keep tracking — trends like these show up once you have at least two months of history.</Text>
                        )}
                        {rollup.financingObtained.totalPrincipalEverTaken > 0 && (
                            <Text style={styles.outcomeLine}>
                                • Financing obtained: {currency}{Math.round(rollup.financingObtained.totalPrincipalEverTaken).toLocaleString()} total
                                ({rollup.financingObtained.activeLoanCount} active, {rollup.financingObtained.paidOffLoanCount} paid off)
                            </Text>
                        )}
                        {rollup.current.overdueInvoiceCount > 0 && (
                            <Text style={styles.outcomeLine}>
                                • Currently overdue: {currency}{Math.round(rollup.current.overdueInvoiceAmount).toLocaleString()} across {rollup.current.overdueInvoiceCount} invoice{rollup.current.overdueInvoiceCount === 1 ? '' : 's'}
                            </Text>
                        )}
                        {rollup.current.inventoryTurnoverRatio !== null && (
                            <Text style={styles.outcomeLine}>
                                • Inventory turnover: {rollup.current.inventoryTurnoverRatio.toFixed(1)}x over the last {Math.min(rollup.monthsOfHistory, 12)} month{Math.min(rollup.monthsOfHistory, 12) === 1 ? '' : 's'} (current snapshot, not yet trended over time)
                            </Text>
                        )}
                    </View>
                )}

                {events.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Icon name="clock" size={28} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No Milestones Yet</Text>
                        <Text style={styles.emptyText}>Once you have some transaction history, loans or goals, they'll show up here as a timeline.</Text>
                    </View>
                ) : (
                    grouped.map(group => (
                        <View key={group.label} style={styles.monthGroup}>
                            <Text style={styles.monthLabel}>{group.label}</Text>
                            {group.events.map(event => {
                                const meta = EVENT_META[event.type];
                                return (
                                    <View key={event.id} style={styles.row}>
                                        <View style={[styles.iconWrap, { backgroundColor: meta.color + '22' }]}>
                                            <Icon name={meta.icon} size={14} color={meta.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[
                                                styles.rowTitle,
                                                event.positive === true && { color: Colors.income },
                                                event.positive === false && { color: Colors.expense },
                                            ]}>{event.title}</Text>
                                            {!!event.detail && <Text style={styles.rowDetail}>{event.detail}</Text>}
                                            <Text style={styles.rowDate}>{formatEventDate(event.date)}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ))
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100, width: '100%', maxWidth: 560, alignSelf: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: Spacing.lg },
    outcomesCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg,
        borderWidth: 1, borderColor: Colors.border,
    },
    outcomesTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
    outcomeLine: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 3 },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    monthGroup: { marginBottom: Spacing.lg },
    monthLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: Spacing.sm, textTransform: 'uppercase' },
    row: {
        flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface,
        borderRadius: Radius.md, padding: Spacing.md, marginBottom: 8, gap: 10,
    },
    iconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    rowTitle: { fontSize: 13.5, color: Colors.textPrimary, fontWeight: '700' },
    rowDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
    rowDate: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});
