import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity,
    StyleSheet, TextInput,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import {
    analyseRootCause,
    modelHireStaff,
    modelRevenueChange,
    modelNewLoan,
    modelPriceIncrease,
    modelCostCut,
    ScenarioResult,
} from '../utils/analysis';
import { ReportPeriod } from '../utils/finance';

type Tab = 'diagnosis' | 'scenarios';
type ScenarioType = 'hire' | 'revenue' | 'loan' | 'price' | 'cost';

// ─── Scenario input forms ──────────────────────────────────────────────────────
function HireForm({ onRun, currency }: { onRun: (r: ScenarioResult) => void; currency: string }) {
    const { finance } = useApp();
    const [salary, setSalary] = useState('');
    return (
        <View>
            <Text style={s.formLabel}>Monthly salary ({currency})</Text>
            <TextInput style={s.input} placeholder="e.g. 3000" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={salary} onChangeText={setSalary} />
            <TouchableOpacity style={[s.runBtn, !salary && s.runBtnDisabled]} disabled={!salary} onPress={() => onRun(modelHireStaff(finance, parseFloat(salary) || 0, currency))}>
                <Text style={s.runBtnText}>Run Scenario →</Text>
            </TouchableOpacity>
        </View>
    );
}

function RevenueForm({ onRun, currency }: { onRun: (r: ScenarioResult) => void; currency: string }) {
    const { finance } = useApp();
    const [pct, setPct] = useState('');
    const presets = [-30, -20, -10, 10, 20, 30];
    return (
        <View>
            <Text style={s.formLabel}>Revenue change (%)</Text>
            <View style={s.presetRow}>
                {presets.map(p => (
                    <TouchableOpacity key={p} style={[s.preset, pct === String(p) && s.presetActive]} onPress={() => setPct(String(p))}>
                        <Text style={[s.presetText, pct === String(p) && s.presetTextActive]}>{p > 0 ? '+' : ''}{p}%</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <TextInput style={s.input} placeholder="or type a custom %" placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={pct} onChangeText={setPct} />
            <TouchableOpacity style={[s.runBtn, !pct && s.runBtnDisabled]} disabled={!pct} onPress={() => onRun(modelRevenueChange(finance, parseFloat(pct) || 0, currency))}>
                <Text style={s.runBtnText}>Run Scenario →</Text>
            </TouchableOpacity>
        </View>
    );
}

function LoanForm({ onRun, currency }: { onRun: (r: ScenarioResult) => void; currency: string }) {
    const { finance } = useApp();
    const [principal, setPrincipal] = useState('');
    const [rate, setRate]           = useState('');
    const [term, setTerm]           = useState('');
    const ready = principal && rate && term;
    return (
        <View>
            <Text style={s.formLabel}>Loan amount ({currency})</Text>
            <TextInput style={s.input} placeholder="e.g. 50000" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={principal} onChangeText={setPrincipal} />
            <Text style={s.formLabel}>Annual interest rate (%)</Text>
            <TextInput style={s.input} placeholder="e.g. 15" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={rate} onChangeText={setRate} />
            <Text style={s.formLabel}>Term (months)</Text>
            <TextInput style={s.input} placeholder="e.g. 24" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={term} onChangeText={setTerm} />
            <TouchableOpacity style={[s.runBtn, !ready && s.runBtnDisabled]} disabled={!ready} onPress={() => onRun(modelNewLoan(finance, parseFloat(principal) || 0, parseFloat(rate) || 0, parseInt(term) || 1, currency))}>
                <Text style={s.runBtnText}>Run Scenario →</Text>
            </TouchableOpacity>
        </View>
    );
}

function PriceForm({ onRun, currency }: { onRun: (r: ScenarioResult) => void; currency: string }) {
    const { finance } = useApp();
    const [pct, setPct] = useState('');
    const presets = [5, 10, 15, 20, 25];
    return (
        <View>
            <Text style={s.formLabel}>Price increase (%)</Text>
            <View style={s.presetRow}>
                {presets.map(p => (
                    <TouchableOpacity key={p} style={[s.preset, pct === String(p) && s.presetActive]} onPress={() => setPct(String(p))}>
                        <Text style={[s.presetText, pct === String(p) && s.presetTextActive]}>+{p}%</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <TextInput style={s.input} placeholder="or type a custom %" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={pct} onChangeText={setPct} />
            <TouchableOpacity style={[s.runBtn, !pct && s.runBtnDisabled]} disabled={!pct} onPress={() => onRun(modelPriceIncrease(finance, parseFloat(pct) || 0, currency))}>
                <Text style={s.runBtnText}>Run Scenario →</Text>
            </TouchableOpacity>
        </View>
    );
}

function CostForm({ onRun, currency }: { onRun: (r: ScenarioResult) => void; currency: string }) {
    const { finance, transactions } = useApp();
    const [cat, setCat]     = useState('');
    const [amount, setAmount] = useState('');

    const topCats = useMemo(() => {
        const m = new Map<string, number>();
        transactions.filter(t => t.type === 'expense').forEach(t => m.set(t.category, (m.get(t.category) ?? 0) + t.amount));
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [transactions]);

    return (
        <View>
            <Text style={s.formLabel}>Category to cut</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {topCats.map(([c, a]) => (
                    <TouchableOpacity key={c} style={[s.preset, cat === c && s.presetActive]} onPress={() => { setCat(c); setAmount(String(Math.round(a * 0.2))); }}>
                        <Text style={[s.presetText, cat === c && s.presetTextActive]}>{c}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <TextInput style={s.input} placeholder="Category name" placeholderTextColor={Colors.textMuted} value={cat} onChangeText={setCat} />
            <Text style={s.formLabel}>Amount to cut ({currency})</Text>
            <TextInput style={s.input} placeholder="e.g. 500" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
            <TouchableOpacity style={[s.runBtn, (!cat || !amount) && s.runBtnDisabled]} disabled={!cat || !amount} onPress={() => onRun(modelCostCut(finance, cat, parseFloat(amount) || 0, currency))}>
                <Text style={s.runBtnText}>Run Scenario →</Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Scenario result card ──────────────────────────────────────────────────────
function ScenarioResultCard({ result, currency }: { result: ScenarioResult; currency: string }) {
    const good = result.profitImpact >= 0;
    return (
        <View style={s.resultCard}>
            <Text style={s.resultLabel}>{result.label}</Text>

            {/* Impact summary */}
            <View style={s.impactRow}>
                <View style={s.impactBox}>
                    <Text style={s.impactLbl}>Profit Impact</Text>
                    <Text style={[s.impactVal, { color: good ? Colors.income : Colors.expense }]}>
                        {good ? '+' : ''}{currency}{result.profitImpact.toLocaleString()}
                    </Text>
                </View>
                <View style={s.impactBox}>
                    <Text style={s.impactLbl}>New Margin</Text>
                    <Text style={[s.impactVal, { color: result.newMargin >= 0 ? Colors.income : Colors.expense }]}>
                        {result.newMargin.toFixed(1)}%
                    </Text>
                </View>
                <View style={s.impactBox}>
                    <Text style={s.impactLbl}>Cash Runway</Text>
                    <Text style={[s.impactVal, { color: result.newCashRunway < 30 ? Colors.expense : Colors.income }]}>
                        {result.newCashRunway > 999 ? '∞' : result.newCashRunway + 'd'}
                    </Text>
                </View>
            </View>

            {/* Before vs after */}
            <View style={s.compareRow}>
                <View style={s.compareCol}>
                    <Text style={s.compareLbl}>Before</Text>
                    <Text style={[s.compareVal, { color: result.baseProfit >= 0 ? Colors.income : Colors.expense }]}>
                        {currency}{result.baseProfit.toLocaleString()}
                    </Text>
                    <Text style={s.compareMargin}>{result.baseMargin.toFixed(1)}% margin</Text>
                </View>
                <Text style={s.compareArrow}>→</Text>
                <View style={s.compareCol}>
                    <Text style={s.compareLbl}>After</Text>
                    <Text style={[s.compareVal, { color: result.newProfit >= 0 ? Colors.income : Colors.expense }]}>
                        {currency}{result.newProfit.toLocaleString()}
                    </Text>
                    <Text style={s.compareMargin}>{result.newMargin.toFixed(1)}% margin</Text>
                </View>
            </View>

            {/* Verdict */}
            <View style={[s.verdictBox, { borderColor: good ? Colors.income : Colors.expense }]}>
                <Text style={[s.verdictText, { color: good ? Colors.income : Colors.expense }]}>
                    {good ? '✓' : '⚠'} {result.verdict}
                </Text>
            </View>

            {/* Risks */}
            {result.risks.length > 0 && (
                <View style={{ marginTop: 10 }}>
                    <Text style={s.riskHeader}>Risks to consider</Text>
                    {result.risks.map((r, i) => <Text key={i} style={s.riskItem}>• {r}</Text>)}
                </View>
            )}

            {/* Opportunities */}
            {result.opportunities.length > 0 && (
                <View style={{ marginTop: 10 }}>
                    <Text style={s.oppHeader}>Opportunities</Text>
                    {result.opportunities.map((o, i) => <Text key={i} style={s.oppItem}>→ {o}</Text>)}
                </View>
            )}
        </View>
    );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function AnalysisScreen() {
    const { transactions, finance, settings, navigate } = useApp();
    const { currency } = settings;

    const [tab, setTab]             = useState<Tab>('diagnosis');
    const [period, setPeriod]       = useState<ReportPeriod>('month');
    const [scenarioType, setScenarioType] = useState<ScenarioType>('hire');
    const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);

    const analysis = useMemo(() => analyseRootCause(transactions, period, settings), [transactions, period, settings]);

    const hasData = transactions.length >= 2;

    const severityColor = analysis.severity === 'positive' ? Colors.income
        : analysis.severity === 'warning' ? Colors.warning
        : analysis.severity === 'critical' ? Colors.expense
        : Colors.textMuted;

    const PERIODS: { key: ReportPeriod; label: string }[] = [
        { key: 'month', label: 'Month' },
        { key: 'quarter', label: 'Quarter' },
        { key: 'year', label: 'Year' },
    ];

    const SCENARIOS: { key: ScenarioType; label: string; icon: string }[] = [
        { key: 'hire',    label: 'Hire Staff',       icon: '👤' },
        { key: 'revenue', label: 'Revenue Change',   icon: '📈' },
        { key: 'loan',    label: 'Take a Loan',      icon: '🏦' },
        { key: 'price',   label: 'Raise Prices',     icon: '💰' },
        { key: 'cost',    label: 'Cut Costs',        icon: '✂️' },
    ];

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Analysis & Decisions</Text>
            </View>

            {/* Tab bar */}
            <View style={s.tabBar}>
                {([{ key: 'diagnosis', label: '🔍 Why?' }, { key: 'scenarios', label: '🔮 What if?' }] as const).map(t => (
                    <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)}>
                        <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>

                {/* ── DIAGNOSIS TAB ─────────────────────────────────────────── */}
                {tab === 'diagnosis' && (
                    <>
                        {!hasData ? (
                            <View style={s.emptyState}>
                                <Text style={s.emptyIcon}>🔍</Text>
                                <Text style={s.emptyTitle}>Add transactions to unlock diagnosis</Text>
                                <Text style={s.emptyBody}>Once you have at least 2 months of data, Quad360 will automatically explain why your profit, revenue, and costs are changing.</Text>
                            </View>
                        ) : (
                            <>
                                {/* Period selector */}
                                <View style={s.periodRow}>
                                    {PERIODS.map(p => (
                                        <TouchableOpacity key={p.key} style={[s.periodBtn, period === p.key && s.periodActive]} onPress={() => setPeriod(p.key)}>
                                            <Text style={[s.periodText, period === p.key && s.periodTextActive]}>{p.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Primary cause banner */}
                                <View style={[s.causeBanner, { borderColor: severityColor }]}>
                                    <Text style={[s.causeLabel, { color: severityColor }]}>
                                        {analysis.severity === 'positive' ? '✅' : analysis.severity === 'warning' ? '⚠️' : analysis.severity === 'critical' ? '🔴' : 'ℹ️'} Root Cause
                                    </Text>
                                    <Text style={[s.causeText, { color: severityColor }]}>{analysis.primaryCause}</Text>
                                </View>

                                {/* Numbers: current vs previous */}
                                <View style={s.compareCard}>
                                    <Text style={s.cardTitle}>Performance Comparison</Text>
                                    <View style={s.metricsGrid}>
                                        {[
                                            { label: 'Revenue', cur: analysis.currentIncome, prv: analysis.previousIncome, good: true },
                                            { label: 'Costs',   cur: analysis.currentExpense, prv: analysis.previousExpense, good: false },
                                            { label: 'Profit',  cur: analysis.currentProfit,  prv: analysis.previousProfit,  good: true },
                                        ].map(m => {
                                            const change = m.cur - m.prv;
                                            const isGood = m.good ? change >= 0 : change <= 0;
                                            return (
                                                <View key={m.label} style={s.metricCell}>
                                                    <Text style={s.metricCellLabel}>{m.label}</Text>
                                                    <Text style={[s.metricCellVal, { color: m.good ? (m.cur >= 0 ? Colors.income : Colors.expense) : Colors.expense }]}>
                                                        {currency}{m.cur.toLocaleString()}
                                                    </Text>
                                                    <Text style={[s.metricCellChange, { color: isGood ? Colors.income : Colors.expense }]}>
                                                        {change >= 0 ? '▲' : '▼'} {currency}{Math.abs(change).toLocaleString()}
                                                    </Text>
                                                    <Text style={s.metricCellPrv}>was {currency}{m.prv.toLocaleString()}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Diagnosis */}
                                <View style={s.diagCard}>
                                    <Text style={s.cardTitle}>📋 What the data says</Text>
                                    {analysis.diagnosis.map((d, i) => (
                                        <Text key={i} style={s.diagLine}>{d}</Text>
                                    ))}
                                </View>

                                {/* Income drivers */}
                                {analysis.incomeDrivers.length > 0 && (
                                    <View style={s.driverCard}>
                                        <Text style={s.cardTitle}>Revenue drivers</Text>
                                        {analysis.incomeDrivers.slice(0, 5).map((d, i) => (
                                            <View key={i} style={s.driverRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.driverCat}>{d.category}</Text>
                                                    <Text style={s.driverCur}>{currency}{d.current.toLocaleString()} <Text style={s.driverPrv}>was {currency}{d.previous.toLocaleString()}</Text></Text>
                                                </View>
                                                <Text style={[s.driverChange, { color: d.impact === 'positive' ? Colors.income : Colors.expense }]}>
                                                    {d.change >= 0 ? '+' : ''}{currency}{d.change.toLocaleString()}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Expense drivers */}
                                {analysis.expenseDrivers.length > 0 && (
                                    <View style={s.driverCard}>
                                        <Text style={s.cardTitle}>Cost drivers</Text>
                                        {analysis.expenseDrivers.slice(0, 5).map((d, i) => (
                                            <View key={i} style={s.driverRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.driverCat}>{d.category}</Text>
                                                    <Text style={s.driverCur}>{currency}{d.current.toLocaleString()} <Text style={s.driverPrv}>was {currency}{d.previous.toLocaleString()}</Text></Text>
                                                </View>
                                                <Text style={[s.driverChange, { color: d.impact === 'positive' ? Colors.income : Colors.expense }]}>
                                                    {d.change >= 0 ? '+' : ''}{currency}{d.change.toLocaleString()}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Recommendations */}
                                <View style={s.recsCard}>
                                    <Text style={s.cardTitle}>✅ Recommended actions</Text>
                                    {analysis.recommendations.map((r, i) => (
                                        <View key={i} style={s.recRow}>
                                            <Text style={s.recNum}>{i + 1}</Text>
                                            <Text style={s.recText}>{r}</Text>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}
                    </>
                )}

                {/* ── SCENARIOS TAB ─────────────────────────────────────────── */}
                {tab === 'scenarios' && (
                    <>
                        <Text style={s.sectionTitle}>What if...?</Text>
                        <Text style={s.sectionSub}>Model a decision before you make it. See the exact profit, margin, and cash runway impact.</Text>

                        {/* Scenario type picker */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            {SCENARIOS.map(sc => (
                                <TouchableOpacity
                                    key={sc.key}
                                    style={[s.scTab, scenarioType === sc.key && s.scTabActive]}
                                    onPress={() => { setScenarioType(sc.key); setScenarioResult(null); }}
                                >
                                    <Text style={s.scTabIcon}>{sc.icon}</Text>
                                    <Text style={[s.scTabText, scenarioType === sc.key && s.scTabTextActive]}>{sc.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Form */}
                        <View style={s.formCard}>
                            {scenarioType === 'hire'    && <HireForm    currency={currency} onRun={r => setScenarioResult(r)} />}
                            {scenarioType === 'revenue' && <RevenueForm currency={currency} onRun={r => setScenarioResult(r)} />}
                            {scenarioType === 'loan'    && <LoanForm    currency={currency} onRun={r => setScenarioResult(r)} />}
                            {scenarioType === 'price'   && <PriceForm   currency={currency} onRun={r => setScenarioResult(r)} />}
                            {scenarioType === 'cost'    && <CostForm    currency={currency} onRun={r => setScenarioResult(r)} />}
                        </View>

                        {/* Result */}
                        {scenarioResult && <ScenarioResultCard result={scenarioResult} currency={currency} />}
                    </>
                )}

            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:        { flex: 1, backgroundColor: Colors.bg },
    scroll:      { flex: 1 },
    pad:         { padding: 16, paddingBottom: 100 },
    headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
    backBtn:     { color: Colors.primary, fontSize: 14 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },

    tabBar:       { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tab:          { flex: 1, paddingVertical: 13, alignItems: 'center' },
    tabActive:    { borderBottomWidth: 3, borderBottomColor: Colors.primary },
    tabText:      { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    tabTextActive:{ color: Colors.primary },

    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyIcon:  { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    emptyBody:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

    periodRow:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
    periodBtn:      { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface },
    periodActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    periodText:     { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
    periodTextActive:{ color: '#fff' },

    causeBanner: { borderWidth: 2, borderRadius: 12, padding: 14, marginBottom: 14, backgroundColor: Colors.surface },
    causeLabel:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
    causeText:   { fontSize: 15, fontWeight: '700', lineHeight: 22 },

    compareCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
    cardTitle:   { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    metricsGrid: { flexDirection: 'row' },
    metricCell:       { flex: 1, alignItems: 'center' },
    metricCellLabel:  { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    metricCellVal:    { fontSize: 15, fontWeight: 'bold' },
    metricCellChange: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    metricCellPrv:    { fontSize: 9, color: Colors.textMuted, marginTop: 1 },

    diagCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
    diagLine:  { fontSize: 14, color: Colors.textPrimary, lineHeight: 22, marginBottom: 8 },

    driverCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
    driverRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    driverCat:  { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    driverCur:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    driverPrv:  { color: Colors.textMuted },
    driverChange:{ fontSize: 13, fontWeight: '700' },

    recsCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
    recRow:    { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
    recNum:    { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#fff', lineHeight: 22 },
    recText:   { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },

    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    sectionSub:   { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 20 },

    scTab:         { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
    scTabActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    scTabIcon:     { fontSize: 20, marginBottom: 4 },
    scTabText:     { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
    scTabTextActive:{ color: '#fff' },

    formCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    formLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6, marginTop: 10 },
    input:     { backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, color: Colors.textPrimary, fontSize: 14, marginBottom: 4 },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    preset:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    presetActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
    presetText:    { fontSize: 12, color: Colors.textSecondary },
    presetTextActive:{ color: '#fff', fontWeight: '700' },
    runBtn:        { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 14 },
    runBtnDisabled:{ opacity: 0.4 },
    runBtnText:    { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    resultCard:    { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    resultLabel:   { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },
    impactRow:     { flexDirection: 'row', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 14 },
    impactBox:     { flex: 1, alignItems: 'center' },
    impactLbl:     { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    impactVal:     { fontSize: 16, fontWeight: 'bold' },
    compareRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    compareCol:    { flex: 1, alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, padding: 10 },
    compareLbl:    { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    compareVal:    { fontSize: 16, fontWeight: 'bold' },
    compareMargin: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    compareArrow:  { fontSize: 20, color: Colors.textMuted },
    verdictBox:    { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
    verdictText:   { fontSize: 13, lineHeight: 20, fontWeight: '600' },
    riskHeader:    { fontSize: 12, fontWeight: '700', color: Colors.expense, marginBottom: 6 },
    riskItem:      { fontSize: 12, color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },
    oppHeader:     { fontSize: 12, fontWeight: '700', color: Colors.income, marginBottom: 6 },
    oppItem:       { fontSize: 12, color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },
});
