import React, { useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, StyleSheet,
    TouchableOpacity, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { getTopCategories } from '../utils/finance';
import { generateSwot } from '../utils/swot';
import { SwotItem } from '../types';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

if (Platform.OS === 'android') {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Derive prioritised actions from SWOT data ────────────────────────────────

interface ActionItem {
    urgency: 'urgent' | 'important' | 'opportunity';
    title: string;
    detail: string;
    metric?: string;
    source: 'weakness' | 'threat' | 'opportunity' | 'strength';
}

function deriveActions(
    swot: ReturnType<typeof generateSwot>,
    currency: string,
): ActionItem[] {
    const actions: ActionItem[] = [];

    // Threats → urgent actions
    swot.threats.forEach((item: SwotItem) => {
        if (item.text.includes('critically low') || item.text.includes('net loss') || item.text.includes('overdue payable')) {
            actions.push({
                urgency: 'urgent',
                title: extractTitle(item.text),
                detail: item.text,
                metric: item.metric,
                source: 'threat',
            });
        }
    });

    // Weaknesses → important actions
    swot.weaknesses.forEach((item: SwotItem) => {
        if (!item.text.includes('Log more')) {
            actions.push({
                urgency: 'important',
                title: extractTitle(item.text),
                detail: item.text,
                metric: item.metric,
                source: 'weakness',
            });
        }
    });

    // Remaining threats not already captured
    swot.threats.forEach((item: SwotItem) => {
        const alreadyAdded = actions.some(a => a.detail === item.text);
        if (!alreadyAdded) {
            actions.push({
                urgency: 'important',
                title: extractTitle(item.text),
                detail: item.text,
                metric: item.metric,
                source: 'threat',
            });
        }
    });

    // Opportunities → opportunity actions
    swot.opportunities.forEach((item: SwotItem) => {
        if (!item.text.includes('expand transaction')) {
            actions.push({
                urgency: 'opportunity',
                title: extractTitle(item.text),
                detail: item.text,
                metric: item.metric,
                source: 'opportunity',
            });
        }
    });

    return actions;
}

export function extractTitle(text: string): string {
    // Truncate at a word boundary, never at punctuation — every currency
    // amount here goes through toLocaleString(), which inserts thousands-
    // separator commas (e.g. "₦95,000"), and phrases like "e.g." contain
    // periods too. Splitting on the first comma/period (the previous
    // approach) cut titles off mid-number or mid-word — "Collecting the
    // ₦95,000 in outstanding receivables..." became just "Collecting the
    // ₦95", and "...income categories (e.g., consulting...)" became
    // "...income categories (e".
    const LIMIT = 70;
    if (text.length <= LIMIT) return text;
    const truncated = text.slice(0, LIMIT);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

const URGENCY_CONFIG: Record<ActionItem['urgency'], { label: string; color: string; bg: string; icon: IconName }> = {
    urgent: { label: 'URGENT', color: Colors.expense, bg: 'rgba(239,68,68,0.1)', icon: 'alert-circle' },
    important: { label: 'IMPORTANT', color: Colors.warning, bg: 'rgba(245,158,11,0.1)', icon: 'alert-triangle' },
    opportunity: { label: 'OPPORTUNITY', color: Colors.income, bg: 'rgba(16,185,129,0.1)', icon: 'trending-up' },
};

const SOURCE_LABELS = {
    threat: 'Threat identified',
    weakness: 'Weakness identified',
    opportunity: 'Opportunity identified',
    strength: 'Leverage strength',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
    const { finance, settings, transactions, setCurrentScreen, navigate } = useApp();
    const { currency, targetMargin, minReserve } = settings;

    const [swotExpanded, setSwotExpanded] = useState(true);
    const [expandedAction, setExpandedAction] = useState<number | null>(null);

    const topExpenses = useMemo(() => getTopCategories(transactions, 'expense', 5), [transactions]);
    const topIncome   = useMemo(() => getTopCategories(transactions, 'income', 5), [transactions]);

    const marginDiff = (isNaN(finance.margin) ? 0 : finance.margin) - (parseFloat(targetMargin) || 0);
    const reserveOk = finance.cashBalance >= parseFloat(minReserve);

    const { pendingAR, pendingAP, totalAR, totalAP, recurringCount, overdueCount } = useMemo(() => {
        const ar = transactions.filter(t => t.type === 'income' && (t.status === 'pending' || t.status === 'overdue'));
        const ap = transactions.filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue'));
        return {
            pendingAR: ar,
            pendingAP: ap,
            totalAR: ar.reduce((s, t) => s + t.amount, 0),
            totalAP: ap.reduce((s, t) => s + t.amount, 0),
            recurringCount: transactions.filter(t => t.isRecurring).length,
            overdueCount: transactions.filter(t => t.status === 'overdue').length,
        };
    }, [transactions]);

    const swot = useMemo(
        () => generateSwot(finance, transactions, settings),
        [finance, transactions, settings]
    );

    const actions = useMemo(() => deriveActions(swot, currency), [swot, currency]);

    const urgentCount = actions.filter(a => a.urgency === 'urgent').length;
    const importantCount = actions.filter(a => a.urgency === 'important').length;
    const opportunityCount = actions.filter(a => a.urgency === 'opportunity').length;

    const toggleAction = (i: number) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedAction(prev => (prev === i ? null : i));
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Financial Insights</Text>

                    {/* Quick stat cards */}
                    <View style={styles.statRow}>
                        <StatCard label="Outstanding AR" value={`${currency}${totalAR.toLocaleString()}`} sub={`${pendingAR.length} invoices`} color={Colors.income} />
                        <StatCard label="Outstanding AP" value={`${currency}${totalAP.toLocaleString()}`} sub={`${pendingAP.length} bills`} color={Colors.expense} />
                    </View>
                    <View style={styles.statRow}>
                        <StatCard label="Recurring Entries" value={`${recurringCount}`} sub="auto-tracked" color={Colors.primary} />
                        <StatCard label="Overdue Items" value={`${overdueCount}`} sub="need attention" color={overdueCount > 0 ? Colors.expense : Colors.income} />
                    </View>

                    {overdueCount > 0 && (
                        <TouchableOpacity
                            style={styles.alertBanner}
                            onPress={() => navigate('reports', { reportSection: 'customers', reportTab: 'aging' })}
                        >
                            <Icon name="alert-triangle" size={14} color={Colors.expense} />
                            <Text style={styles.alertText}>
                                {overdueCount} overdue transaction{overdueCount > 1 ? 's' : ''} — tap to view AR/AP Aging
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* ── SWOT Action Plan ─────────────────────────────────── */}
                    <TouchableOpacity
                        style={styles.swotHeader}
                        onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setSwotExpanded(e => !e);
                        }}
                        activeOpacity={0.8}
                    >
                        <View>
                            <View style={styles.swotHeaderTitleRow}>
                                <Icon name="search" size={16} color={Colors.textPrimary} />
                                <Text style={styles.swotHeaderTitle}>SWOT Action Plan</Text>
                            </View>
                            <Text style={styles.swotHeaderSub}>
                                Personalised actions derived from your live financial data
                            </Text>
                        </View>
                        <Icon name={swotExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                    </TouchableOpacity>

                    {swotExpanded && (
                        <View style={styles.swotBody}>
                            {/* Action count summary */}
                            <View style={styles.actionSummaryRow}>
                                <ActionBadge count={urgentCount} label="Urgent" color={Colors.expense} />
                                <ActionBadge count={importantCount} label="Important" color={Colors.warning} />
                                <ActionBadge count={opportunityCount} label="Opportunity" color={Colors.income} />
                            </View>

                            <Text style={styles.actionListTitle}>Your Action List</Text>

                            {actions.length === 0 && (
                                <Text style={styles.empty}>Log more transactions to generate your personalised action plan.</Text>
                            )}

                            {actions.map((action, i) => {
                                const cfg = URGENCY_CONFIG[action.urgency];
                                const isOpen = expandedAction === i;
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[styles.actionCard, { borderLeftColor: cfg.color, backgroundColor: isOpen ? cfg.bg : Colors.surface }]}
                                        onPress={() => toggleAction(i)}
                                        activeOpacity={0.85}
                                    >
                                        <View style={styles.actionTop}>
                                            <View style={styles.actionLeft}>
                                                <View style={styles.actionIcon}>
                                                    <Icon name={cfg.icon} size={16} color={cfg.color} />
                                                </View>
                                                <View style={styles.actionTitleBlock}>
                                                    <View style={[styles.urgencyPill, { backgroundColor: cfg.bg }]}>
                                                        <Text style={[styles.urgencyLabel, { color: cfg.color }]}>{cfg.label}</Text>
                                                    </View>
                                                    <Text style={styles.actionTitle}>{action.title}</Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.expandIcon, { color: cfg.color }]}>{isOpen ? '−' : '+'}</Text>
                                        </View>

                                        {isOpen && (
                                            <View style={styles.actionExpanded}>
                                                <Text style={styles.actionDetail}>{action.detail}</Text>
                                                {action.metric && (
                                                    <View style={[styles.metricPill, { backgroundColor: cfg.bg, borderColor: cfg.color + '44' }]}>
                                                        <Text style={[styles.metricText, { color: cfg.color }]}>{action.metric}</Text>
                                                    </View>
                                                )}
                                                <View style={styles.sourceRow}>
                                                    <View style={styles.sourceLabelRow}>
                                                        <Icon name="bookmark" size={11} color={Colors.textMuted} />
                                                        <Text style={styles.sourceLabel}>{SOURCE_LABELS[action.source]}</Text>
                                                    </View>
                                                    {action.source === 'opportunity' && (
                                                        <TouchableOpacity onPress={() => navigate('goals', { goalType: 'custom' })}>
                                                            <Text style={styles.goalLink}>Set a goal →</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Link to full SWOT */}
                            <TouchableOpacity
                                style={styles.fullSwotBtn}
                                onPress={() => setCurrentScreen('financial-assessment')}
                            >
                                <Text style={styles.fullSwotText}>View full SWOT Analysis in Reports →</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ── Performance ─────────────────────────────────────── */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Performance Overview</Text>
                        <Row label="Current Margin" value={`${(isNaN(finance.margin) ? 0 : finance.margin).toFixed(2)}%`} valueStyle={(isNaN(finance.margin) ? 0 : finance.margin) >= (parseFloat(targetMargin) || 0) ? styles.green : styles.red} />
                        <Row label="Target Margin" value={`${targetMargin}%`} valueStyle={styles.normal} />
                        <Row label="Difference" value={`${marginDiff >= 0 ? '+' : ''}${marginDiff.toFixed(2)}%`} valueStyle={marginDiff >= 0 ? styles.green : styles.red} />
                    </View>

                    {/* ── Cash Reserve Check ───────────────────────────────── — the
                        raw income/expense/cash-balance figures this card used to
                        headline were an exact repeat of Dashboard's numbers.
                        What's actually unique here is the reserve threshold check
                        against your Settings target, so that's all that's left. */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Cash Reserve Check</Text>
                        <Row label="Min. Reserve Target" value={`${currency}${minReserve}`} valueStyle={styles.normal} />
                        <View style={[styles.badge, reserveOk ? styles.badgeGreen : styles.badgeRed]}>
                            <Text style={styles.badgeText}>{reserveOk ? 'Reserve threshold met' : 'Below minimum reserve'}</Text>
                        </View>
                    </View>

                    {/* ── Tax ──────────────────────────────────────────────── */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Tax Position</Text>
                        <Row label="Tax Collected" value={`${currency}${finance.totalTaxCollected.toLocaleString()}`} valueStyle={styles.yellow} />
                        <Row label="Tax Paid" value={`${currency}${finance.totalTaxPaid.toLocaleString()}`} valueStyle={styles.yellow} />
                        <Row label="Net Tax Position" value={`${finance.netTaxPosition >= 0 ? '+' : ''}${currency}${finance.netTaxPosition.toLocaleString()}`} valueStyle={finance.netTaxPosition >= 0 ? styles.green : styles.red} />
                        <TouchableOpacity onPress={() => navigate('reports', { reportSection: 'tax', reportTab: 'tax' })}>
                            <Text style={styles.linkText}>View full Tax Summary →</Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Balance Sheet ─────────────────────────────────────── — was a
                        full repeat of Reports > What I Own & Owe with no new
                        framing; that's the balance sheet's actual home, so this is
                        now just a link to it instead of a third copy of the numbers. */}
                    <TouchableOpacity
                        style={styles.fullSwotBtn}
                        onPress={() => navigate('reports', { reportSection: 'statements', reportTab: 'balancesheet' })}
                    >
                        <Text style={styles.fullSwotText}>See full balance sheet (assets, liabilities, equity) →</Text>
                    </TouchableOpacity>

                    {/* ── Top Expenses ─────────────────────────────────────── */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Top Expense Categories</Text>
                        {topExpenses.length === 0 && <Text style={styles.empty}>No expense transactions yet.</Text>}
                        {topExpenses.map(({ category, amount }) => (
                            <Row key={category} label={category} value={`${currency}${amount.toLocaleString()}`} valueStyle={styles.red} />
                        ))}
                    </View>

                    {/* ── Income Sources ────────────────────────────────────── */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Income Sources</Text>
                        {topIncome.length === 0 && <Text style={styles.empty}>No income transactions yet.</Text>}
                        {topIncome.map(({ category, amount }) => (
                            <Row key={category} label={category} value={`${currency}${amount.toLocaleString()}`} valueStyle={styles.green} />
                        ))}
                    </View>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBadge({ count, label, color }: { count: number; label: string; color: string }) {
    return (
        <View style={[badgeStyles.box, { borderColor: color + '55', backgroundColor: color + '15' }]}>
            <Text style={[badgeStyles.count, { color }]}>{count}</Text>
            <Text style={[badgeStyles.label, { color }]}>{label}</Text>
        </View>
    );
}

const badgeStyles = StyleSheet.create({
    box: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1 },
    count: { fontSize: 20, fontWeight: 'bold' },
    label: { fontSize: 10, fontWeight: '600', marginTop: 2 },
});

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
    return (
        <View style={[statStyles.card, { borderTopColor: color }]}>
            <Text style={statStyles.label}>{label}</Text>
            <Text style={[statStyles.value, { color }]}>{value}</Text>
            <Text style={statStyles.sub}>{sub}</Text>
        </View>
    );
}

const statStyles = StyleSheet.create({
    card: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderTopWidth: 3 },
    label: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    value: { fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
    sub: { fontSize: 10, color: Colors.textMuted },
});

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle: object }) {
    return (
        <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={[rowStyles.value, valueStyle]}>{value}</Text>
        </View>
    );
}

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
    value: { fontSize: 14, fontWeight: '600' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    alertBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1,
        borderColor: Colors.expense, borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md,
    },
    alertText: { flex: 1, color: Colors.expense, fontSize: 13, fontWeight: '600' },

    // SWOT action plan
    swotHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 0,
        borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        borderWidth: 1, borderColor: Colors.border, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    swotHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swotHeaderTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
    swotHeaderSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    swotBody: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
        borderTopLeftRadius: 0, borderTopRightRadius: 0, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.border, borderTopWidth: 0,
        ...Shadow.sm,
    },
    actionSummaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    actionListTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    actionCard: {
        borderRadius: 10, borderLeftWidth: 4, padding: Spacing.md, marginBottom: Spacing.sm,
    },
    actionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    actionLeft: { flexDirection: 'row', flex: 1, gap: 10, alignItems: 'flex-start' },
    actionIcon: { marginTop: 2 },
    actionTitleBlock: { flex: 1 },
    urgencyPill: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
    urgencyLabel: { fontSize: 9, fontWeight: 'bold' },
    actionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, lineHeight: 18 },
    expandIcon: { fontSize: 20, fontWeight: 'bold', marginLeft: 8 },
    actionExpanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    actionDetail: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.sm },
    metricPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, marginBottom: Spacing.sm },
    metricText: { fontSize: 11, fontWeight: '600' },
    sourceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sourceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sourceLabel: { fontSize: 11, color: Colors.textMuted },
    goalLink: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
    fullSwotBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
    fullSwotText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },

    // Shared
    card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.md },
    green: { color: Colors.income },
    red: { color: Colors.expense },
    blue: { color: Colors.asset },
    orange: { color: Colors.liability },
    purple: { color: Colors.equity },
    yellow: { color: Colors.warning },
    normal: { color: Colors.textSecondary },
    note: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 8 },
    empty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
    badge: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' },
    badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
    badgeRed: { backgroundColor: 'rgba(239,68,68,0.15)' },
    badgeText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
    linkText: { color: Colors.primary, fontSize: 12, marginTop: 10 },
});
