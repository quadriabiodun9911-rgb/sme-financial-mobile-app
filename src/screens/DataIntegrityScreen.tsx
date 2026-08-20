import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { confirmAction, showAlert } from '../utils/webAlert';
import { auditDataIntegrity, ENTITY_LABELS, IntegrityIssue, IntegrityEntityType } from '../utils/dataIntegrity';

export default function DataIntegrityScreen() {
    const {
        transactions, invoices, assets, inventory, goals, loans, budgets,
        deleteTransaction, deleteInvoice, deleteAsset, deleteInventoryItem, deleteGoal, deleteLoan, deleteBudget,
    } = useApp();

    const [version, setVersion] = useState(0); // bump to force re-audit after a delete

    const issues = useMemo(
        () => auditDataIntegrity({ transactions, invoices, assets, inventory, goals, loans, budgets }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [transactions, invoices, assets, inventory, goals, loans, budgets, version]
    );

    const deleters: Record<IntegrityEntityType, (id: string) => void> = {
        transactions: deleteTransaction,
        invoices: deleteInvoice,
        assets: deleteAsset,
        inventory: deleteInventoryItem,
        goals: deleteGoal,
        loans: deleteLoan,
        budgets: deleteBudget,
    };

    const grouped = useMemo(() => {
        const map = new Map<IntegrityEntityType, IntegrityIssue[]>();
        for (const issue of issues) {
            const list = map.get(issue.entityType) ?? [];
            list.push(issue);
            map.set(issue.entityType, list);
        }
        return map;
    }, [issues]);

    const deleteOne = (issue: IntegrityIssue) => {
        confirmAction(
            'Remove This Record?',
            `"${issue.label}" can't be read after a PIN reset broke its encryption key. This can't be repaired — you'll need to re-enter it if you still have the original numbers.`,
            'Remove',
            () => { deleters[issue.entityType](issue.id); setVersion(v => v + 1); },
        );
    };

    const deleteAll = () => {
        confirmAction(
            `Remove All ${issues.length} Broken Records?`,
            'None of these can be repaired — their encryption key was lost in a past PIN reset. This removes them from your account; re-enter any you still have records of.',
            `Remove All ${issues.length}`,
            () => {
                for (const issue of issues) deleters[issue.entityType](issue.id);
                setVersion(v => v + 1);
                showAlert('Cleaned Up', 'The unreadable records have been removed.');
            },
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <Text style={styles.title}>Data Integrity Check</Text>
                <Text style={styles.subtitle}>
                    A password reset can leave a small number of records permanently unreadable if it happened before
                    this device's encryption key was fixed. This page finds them so you can clean them up — future
                    resets can no longer cause this.
                </Text>

                {issues.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Icon name="check-circle" size={28} color={Colors.income} />
                        <Text style={styles.emptyTitle}>Nothing Broken</Text>
                        <Text style={styles.emptyText}>Every record in your account decrypts cleanly on this device.</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryTitle}>
                                {issues.length} record{issues.length === 1 ? '' : 's'} can't be read
                            </Text>
                            <Text style={styles.summaryText}>
                                These were encrypted before your last PIN reset and can't be decrypted with this
                                device's current key. The underlying data isn't retrievable — removing them clears
                                the blank/zero entries you'd otherwise see across the app.
                            </Text>
                            <TouchableOpacity style={styles.deleteAllBtn} onPress={deleteAll}>
                                <Icon name="trash-2" size={15} color="#fff" />
                                <Text style={styles.deleteAllBtnText}>Remove All {issues.length}</Text>
                            </TouchableOpacity>
                        </View>

                        {[...grouped.entries()].map(([entityType, list]) => (
                            <View key={entityType} style={styles.group}>
                                <Text style={styles.groupTitle}>{ENTITY_LABELS[entityType]} ({list.length})</Text>
                                {list.map(issue => (
                                    <View key={`${issue.entityType}-${issue.id}`} style={styles.row}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rowLabel} numberOfLines={1}>{issue.label}</Text>
                                            <Text style={styles.rowFields}>
                                                Unreadable: {issue.brokenFields.join(', ')}
                                            </Text>
                                        </View>
                                        <TouchableOpacity style={styles.rowDeleteBtn} onPress={() => deleteOne(issue)}>
                                            <Icon name="trash-2" size={14} color={Colors.expense} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </>
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
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: Spacing.lg },
    emptyCard: {
        alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg,
        padding: Spacing.xl, gap: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
    summaryCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
        marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.expense + '33',
    },
    summaryTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    summaryText: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: Spacing.md },
    deleteAllBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: Colors.expense, borderRadius: Radius.md, paddingVertical: 12,
    },
    deleteAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    group: { marginBottom: Spacing.lg },
    groupTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
    row: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        borderRadius: Radius.md, padding: Spacing.md, marginBottom: 8, gap: 10,
    },
    rowLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
    rowFields: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    rowDeleteBtn: {
        width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.expense + '15',
    },
});
