import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { Transaction } from '../types';
import {
    compareDecisionScenarios, DecisionScenarioInput, DecisionComparisonRow,
    DecisionRiskLevel, FundingCapacityLevel,
} from '../utils/decisionComparison';
import { generateId } from '../utils/uuid';

interface Props {
    currency: string;
    transactions: Transaction[];
    currentCashBalance: number;
}

interface DraftScenario {
    id: string;
    label: string;
    revenue: string;
    cost: string;
    loanPayment: string;
}

function emptyDraft(): DraftScenario {
    return { id: generateId(), label: '', revenue: '', cost: '', loanPayment: '' };
}

const RISK_COLOR: Record<DecisionRiskLevel, string> = {
    Low: Colors.income, Medium: Colors.warning, High: Colors.expense,
};
const CAPACITY_COLOR: Record<FundingCapacityLevel, string> = {
    High: Colors.income, Medium: Colors.warning, Low: Colors.expense, None: Colors.expense,
};

const MAX_SCENARIOS = 5;

// Puts "Hire vs buy equipment vs take a loan vs raise prices" in one table
// instead of one calculator at a time — the same net-monthly-cost engine
// every other "can I afford this" tool here already uses
// (financialDecisionSimulator.ts, via decisionComparison.ts), just run once
// per named scenario and laid out side by side so the comparison itself is
// the point, not a re-derived judgment.
export default function DecisionComparisonTable({ currency, transactions, currentCashBalance }: Props) {
    const [scenarios, setScenarios] = useState<DraftScenario[]>([emptyDraft(), emptyDraft()]);

    const updateScenario = (id: string, patch: Partial<DraftScenario>) => {
        setScenarios(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
    };
    const addScenario = () => {
        if (scenarios.length >= MAX_SCENARIOS) return;
        setScenarios(prev => [...prev, emptyDraft()]);
    };
    const removeScenario = (id: string) => {
        setScenarios(prev => (prev.length <= 1 ? prev : prev.filter(s => s.id !== id)));
    };

    const inputs: DecisionScenarioInput[] = scenarios
        .filter(s => s.label.trim().length > 0)
        .map(s => ({
            id: s.id,
            label: s.label.trim(),
            monthlyRevenueDelta: parseFloat(s.revenue) || 0,
            monthlyCostDelta: parseFloat(s.cost) || 0,
            newLoanMonthlyPayment: parseFloat(s.loanPayment) || 0,
        }));
    const rows: DecisionComparisonRow[] = inputs.length > 0
        ? compareDecisionScenarios(inputs, transactions, currentCashBalance, currency)
        : [];

    const fmt = (n: number) => `${n >= 0 ? '+' : '-'}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

    return (
        <View>
            <Text style={styles.help}>
                Name each decision you're weighing and its rough monthly effect — a new hire's salary, a price
                increase, a loan's monthly payment. See them side by side before committing to any one.
            </Text>

            {scenarios.map((s, idx) => (
                <View key={s.id} style={styles.scenarioForm}>
                    <View style={styles.scenarioFormHeader}>
                        <TextInput
                            style={styles.labelInput}
                            value={s.label}
                            onChangeText={t => updateScenario(s.id, { label: t })}
                            placeholder={`Decision ${idx + 1} (e.g. Hire 3 staff)`}
                            placeholderTextColor={Colors.muted}
                        />
                        {scenarios.length > 1 && (
                            <TouchableOpacity onPress={() => removeScenario(s.id)} style={styles.removeBtn}>
                                <Icon name="x" size={14} color={Colors.textMuted} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.fieldRow}>
                        <View style={styles.field}>
                            <Text style={styles.fieldLabel}>Monthly revenue change</Text>
                            <TextInput
                                style={styles.numberInput}
                                value={s.revenue}
                                onChangeText={t => updateScenario(s.id, { revenue: t })}
                                placeholder="0"
                                placeholderTextColor={Colors.muted}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={styles.field}>
                            <Text style={styles.fieldLabel}>Monthly cost change</Text>
                            <TextInput
                                style={styles.numberInput}
                                value={s.cost}
                                onChangeText={t => updateScenario(s.id, { cost: t })}
                                placeholder="0"
                                placeholderTextColor={Colors.muted}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={styles.field}>
                            <Text style={styles.fieldLabel}>New loan payment</Text>
                            <TextInput
                                style={styles.numberInput}
                                value={s.loanPayment}
                                onChangeText={t => updateScenario(s.id, { loanPayment: t })}
                                placeholder="0"
                                placeholderTextColor={Colors.muted}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>
                </View>
            ))}

            {scenarios.length < MAX_SCENARIOS && (
                <TouchableOpacity style={styles.addBtn} onPress={addScenario}>
                    <Icon name="plus" size={13} color={Colors.primary} />
                    <Text style={styles.addBtnText}>Add another decision</Text>
                </TouchableOpacity>
            )}

            {rows.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: Spacing.lg }}>
                    <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeaderRow]}>
                            <Text style={[styles.cell, styles.headerCell, styles.decisionCol]}>Decision</Text>
                            <Text style={[styles.cell, styles.headerCell, styles.numCol]}>Revenue</Text>
                            <Text style={[styles.cell, styles.headerCell, styles.numCol]}>Cash</Text>
                            <Text style={[styles.cell, styles.headerCell, styles.numCol]}>Profit</Text>
                            <Text style={[styles.cell, styles.headerCell, styles.badgeCol]}>Risk</Text>
                            <Text style={[styles.cell, styles.headerCell, styles.badgeCol]}>Funding Capacity</Text>
                        </View>
                        {rows.map(row => (
                            <View key={row.id} style={styles.tableRow}>
                                <Text style={[styles.cell, styles.decisionCol, styles.decisionCell]}>{row.label}</Text>
                                {!row.available ? (
                                    <Text style={[styles.cell, styles.unavailableCell]}>{row.reason || 'Not enough history yet'}</Text>
                                ) : (
                                    <>
                                        <Text style={[styles.cell, styles.numCol, { color: row.monthlyRevenueImpact >= 0 ? Colors.income : Colors.expense }]}>
                                            {fmt(row.monthlyRevenueImpact)}
                                        </Text>
                                        <Text style={[styles.cell, styles.numCol, { color: row.monthlyCashImpact >= 0 ? Colors.income : Colors.expense }]}>
                                            {fmt(row.monthlyCashImpact)}
                                        </Text>
                                        <Text style={[styles.cell, styles.numCol, { color: row.monthlyProfitImpact >= 0 ? Colors.income : Colors.expense }]}>
                                            {fmt(row.monthlyProfitImpact)}
                                        </Text>
                                        <View style={[styles.badgeCol, styles.badgeCell]}>
                                            <View style={[styles.badge, { backgroundColor: RISK_COLOR[row.risk] + '22' }]}>
                                                <Text style={[styles.badgeText, { color: RISK_COLOR[row.risk] }]}>{row.risk}</Text>
                                            </View>
                                        </View>
                                        <View style={[styles.badgeCol, styles.badgeCell]}>
                                            <View style={[styles.badge, { backgroundColor: CAPACITY_COLOR[row.fundingCapacity] + '22' }]}>
                                                <Text style={[styles.badgeText, { color: CAPACITY_COLOR[row.fundingCapacity] }]}>{row.fundingCapacity}</Text>
                                            </View>
                                        </View>
                                    </>
                                )}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    help: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.md },
    scenarioForm: {
        backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.sm, marginBottom: Spacing.sm,
    },
    scenarioFormHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
    labelInput: {
        flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary,
        borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 4,
    },
    removeBtn: { padding: 4 },
    fieldRow: { flexDirection: 'row', gap: Spacing.sm },
    field: { flex: 1 },
    fieldLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 3 },
    numberInput: {
        fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.surface,
        borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
        paddingHorizontal: Spacing.sm, paddingVertical: 6,
    },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 2 },
    addBtnText: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },

    table: { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
    tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border },
    tableHeaderRow: { borderTopWidth: 0, backgroundColor: Colors.bg },
    cell: { paddingVertical: 10, paddingHorizontal: Spacing.sm, fontSize: 12, color: Colors.textPrimary },
    headerCell: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    decisionCol: { width: 150 },
    decisionCell: { fontWeight: '700' },
    numCol: { width: 100, fontWeight: '600' },
    badgeCol: { width: 110, justifyContent: 'center' },
    badgeCell: { paddingVertical: 6, paddingHorizontal: Spacing.sm },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
    badgeText: { fontSize: 10.5, fontWeight: '700' },
    unavailableCell: { flex: 1, fontStyle: 'italic', color: Colors.textMuted },
});
