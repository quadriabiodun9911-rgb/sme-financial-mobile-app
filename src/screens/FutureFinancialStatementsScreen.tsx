import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { buildFutureFinancialStatements, NO_ADJUSTMENTS, ForecastAdjustments } from '../utils/futureFinancialStatements';

type Statement = 'pnl' | 'cashflow' | 'balance';

function Row({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
    return (
        <View style={s.row}>
            <Text style={[s.rowLabel, bold && s.rowLabelBold]}>{label}</Text>
            <Text style={[s.rowValue, bold && s.rowValueBold, valueColor ? { color: valueColor } : null]}>{value}</Text>
        </View>
    );
}

function AdjustmentInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
    return (
        <View style={s.inputRow}>
            <Text style={s.inputLabel}>{label}</Text>
            <View style={s.inputWrap}>
                <TextInput
                    style={s.input}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                />
                <Text style={s.inputSuffix}>{suffix}</Text>
            </View>
        </View>
    );
}

export default function FutureFinancialStatementsScreen() {
    const { transactions, loans, finance, settings, goBack } = useApp();
    const { currency } = settings;

    const [activeStatement, setActiveStatement] = useState<Statement>('pnl');
    const [horizon, setHorizon] = useState<6 | 12>(6);
    const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);

    const [revenueGrowth, setRevenueGrowth] = useState('0');
    const [expenseGrowth, setExpenseGrowth] = useState('0');
    const [extraMonthlyCost, setExtraMonthlyCost] = useState('0');
    const [newLoanAmount, setNewLoanAmount] = useState('0');
    const [newLoanRate, setNewLoanRate] = useState('0');
    const [newLoanTerm, setNewLoanTerm] = useState('0');

    const adjustments: ForecastAdjustments = useMemo(() => ({
        revenueGrowthPctPerMonth: parseFloat(revenueGrowth) || 0,
        expenseGrowthPctPerMonth: parseFloat(expenseGrowth) || 0,
        oneOffMonthlyCostAdd: parseFloat(extraMonthlyCost) || 0,
        newLoanAmount: parseFloat(newLoanAmount) || 0,
        newLoanAnnualRatePct: parseFloat(newLoanRate) || 0,
        newLoanTermMonths: parseFloat(newLoanTerm) || 0,
    }), [revenueGrowth, expenseGrowth, extraMonthlyCost, newLoanAmount, newLoanRate, newLoanTerm]);

    const hasAdjustments = JSON.stringify(adjustments) !== JSON.stringify(NO_ADJUSTMENTS);

    const forecast = useMemo(
        () => buildFutureFinancialStatements(transactions, loans, finance, adjustments, horizon),
        [transactions, loans, finance, adjustments, horizon],
    );
    const baseline = useMemo(
        () => buildFutureFinancialStatements(transactions, loans, finance, NO_ADJUSTMENTS, horizon),
        [transactions, loans, finance, horizon],
    );

    const notEnoughData = forecast.baselineMonthsUsed === 0;
    const month = forecast.months[selectedMonthIdx];
    const baselineMonth = baseline.months[selectedMonthIdx];

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={goBack}><Text style={s.back}>← Back</Text></TouchableOpacity>
                <Text style={s.title}>🔮 Future Financial Statements</Text>
                <Text style={s.subtitle}>
                    A projection, not a guarantee — built from your recent revenue and costs, plus whatever
                    adjustments you enter below.
                </Text>

                {notEnoughData ? (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Not enough recorded history yet</Text>
                        <Text style={s.emptyText}>
                            Log at least one month of transactions so Quad360 has a real revenue and expense
                            run-rate to project forward from.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Adjust the business</Text>
                            <Text style={s.baselineNote}>
                                Baseline: {fmt(forecast.baselineMonthlyRevenue)}/mo revenue, {fmt(forecast.baselineMonthlyExpense)}/mo
                                expenses — averaged over your last {forecast.baselineMonthsUsed} recorded month{forecast.baselineMonthsUsed === 1 ? '' : 's'}.
                            </Text>
                            <AdjustmentInput label="Revenue growth" value={revenueGrowth} onChange={setRevenueGrowth} suffix="%/mo" />
                            <AdjustmentInput label="Cost growth" value={expenseGrowth} onChange={setExpenseGrowth} suffix="%/mo" />
                            <AdjustmentInput label="New monthly cost (e.g. a hire)" value={extraMonthlyCost} onChange={setExtraMonthlyCost} suffix={currency} />
                            <AdjustmentInput label="New loan amount" value={newLoanAmount} onChange={setNewLoanAmount} suffix={currency} />
                            {parseFloat(newLoanAmount) > 0 && (
                                <>
                                    <AdjustmentInput label="Loan interest rate" value={newLoanRate} onChange={setNewLoanRate} suffix="%/yr" />
                                    <AdjustmentInput label="Loan term" value={newLoanTerm} onChange={setNewLoanTerm} suffix="months" />
                                </>
                            )}

                            <View style={s.horizonRow}>
                                {([6, 12] as const).map(h => (
                                    <TouchableOpacity
                                        key={h}
                                        style={[s.horizonBtn, horizon === h && s.horizonBtnActive]}
                                        onPress={() => { setHorizon(h); setSelectedMonthIdx(0); }}
                                    >
                                        <Text style={[s.horizonBtnText, horizon === h && s.horizonBtnTextActive]}>{h} months</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {hasAdjustments && (
                            <View style={s.impactCard}>
                                <Text style={s.impactTitle}>Effect by Month {horizon}</Text>
                                <Text style={s.impactLine}>
                                    Cash: {fmt(baseline.months[horizon - 1].endingCash)} → {fmt(forecast.months[horizon - 1].endingCash)}
                                    {'  '}
                                    <Text style={{ color: forecast.months[horizon - 1].endingCash >= baseline.months[horizon - 1].endingCash ? Colors.income : Colors.expense }}>
                                        ({forecast.months[horizon - 1].endingCash >= baseline.months[horizon - 1].endingCash ? '+' : ''}
                                        {fmt(forecast.months[horizon - 1].endingCash - baseline.months[horizon - 1].endingCash)})
                                    </Text>
                                </Text>
                                <Text style={s.impactLine}>
                                    Monthly profit: {fmt(baseline.months[horizon - 1].profit)} → {fmt(forecast.months[horizon - 1].profit)}
                                </Text>
                            </View>
                        )}

                        {/* Month selector */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll} contentContainerStyle={s.monthScrollContent}>
                            {forecast.months.map((mo, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[s.monthChip, selectedMonthIdx === i && s.monthChipActive]}
                                    onPress={() => setSelectedMonthIdx(i)}
                                >
                                    <Text style={[s.monthChipText, selectedMonthIdx === i && s.monthChipTextActive]}>{mo.monthLabel}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Statement tabs */}
                        <View style={s.tabRow}>
                            {([
                                { key: 'pnl', label: 'P&L' },
                                { key: 'cashflow', label: 'Cash Flow' },
                                { key: 'balance', label: 'Balance Sheet' },
                            ] as { key: Statement; label: string }[]).map(t => (
                                <TouchableOpacity
                                    key={t.key}
                                    style={[s.tab, activeStatement === t.key && s.tabActive]}
                                    onPress={() => setActiveStatement(t.key)}
                                >
                                    <Text style={[s.tabText, activeStatement === t.key && s.tabTextActive]}>{t.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>{month.monthLabel} — Projected {activeStatement === 'pnl' ? 'Profit & Loss' : activeStatement === 'cashflow' ? 'Cash Flow' : 'Balance Sheet'}</Text>

                            {activeStatement === 'pnl' && (
                                <>
                                    <Row label="Revenue" value={fmt(month.revenue)} />
                                    <Row label="Operating expenses" value={fmt(month.operatingExpenses)} />
                                    <Row label="Profit" value={fmt(month.profit)} valueColor={month.profit >= 0 ? Colors.income : Colors.expense} bold />
                                    <Row label="Profit margin" value={`${month.profitMargin.toFixed(1)}%`} />
                                </>
                            )}

                            {activeStatement === 'cashflow' && (
                                <>
                                    <Row label="Operating cash flow" value={fmt(month.operatingCashFlow)} valueColor={month.operatingCashFlow >= 0 ? Colors.income : Colors.expense} />
                                    <Row label="Financing cash flow" value={fmt(month.financingCashFlow)} valueColor={month.financingCashFlow >= 0 ? Colors.income : Colors.expense} />
                                    <Row label="Net change in cash" value={fmt(month.netCashChange)} valueColor={month.netCashChange >= 0 ? Colors.income : Colors.expense} bold />
                                    <Row label="Ending cash" value={fmt(month.endingCash)} bold />
                                </>
                            )}

                            {activeStatement === 'balance' && (
                                <>
                                    <Row label="Cash" value={fmt(month.endingCash)} />
                                    <Row label="Receivables (estimated)" value={fmt(month.receivables)} />
                                    <Row label="Other assets" value={fmt(month.otherAssets)} />
                                    <Row label="Total assets" value={fmt(month.totalAssets)} bold />
                                    <Row label="Loan balance" value={fmt(month.loanBalance)} />
                                    <Row label="Payables (estimated)" value={fmt(month.payables)} />
                                    <Row label="Other liabilities" value={fmt(month.otherLiabilities)} />
                                    <Row label="Total liabilities" value={fmt(month.totalLiabilities)} bold />
                                    <Row label="Equity" value={fmt(month.equity)} valueColor={month.equity >= 0 ? Colors.income : Colors.expense} bold />
                                </>
                            )}
                        </View>

                        <Text style={s.disclaimer}>
                            Receivables and payables are estimated from your recent collection/payment speed, not
                            tracked individually. Equity is assets minus liabilities, not independently tracked.
                            This is a planning tool, not an accounting record or a promise of future performance.
                        </Text>
                    </>
                )}
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
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 18 },
    card: {
        backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.border,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    emptyText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
    baselineNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 14, lineHeight: 17 },

    inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    inputLabel: { fontSize: 13, color: Colors.textPrimary, flex: 1, marginRight: 8 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border },
    input: { color: Colors.textPrimary, fontSize: 14, paddingVertical: 8, width: 70, textAlign: 'right' },
    inputSuffix: { color: Colors.textSecondary, fontSize: 12, marginLeft: 4 },

    horizonRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    horizonBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surfaceVariant, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    horizonBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    horizonBtnText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    horizonBtnTextActive: { color: '#fff' },

    impactCard: { backgroundColor: Colors.primary + '15', borderRadius: 12, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    impactTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    impactLine: { fontSize: 13, color: Colors.textPrimary, marginBottom: 3 },

    monthScroll: { marginBottom: 10 },
    monthScrollContent: { gap: 8, paddingRight: 8 },
    monthChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    monthChipText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    monthChipTextActive: { color: '#fff' },

    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    tab: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    tabTextActive: { color: '#fff' },

    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    rowLabel: { fontSize: 13.5, color: Colors.textSecondary, flex: 1 },
    rowLabelBold: { color: Colors.textPrimary, fontWeight: '700' },
    rowValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flexShrink: 0, marginLeft: 8 },
    rowValueBold: { fontSize: 15.5, fontWeight: '800' },

    disclaimer: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginBottom: 20 },
});
