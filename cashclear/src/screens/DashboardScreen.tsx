import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StatCard from '../components/StatCard';

function naira(amount: number): string {
    const sign = amount < 0 ? '-' : '';
    return `${sign}₦${Math.abs(amount).toLocaleString()}`;
}

export default function DashboardScreen() {
    const { user, totalBalance, cashFlowProjections, cashFlowAlerts, agingReceivables, creditResult } = useApp();

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.greeting}>Hi {user?.name.split(' ')[0]},</Text>
                <Text style={styles.business}>{user?.businessName}</Text>

                <Card style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Total balance across all wallets</Text>
                    <Text style={styles.balanceValue}>{naira(totalBalance)}</Text>
                    <View style={styles.scoreRow}>
                        <Ionicons name="speedometer-outline" size={16} color={colors.primary} />
                        <Text style={styles.scoreRowText}>Credit Readiness Score: {creditResult.overallScore} ({creditResult.band})</Text>
                    </View>
                </Card>

                {cashFlowAlerts.length > 0 && (
                    <View style={styles.alerts}>
                        {cashFlowAlerts.map((alert) => (
                            <Card
                                key={alert.id}
                                style={[
                                    styles.alertCard,
                                    { borderColor: alert.severity === 'critical' ? colors.danger : colors.warning },
                                ]}
                            >
                                <Ionicons
                                    name={alert.severity === 'critical' ? 'alert-circle-outline' : 'information-circle-outline'}
                                    size={18}
                                    color={alert.severity === 'critical' ? colors.danger : colors.warning}
                                />
                                <Text style={styles.alertText}>{alert.message}</Text>
                            </Card>
                        ))}
                    </View>
                )}

                <Text style={styles.sectionTitle}>Cash flow projection</Text>
                <View style={styles.statsRow}>
                    {cashFlowProjections.map((p) => (
                        <StatCard
                            key={p.daysAhead}
                            label={`${p.daysAhead} days`}
                            value={naira(p.projectedBalance)}
                            valueColor={p.shortfall ? colors.danger : colors.text}
                            sub={p.shortfall ? 'Projected shortfall' : 'On track'}
                        />
                    ))}
                </View>

                <Text style={styles.sectionTitle}>Receivables aging</Text>
                <Card>
                    {agingReceivables.map((inv, idx) => (
                        <View key={inv.id} style={[styles.invoiceRow, idx > 0 ? styles.invoiceRowBorder : null]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.invoiceClient}>{inv.client}</Text>
                                <Text style={styles.invoiceDue}>
                                    {inv.daysOverdue > 0 ? `${inv.daysOverdue} days overdue` : 'Not yet due'}
                                </Text>
                            </View>
                            <Text style={styles.invoiceAmount}>{naira(inv.amount)}</Text>
                        </View>
                    ))}
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 20, paddingBottom: 40, gap: 16 },
    greeting: { color: colors.textMuted, fontSize: 14 },
    business: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
    balanceCard: { gap: 10 },
    balanceLabel: { color: colors.textMuted, fontSize: 12 },
    balanceValue: { color: colors.text, fontSize: 30, fontWeight: '800' },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    scoreRowText: { color: colors.textMuted, fontSize: 12 },
    alerts: { gap: 10 },
    alertCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    alertText: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
    statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    invoiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    invoiceRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    invoiceClient: { color: colors.text, fontSize: 14, fontWeight: '600' },
    invoiceDue: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
    invoiceAmount: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
