import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeDecisionSimulation, computeExpansionReadiness, DecisionAffordability, ExpansionReadinessBand } from '../utils/financialDecisionSimulator';
import { FinancialHealthPillar } from '../utils/financialHealthPillars';

interface Props {
    currency: string;
    transactions: Transaction[];
    currentCashBalance: number;
    // Only used for the Expansion Readiness banner -- omit it and this
    // component still answers "can I afford this" without that banner,
    // for callers that don't already have the pillar breakdown at hand.
    pillars?: FinancialHealthPillar[];
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

const AFFORDABILITY_META: Record<DecisionAffordability, { label: string; color: string }> = {
    affordable: { label: '✅ Affordable under current conditions', color: Colors.income },
    tight: { label: '⚡ Affordable, but tight', color: Colors.warning },
    not_affordable: { label: '⚠️ Not affordable yet', color: Colors.expense },
};

const READINESS_META: Record<ExpansionReadinessBand, { color: string }> = {
    Strong: { color: Colors.income },
    Moderate: { color: Colors.warning },
    Weak: { color: Colors.expense },
};

// "Can my business afford this decision?" for the most common shape of
// decision an owner asks about: one new ongoing monthly cost -- a hire, a
// second location's added fixed overhead, a new recurring service. See
// financialDecisionSimulator.ts for why this is deliberately simpler than
// the Growth Affordability Calculator (no upfront cost or ramp-up
// modeled) and why the downside check reuses Revenue Stress Test's own
// -20% convention rather than inventing a new one.
export default function DecisionSimulator({ currency, transactions, currentCashBalance, pillars }: Props) {
    const [addedCost, setAddedCost] = useState('');

    const result = useMemo(() => {
        const additionalMonthlyCost = parseFloat(addedCost) || 0;
        if (additionalMonthlyCost <= 0) return null;
        return computeDecisionSimulation(transactions, currentCashBalance, additionalMonthlyCost, currency);
    }, [addedCost, transactions, currentCashBalance, currency]);

    const expansionReadiness = useMemo(
        () => (pillars && pillars.length > 0 ? computeExpansionReadiness(pillars) : null),
        [pillars],
    );

    return (
        <View style={s.card}>
            <Text style={s.title}>🧮 Can I Afford This Decision?</Text>
            <Text style={s.subtitle}>
                Enter one new ongoing monthly cost — a new hire's salary, a second location's added rent and overhead, a new service — and see whether your current cash flow can carry it.
            </Text>

            <View style={s.field}>
                <Text style={s.fieldLabel}>New Monthly Cost</Text>
                <View style={s.inputWrap}>
                    <Text style={s.affix}>{currency}</Text>
                    <TextInput
                        style={s.input}
                        value={addedCost}
                        onChangeText={setAddedCost}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                    />
                </View>
            </View>

            {!result && <Text style={s.emptyHint}>Enter a new monthly cost to check affordability.</Text>}

            {result && !result.available && <Text style={s.emptyHint}>{result.reason}</Text>}

            {result && result.available && (
                <>
                    <View style={s.statRow}>
                        <Stat label="Current monthly cash surplus" value={fmt(currency, result.currentMonthlySurplus)} negative={result.currentMonthlySurplus < 0} />
                        <Stat label="New monthly cost" value={fmt(currency, result.additionalMonthlyCost)} />
                        <Stat label="Surplus after" value={fmt(currency, result.surplusAfterDecision)} negative={result.surplusAfterDecision < 0} />
                    </View>

                    <View style={[s.verdictBox, { borderColor: AFFORDABILITY_META[result.affordability].color }]}>
                        <Text style={[s.verdictLabel, { color: AFFORDABILITY_META[result.affordability].color }]}>
                            {AFFORDABILITY_META[result.affordability].label}
                        </Text>
                        <Text style={s.verdictReason}>{result.assessment}</Text>
                    </View>

                    <View style={s.downsideBox}>
                        <Text style={s.downsideLabel}>Downside scenario: revenue falls {result.downsideRevenueDropPct}%</Text>
                        <Text style={s.downsideText}>{result.downsideNarrative}</Text>
                    </View>

                    {expansionReadiness && (
                        <View style={[s.readinessBox, { borderColor: READINESS_META[expansionReadiness.band].color }]}>
                            <Text style={[s.readinessLabel, { color: READINESS_META[expansionReadiness.band].color }]}>
                                Expansion Readiness: {expansionReadiness.band}
                            </Text>
                            <Text style={s.readinessSubtext}>
                                Your weakest Financial Health pillar right now, since that's what would break first under added strain.
                            </Text>
                            <Text style={s.downsideText}>
                                {Number.isFinite(result.monthsOfReserveForAddedCost)
                                    ? `Your current cash position can support approximately ${result.monthsOfReserveForAddedCost.toFixed(1)} months of this additional fixed cost on its own.`
                                    : 'Enter a new monthly cost above to see how many months your cash reserve would cover it.'}
                                {' '}Limiting factor: {expansionReadiness.limitingPillar.label} ({Math.round(expansionReadiness.limitingPillar.score)}/100).
                            </Text>
                        </View>
                    )}
                </>
            )}
        </View>
    );
}

function Stat({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
    return (
        <View style={s.stat}>
            <Text style={s.statLabel}>{label}</Text>
            <Text style={[s.statVal, negative && { color: Colors.expense }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 17 },

    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, lineHeight: 13 },
    statVal: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    downsideBox: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginTop: 10 },
    downsideLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    downsideText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    readinessBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 10 },
    readinessLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    readinessSubtext: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 4 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
