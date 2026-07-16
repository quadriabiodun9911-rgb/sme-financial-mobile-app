import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction } from '../types';
import { computeMonthlyTrend } from '../utils/finance';
import NextStepLink from './NextStepLink';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    currency: string;
    targetMargin: string;
    onSeeBudget?: () => void;
}

type Horizon = 3 | 6 | 12;
type ScenarioKey = 'pessimistic' | 'base' | 'optimistic';

const SCENARIO_CONFIG: Record<ScenarioKey, { label: string; incomeGrowth: number; costGrowth: number; color: string }> = {
    pessimistic: { label: 'Pessimistic',  incomeGrowth: -0.15, costGrowth:  0.10, color: Colors.expense },
    base:        { label: 'Base Case',    incomeGrowth:  0.00, costGrowth:  0.00, color: Colors.primary },
    optimistic:  { label: 'Optimistic',   incomeGrowth:  0.15, costGrowth: -0.05, color: Colors.income  },
};

function pct(n: number) { return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`; }

export default function BudgetForecast({ finance, transactions, currency, targetMargin, onSeeBudget }: Props) {
    const [horizon, setHorizon]         = useState<Horizon>(6);
    const [activeScenario, setScenario] = useState<ScenarioKey>('base');
    const [customIncome, setCustomIncome] = useState(0);   // delta multiplier: -0.3 to +0.5
    const [customCost,   setCustomCost]   = useState(0);

    const trend = useMemo(() => computeMonthlyTrend(transactions, 6), [transactions]);
    const monthsWithData = trend.filter(p => p.income > 0 || p.expense > 0).length;

    const avgMonthlyIncome  = monthsWithData > 0 ? trend.reduce((s, p) => s + p.income,  0) / Math.max(monthsWithData, 1) : finance.income  / 12;
    const avgMonthlyExpense = monthsWithData > 0 ? trend.reduce((s, p) => s + p.expense, 0) / Math.max(monthsWithData, 1) : finance.expense / 12;

    // Build all 3 scenario projections
    const scenarios = useMemo(() => {
        return (Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map(key => {
            const cfg = SCENARIO_CONFIG[key];
            const ig = key === 'base' ? customIncome : cfg.incomeGrowth;
            const cg = key === 'base' ? customCost   : cfg.costGrowth;
            const months = Array.from({ length: horizon }, (_, i) => {
                const d = new Date(); d.setMonth(d.getMonth() + i + 1);
                const label   = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                const income  = avgMonthlyIncome  * (1 + ig);
                const expense = avgMonthlyExpense * (1 + cg);
                return { label, income, expense, profit: income - expense };
            });
            const totalIncome  = months.reduce((s, p) => s + p.income,  0);
            const totalExpense = months.reduce((s, p) => s + p.expense, 0);
            const totalProfit  = totalIncome - totalExpense;
            const margin       = totalIncome > 0 ? (totalProfit / totalIncome) * 100 : 0;
            return { key, cfg, months, totalIncome, totalExpense, totalProfit, margin };
        });
    }, [horizon, avgMonthlyIncome, avgMonthlyExpense, customIncome, customCost]);

    const active = scenarios.find(s => s.key === activeScenario)!;
    const maxBar = Math.max(...active.months.flatMap(p => [p.income, p.expense]), 1);

    const targetM = parseFloat(targetMargin) || 0;

    const STEP = 0.05;
    const adj = (setter: (v: number) => void, cur: number, dir: number, min: number, max: number) =>
        setter(Math.max(min, Math.min(max, Math.round((cur + dir * STEP) * 100) / 100)));

    return (
        <View>
            <Text style={s.intro}>
                Projects revenue and costs forward under different growth assumptions — separate from your
                category-by-category spending plan on the Budget screen.
            </Text>
            {onSeeBudget && (
                <NextStepLink text="Go to your actual Budget (spending by category)" onPress={onSeeBudget} />
            )}

            {/* Horizon */}
            <View style={[s.row, { marginTop: 14 }]}>
                <Text style={s.rowLabel}>Forecast horizon:</Text>
                {([3, 6, 12] as Horizon[]).map(h => (
                    <TouchableOpacity key={h} style={[s.chip, horizon === h && s.chipActive]} onPress={() => setHorizon(h)}>
                        <Text style={[s.chipText, horizon === h && s.chipTextActive]}>{h}mo</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Scenario selector */}
            <View style={s.row}>
                {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map(k => (
                    <TouchableOpacity key={k} style={[s.scenBtn, activeScenario === k && { borderColor: SCENARIO_CONFIG[k].color, backgroundColor: SCENARIO_CONFIG[k].color + '22' }]} onPress={() => setScenario(k)}>
                        <Text style={[s.scenLabel, { color: activeScenario === k ? SCENARIO_CONFIG[k].color : Colors.textMuted }]}>{SCENARIO_CONFIG[k].label}</Text>
                        <Text style={[s.scenSub, { color: activeScenario === k ? SCENARIO_CONFIG[k].color : Colors.textMuted }]}>
                            Rev {pct(SCENARIO_CONFIG[k].incomeGrowth)} / Cost {pct(SCENARIO_CONFIG[k].costGrowth)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Base case custom adjustments */}
            {activeScenario === 'base' && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Adjust Base Case Assumptions</Text>
                    <AdjRow label="Revenue growth"  value={customIncome} onMinus={() => adj(setCustomIncome, customIncome, -1, -0.5, 1.0)} onPlus={() => adj(setCustomIncome, customIncome, 1, -0.5, 1.0)} />
                    <AdjRow label="Cost growth"     value={customCost}   onMinus={() => adj(setCustomCost,   customCost,   -1, -0.5, 1.0)} onPlus={() => adj(setCustomCost,   customCost,   1, -0.5, 1.0)} />
                </View>
            )}

            {/* KPI summary strip for active scenario */}
            <View style={s.kpiRow}>
                <KpiCard label={`${horizon}mo Revenue`}  value={`${currency}${Math.round(active.totalIncome).toLocaleString()}`}  color={Colors.income} />
                <KpiCard label={`${horizon}mo Costs`}    value={`${currency}${Math.round(active.totalExpense).toLocaleString()}`} color={Colors.expense} />
                <KpiCard label="Proj. Margin" value={`${active.margin.toFixed(1)}%`} color={active.margin >= targetM ? Colors.income : Colors.expense} />
            </View>

            {/* Scenario comparison table */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Scenario Comparison ({horizon} months)</Text>
                <View style={s.compHeader}>
                    <Text style={[s.compCell, { flex: 1.6 }]}>Scenario</Text>
                    <Text style={s.compCell}>Revenue</Text>
                    <Text style={s.compCell}>Profit</Text>
                    <Text style={s.compCell}>Margin</Text>
                </View>
                {scenarios.map(sc => (
                    <TouchableOpacity key={sc.key} style={[s.compRow, activeScenario === sc.key && s.compRowActive]} onPress={() => setScenario(sc.key)}>
                        <Text style={[s.compCell, { flex: 1.6, color: sc.cfg.color, fontWeight: '600' }]}>{sc.cfg.label}</Text>
                        <Text style={[s.compCell, { color: Colors.income }]}>{currency}{Math.round(sc.totalIncome / 1000)}k</Text>
                        <Text style={[s.compCell, { color: sc.totalProfit >= 0 ? Colors.income : Colors.expense }]}>
                            {sc.totalProfit >= 0 ? '+' : ''}{currency}{Math.round(sc.totalProfit / 1000)}k
                        </Text>
                        <Text style={[s.compCell, { color: sc.margin >= targetM ? Colors.income : Colors.expense }]}>{sc.margin.toFixed(1)}%</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Bar chart for active scenario */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Monthly Projection — {SCENARIO_CONFIG[activeScenario].label}</Text>
                <View style={s.chart}>
                    {active.months.map((pt, i) => {
                        const incH = Math.round((pt.income  / maxBar) * 80);
                        const expH = Math.round((pt.expense / maxBar) * 80);
                        return (
                            <View key={i} style={s.col}>
                                <View style={s.bars}>
                                    <View style={[s.bar, { height: Math.max(incH, 2), backgroundColor: Colors.income,  marginRight: 2 }]} />
                                    <View style={[s.bar, { height: Math.max(expH, 2), backgroundColor: Colors.expense }]} />
                                </View>
                                <Text style={s.colLabel}>{pt.label}</Text>
                            </View>
                        );
                    })}
                </View>
                <View style={s.legend}>
                    <LDot color={Colors.income}  label="Revenue" />
                    <LDot color={Colors.expense} label="Cost" />
                </View>
            </View>

            {/* Month-by-month table */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Month-by-Month — {SCENARIO_CONFIG[activeScenario].label}</Text>
                <View style={s.tableHeader}>
                    <Text style={s.tableMonth}>Month</Text>
                    <Text style={[s.tableVal, { color: Colors.income }]}>Revenue</Text>
                    <Text style={[s.tableVal, { color: Colors.expense }]}>Cost</Text>
                    <Text style={s.tableVal}>Profit</Text>
                </View>
                {active.months.map((pt, i) => (
                    <View key={i} style={s.tableRow}>
                        <Text style={s.tableMonth}>{pt.label}</Text>
                        <Text style={[s.tableVal, { color: Colors.income }]}>{currency}{Math.round(pt.income).toLocaleString()}</Text>
                        <Text style={[s.tableVal, { color: Colors.expense }]}>{currency}{Math.round(pt.expense).toLocaleString()}</Text>
                        <Text style={[s.tableVal, { color: pt.profit >= 0 ? Colors.income : Colors.expense }]}>
                            {pt.profit >= 0 ? '+' : ''}{currency}{Math.round(pt.profit).toLocaleString()}
                        </Text>
                    </View>
                ))}
                <View style={[s.tableRow, s.tableTotal]}>
                    <Text style={[s.tableMonth, { fontWeight: 'bold', color: Colors.textPrimary }]}>Total</Text>
                    <Text style={[s.tableVal, { color: Colors.income,  fontWeight: 'bold' }]}>{currency}{Math.round(active.totalIncome).toLocaleString()}</Text>
                    <Text style={[s.tableVal, { color: Colors.expense, fontWeight: 'bold' }]}>{currency}{Math.round(active.totalExpense).toLocaleString()}</Text>
                    <Text style={[s.tableVal, { color: active.totalProfit >= 0 ? Colors.income : Colors.expense, fontWeight: 'bold' }]}>
                        {active.totalProfit >= 0 ? '+' : ''}{currency}{Math.round(active.totalProfit).toLocaleString()}
                    </Text>
                </View>
                <Text style={s.disc}>
                    Based on {monthsWithData > 0 ? `last ${monthsWithData} months` : 'overall averages'}.
                    {activeScenario !== 'base' ? ` ${SCENARIO_CONFIG[activeScenario].label}: revenue ${pct(SCENARIO_CONFIG[activeScenario].incomeGrowth)}, costs ${pct(SCENARIO_CONFIG[activeScenario].costGrowth)} vs average.` : ''}
                </Text>
            </View>
        </View>
    );
}

function AdjRow({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
    return (
        <View style={s.adjRow}>
            <Text style={s.adjLabel}>{label}</Text>
            <TouchableOpacity style={s.adjBtn} onPress={onMinus}><Text style={s.adjBtnText}>−</Text></TouchableOpacity>
            <Text style={[s.adjVal, { color: value >= 0 ? Colors.income : Colors.expense }]}>{pct(value)}</Text>
            <TouchableOpacity style={s.adjBtn} onPress={onPlus}><Text style={s.adjBtnText}>+</Text></TouchableOpacity>
        </View>
    );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{label}</Text>
            <Text style={[s.kpiValue, { color }]}>{value}</Text>
        </View>
    );
}

function LDot({ color, label }: { color: string; label: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ fontSize: 10, color: Colors.textMuted }}>{label}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    intro:    { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
    row:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    rowLabel: { fontSize: 12, color: Colors.textMuted },
    chip:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    chipActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText:     { fontSize: 12, color: Colors.textMuted },
    chipTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },

    scenBtn:   { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 8, alignItems: 'center' },
    scenLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
    scenSub:   { fontSize: 9 },

    card:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },

    adjRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    adjLabel:  { flex: 1, fontSize: 13, color: Colors.textSecondary },
    adjBtn:    { width: 30, height: 30, borderRadius: 6, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    adjBtnText:{ fontSize: 18, color: Colors.textPrimary, lineHeight: 22 },
    adjVal:    { width: 56, textAlign: 'center', fontSize: 13, fontWeight: '700' },

    kpiRow:  { flexDirection: 'row', gap: 8, marginBottom: 12 },
    kpiCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' },
    kpiLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    kpiValue:{ fontSize: 12, fontWeight: 'bold' },

    compHeader:  { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
    compRow:     { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    compRowActive:{ backgroundColor: Colors.bg, borderRadius: 6 },
    compCell:    { flex: 1, fontSize: 12, color: Colors.textMuted, textAlign: 'right' },

    chart:    { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2, marginBottom: 8 },
    col:      { flex: 1, alignItems: 'center' },
    bars:     { flexDirection: 'row', alignItems: 'flex-end' },
    bar:      { width: 8, borderRadius: 2 },
    colLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 3 },
    legend:   { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 4 },

    tableHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 2 },
    tableRow:    { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableTotal:  { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 8 },
    tableMonth:  { fontSize: 12, color: Colors.textMuted, width: 48 },
    tableVal:    { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'right' },
    disc:        { fontSize: 10, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic', lineHeight: 15 },
});
