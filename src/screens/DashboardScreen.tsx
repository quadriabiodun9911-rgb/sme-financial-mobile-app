import React from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function DashboardScreen() {
    const { finance, insight, settings, goals, transactions, navigate, setCurrentScreen } = useApp();
    const { currency, targetMargin, minReserve } = settings;

    const insightBorder =
        insight.severity === 'critical' ? Colors.criticalBorder
        : insight.severity === 'warning' ? Colors.warningBorder
        : Colors.healthyBorder;

    const tagBg = insightBorder;
    const tagColor = insight.severity === 'warning' ? Colors.bg : Colors.textPrimary;

    // Live goal summary
    const activeGoals  = goals.filter(g => g.status !== 'achieved');
    const achievedGoals = goals.filter(g => g.status === 'achieved');
    const offTrack     = goals.filter(g => g.status === 'off_track' || g.status === 'at_risk');

    // Overdue count
    const overdueCount = transactions.filter(t => t.status === 'overdue').length;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                <Text style={styles.title}>Dashboard</Text>

                {/* ── Overdue alert ───────────────────────────────────────── */}
                {overdueCount > 0 && (
                    <TouchableOpacity
                        style={styles.alertBanner}
                        onPress={() => navigate('reports', { reportSection: 'operations', reportTab: 'aging' })}
                    >
                        <Text style={styles.alertText}>
                            ⚠ {overdueCount} overdue item{overdueCount > 1 ? 's' : ''} — tap to view AR/AP Aging
                        </Text>
                    </TouchableOpacity>
                )}

                {/* ── Insight card ────────────────────────────────────────── */}
                <View style={[styles.insightCard, { borderLeftColor: insightBorder }]}>
                    <View style={styles.insightHeader}>
                        <View style={[styles.tag, { backgroundColor: tagBg }]}>
                            <Text style={[styles.tagText, { color: tagColor }]}>{insight.tag}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setCurrentScreen('insights')}>
                            <Text style={styles.insightLink}>Full Insights →</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={styles.insightAction}>{insight.action}</Text>
                </View>

                {/* ── Income / Expenses ───────────────────────────────────── */}
                <View style={styles.row}>
                    <MetricCard label="Income"   value={`${currency}${finance.income.toLocaleString()}`}   color={Colors.income} />
                    <MetricCard label="Expenses" value={`${currency}${finance.expense.toLocaleString()}`}  color={Colors.expense} />
                </View>

                {/* ── Net Profit ──────────────────────────────────────────── */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Net Profit</Text>
                    <Text style={[styles.bigNum, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                    </Text>
                    <View style={styles.marginRow}>
                        <Text style={[styles.marginText, { color: finance.margin >= parseFloat(targetMargin) ? Colors.income : Colors.expense }]}>
                            {finance.margin.toFixed(2)}% margin
                        </Text>
                        <Text style={styles.marginTarget}>target {targetMargin}%</Text>
                    </View>
                </View>

                {/* ── Cash Balance ────────────────────────────────────────── */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Cash Balance</Text>
                    <Text style={[styles.bigNum, { color: Colors.income }]}>
                        {currency}{finance.cashBalance.toLocaleString()}
                    </Text>
                    <View style={styles.marginRow}>
                        <Text style={styles.hint}>Min. reserve: {currency}{minReserve}</Text>
                        <View style={[styles.reserveBadge, {
                            backgroundColor: finance.cashBalance >= parseFloat(minReserve)
                                ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        }]}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: finance.cashBalance >= parseFloat(minReserve) ? Colors.income : Colors.expense }}>
                                {finance.cashBalance >= parseFloat(minReserve) ? 'Reserve OK' : 'Below Reserve'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Tax summary ─────────────────────────────────────────── */}
                <View style={[styles.card, styles.taxRow]}>
                    <View style={styles.taxItem}>
                        <Text style={styles.taxLabel}>Tax Collected</Text>
                        <Text style={[styles.taxVal, { color: Colors.warning }]}>{currency}{finance.totalTaxCollected.toLocaleString()}</Text>
                    </View>
                    <View style={styles.taxDivider} />
                    <View style={styles.taxItem}>
                        <Text style={styles.taxLabel}>Tax Paid</Text>
                        <Text style={[styles.taxVal, { color: Colors.warning }]}>{currency}{finance.totalTaxPaid.toLocaleString()}</Text>
                    </View>
                    <View style={styles.taxDivider} />
                    <View style={styles.taxItem}>
                        <Text style={styles.taxLabel}>Net Tax</Text>
                        <Text style={[styles.taxVal, { color: finance.netTaxPosition >= 0 ? Colors.income : Colors.expense }]}>
                            {finance.netTaxPosition >= 0 ? '+' : ''}{currency}{finance.netTaxPosition.toLocaleString()}
                        </Text>
                    </View>
                </View>

                {/* ── Assets / Liabilities ────────────────────────────────── */}
                <View style={styles.row}>
                    <MetricCard label="Total Assets"       value={`${currency}${finance.assets.toLocaleString()}`}      color={Colors.asset} />
                    <MetricCard label="Total Liabilities"  value={`${currency}${finance.liabilities.toLocaleString()}`} color={Colors.liability} />
                </View>
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Owner's Equity</Text>
                    <Text style={[styles.bigNum, { color: Colors.equity }]}>
                        {currency}{finance.equity.toLocaleString()}
                    </Text>
                    <Text style={styles.hint}>Assets − Liabilities</Text>
                </View>

                {/* ── Goals quick card ────────────────────────────────────── */}
                <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('goals')}>
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>🎯</Text>
                        <View>
                            <Text style={styles.quickLabel}>Financial Goals</Text>
                            {goals.length === 0 ? (
                                <Text style={styles.quickSub}>No goals set yet — tap to add</Text>
                            ) : (
                                <Text style={styles.quickSub}>
                                    {activeGoals.length} active · {achievedGoals.length} achieved
                                    {offTrack.length > 0 ? ` · ${offTrack.length} need attention` : ''}
                                </Text>
                            )}
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                {/* ── SWOT quick card ─────────────────────────────────────── */}
                <TouchableOpacity
                    style={styles.quickCard}
                    onPress={() => navigate('reports', { reportSection: 'analysis', reportTab: 'swot' })}
                >
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>📊</Text>
                        <View>
                            <Text style={styles.quickLabel}>SWOT Analysis</Text>
                            <Text style={styles.quickSub}>Live strengths, weaknesses, opportunities & threats</Text>
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btn} onPress={() => setCurrentScreen('reports')}>
                    <Text style={styles.btnText}>View Detailed Reports</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* ── Quick-add FAB ────────────────────────────────────────────── */}
            <TouchableOpacity style={styles.fab} onPress={() => setCurrentScreen('transactions')}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            <FooterNav />
        </SafeAreaView>
    );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={[styles.card, styles.flex]}>
            <Text style={styles.cardLabel}>{label}</Text>
            <Text style={[styles.bigNum, { color, fontSize: 18 }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe:  { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad:   { padding: 16, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },
    row:   { flexDirection: 'row', gap: 12, marginBottom: 12 },
    flex:  { flex: 1 },

    alertBanner: {
        backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1,
        borderColor: Colors.expense, borderRadius: 8, padding: 10, marginBottom: 12,
    },
    alertText: { color: Colors.expense, fontSize: 12, fontWeight: '600', textAlign: 'center' },

    insightCard: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
        marginBottom: 12, borderLeftWidth: 4,
    },
    insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    tag:       { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
    tagText:   { fontSize: 10, fontWeight: 'bold' },
    insightLink: { color: Colors.primary, fontSize: 12 },
    insightTitle:  { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    insightAction: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    card:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
    cardLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    bigNum:    { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
    marginRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    marginText:  { fontSize: 12, fontWeight: '600' },
    marginTarget:{ fontSize: 11, color: Colors.textMuted },
    hint:      { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
    reserveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

    taxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    taxItem: { flex: 1, alignItems: 'center' },
    taxLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    taxVal:  { fontSize: 13, fontWeight: 'bold' },
    taxDivider: { width: 1, height: 30, backgroundColor: Colors.border },

    quickCard: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
        marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
    },
    quickCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    quickIcon:  { fontSize: 24 },
    quickLabel: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
    quickSub:   { fontSize: 11, color: Colors.textMuted },
    quickArrow: { fontSize: 22, color: Colors.textMuted },

    btn:     { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

    fab: {
        position: 'absolute', right: 20, bottom: 80,
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: Colors.income, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
    },
    fabText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
});
