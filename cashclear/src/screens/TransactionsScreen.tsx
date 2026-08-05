import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';

function naira(amount: number): string {
    const sign = amount < 0 ? '-' : '+';
    return `${sign}₦${Math.abs(amount).toLocaleString()}`;
}

export default function TransactionsScreen() {
    const { transactions, projects, activeProjectId, setActiveProjectId } = useApp();
    const commingledCount = transactions.filter((tx) => tx.isCommingled).length;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Transactions</Text>
                <Text style={styles.subtitle}>Auto-categorized from your connected wallets, banks and POS</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                <TouchableOpacity
                    style={[styles.filterChip, activeProjectId === 'all' ? styles.filterChipActive : null]}
                    onPress={() => setActiveProjectId('all')}
                >
                    <Text style={[styles.filterChipText, activeProjectId === 'all' ? styles.filterChipTextActive : null]}>All</Text>
                </TouchableOpacity>
                {projects.map((p) => (
                    <TouchableOpacity
                        key={p.id}
                        style={[styles.filterChip, activeProjectId === p.id ? styles.filterChipActive : null]}
                        onPress={() => setActiveProjectId(p.id)}
                    >
                        <Text style={[styles.filterChipText, activeProjectId === p.id ? styles.filterChipTextActive : null]}>{p.name}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {commingledCount > 0 && (
                <Card style={styles.warningCard}>
                    <Ionicons name="warning-outline" size={18} color={colors.warning} />
                    <Text style={styles.warningText}>
                        {commingledCount} transaction{commingledCount > 1 ? 's' : ''} look like personal spending on a business wallet. This hurts your Business-Personal Separation score.
                    </Text>
                </Card>
            )}

            <ScrollView contentContainerStyle={styles.list}>
                {transactions.map((tx) => (
                    <Card key={tx.id} style={[styles.txCard, tx.isCommingled ? styles.txCardFlagged : null]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.txDescription}>{tx.description}</Text>
                            <View style={styles.txMetaRow}>
                                <Text style={styles.txCategory}>{tx.category}</Text>
                                <Text style={styles.txDot}>•</Text>
                                <Text style={styles.txSource}>{tx.source}</Text>
                                <Text style={styles.txDot}>•</Text>
                                <Text style={styles.txDate}>{tx.date}</Text>
                            </View>
                            {tx.isCommingled && (
                                <View style={styles.flagRow}>
                                    <Ionicons name="flag-outline" size={12} color={colors.warning} />
                                    <Text style={styles.flagText}>Flagged: possible commingling</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.txAmount, { color: tx.amount < 0 ? colors.text : colors.success }]}>{naira(tx.amount)}</Text>
                    </Card>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: 20, paddingBottom: 12 },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    filterChipTextActive: { color: colors.background },
    warningCard: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 12, borderColor: colors.warning, alignItems: 'flex-start' },
    warningText: { color: colors.text, fontSize: 12, flex: 1, lineHeight: 17 },
    list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
    txCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    txCardFlagged: { borderColor: colors.warning },
    txDescription: { color: colors.text, fontSize: 14, fontWeight: '600' },
    txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
    txCategory: { color: colors.primary, fontSize: 11, fontWeight: '600' },
    txDot: { color: colors.textFaint, fontSize: 11 },
    txSource: { color: colors.textFaint, fontSize: 11 },
    txDate: { color: colors.textFaint, fontSize: 11 },
    flagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    flagText: { color: colors.warning, fontSize: 11 },
    txAmount: { fontSize: 14, fontWeight: '700' },
});
