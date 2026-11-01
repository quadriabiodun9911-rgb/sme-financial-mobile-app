/**
 * The periodic Accounts Receivable report an accountant would prepare
 * weekly or monthly: total outstanding, the overdue portion, who's
 * collected during the period (invoices only -- see
 * computeReceivablesReport's own comment on why a plain Transaction's paid
 * status can't honestly be counted here), which customers carry the
 * largest outstanding balances, what's expected to come in soon, and the
 * IFRS for SMEs Section 11.21 period-end impairment review queue: every
 * receivable old enough (90+ days) to show objective evidence of
 * impairment, split into ones still awaiting that assessment (actionable
 * here, right from this list) and ones already provisioned. Every figure
 * comes from computeAgingBuckets' own outstanding-receivables source, so
 * this can never disagree with the Aging Report below it on this screen.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { computeReceivablesReport } from '../utils/finance';
import { localDateStr } from '../utils/localDate';
import { Transaction } from '../types';
import { Colors } from '../theme/colors';
import { Radius, Spacing, Shadow } from '../theme/tokens';
import BarList from './BarList';
import ReceivableActionModal, { ReceivableActionMode } from './ReceivableActionModal';

type Window = 'week' | 'month';

export default function ReceivablesReport() {
    const {
        transactions, invoices, settings,
        badDebtProvisions, addBadDebtProvision,
        receivableWriteOffs, writeOffReceivable,
    } = useApp();
    const { currency } = settings;
    const [windowSize, setWindowSize] = useState<Window>('month');
    const [actionModal, setActionModal] = useState<{ mode: ReceivableActionMode; tx: Transaction } | null>(null);

    const todayKey = localDateStr();
    const report = useMemo(() => {
        const days = windowSize === 'week' ? 7 : 30;
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        const periodLabel = windowSize === 'week' ? 'Last 7 Days' : 'Last 30 Days';
        return computeReceivablesReport(
            transactions, invoices, localDateStr(start), localDateStr(end), periodLabel,
            badDebtProvisions, receivableWriteOffs
        );
    }, [transactions, invoices, windowSize, todayKey, badDebtProvisions, receivableWriteOffs]);

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    const openAction = (mode: ReceivableActionMode, transactionId: string) => {
        const tx = transactions.find(t => t.id === transactionId);
        if (tx) setActionModal({ mode, tx });
    };

    if (report.totalOutstanding <= 0) {
        return (
            <View style={styles.card}>
                <Text style={styles.title}>Receivables Report</Text>
                <Text style={styles.emptyText}>No outstanding receivables right now -- nothing to report.</Text>
            </View>
        );
    }

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>Receivables Report</Text>
                <View style={styles.toggleRow}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, windowSize === 'week' && styles.toggleBtnActive]}
                        onPress={() => setWindowSize('week')}
                    >
                        <Text style={[styles.toggleText, windowSize === 'week' && styles.toggleTextActive]}>Week</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, windowSize === 'month' && styles.toggleBtnActive]}
                        onPress={() => setWindowSize('month')}
                    >
                        <Text style={[styles.toggleText, windowSize === 'month' && styles.toggleTextActive]}>Month</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.statRow}>
                <View style={styles.statTile}>
                    <Text style={styles.statLabel}>Total Outstanding</Text>
                    <Text style={styles.statValue}>{fmt(report.totalOutstanding)}</Text>
                </View>
                <View style={styles.statTile}>
                    <Text style={styles.statLabel}>Overdue</Text>
                    <Text style={[styles.statValue, { color: Colors.expense }]}>{fmt(report.overdueBalance)}</Text>
                </View>
                <View style={styles.statTile}>
                    <Text style={styles.statLabel}>Collected ({report.periodLabel})</Text>
                    <Text style={[styles.statValue, { color: Colors.income }]}>{fmt(report.collectedThisPeriod)}</Text>
                </View>
            </View>
            <Text style={styles.note}>
                "Collected" counts invoices marked paid in this window -- transactions entered directly as paid have no collection date to count against.
            </Text>

            {report.topDefaulters.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Major Outstanding Customers</Text>
                    <BarList
                        items={report.topDefaulters.map(c => ({
                            label: c.customer,
                            value: c.totalOutstanding,
                            displayValue: fmt(c.totalOutstanding),
                        }))}
                        color={Colors.expense}
                    />
                </View>
            )}

            {report.expectedCollections.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Expected to Collect Soon</Text>
                    {report.expectedCollections.map((item, i) => (
                        <View key={`${item.customer}-${item.dueDate}-${i}`} style={styles.listRow}>
                            <Text style={styles.listName} numberOfLines={1}>{item.customer}</Text>
                            <Text style={styles.listMeta}>due in {item.days}d</Text>
                            <Text style={[styles.listAmount, { color: Colors.income }]}>{fmt(item.amount)}</Text>
                        </View>
                    ))}
                </View>
            )}

            {report.needsReview.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Needs Review (90+ Days Overdue)</Text>
                    <Text style={styles.sectionHint}>
                        Period-end impairment check (IFRS for SMEs 11.21) -- assess each of these for objective evidence of impairment.
                    </Text>
                    {report.needsReview.map((item, i) => (
                        <View key={`${item.transactionId}-${item.dueDate}-${i}`} style={styles.reviewRow}>
                            <View style={styles.reviewInfo}>
                                <Text style={styles.listName} numberOfLines={1}>{item.customer}</Text>
                                <Text style={[styles.listMeta, { color: Colors.expense, textAlign: 'left', width: undefined }]}>
                                    {item.days}d overdue · {fmt(item.amount)}
                                </Text>
                            </View>
                            {item.hasActiveProvision ? (
                                <Text style={styles.provisionedTag}>Provisioned</Text>
                            ) : item.actionable ? (
                                <View style={styles.reviewActions}>
                                    <TouchableOpacity style={styles.reviewBtn} onPress={() => openAction('doubtful', item.transactionId)}>
                                        <Text style={styles.reviewBtnText}>Mark Doubtful</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.reviewBtnMuted} onPress={() => openAction('writeoff', item.transactionId)}>
                                        <Text style={styles.reviewBtnMutedText}>Write Off</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                        </View>
                    ))}
                </View>
            )}

            <ReceivableActionModal
                visible={!!actionModal}
                mode={actionModal?.mode ?? 'doubtful'}
                tx={actionModal?.tx ?? null}
                currency={currency}
                onClose={() => setActionModal(null)}
                onConfirmDoubtful={(amount, note) => {
                    if (!actionModal) return;
                    addBadDebtProvision(actionModal.tx.id, amount, localDateStr(), actionModal.tx.vendorCustomer, note || actionModal.tx.description);
                }}
                onConfirmWriteOff={(note) => {
                    if (!actionModal) return;
                    writeOffReceivable(actionModal.tx.id, actionModal.tx.amount ?? 0, localDateStr(), actionModal.tx.vendorCustomer, note || actionModal.tx.description);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    toggleRow: { flexDirection: 'row', gap: 6 },
    toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    toggleTextActive: { color: Colors.textPrimary },
    statRow: { flexDirection: 'row', gap: Spacing.sm },
    statTile: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: 10, gap: 4 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, fontWeight: '600' },
    statValue: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    note: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 8, lineHeight: 14 },
    section: { marginTop: 16 },
    sectionTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    sectionHint: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 10, lineHeight: 14 },
    listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    listName: { flex: 1, fontSize: 12, color: Colors.textPrimary, fontWeight: '500' },
    listMeta: { fontSize: 10.5, color: Colors.textMuted, width: 78, textAlign: 'right' },
    listAmount: { fontSize: 12, fontWeight: '700', width: 90, textAlign: 'right' },
    emptyText: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    reviewInfo: { flex: 1, gap: 2 },
    reviewActions: { flexDirection: 'row', gap: 6 },
    reviewBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 6 },
    reviewBtnText: { fontSize: 10.5, color: Colors.expense, fontWeight: '600' },
    reviewBtnMuted: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.surfaceVariant, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
    reviewBtnMutedText: { fontSize: 10.5, color: Colors.textSecondary, fontWeight: '600' },
    provisionedTag: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic' },
});
