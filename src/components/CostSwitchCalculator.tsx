import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon, { IconName } from './ui/Icon';
import { computeCostSwitch, CostSwitchVerdict } from '../utils/costSwitchEngine';
import NextStepLink from './NextStepLink';

interface Props {
    currency: string;
    cashBalance: number;
    minReserve: number;
    // A category name and its current monthly amount, handed off from Cost
    // Exposure's own biggest-driver list -- same one-time-consumed prefill
    // pattern AssetAcquisitionCalculator/GrowthAffordabilityCalculator use,
    // so tapping "Simulate reducing this" there lands here pre-filled
    // instead of asking the owner to retype a number they already saw.
    prefill?: { label: string; monthlyAmount: number } | null;
    onPrefillConsumed?: () => void;
    // Shown once there's a real upfront figure to finance, so a switch that
    // isn't affordable in cash (or that the owner would rather finance
    // outright) can go straight to Financing Marketplace with the category
    // and amount already filled in, instead of making them retype both.
    onSeeFinancing?: (upfrontCost: number, costLabel: string) => void;
}

const HORIZON_MONTHS = 36;

const VERDICT_META: Record<CostSwitchVerdict, { label: string; color: string; icon: IconName }> = {
    strong: { label: 'Worth it', color: Colors.income, icon: 'check-circle' },
    marginal: { label: 'Worth weighing', color: Colors.warning, icon: 'alert-circle' },
    'not-worth-it': { label: 'Not yet', color: Colors.warning, icon: 'clock' },
    'increases-cost': { label: "Doesn't pay for itself", color: Colors.expense, icon: 'alert-triangle' },
};

function parseNum(value: string): number {
    return parseFloat(value.replace(/,/g, ''));
}

// "Will replacing fuel/generator with solar pay for itself?" generalized:
// any ongoing cost (delivery, manual labor, rented equipment, a software
// workaround) weighed against paying upfront -- cash or financed -- to cut
// or remove it. See costSwitchEngine.ts for why this is a different
// question than the existing Buy/Finance/Lease and Growth Affordability
// calculators, which both assume a NEW cost, not a replacement for one
// already being paid.
export default function CostSwitchCalculator({ currency, cashBalance, minReserve, prefill, onPrefillConsumed, onSeeFinancing }: Props) {
    const [costLabel, setCostLabel] = useState('');
    const [currentMonthlyCost, setCurrentMonthlyCost] = useState('');
    const [upfrontCost, setUpfrontCost] = useState('');
    const [newMonthlyCost, setNewMonthlyCost] = useState('0');
    const [financed, setFinanced] = useState(false);
    const [termMonths, setTermMonths] = useState('24');
    const [aprPercent, setAprPercent] = useState('20');

    useEffect(() => {
        if (!prefill) return;
        setCostLabel(prefill.label);
        setCurrentMonthlyCost(prefill.monthlyAmount > 0 ? String(Math.round(prefill.monthlyAmount)) : '');
        onPrefillConsumed?.();
    }, [prefill]);

    const currentMonthlyCostNum = parseNum(currentMonthlyCost);
    const upfrontCostNum = parseNum(upfrontCost);
    const parsedTermMonths = parseInt(termMonths.replace(/,/g, ''), 10);
    const termMonthsNum = Number.isFinite(parsedTermMonths) && parsedTermMonths > 0 ? parsedTermMonths : 24;

    const result = !isNaN(currentMonthlyCostNum) && currentMonthlyCostNum > 0 && !isNaN(upfrontCostNum) && upfrontCostNum > 0
        ? computeCostSwitch({
            currentMonthlyCost: currentMonthlyCostNum,
            upfrontCost: upfrontCostNum,
            newMonthlyCost: parseNum(newMonthlyCost) || 0,
            financed,
            termMonths: termMonthsNum,
            aprPercent: parseNum(aprPercent) || 0,
            cashBalance,
            minReserve,
            horizonMonths: HORIZON_MONTHS,
        })
        : null;

    return (
        <View style={s.card}>
            <View style={s.titleRow}>
                <Icon name="repeat" size={16} color={Colors.text} />
                <Text style={s.title}>Will Switching This Cost Pay For Itself?</Text>
            </View>
            <Text style={s.subtitle}>
                Generator vs. solar, delivery vs. your own vehicle, rented equipment vs. buying it — pay an upfront cost
                now to cut or remove something you're already paying monthly, and see the real payback period. Nothing
                here is recorded; it's just the numbers.
            </Text>

            <Text style={s.fieldLabel}>What are you replacing? (optional)</Text>
            <TextInput style={s.input} value={costLabel} onChangeText={setCostLabel} placeholder="e.g. Generator fuel" placeholderTextColor={Colors.muted} />

            <Text style={s.fieldLabel}>{`Current monthly cost (${currency})`}</Text>
            <TextInput style={s.input} value={currentMonthlyCost} onChangeText={setCurrentMonthlyCost} keyboardType="decimal-pad" placeholder="e.g. 85,000" placeholderTextColor={Colors.muted} />

            <Text style={s.fieldLabel}>{`Upfront cost of the replacement (${currency})`}</Text>
            <TextInput style={s.input} value={upfrontCost} onChangeText={setUpfrontCost} keyboardType="decimal-pad" placeholder="e.g. 1,800,000" placeholderTextColor={Colors.muted} />

            <Text style={s.fieldLabel}>{`New ongoing monthly cost (${currency}) — 0 if none`}</Text>
            <TextInput style={s.input} value={newMonthlyCost} onChangeText={setNewMonthlyCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.muted} />

            <View style={s.financeToggleRow}>
                <TouchableOpacity style={[s.financeToggleBtn, !financed && s.financeToggleBtnActive]} onPress={() => setFinanced(false)}>
                    <Text style={[s.financeToggleText, !financed && s.financeToggleTextActive]}>Pay cash</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.financeToggleBtn, financed && s.financeToggleBtnActive]} onPress={() => setFinanced(true)}>
                    <Text style={[s.financeToggleText, financed && s.financeToggleTextActive]}>Finance it</Text>
                </TouchableOpacity>
            </View>

            {financed && (
                <View style={s.row}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>Finance term (months)</Text>
                        <TextInput style={s.input} value={termMonths} onChangeText={setTermMonths} keyboardType="number-pad" placeholder="24" placeholderTextColor={Colors.muted} />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>Interest rate (% APR)</Text>
                        <TextInput style={s.input} value={aprPercent} onChangeText={setAprPercent} keyboardType="decimal-pad" placeholder="20" placeholderTextColor={Colors.muted} />
                    </View>
                </View>
            )}

            {!result && <Text style={s.emptyHint}>Enter the current monthly cost and the upfront replacement cost to see the payback.</Text>}

            {result && (
                <>
                    <View style={[s.verdictBox, { borderColor: VERDICT_META[result.verdict].color, backgroundColor: VERDICT_META[result.verdict].color + '12' }]}>
                        <View style={s.verdictHeaderRow}>
                            <Icon name={VERDICT_META[result.verdict].icon} size={16} color={VERDICT_META[result.verdict].color} />
                            <Text style={[s.verdictLabel, { color: VERDICT_META[result.verdict].color }]}>{VERDICT_META[result.verdict].label}</Text>
                        </View>
                        <Text style={s.verdictText}>{result.rationale}</Text>
                    </View>

                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>Monthly saving</Text>
                        <Text style={[s.resultVal, { color: result.monthlySavings >= 0 ? Colors.income : Colors.expense }]}>
                            {result.monthlySavings >= 0 ? '+' : ''}{currency}{Math.round(result.monthlySavings).toLocaleString()}
                        </Text>
                    </View>
                    {result.paybackMonths !== null && (
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>Payback period</Text>
                            <Text style={s.resultVal}>{result.paybackMonths.toFixed(1)} months</Text>
                        </View>
                    )}
                    {financed && (
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>Finance payment</Text>
                            <Text style={[s.resultVal, { color: Colors.expense }]}>{currency}{Math.round(result.financeMonthlyPayment).toLocaleString()}/mo</Text>
                        </View>
                    )}
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>{`Savings over ${HORIZON_MONTHS} months`}</Text>
                        <Text style={[s.resultVal, { color: result.totalSavingsOverHorizon >= 0 ? Colors.income : Colors.expense, fontWeight: '800' }]}>
                            {result.totalSavingsOverHorizon >= 0 ? '+' : ''}{currency}{Math.round(result.totalSavingsOverHorizon).toLocaleString()}
                        </Text>
                    </View>

                    {!financed && (
                        <Text style={[s.affordText, { color: result.affordableNow ? Colors.income : Colors.expense }]}>
                            {result.affordableNow
                                ? `✓ Cash after: ${currency}${Math.round(result.cashAfterUpfront).toLocaleString()} (reserve kept)`
                                : `⚠ Paying cash now would leave you below your minimum reserve (${currency}${Math.round(result.cashAfterUpfront).toLocaleString()} after) — consider financing instead`}
                        </Text>
                    )}

                    {onSeeFinancing && result.verdict !== 'increases-cost' && (financed || !result.affordableNow) && (
                        <NextStepLink
                            text="Need to finance this? See matching lenders"
                            onPress={() => onSeeFinancing(upfrontCostNum, costLabel)}
                        />
                    )}
                </>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.text },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.md },

    fieldLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4, marginTop: 8 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.text, backgroundColor: Colors.bg },
    row: { flexDirection: 'row' },

    financeToggleRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    financeToggleBtn: { flex: 1, paddingVertical: 9, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.bg },
    financeToggleBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '14' },
    financeToggleText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
    financeToggleTextActive: { color: Colors.primary },

    emptyHint: { fontSize: 12, color: Colors.muted, fontStyle: 'italic', marginTop: Spacing.md },

    verdictBox: { borderRadius: Radius.sm, borderWidth: 1, padding: 10, marginTop: Spacing.md },
    verdictHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    verdictLabel: { fontSize: 13, fontWeight: '800' },
    verdictText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    resultLabel: { fontSize: 12, color: Colors.textSecondary },
    resultVal: { fontSize: 13, fontWeight: '700', color: Colors.text },

    affordText: { fontSize: 11.5, fontWeight: '700', marginTop: 8 },
});
