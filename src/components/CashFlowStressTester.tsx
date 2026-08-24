import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { computeCashFlowStressTest, CashFlowStressTestResult, StressVerdict } from '../utils/cashFlowStressTest';
import DataConfidenceBadge from './DataConfidenceBadge';
import { Transaction } from '../types';

interface SavedScenario {
    id: string;
    name: string;
    costIncreasePct: number;
    collectionsDelayDays: number;
    delayedIncome: number;
    result: CashFlowStressTestResult;
}

const MAX_SCENARIOS = 3;

interface Props {
    currency: string;
    currentCashBalance: number;
    dailyBurn: number;
    transactions: Transaction[];
    inventoryValue?: number;
}

function fmtDays(n: number): string {
    if (!isFinite(n)) return '∞';
    return `${Math.round(n)} days`;
}

const VERDICT_COLOR: Record<StressVerdict, string> = {
    critical: Colors.expense,
    caution: Colors.warning,
    safe: Colors.income,
};

const VERDICT_LABEL: Record<StressVerdict, string> = {
    critical: '🔴 Critical',
    caution: '🟡 Caution',
    safe: '🟢 Safe',
};

// A "what if" the user sets, not a prediction — Quad360 has no live feed of
// oil prices, freight rates, or FX movements to trigger this on its own.
// The value is turning a headline about shipping delays or fuel spikes
// into a concrete answer against this business's own cash position,
// instead of a vague sense of unease.
export default function CashFlowStressTester({ currency, currentCashBalance, dailyBurn, transactions, inventoryValue }: Props) {
    const [costIncreasePct, setCostIncreasePct] = useState('0');
    const [delayDays, setDelayDays] = useState('0');
    const [delayedIncome, setDelayedIncome] = useState('0');
    const [scenarioName, setScenarioName] = useState('');
    const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

    const result = useMemo(() => {
        return computeCashFlowStressTest({
            currentCashBalance,
            dailyBurn,
            costIncreasePct: parseFloat(costIncreasePct) || 0,
            collectionsDelayDays: parseFloat(delayDays) || 0,
            delayedIncome: parseFloat(delayedIncome) || 0,
            inventoryValue,
        });
    }, [currentCashBalance, dailyBurn, costIncreasePct, delayDays, delayedIncome, inventoryValue]);

    const hasStress = (parseFloat(costIncreasePct) || 0) > 0 || (parseFloat(delayedIncome) || 0) > 0;

    const saveScenario = () => {
        if (!hasStress || savedScenarios.length >= MAX_SCENARIOS) return;
        setSavedScenarios(prev => [...prev, {
            id: `${Date.now()}`,
            name: scenarioName.trim() || `Scenario ${prev.length + 1}`,
            costIncreasePct: parseFloat(costIncreasePct) || 0,
            collectionsDelayDays: parseFloat(delayDays) || 0,
            delayedIncome: parseFloat(delayedIncome) || 0,
            result,
        }]);
        setScenarioName('');
    };

    const removeScenario = (id: string) => {
        setSavedScenarios(prev => prev.filter(sc => sc.id !== id));
    };

    return (
        <View style={s.card}>
            <Text style={s.title}>⚡ Cash Flow Stress Test</Text>
            <Text style={s.subtitle}>
                Model a shock — rising fuel/input costs, a delayed shipment, slower-paying customers — against your real cash position, before it actually happens.
            </Text>

            <DataConfidenceBadge transactions={transactions} />

            <Field label="Cost Increase (fuel, freight, materials)" suffix="%" value={costIncreasePct} onChange={setCostIncreasePct} placeholder="0" hint="e.g. 20 for a 20% rise in what you pay to run the business" />
            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Field label="Payment Delay" suffix="days" value={delayDays} onChange={setDelayDays} placeholder="0" hint="How much later than usual" />
                </View>
                <View style={{ flex: 1 }}>
                    <Field label="Cash At Risk" currency={currency} value={delayedIncome} onChange={setDelayedIncome} placeholder="0" hint="Expected but delayed" />
                </View>
            </View>

            <View style={s.statRow}>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Current Runway</Text>
                    <Text style={s.statVal}>{fmtDays(result.baselineRunwayDays)}</Text>
                </View>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Runway Under Stress</Text>
                    <Text style={[s.statVal, { color: hasStress ? VERDICT_COLOR[result.verdict] : Colors.textPrimary }]}>{fmtDays(result.stressedRunwayDays)}</Text>
                </View>
                <View style={s.stat}>
                    <Text style={s.statLabel}>Runway Lost</Text>
                    <Text style={s.statVal}>{isFinite(result.runwayLostDays) ? `${Math.round(result.runwayLostDays)} days` : '—'}</Text>
                </View>
            </View>

            {hasStress && (
                <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                    <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                    <Text style={s.verdictReason}>{result.reason}</Text>
                </View>
            )}

            {result.stockRestockImpact && (
                <View style={s.restockBox}>
                    <Text style={s.restockTitle}>📦 What this means for restocking</Text>
                    <Text style={s.restockText}>
                        Replacing your current stock (worth {currency}{result.stockRestockImpact.currentRestockCost.toLocaleString()}) would cost {currency}{result.stockRestockImpact.stressedRestockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} at this rate — {currency}{result.stockRestockImpact.extraCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} more than today.
                    </Text>
                </View>
            )}
            {!hasStress && (
                <Text style={s.emptyHint}>Enter a cost increase or delayed cash amount to see the effect on your runway.</Text>
            )}

            {hasStress && savedScenarios.length < MAX_SCENARIOS && (
                <View style={s.saveRow}>
                    <TextInput
                        style={s.saveInput}
                        value={scenarioName}
                        onChangeText={setScenarioName}
                        placeholder={`Name this scenario (e.g. "Oil stays high 6mo")`}
                        placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity style={s.saveBtn} onPress={saveScenario}>
                        <Text style={s.saveBtnText}>Save & Compare</Text>
                    </TouchableOpacity>
                </View>
            )}

            {savedScenarios.length > 0 && (
                <View style={s.compareSection}>
                    <Text style={s.compareTitle}>Your Saved What-Ifs</Text>
                    <Text style={s.compareNote}>
                        Your own hypotheticals, not a forecast — see Cash Flow Outlook for the automatic
                        pessimistic/base/optimistic projection built from your real history. Snapshots at the time each
                        was saved — re-save if your cash position has since changed.
                    </Text>
                    {savedScenarios.map(sc => (
                        <View key={sc.id} style={[s.compareCard, { borderLeftColor: VERDICT_COLOR[sc.result.verdict] }]}>
                            <View style={s.compareHeader}>
                                <Text style={s.compareName}>{sc.name}</Text>
                                <TouchableOpacity onPress={() => removeScenario(sc.id)}>
                                    <Text style={s.compareRemove}>✕</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={s.compareAssumptions}>
                                {sc.costIncreasePct > 0 ? `+${sc.costIncreasePct}% costs` : null}
                                {sc.costIncreasePct > 0 && sc.collectionsDelayDays > 0 ? ' · ' : null}
                                {sc.collectionsDelayDays > 0 ? `${sc.collectionsDelayDays}-day delay` : null}
                                {(sc.costIncreasePct > 0 || sc.collectionsDelayDays > 0) && sc.delayedIncome > 0 ? ' · ' : null}
                                {sc.delayedIncome > 0 ? `${currency}${sc.delayedIncome.toLocaleString()} at risk` : null}
                            </Text>
                            <View style={s.compareStatRow}>
                                <Text style={s.compareStatLabel}>Runway under this scenario</Text>
                                <Text style={[s.compareStatVal, { color: VERDICT_COLOR[sc.result.verdict] }]}>{fmtDays(sc.result.stressedRunwayDays)}</Text>
                                <Text style={[s.compareVerdictBadge, { color: VERDICT_COLOR[sc.result.verdict] }]}>{VERDICT_LABEL[sc.result.verdict]}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function Field({ label, value, onChange, placeholder, currency, suffix, hint }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string;
    currency?: string; suffix?: string; hint?: string;
}) {
    return (
        <View style={s.field}>
            <Text style={s.fieldLabel}>{label}</Text>
            <View style={s.inputWrap}>
                {currency && <Text style={s.affix}>{currency}</Text>}
                <TextInput
                    style={s.input}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textMuted}
                />
                {suffix && <Text style={s.affix}>{suffix}</Text>}
            </View>
            {hint && <Text style={s.fieldHint}>{hint}</Text>}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 17 },

    row: { flexDirection: 'row', gap: 10 },
    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
    statVal: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    restockBox: { marginTop: 10, backgroundColor: Colors.bg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.border },
    restockTitle: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
    restockText: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },

    saveRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    saveInput: { flex: 1, backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary },
    saveBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
    saveBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

    compareSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14 },
    compareTitle: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
    compareNote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 10 },
    compareCard: { backgroundColor: Colors.bg, borderRadius: 10, borderLeftWidth: 4, padding: 12, marginBottom: 10 },
    compareHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    compareName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    compareRemove: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 4 },
    compareAssumptions: { fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },
    compareStatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    compareStatLabel: { fontSize: 11, color: Colors.textMuted, flex: 1 },
    compareStatVal: { fontSize: 14, fontWeight: '800' },
    compareVerdictBadge: { fontSize: 11, fontWeight: '700', marginLeft: 10 },
});
