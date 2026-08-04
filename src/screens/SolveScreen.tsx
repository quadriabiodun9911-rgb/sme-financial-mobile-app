import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeMonthlyBaseline } from '../utils/analysis';
import { computeCashRunway } from '../utils/cashRunway';
import { computeDSCR } from '../utils/finance';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';

interface AnswerLine { label: string; value: string; color?: string }

interface ProblemEntry {
    emoji: string;
    prompt: string;
    detail: string;
    screen: string;
    params?: Record<string, unknown>;
    seeMoreLabel: string;
}

// Problem-first entry point: instead of asking a first-time owner to map
// "I have a cash problem" onto which of six pillars, a DNA screen, a
// Forecast screen, Analysis, and Reports actually answers it, this lets
// them say the problem in their own words and get the actual answer right
// here — the real numbers, not just a link to go find them. "See full
// breakdown" still routes to the deeper existing screen for the full
// picture, but tapping the question itself has to answer the question.
//
// These are the actual questions the app is built to keep answering — not
// an arbitrary list of problem phrasings. Every screen in the app exists
// to answer one of these; this front door just says so directly, since
// that's the one place in the UI whose entire job is to ask the business
// owner "what's on your mind" and hand back the real answer.
const PROBLEMS: ProblemEntry[] = [
    { emoji: '💰', prompt: 'Am I making money?', detail: 'Profit, revenue, margins, expenses.', screen: 'analysis', params: { tab: 'diagnosis' }, seeMoreLabel: 'See full profit & margin analysis' },
    { emoji: '💵', prompt: 'Will I run out of cash?', detail: 'Cash flow, runway, receivables, upcoming obligations.', screen: 'cashflow', seeMoreLabel: 'See 13-week cash flow forecast' },
    { emoji: '📦', prompt: 'Where is my money tied up?', detail: 'Inventory, customers owing, assets, deposits.', screen: 'inventory', seeMoreLabel: 'See full inventory breakdown' },
    { emoji: '📈', prompt: 'Is my business getting healthier?', detail: 'Growth, margins, customer concentration, operating efficiency.', screen: 'growth', seeMoreLabel: 'See full growth analysis' },
    { emoji: '🏦', prompt: 'Can I get funding?', detail: 'Funding readiness, financial history, debt capacity, documentation.', screen: 'credit-worthiness', seeMoreLabel: 'See full credit-worthiness score' },
];

export default function SolveScreen() {
    const { user, navigate, goBack, transactions, invoices, finance, inventory, loans, settings } = useApp();
    const currency = settings.currency;
    const [expanded, setExpanded] = useState<number | null>(null);

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    // Every number below is computed directly from the same free utilities
    // used elsewhere in the app (not the Pro-gated screens themselves), so
    // the actual answer to each question is available to every plan — "See
    // full breakdown" is what's behind the Analytics paywall, not the answer.
    const monthly = useMemo(() => computeMonthlyBaseline(transactions, finance), [transactions, finance]);
    const runway = useMemo(() => computeCashRunway(transactions, finance.cashBalance), [transactions, finance.cashBalance]);
    const dscr = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);
    const diagnosis = useMemo(
        () => performFinancialDiagnosis(transactions, invoices, finance.cashBalance, finance.expense || 100000, currency, loans, inventory),
        [transactions, invoices, finance, currency, loans, inventory]
    );

    const inventoryValue = useMemo(() => inventory.reduce((s, i) => s + i.quantity * i.costPrice, 0), [inventory]);

    const ANSWERS: Record<string, AnswerLine[]> = {
        'Am I making money?': [
            { label: 'Revenue (monthly avg)', value: fmt(monthly.income) },
            { label: 'Expenses (monthly avg)', value: fmt(monthly.expense) },
            { label: 'Profit', value: fmt(monthly.profit), color: monthly.profit >= 0 ? Colors.income : Colors.expense },
            { label: 'Margin', value: `${monthly.margin.toFixed(1)}%`, color: monthly.margin >= 15 ? Colors.income : Colors.warning },
        ],
        'Will I run out of cash?': [
            { label: 'Cash balance', value: fmt(finance.cashBalance) },
            { label: 'Daily burn', value: fmt(runway.dailyBurn) },
            { label: 'Runway', value: runway.runwayDays >= 999 ? '999+ days' : `${runway.runwayDays} days`, color: runway.runwayDays < 30 ? Colors.expense : runway.runwayDays < 60 ? Colors.warning : Colors.income },
        ],
        'Where is my money tied up?': [
            { label: 'Inventory value', value: fmt(inventoryValue) },
            { label: 'Owed by customers', value: fmt(diagnosis.metrics.accountsReceivable) },
            { label: 'Assets', value: fmt(finance.assets) },
        ],
        'Is my business getting healthier?': [
            { label: 'Health score', value: `${diagnosis.overallHealth}/100`, color: diagnosis.healthStatus === 'healthy' ? Colors.income : diagnosis.healthStatus === 'warning' ? Colors.warning : Colors.expense },
            { label: 'Month-over-month growth', value: `${diagnosis.metrics.monthOverMonthGrowth >= 0 ? '+' : ''}${diagnosis.metrics.monthOverMonthGrowth.toFixed(1)}%`, color: diagnosis.metrics.monthOverMonthGrowth >= 0 ? Colors.income : Colors.expense },
            { label: 'Trend', value: diagnosis.metrics.profitTrend },
        ],
        'Can I get funding?': [
            { label: 'Debt Service Coverage Ratio', value: dscr.dscr.toFixed(2), color: dscr.status === 'healthy' ? Colors.income : dscr.status === 'warning' ? Colors.warning : Colors.expense },
            { label: 'Cash runway', value: runway.runwayDays >= 999 ? '999+ days' : `${runway.runwayDays} days` },
            { label: 'Readiness', value: dscr.status === 'healthy' ? 'Lender-ready' : dscr.status === 'warning' ? 'Needs work' : 'Not ready yet', color: dscr.status === 'healthy' ? Colors.income : dscr.status === 'warning' ? Colors.warning : Colors.expense },
        ],
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={goBack}><Text style={s.back}>← Back</Text></TouchableOpacity>
                <Text style={s.title}>What can we help you solve today?</Text>
                <Text style={s.subtitle}>
                    {user?.businessName ? `${user.businessName} — tap a question for the answer, right here.` : 'Tap a question for the answer, right here.'}
                </Text>

                {PROBLEMS.map((p, i) => {
                    const isOpen = expanded === i;
                    const answer = ANSWERS[p.prompt] || [];
                    return (
                        <View key={i} style={s.card}>
                            <TouchableOpacity
                                style={s.cardHeader}
                                onPress={() => setExpanded(isOpen ? null : i)}
                                activeOpacity={0.75}
                            >
                                <Text style={s.emoji}>{p.emoji}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.prompt}>{p.prompt}</Text>
                                    <Text style={s.detail}>{p.detail}</Text>
                                </View>
                                <Text style={s.arrow}>{isOpen ? '▲' : '▼'}</Text>
                            </TouchableOpacity>

                            {isOpen && (
                                <View style={s.answerBox}>
                                    {answer.map((line, li) => (
                                        <View key={li} style={s.answerRow}>
                                            <Text style={s.answerLabel}>{line.label}</Text>
                                            <Text style={[s.answerValue, line.color ? { color: line.color } : null]}>{line.value}</Text>
                                        </View>
                                    ))}
                                    <TouchableOpacity onPress={() => navigate(p.screen, p.params)} style={s.seeMoreBtn} activeOpacity={0.75}>
                                        <Text style={s.seeMoreText}>{p.seeMoreLabel} →</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    );
                })}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },
    back: { color: Colors.primary, fontSize: 15, marginBottom: 8 },
    title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13.5, color: Colors.textSecondary, marginBottom: 18, lineHeight: 18 },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    emoji: { fontSize: 26, marginRight: 14 },
    prompt: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    detail: { fontSize: 12.5, color: Colors.textSecondary },
    arrow: { fontSize: 14, color: Colors.textSecondary, marginLeft: 8 },
    answerBox: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
    answerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    answerLabel: { fontSize: 13, color: Colors.textSecondary },
    answerValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    seeMoreBtn: { marginTop: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.primary + '15', borderRadius: 10 },
    seeMoreText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});
