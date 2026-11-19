/**
 * Liabilities Worklist card — the itemized "who/what/when" list underneath
 * the Balance Sheet's Current/Non-Current Liabilities total: every active
 * loan, every payable already in the ledger, every vendor bill still
 * awaiting review, and tax collected but not yet remitted, in one place.
 * See src/utils/liabilitiesWorklist.ts for why "needs-review" bills and
 * tax are called out as the HIDDEN half -- real money owed that isn't yet
 * reflected in the Balance Sheet's own Accounts Payable line.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { computeLiabilitiesWorklist, LiabilityKind } from '../utils/liabilitiesWorklist';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';

const KIND_LABEL: Record<LiabilityKind, string> = {
    loan: 'Loan',
    accountsPayable: 'Payable',
    billNeedsReview: 'Bill — needs review',
    tax: 'Tax owed',
};

export default function LiabilitiesWorklistCard() {
    const { loans, transactions, bills, finance, settings } = useApp();
    const { currency } = settings;

    const worklist = computeLiabilitiesWorklist(loans, transactions, bills, finance, currency);

    return (
        <View style={styles.container}>
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Everything You Owe</Text>
                <Text style={styles.summaryAmount}>{currency}{worklist.total.toLocaleString()}</Text>
                <Text style={styles.summaryHint}>{worklist.narrative}</Text>
            </View>

            {worklist.items.length === 0 ? (
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Nothing Outstanding</Text>
                    <Text style={styles.emptyText}>No active loans, payables, unreviewed bills or unpaid tax recorded right now.</Text>
                </View>
            ) : (
                worklist.items.map((item, i) => {
                    const isHidden = item.kind === 'billNeedsReview' || item.kind === 'tax';
                    const dotColor = item.daysOverdue ? Colors.expense : isHidden ? Colors.warning : Colors.textMuted;
                    return (
                        <View key={`${item.kind}-${item.label}-${i}`} style={styles.row}>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowLabel} numberOfLines={1}>{item.label}</Text>
                                <View style={styles.rowMeta}>
                                    <Text style={styles.metaText}>{KIND_LABEL[item.kind]}</Text>
                                    {item.dueDate ? <Text style={styles.metaText}>Due: {item.dueDate}</Text> : null}
                                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                                    <Text style={[styles.statusText, { color: dotColor }]}>
                                        {item.daysOverdue ? `${item.daysOverdue}d overdue` : isHidden ? 'not yet in ledger' : 'on schedule'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.rowAmount}>{currency}{item.amount.toLocaleString()}</Text>
                        </View>
                    );
                })
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    summaryCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    summaryTitle: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
    summaryAmount: { fontSize: 26, fontWeight: '800', color: Colors.expense, marginBottom: 6 },
    summaryHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
    emptyCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.income, marginBottom: 4 },
    emptyText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 12, marginBottom: Spacing.xs,
        borderWidth: 1, borderColor: Colors.border,
    },
    rowInfo: { flex: 1, marginRight: 8 },
    rowLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: Colors.textMuted },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '600' },
    rowAmount: { fontSize: 14, fontWeight: '700', color: Colors.expense },
});
