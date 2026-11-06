import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { Transaction, Invoice, ReceivableWriteOff, StaffMember } from '../types';
import { computeReceivablesPayrollCashImpact } from '../utils/receivablesPayrollCashImpact';

interface Props {
    transactions: Transaction[];
    invoices: Invoice[];
    staff: StaffMember[];
    receivableWriteOffs: ReceivableWriteOff[];
    currency: string;
}

export default function ReceivablesPayrollCashImpact({ transactions, invoices, staff, receivableWriteOffs, currency }: Props) {
    const impact = useMemo(
        () => computeReceivablesPayrollCashImpact(transactions, invoices, staff, receivableWriteOffs),
        [transactions, invoices, staff, receivableWriteOffs]
    );

    const fmt = (n: number) => `${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

    if (!impact.hasReceivablesData && !impact.hasPayrollData) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No receivables or payroll data yet</Text>
                <Text style={styles.emptyText}>
                    This view compares what customers owe you against what you owe staff each month -- useful for any
                    business collecting payments over time against ongoing salary obligations (fee-based businesses,
                    schools, service providers on invoice terms). Send an invoice with a due date, or add active staff
                    under Payroll, to see it here.
                </Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.scroll}>
            <View style={styles.summaryRow}>
                <SummaryCard
                    label="Outstanding Receivables"
                    value={impact.hasReceivablesData ? fmt(impact.totalOutstandingReceivables) : '—'}
                    color={Colors.income}
                />
                <SummaryCard
                    label="Monthly Payroll"
                    value={impact.hasPayrollData ? fmt(impact.monthlyPayrollObligation) : '—'}
                    color={Colors.expense}
                />
            </View>

            {impact.hasReceivablesData && (
                <View style={styles.bestCard}>
                    <Text style={styles.summaryLabel}>Receivables Breakdown</Text>
                    <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Expected soon (current)</Text>
                        <Text style={[styles.breakdownValue, { color: Colors.income }]}>{fmt(impact.currentReceivables)}</Text>
                    </View>
                    <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Overdue</Text>
                        <Text style={[styles.breakdownValue, { color: impact.overdueReceivables > 0 ? Colors.expense : Colors.textMuted }]}>
                            {fmt(impact.overdueReceivables)}
                        </Text>
                    </View>
                </View>
            )}

            {impact.hasPayrollData && (
                <View style={styles.bestCard}>
                    <Text style={styles.summaryLabel}>Payroll Obligation</Text>
                    <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Active staff</Text>
                        <Text style={styles.breakdownValue}>{impact.activeStaffCount}</Text>
                    </View>
                    <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Total monthly cost</Text>
                        <Text style={[styles.breakdownValue, { color: Colors.expense }]}>{fmt(impact.monthlyPayrollObligation)}</Text>
                    </View>
                </View>
            )}

            {impact.hasReceivablesData && impact.hasPayrollData ? (
                <View style={[styles.impactCard, { borderColor: impact.netImpact >= 0 ? Colors.income + '55' : Colors.expense + '55' }]}>
                    <Text style={styles.summaryLabel}>What This Means</Text>
                    <Text style={[styles.impactValue, { color: impact.netImpact >= 0 ? Colors.income : Colors.expense }]}>
                        {impact.netImpact >= 0 ? '+' : '-'}{fmt(impact.netImpact)}
                    </Text>
                    <Text style={styles.impactText}>
                        {impact.netImpact >= 0
                            ? `If everything currently owed to you were collected, it would cover this month's payroll with ${fmt(impact.netImpact)} to spare.`
                            : `If everything currently owed to you were collected, it would still fall ${fmt(impact.netImpact)} short of this month's payroll. ` +
                              (impact.overdueReceivables > 0
                                  ? `${fmt(impact.overdueReceivables)} of what's owed is already overdue -- collecting that first closes part of the gap.`
                                  : 'Collection timing matters more than usual this period.')}
                    </Text>
                </View>
            ) : (
                <View style={styles.partialNote}>
                    <Text style={styles.partialNoteText}>
                        {!impact.hasReceivablesData
                            ? 'No outstanding receivables recorded, so there\'s nothing to compare payroll against yet.'
                            : 'No active staff with a salary recorded, so there\'s no payroll obligation to compare receivables against yet.'}
                    </Text>
                </View>
            )}
        </ScrollView>
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

const styles = StyleSheet.create({
    scroll: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
    empty: { padding: 24, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },

    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    summaryLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
    summaryValue: { fontSize: 17, fontWeight: 'bold' },

    bestCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    breakdownLabel: { fontSize: 12.5, color: Colors.textSecondary },
    breakdownValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

    impactCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1.5, ...Shadow.sm },
    impactValue: { fontSize: 20, fontWeight: 'bold', marginVertical: 4 },
    impactText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    partialNote: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    partialNoteText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
});
