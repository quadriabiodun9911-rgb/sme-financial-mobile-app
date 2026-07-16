import React, { useMemo, useState } from 'react';
import {
    ScrollView, View, Text,
    TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeCashFlowForecast } from '../utils/finance';
import NextStepLink from '../components/NextStepLink';

type Tab = 'forecast' | 'runway' | 'ar';

export default function CashFlowScreen() {
    const { transactions, loans, invoices, budgets, finance, settings, setCurrentScreen } = useApp();
    const [tab, setTab] = useState<Tab>('forecast');
    const sym = settings.currency || '₦';

    const fmt = (n: number) => {
        const abs = Math.abs(n);
        const s = abs >= 1_000_000
            ? (abs / 1_000_000).toFixed(1) + 'M'
            : abs >= 1_000 ? (abs / 1_000).toFixed(0) + 'K'
            : abs.toFixed(0);
        return (n < 0 ? '-' : '') + sym + s;
    };

    // 90-day weekly cash flow forecast
    const weeks = useMemo(() => computeCashFlowForecast(transactions, loans, invoices, budgets), [transactions, loans, invoices, budgets]);
    const usesBudget = weeks.some(w => w.usedBudget);

    // Cash runway
    const { runwayDays, dailyBurn, cashBalance } = useMemo(() => {
        const last30 = new Date(); last30.setDate(last30.getDate() - 30);
        const l30 = last30.toISOString().split('T')[0];
        const burn30 = transactions
            .filter(t => t.type === 'expense' && t.status === 'paid' && t.date >= l30)
            .reduce((s, t) => s + t.amount, 0);
        const daily = burn30 / 30;
        const bal = finance.cashBalance;
        const runway = daily > 0 ? Math.floor(bal / daily) : 999;
        return { runwayDays: runway, dailyBurn: daily, cashBalance: bal };
    }, [transactions, finance.cashBalance]);

    const runwayColor = runwayDays < 30 ? Colors.expense : runwayDays < 90 ? Colors.warning : Colors.income;

    // AR risk scoring — O(n) with pre-computed client history Map
    const arRisk = useMemo(() => {
        // Single pass: build overdue count per client
        const overdueByClient = new Map<string, number>();
        for (const i of invoices) {
            if (i.status === 'overdue') {
                overdueByClient.set(i.clientName, (overdueByClient.get(i.clientName) ?? 0) + 1);
            }
        }
        const now = Date.now();
        const unpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
        return unpaid.map(inv => {
            const overdueHistory = overdueByClient.get(inv.clientName) ?? 0;
            const daysUntilDue = inv.dueDate
                ? Math.ceil((new Date(inv.dueDate).getTime() - now) / 86400000)
                : null;
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
            const risk: 'high' | 'medium' | 'low' = isOverdue || overdueHistory > 0 ? 'high'
                : daysUntilDue !== null && daysUntilDue <= 7 ? 'medium' : 'low';
            return { inv, daysUntilDue, risk };
        }).sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.risk] - order[b.risk];
        });
    }, [invoices]);

    const totalAR = arRisk.reduce((s, r) => s + (r.inv.total ?? 0), 0);
    const atRiskAR = arRisk.filter(r => r.risk === 'high').reduce((s, r) => s + (r.inv.total ?? 0), 0);

    // Summary metrics
    const totalInflow  = weeks.reduce((s, w) => s + w.projectedInflow, 0);
    const totalOutflow = weeks.reduce((s, w) => s + w.projectedOutflow, 0);
    const alertWeeks   = weeks.filter(w => w.alert).length;
    const maxOut = Math.max(...weeks.map(w => Math.max(w.projectedInflow, w.projectedOutflow)), 1);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* Tabs */}
            <View style={styles.tabRow}>
                {(['forecast', 'runway', 'ar'] as Tab[]).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.tab, tab === t && styles.tabActive]}
                        onPress={() => setTab(t)}
                    >
                        <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                            {t === 'forecast' ? '📅 Forecast' : t === 'runway' ? '⛽ Runway' : '📨 AR Risk'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── FORECAST TAB ── */}
                {tab === 'forecast' && (
                    <>
                        {/* Summary cards */}
                        <View style={styles.row3}>
                            <View style={styles.miniCard}>
                                <Text style={styles.miniLabel}>90-Day Inflow</Text>
                                <Text style={[styles.miniVal, { color: Colors.income }]}>{fmt(totalInflow)}</Text>
                            </View>
                            <View style={styles.miniCard}>
                                <Text style={styles.miniLabel}>90-Day Outflow</Text>
                                <Text style={[styles.miniVal, { color: Colors.expense }]}>{fmt(totalOutflow)}</Text>
                            </View>
                            <View style={styles.miniCard}>
                                <Text style={styles.miniLabel}>Alert Weeks</Text>
                                <Text style={[styles.miniVal, { color: alertWeeks > 0 ? Colors.expense : Colors.income }]}>
                                    {alertWeeks}
                                </Text>
                            </View>
                        </View>

                        {alertWeeks > 0 && (
                            <View style={styles.alertBanner}>
                                <Text style={styles.alertIcon}>⚠️</Text>
                                <Text style={styles.alertText}>
                                    {alertWeeks} week{alertWeeks > 1 ? 's' : ''} with negative projected cash flow in the next 90 days. Review your outflows or accelerate collections.
                                </Text>
                            </View>
                        )}

                        <Text style={styles.sectionTitle}>Weekly Cash Flow — Next 13 Weeks</Text>
                        {weeks.map((w, i) => {
                            const inflowPct = w.projectedInflow / maxOut;
                            const outflowPct = w.projectedOutflow / maxOut;
                            return (
                                <View key={i} style={[styles.weekRow, w.alert && styles.weekRowAlert]}>
                                    <Text style={styles.weekLabel}>{w.week}</Text>
                                    <View style={styles.barCol}>
                                        <View style={styles.barTrack}>
                                            <View style={[styles.barFill, { width: `${inflowPct * 100}%`, backgroundColor: Colors.income }]} />
                                        </View>
                                        <View style={styles.barTrack}>
                                            <View style={[styles.barFill, { width: `${outflowPct * 100}%`, backgroundColor: Colors.expense }]} />
                                        </View>
                                    </View>
                                    <View style={styles.weekNums}>
                                        <Text style={[styles.weekNet, { color: w.netCash >= 0 ? Colors.income : Colors.expense }]}>
                                            {fmt(w.netCash)}
                                        </Text>
                                        <Text style={styles.weekCumLabel}>
                                            Cum: {fmt(w.cumulativeCash)}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}

                        <View style={styles.legend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
                                <Text style={styles.legendLabel}>Projected Inflow</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
                                <Text style={styles.legendLabel}>Projected Outflow</Text>
                            </View>
                        </View>

                        <View style={styles.noteBox}>
                            <Text style={styles.noteText}>
                                💡 Inflows are based on pending invoice due dates. Outflows use your recurring expenses, active loan payments{usesBudget ? ', and this month\'s committed budget' : ''}. Add more transactions to improve accuracy.
                            </Text>
                        </View>

                        <NextStepLink
                            emphasis="button"
                            text={usesBudget ? 'This forecast reflects your budget — Review it' : 'Set a budget to sharpen this forecast'}
                            onPress={() => setCurrentScreen('budget')}
                        />
                    </>
                )}

                {/* ── RUNWAY TAB ── */}
                {tab === 'runway' && (
                    <>
                        <View style={[styles.runwayCard, { borderColor: runwayColor }]}>
                            <Text style={styles.runwayLabel}>Cash Runway</Text>
                            <Text style={[styles.runwayDays, { color: runwayColor }]}>
                                {runwayDays >= 999 ? '∞' : runwayDays} days
                            </Text>
                            <Text style={styles.runwaySub}>
                                {runwayDays < 30
                                    ? '🔴 Critical — less than 30 days of cash remaining'
                                    : runwayDays < 90
                                    ? '🟡 Caution — less than 3 months of runway'
                                    : '🟢 Healthy — more than 3 months of runway'}
                            </Text>
                        </View>

                        <View style={styles.row2}>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>Cash Balance</Text>
                                <Text style={[styles.card2Val, { color: Colors.income }]}>{fmt(cashBalance)}</Text>
                            </View>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>Daily Burn Rate</Text>
                                <Text style={[styles.card2Val, { color: Colors.expense }]}>{fmt(dailyBurn)}</Text>
                            </View>
                        </View>

                        <Text style={styles.sectionTitle}>What Affects Your Runway</Text>
                        <View style={styles.infoCard}>
                            <Text style={styles.infoRow}>📉 Reduce burn rate by cutting non-essential recurring expenses</Text>
                            <Text style={styles.infoRow}>📈 Increase inflow by accelerating invoice collections</Text>
                            <Text style={styles.infoRow}>🏦 Build a minimum 3-month cash reserve as your safety net</Text>
                            <Text style={styles.infoRow}>🔄 Review loan repayment schedule — refinancing can extend runway</Text>
                        </View>

                        <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentScreen('invoices')}>
                            <Text style={styles.actionBtnText}>Chase Outstanding Invoices →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: Colors.expense }]} onPress={() => setCurrentScreen('transactions')}>
                            <Text style={[styles.actionBtnText, { color: Colors.expense }]}>Review Recurring Expenses →</Text>
                        </TouchableOpacity>
                    </>
                )}

                {/* ── AR RISK TAB ── */}
                {tab === 'ar' && (
                    <>
                        <View style={styles.row2}>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>Total Outstanding AR</Text>
                                <Text style={[styles.card2Val, { color: Colors.income }]}>{fmt(totalAR)}</Text>
                            </View>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>At-Risk AR</Text>
                                <Text style={[styles.card2Val, { color: Colors.expense }]}>{fmt(atRiskAR)}</Text>
                            </View>
                        </View>

                        {arRisk.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Text style={styles.emptyIcon}>✅</Text>
                                <Text style={styles.emptyTitle}>No Outstanding Invoices</Text>
                                <Text style={styles.emptyText}>All invoices have been paid. Great work on collections!</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.sectionTitle}>Invoice Collection Risk</Text>
                                {arRisk.map(({ inv, daysUntilDue, risk }) => (
                                    <View key={inv.id} style={[styles.arCard, {
                                        borderLeftColor: risk === 'high' ? Colors.expense : risk === 'medium' ? Colors.warning : Colors.income
                                    }]}>
                                        <View style={styles.arTop}>
                                            <Text style={styles.arClient}>{inv.clientName}</Text>
                                            <Text style={[styles.arAmount, { color: risk === 'high' ? Colors.expense : Colors.income }]}>
                                                {fmt(inv.total)}
                                            </Text>
                                        </View>
                                        <View style={styles.arBottom}>
                                            <Text style={styles.arRef}>#{inv.invoiceNumber}</Text>
                                            <View style={[styles.riskBadge, {
                                                backgroundColor: risk === 'high' ? 'rgba(239,68,68,0.1)' : risk === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)'
                                            }]}>
                                                <Text style={[styles.riskText, {
                                                    color: risk === 'high' ? Colors.expense : risk === 'medium' ? Colors.warning : Colors.income
                                                }]}>
                                                    {risk === 'high' ? '🔴 High Risk' : risk === 'medium' ? '🟡 Due Soon' : '🟢 On Track'}
                                                </Text>
                                            </View>
                                            <Text style={styles.arDue}>
                                                {daysUntilDue === null ? '' : daysUntilDue < 0
                                                    ? `${Math.abs(daysUntilDue)}d overdue`
                                                    : `Due in ${daysUntilDue}d`}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}

                        <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentScreen('invoices')}>
                            <Text style={styles.actionBtnText}>Manage Invoices →</Text>
                        </TouchableOpacity>
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:     { flex: 1, backgroundColor: Colors.bg },
    scroll:   { padding: 16 },
    tabRow:   { flexDirection: 'row', borderBottomWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    tab:      { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive:{ borderBottomWidth: 2, borderColor: Colors.primary },
    tabLabel: { fontSize: 13, color: Colors.muted, fontWeight: '600' },
    tabLabelActive: { color: Colors.primary },

    row3:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
    miniCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
    miniLabel:{ fontSize: 10, color: Colors.muted, marginBottom: 4 },
    miniVal:  { fontSize: 14, fontWeight: '800' },

    alertBanner: { flexDirection: 'row', backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 10, padding: 12, gap: 8, marginBottom: 16, alignItems: 'flex-start' },
    alertIcon:   { fontSize: 16 },
    alertText:   { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 18 },

    sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10, marginTop: 8 },

    weekRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    weekRowAlert: { backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: 8, padding: 4 },
    weekLabel:    { width: 52, fontSize: 11, color: Colors.muted },
    barCol:       { flex: 1, gap: 3 },
    barTrack:     { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
    barFill:      { height: '100%', borderRadius: 3 },
    weekNums:     { width: 72, alignItems: 'flex-end' },
    weekNet:      { fontSize: 12, fontWeight: '700' },
    weekCumLabel: { fontSize: 10, color: Colors.muted },

    legend:       { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 12, marginBottom: 8 },
    legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot:    { width: 10, height: 10, borderRadius: 5 },
    legendLabel:  { fontSize: 12, color: Colors.muted },

    noteBox:  { backgroundColor: Colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: Colors.border, marginTop: 8 },
    noteText: { fontSize: 12, color: Colors.muted, lineHeight: 18 },

    // Runway
    runwayCard:   { backgroundColor: Colors.card, borderRadius: 16, padding: 24, borderWidth: 2, marginBottom: 16, alignItems: 'center' },
    runwayLabel:  { fontSize: 13, color: Colors.muted, marginBottom: 8 },
    runwayDays:   { fontSize: 52, fontWeight: '900' },
    runwaySub:    { fontSize: 13, color: Colors.muted, marginTop: 8, textAlign: 'center' },

    row2:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
    card2: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
    card2Label: { fontSize: 11, color: Colors.muted, marginBottom: 4 },
    card2Val:   { fontSize: 18, fontWeight: '800' },

    infoCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 16, gap: 10 },
    infoRow:  { fontSize: 13, color: Colors.muted, lineHeight: 18 },

    actionBtn: { backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

    // AR Risk
    arCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, marginBottom: 10 },
    arTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    arClient: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
    arAmount: { fontSize: 14, fontWeight: '800' },
    arBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    arRef:    { fontSize: 11, color: Colors.muted },
    riskBadge:{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    riskText: { fontSize: 11, fontWeight: '700' },
    arDue:    { fontSize: 11, color: Colors.muted, marginLeft: 'auto' },

    emptyBox:   { alignItems: 'center', paddingVertical: 40 },
    emptyIcon:  { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 6 },
    emptyText:  { fontSize: 14, color: Colors.muted, textAlign: 'center' },
});
