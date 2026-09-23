import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { analyzeAcquisition, AcquisitionMethod } from '../utils/assetAcquisitionEngine';
import { computeProfitCashImpact } from '../utils/impactChain';
import ProfitCashImpactCard from './ProfitCashImpactCard';

interface Props {
    currency: string;
    cashBalance: number;
    monthlyProfit: number;
    minReserve: number;
    onSeeFullPicture: () => void;
}

// The same Cash / Credit / Lease decision tree Assets > Add Asset already
// runs (assetAcquisitionEngine.ts) -- surfaced here as a standalone "what
// if" calculator, with no asset actually created and no transactions
// recorded, for the "before I even go looking, which way should I acquire
// this" question. Same engine, same recommendation logic, just without the
// side effect of committing to a purchase.
export default function AssetAcquisitionCalculator({ currency, cashBalance, monthlyProfit, minReserve, onSeeFullPicture }: Props) {
    const [cost, setCost] = useState('');
    const [usefulLife, setUsefulLife] = useState('5');
    const [residualValue, setResidualValue] = useState('0');
    const [termMonths, setTermMonths] = useState('24');
    const [aprPercent, setAprPercent] = useState('20');
    const [selectedMethod, setSelectedMethod] = useState<AcquisitionMethod | null>(null);

    const costNum = parseFloat(cost);
    const analysis = !isNaN(costNum) && costNum > 0
        ? analyzeAcquisition({
            cost: costNum,
            usefulLifeYears: parseFloat(usefulLife) || 5,
            residualValue: parseFloat(residualValue) || 0,
            termMonths: parseInt(termMonths, 10) || 24,
            aprPercent: parseFloat(aprPercent) || 0,
            cashBalance,
            monthlyProfit,
            minReserve,
            currency,
        })
        : null;

    const selected = analysis?.options.find(o => o.method === (selectedMethod ?? analysis.recommended)) ?? null;

    return (
        <View style={s.card}>
            <View style={s.titleRow}>
                <Icon name="zap" size={16} color={Colors.text} />
                <Text style={s.title}>Buy, Finance, or Lease?</Text>
            </View>
            <Text style={s.subtitle}>
                Before you commit to buying an asset — a vehicle, equipment, machinery — see whether paying cash, buying on credit, or leasing actually makes more sense for your business right now. Nothing here is recorded; it's just the numbers.
            </Text>

            <Text style={s.fieldLabel}>{`Asset cost (${currency})`}</Text>
            <TextInput style={s.input} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="e.g. 2,500,000" placeholderTextColor={Colors.muted} />

            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Useful life (years)</Text>
                    <TextInput style={s.input} value={usefulLife} onChangeText={setUsefulLife} keyboardType="decimal-pad" placeholder="5" placeholderTextColor={Colors.muted} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>{`Residual value (${currency})`}</Text>
                    <TextInput style={s.input} value={residualValue} onChangeText={setResidualValue} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.muted} />
                </View>
            </View>

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

            {!analysis && <Text style={s.emptyHint}>Enter an asset cost to compare cash, credit, and lease.</Text>}

            {analysis && (
                <>
                    <Text style={s.optionsHint}>Tap an option to see its full impact below:</Text>
                    {analysis.options.map(opt => {
                        const isRec = opt.method === analysis.recommended;
                        const isSelected = opt.method === (selectedMethod ?? analysis.recommended);
                        return (
                            <TouchableOpacity
                                key={opt.method}
                                activeOpacity={0.8}
                                onPress={() => setSelectedMethod(opt.method)}
                                style={[s.option, isSelected && { borderColor: Colors.primary, borderWidth: 2, backgroundColor: Colors.primary + '10' }]}
                            >
                                <View style={s.optHeader}>
                                    <Text style={s.optLabel}>{isSelected ? '● ' : '○ '}{opt.label}{isRec ? '  ⭐' : ''}</Text>
                                    <Text style={s.optOwns}>{opt.ownsAsset ? 'You own it' : 'Rented'}</Text>
                                </View>
                                <Text style={s.optLine}>
                                    Upfront cash: <Text style={s.optVal}>{currency}{Math.round(opt.upfront).toLocaleString()}</Text>
                                    {opt.monthly > 0 ? <Text> · Monthly: <Text style={s.optVal}>{currency}{Math.round(opt.monthly).toLocaleString()}</Text> × {opt.termMonths}</Text> : null}
                                </Text>
                                <Text style={s.optLine}>
                                    Total paid: <Text style={s.optVal}>{currency}{Math.round(opt.totalCashPaid).toLocaleString()}</Text>
                                    {opt.extraVsCash > 0 ? <Text style={{ color: Colors.expense }}>  (+{currency}{Math.round(opt.extraVsCash).toLocaleString()} vs cash)</Text> : null}
                                </Text>
                                <Text style={s.optLine}>
                                    Monthly profit impact: <Text style={[s.optVal, { color: Colors.expense }]}>-{currency}{Math.round(opt.monthlyProfitImpact).toLocaleString()}</Text>
                                </Text>
                                {opt.method === 'cash' ? (
                                    <Text style={[s.optFlag, { color: opt.keepsReserve ? Colors.income : Colors.expense }]}>
                                        {opt.affordableNow
                                            ? (opt.keepsReserve
                                                ? `✓ Cash after: ${currency}${Math.round(opt.cashAfterUpfront).toLocaleString()} (reserve kept)`
                                                : `⚠ Cash after: ${currency}${Math.round(opt.cashAfterUpfront).toLocaleString()} — below your minimum reserve`)
                                            : `⚠ Not enough cash (short by ${currency}${Math.round(costNum - cashBalance).toLocaleString()})`}
                                    </Text>
                                ) : (
                                    <Text style={[s.optFlag, { color: opt.serviceable ? Colors.income : Colors.expense }]}>
                                        {opt.serviceable
                                            ? `✓ ${currency}${Math.round(opt.monthly).toLocaleString()}/mo is covered by profit`
                                            : `⚠ ${currency}${Math.round(opt.monthly).toLocaleString()}/mo exceeds current monthly profit`}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}

                    <View style={s.verdict}>
                        <Text style={s.verdictText}>{analysis.rationale}</Text>
                    </View>

                    {selected && (
                        <ProfitCashImpactCard
                            impact={computeProfitCashImpact(monthlyProfit, cashBalance - selected.upfront, -selected.monthlyProfitImpact)}
                            source="asset"
                            currency={currency}
                            onSeeFullPicture={onSeeFullPicture}
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

    emptyHint: { fontSize: 12, color: Colors.muted, fontStyle: 'italic', marginTop: Spacing.md },

    optionsHint: { fontSize: 10.5, color: Colors.muted, fontStyle: 'italic', marginTop: Spacing.md, marginBottom: 2 },
    option: { backgroundColor: Colors.bg, borderRadius: 10, padding: 10, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
    optHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    optLabel: { fontSize: 12, fontWeight: '800', color: Colors.text },
    optOwns: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
    optLine: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3, lineHeight: 16 },
    optVal: { fontWeight: '700', color: Colors.text },
    optFlag: { fontSize: 11, fontWeight: '700', marginTop: 4 },

    verdict: { borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary, padding: 10, marginTop: Spacing.md, backgroundColor: Colors.primary + '12' },
    verdictText: { fontSize: 11.5, fontWeight: '600', lineHeight: 16, color: Colors.primary },
});
