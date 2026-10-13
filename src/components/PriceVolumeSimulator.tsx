import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon, { IconName } from './ui/Icon';
import { computePriceVolumeImpact, PriceVolumeVerdict } from '../utils/priceVolumeEngine';

interface Props {
    currency: string;
    // A specific product and its real recent numbers, handed off from
    // Inventory Pricing's own per-item list -- same one-time-consumed
    // prefill pattern CostSwitchCalculator/AssetAcquisitionCalculator use,
    // so tapping "Test your own volume assumption" there lands here
    // pre-filled instead of asking the owner to retype numbers already on
    // screen.
    prefill?: { label: string; unitsSoldPerMonth: number; currentPrice: number; costPerUnit: number; currentStockUnits?: number; priceChangePct?: number } | null;
    onPrefillConsumed?: () => void;
}

const VERDICT_META: Record<PriceVolumeVerdict, { label: string; color: string; icon: IconName }> = {
    strong: { label: 'Worth testing', color: Colors.income, icon: 'check-circle' },
    marginal: { label: 'Thin margin for error', color: Colors.warning, icon: 'alert-circle' },
    'not-worth-it': { label: "Doesn't pay off", color: Colors.warning, icon: 'trending-down' },
    'destroys-margin': { label: 'Below cost', color: Colors.expense, icon: 'alert-triangle' },
};

function parseNum(value: string): number {
    return parseFloat(value.replace(/,/g, ''));
}

// "Would a 5% discount generate enough additional sales to compensate for
// the lower margin?" -- generalized to any price change (cut or rise) on
// any one product, with the owner supplying their own volume assumption
// rather than this engine guessing one. See priceVolumeEngine.ts for why
// this is a different question than inventoryPricingScenario.ts's
// portfolio-wide pricing tool, which deliberately never assumes a price
// cut changes volume at all.
export default function PriceVolumeSimulator({ currency, prefill, onPrefillConsumed }: Props) {
    const [productLabel, setProductLabel] = useState('');
    const [unitsSoldPerMonth, setUnitsSoldPerMonth] = useState('');
    const [currentPrice, setCurrentPrice] = useState('');
    const [costPerUnit, setCostPerUnit] = useState('');
    const [currentStockUnits, setCurrentStockUnits] = useState('');
    const [priceChangePct, setPriceChangePct] = useState('-5');
    const [assumedVolumeChangePct, setAssumedVolumeChangePct] = useState('15');

    useEffect(() => {
        if (!prefill) return;
        setProductLabel(prefill.label);
        setUnitsSoldPerMonth(prefill.unitsSoldPerMonth > 0 ? String(Math.round(prefill.unitsSoldPerMonth)) : '');
        setCurrentPrice(prefill.currentPrice > 0 ? String(prefill.currentPrice) : '');
        setCostPerUnit(prefill.costPerUnit >= 0 ? String(prefill.costPerUnit) : '');
        setCurrentStockUnits(prefill.currentStockUnits != null ? String(Math.round(prefill.currentStockUnits)) : '');
        // Lets a hand-off carry the actual direction/size under
        // consideration (e.g. a recommended price INCREASE) instead of
        // always opening on the generic -5% default, which would silently
        // contradict a price-rise recommendation the owner just came from.
        if (prefill.priceChangePct != null) {
            setPriceChangePct(prefill.priceChangePct.toFixed(1));
            // The generic +15% volume-change default assumes a cut winning
            // volume -- left as-is for a price INCREASE it would silently
            // assume raising the price also drives MORE sales, an
            // optimistic assumption with no basis. Default to a volume
            // LOSS instead, the downside this hand-off is actually meant
            // to stress-test; still just a starting point to edit.
            if (prefill.priceChangePct > 0) setAssumedVolumeChangePct('-5');
        }
        onPrefillConsumed?.();
    }, [prefill]);

    const unitsSoldPerMonthNum = parseNum(unitsSoldPerMonth);
    const currentPriceNum = parseNum(currentPrice);
    const costPerUnitNum = parseNum(costPerUnit);
    const stockNum = currentStockUnits.trim() !== '' ? parseNum(currentStockUnits) : undefined;

    const result = !isNaN(unitsSoldPerMonthNum) && unitsSoldPerMonthNum > 0
        && !isNaN(currentPriceNum) && currentPriceNum > 0
        && !isNaN(costPerUnitNum) && costPerUnitNum >= 0
        ? computePriceVolumeImpact({
            unitsSoldPerMonth: unitsSoldPerMonthNum,
            currentPrice: currentPriceNum,
            costPerUnit: costPerUnitNum,
            priceChangePct: parseNum(priceChangePct) || 0,
            assumedVolumeChangePct: parseNum(assumedVolumeChangePct) || 0,
            currentStockUnits: stockNum != null && !isNaN(stockNum) ? stockNum : undefined,
        })
        : null;

    return (
        <View style={s.card}>
            <View style={s.titleRow}>
                <Icon name="percent" size={16} color={Colors.text} />
                <Text style={s.title}>Would This Price Change Pay Off?</Text>
            </View>
            <Text style={s.subtitle}>
                A discount only pays for itself if the extra sales it brings in cover the margin given up — enter your own
                guess for how volume responds and see the real break-even point, not just a hunch.
            </Text>

            <Text style={s.fieldLabel}>Which product? (optional)</Text>
            <TextInput style={s.input} value={productLabel} onChangeText={setProductLabel} placeholder="e.g. 50kg rice bag" placeholderTextColor={Colors.muted} />

            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Units sold / month</Text>
                    <TextInput style={s.input} value={unitsSoldPerMonth} onChangeText={setUnitsSoldPerMonth} keyboardType="decimal-pad" placeholder="e.g. 1,000" placeholderTextColor={Colors.muted} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>{`Current price (${currency})`}</Text>
                    <TextInput style={s.input} value={currentPrice} onChangeText={setCurrentPrice} keyboardType="decimal-pad" placeholder="e.g. 1,000" placeholderTextColor={Colors.muted} />
                </View>
            </View>

            <Text style={s.fieldLabel}>{`Cost per unit (${currency})`}</Text>
            <TextInput style={s.input} value={costPerUnit} onChangeText={setCostPerUnit} keyboardType="decimal-pad" placeholder="e.g. 700" placeholderTextColor={Colors.muted} />

            <View style={s.row}>
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Price change (%)</Text>
                    <TextInput style={s.input} value={priceChangePct} onChangeText={setPriceChangePct} keyboardType="numbers-and-punctuation" placeholder="-5" placeholderTextColor={Colors.muted} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Assumed volume change (%)</Text>
                    <TextInput style={s.input} value={assumedVolumeChangePct} onChangeText={setAssumedVolumeChangePct} keyboardType="numbers-and-punctuation" placeholder="15" placeholderTextColor={Colors.muted} />
                </View>
            </View>

            <Text style={s.fieldLabel}>Units currently in stock (optional)</Text>
            <TextInput style={s.input} value={currentStockUnits} onChangeText={setCurrentStockUnits} keyboardType="decimal-pad" placeholder="Checks whether you can actually supply the extra volume" placeholderTextColor={Colors.muted} />

            {!result && <Text style={s.emptyHint}>Enter units sold, current price, and cost per unit to see the impact.</Text>}

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
                        <Text style={s.resultLabel}>Gross profit now</Text>
                        <Text style={s.resultVal}>{currency}{Math.round(result.currentGrossProfit).toLocaleString()}/mo</Text>
                    </View>
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>Gross profit under your assumption</Text>
                        <Text style={[s.resultVal, { color: result.grossProfitChange >= 0 ? Colors.income : Colors.expense, fontWeight: '800' }]}>
                            {currency}{Math.round(result.newGrossProfit).toLocaleString()}/mo ({result.grossProfitChange >= 0 ? '+' : ''}{currency}{Math.round(result.grossProfitChange).toLocaleString()})
                        </Text>
                    </View>
                    {result.breakEvenVolumeChangePct !== null && (
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>Volume change needed to break even</Text>
                            <Text style={s.resultVal}>{result.breakEvenVolumeChangePct >= 0 ? '+' : ''}{result.breakEvenVolumeChangePct.toFixed(1)}%</Text>
                        </View>
                    )}
                    <View style={s.resultRow}>
                        <Text style={s.resultLabel}>If volume doesn't respond at all</Text>
                        <Text style={[s.resultVal, { color: result.noResponseGrossProfitChange >= 0 ? Colors.income : Colors.expense }]}>
                            {result.noResponseGrossProfitChange >= 0 ? '+' : ''}{currency}{Math.round(result.noResponseGrossProfitChange).toLocaleString()}/mo
                        </Text>
                    </View>

                    {result.stockSufficient === false && (
                        <Text style={s.stockWarning}>
                            ⚠ The assumed volume ({Math.round(result.newUnitsSold).toLocaleString()} units) is more than the {Math.round(parseNum(currentStockUnits)).toLocaleString()} you currently have in stock.
                        </Text>
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

    verdictBox: { borderRadius: Radius.sm, borderWidth: 1, padding: 10, marginTop: Spacing.md },
    verdictHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    verdictLabel: { fontSize: 13, fontWeight: '800' },
    verdictText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    resultLabel: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1, paddingRight: 8 },
    resultVal: { fontSize: 13, fontWeight: '700', color: Colors.text },

    stockWarning: { fontSize: 11.5, fontWeight: '700', color: Colors.warning, marginTop: 8, lineHeight: 16 },
});
