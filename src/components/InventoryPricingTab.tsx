import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { computeInventoryPricingScenario, computeRequiredUniformPriceChange, ProductPricingRow } from '../utils/inventoryPricingScenario';
import { computeRequiredPriceIncrease } from '../utils/priceAdjustment';
import { computeInventoryPricingInsights } from '../utils/inventoryPricingInsights';
import { computeInventoryDecisions, InventoryDecisionAction } from '../utils/inventoryDecisions';

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

const DECISION_COLOR: Record<InventoryDecisionAction, string> = {
    reorder: Colors.income,
    reduce: Colors.warning,
    discontinue: Colors.expense,
};
const DECISION_LABEL: Record<InventoryDecisionAction, string> = {
    reorder: 'Reorder',
    reduce: 'Reduce',
    discontinue: 'Discontinue',
};

// Pricing Optimization, grounded in real goods and real sales instead of an
// abstract "assume this much revenue at this margin" calculator -- every
// number here traces back to an actual inventory item and its own recent
// sell-through (see inventoryPricingScenario.ts). Lives on Inventory & Stock
// rather than Reports so pricing decisions sit next to the stock they're
// actually about.
export default function InventoryPricingTab() {
    const { inventory, transactions, settings, finance } = useApp();
    const currency = settings.currency || '₦';

    const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});
    const [volumeLossPct, setVolumeLossPct] = useState('10');
    const [targetRevenue, setTargetRevenue] = useState('');
    const [costIncreaseInput, setCostIncreaseInput] = useState('20');
    const [targetMarginInput, setTargetMarginInput] = useState('');

    const parsedOverrides = useMemo(() => {
        const out: Record<string, number> = {};
        for (const [id, v] of Object.entries(priceOverrides)) {
            const n = parseFloat(v);
            if (!isNaN(n) && n >= 0) out[id] = n;
        }
        return out;
    }, [priceOverrides]);

    const volLoss = parseFloat(volumeLossPct) || 0;

    const scenario = useMemo(
        () => computeInventoryPricingScenario(inventory, transactions, parsedOverrides, volLoss),
        [inventory, transactions, parsedOverrides, volLoss]
    );

    const requiredChange = useMemo(() => {
        const target = parseFloat(targetRevenue);
        if (isNaN(target) || target <= 0) return null;
        return computeRequiredUniformPriceChange(inventory, transactions, target, volLoss);
    }, [inventory, transactions, targetRevenue, volLoss]);

    const currentMarginPct = scenario.currentMonthlyRevenue > 0
        ? (scenario.currentMonthlyProfit / scenario.currentMonthlyRevenue) * 100
        : 0;

    // "Costs went up X% — what price increase protects my margin?" -- the
    // inverse of the per-product scenario above, answered at the aggregate
    // business level since a cost shock (fuel, freight, materials) rarely
    // hits just one product.
    const priceAdjustment = useMemo(() => computeRequiredPriceIncrease({
        currentRevenue: scenario.currentMonthlyRevenue,
        currentMarginPct,
        costIncreasePct: parseFloat(costIncreaseInput) || 0,
        targetMarginPct: targetMarginInput.trim() !== '' ? (parseFloat(targetMarginInput) || 0) : currentMarginPct,
    }), [scenario.currentMonthlyRevenue, currentMarginPct, costIncreaseInput, targetMarginInput]);

    const applySuggestedChange = () => {
        if (!requiredChange || !requiredChange.feasible) return;
        const next: Record<string, string> = { ...priceOverrides };
        for (const row of scenario.rows) {
            if (!row.hasSalesData) continue;
            const newPrice = row.currentSellingPrice * (1 + requiredChange.requiredPctChange / 100);
            next[row.itemId] = newPrice.toFixed(2);
        }
        setPriceOverrides(next);
    };

    const resetOverrides = () => setPriceOverrides({});

    const hasAnyOverride = Object.keys(parsedOverrides).length > 0;
    const sortedRows = useMemo(
        () => scenario.rows.slice().sort((a, b) => b.currentMonthlyRevenue - a.currentMonthlyRevenue),
        [scenario.rows]
    );

    const costDriftInsights = useMemo(() => computeInventoryPricingInsights(inventory, currency), [inventory, currency]);

    const inventoryDecisions = useMemo(
        () => computeInventoryDecisions(inventory, transactions, finance?.cashBalance ?? 0, currency),
        [inventory, transactions, finance?.cashBalance, currency],
    );

    const insights = useMemo(() => {
        const list: { color: string; text: string }[] = [];
        for (const drift of costDriftInsights) {
            list.push({ color: Colors.warning, text: drift.narrative });
        }
        const negative = scenario.rows.filter(r => r.hasSalesData && r.currentMargin < 0);
        if (negative.length > 0) {
            list.push({ color: Colors.expense, text: `${negative.length} item${negative.length > 1 ? 's are' : ' is'} selling below cost right now — ${negative.map(r => r.name).slice(0, 3).join(', ')}${negative.length > 3 ? ', …' : ''}.` });
        }
        const thin = scenario.rows.filter(r => r.hasSalesData && r.currentMargin >= 0 && r.currentMargin < 15);
        if (thin.length > 0) {
            list.push({ color: Colors.warning, text: `${thin.length} item${thin.length > 1 ? 's have' : ' has'} thin margins (under 15%) — good candidates to test a price increase.` });
        }
        const noData = scenario.itemsWithoutSalesData;
        if (noData > 0) {
            list.push({ color: Colors.textMuted, text: `${noData} item${noData > 1 ? 's have' : ' has'} no recent sales recorded through Inventory's "Sell" action, so ${noData > 1 ? 'they' : 'it'} can't be scenario-priced yet.` });
        }
        return list;
    }, [scenario, costDriftInsights]);

    if (inventory.length === 0) {
        return (
            <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No inventory items yet</Text>
                <Text style={s.emptySub}>Add items on the Stock tab to start modeling pricing scenarios against real goods.</Text>
            </View>
        );
    }

    return (
        <View>
            <Text style={s.subtitle}>
                Set a revenue target or edit prices item by item — every scenario number below is scaled from that
                product's own recent sales, not a business-wide average.
            </Text>

            {/* Revenue target solver */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Revenue Target</Text>
                <View style={s.row}>
                    <View style={s.flex1}>
                        <Text style={s.label}>Target monthly revenue ({currency})</Text>
                        <TextInput
                            style={s.input}
                            placeholder={String(Math.round(scenario.currentMonthlyRevenue))}
                            placeholderTextColor={Colors.textMuted}
                            value={targetRevenue}
                            onChangeText={setTargetRevenue}
                            keyboardType="decimal-pad"
                        />
                    </View>
                    <View style={s.flex1}>
                        <Text style={s.label}>Expected volume loss on a price rise (%)</Text>
                        <TextInput
                            style={s.input}
                            placeholder="10"
                            placeholderTextColor={Colors.textMuted}
                            value={volumeLossPct}
                            onChangeText={setVolumeLossPct}
                            keyboardType="decimal-pad"
                        />
                    </View>
                </View>

                {requiredChange && (
                    <View style={[s.suggestBox, { borderColor: requiredChange.feasible ? Colors.primary : Colors.expense }]}>
                        <Text style={s.suggestText}>{requiredChange.reason}</Text>
                        {requiredChange.feasible && requiredChange.requiredPctChange !== 0 && (
                            <TouchableOpacity style={s.applyBtn} onPress={applySuggestedChange}>
                                <Text style={s.applyBtnText}>Apply to all tracked items →</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>

            {/* Protect Your Margin — inverse of the target solver above */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Protect Your Margin</Text>
                <Text style={s.paSubtitle}>Costs went up — what price increase do you need to protect your margin?</Text>
                <View style={s.row}>
                    <View style={s.flex1}>
                        <Text style={s.label}>Cost increase (%)</Text>
                        <TextInput
                            style={s.input}
                            placeholder="20"
                            placeholderTextColor={Colors.textMuted}
                            value={costIncreaseInput}
                            onChangeText={setCostIncreaseInput}
                            keyboardType="decimal-pad"
                        />
                    </View>
                    <View style={s.flex1}>
                        <Text style={s.label}>Target margin (%)</Text>
                        <TextInput
                            style={s.input}
                            placeholder={currentMarginPct.toFixed(0)}
                            placeholderTextColor={Colors.textMuted}
                            value={targetMarginInput}
                            onChangeText={setTargetMarginInput}
                            keyboardType="decimal-pad"
                        />
                    </View>
                </View>
                {priceAdjustment.feasible ? (
                    <View style={[s.suggestBox, { borderColor: priceAdjustment.requiredPriceIncreasePct > 0 ? Colors.warning : Colors.income, alignItems: 'center' }]}>
                        <Text style={s.paResultValue}>
                            {priceAdjustment.requiredPriceIncreasePct > 0 ? '+' : ''}{priceAdjustment.requiredPriceIncreasePct.toFixed(1)}%
                        </Text>
                        <Text style={s.paResultLabel}>required price increase</Text>
                        <Text style={[s.suggestText, { textAlign: 'center' }]}>{priceAdjustment.reason}</Text>
                    </View>
                ) : (
                    <Text style={s.suggestText}>{priceAdjustment.reason}</Text>
                )}
            </View>

            {/* Scenario Results */}
            <View style={s.card}>
                <View style={s.rowBetween}>
                    <Text style={s.cardTitle}>Scenario Results</Text>
                    {hasAnyOverride && (
                        <TouchableOpacity onPress={resetOverrides}>
                            <Text style={s.resetLink}>Reset prices</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {/* Stated before the numbers, not after -- so a reader who
                    types a new price for an untracked item understands
                    up front why the totals below won't move, instead of
                    reading a flat $0 and a footnote as a broken feature. */}
                <Text style={s.disc}>
                    {scenario.itemsWithSalesData === 0
                        ? "None of your items have recorded sales through Inventory's \"Sell\" action yet, so profit below can't move -- margin per product still updates instantly as you type a price."
                        : `Revenue and profit below are based on ${scenario.itemsWithSalesData} item${scenario.itemsWithSalesData === 1 ? '' : 's'} with recent recorded sales${scenario.itemsWithoutSalesData > 0 ? ` (${scenario.itemsWithoutSalesData} more have no sales data yet, so a new price for them won't move these totals)` : ''}.`}
                </Text>
                <View style={s.kpiRow}>
                    <Kpi label="Current Revenue" value={fmt(currency, scenario.currentMonthlyRevenue)} color={Colors.textPrimary} />
                    <Kpi label="Scenario Revenue" value={fmt(currency, scenario.scenarioMonthlyRevenue)} color={Colors.income} />
                </View>
                <View style={s.kpiRow}>
                    <Kpi label="Current Profit" value={fmt(currency, scenario.currentMonthlyProfit)} color={Colors.textPrimary} />
                    <Kpi label="Scenario Profit" value={fmt(currency, scenario.scenarioMonthlyProfit)} color={Colors.income} />
                </View>
                <View style={s.gainBanner}>
                    <Text style={s.gainLabel}>Monthly Profit Gain</Text>
                    <Text style={[s.gainValue, { color: scenario.profitGain >= 0 ? Colors.income : Colors.expense }]}>
                        {scenario.profitGain >= 0 ? '+' : ''}{fmt(currency, scenario.profitGain)}
                        {' '}({scenario.profitGainPct >= 0 ? '+' : ''}{scenario.profitGainPct.toFixed(0)}%)
                    </Text>
                </View>
            </View>

            {inventoryDecisions.length > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Inventory Decisions</Text>
                    <Text style={s.disc}>What to do next, based on how fast each item is actually selling — not a forecast, a call.</Text>
                    {inventoryDecisions.map(d => (
                        <View key={d.itemId} style={[s.insightRow, { borderLeftColor: DECISION_COLOR[d.action] }]}>
                            <Text style={s.insightText}>
                                <Text style={{ fontWeight: '800', color: DECISION_COLOR[d.action] }}>{DECISION_LABEL[d.action]}: </Text>
                                <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{d.itemName}. </Text>
                                {d.detail}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {insights.length > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Pricing Insights</Text>
                    {insights.map((ins, i) => (
                        <View key={i} style={[s.insightRow, { borderLeftColor: ins.color }]}>
                            <Text style={s.insightText}>{ins.text}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Per-product table */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Adjust Prices by Product</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 1.6 }]}>Product</Text>
                    <Text style={s.th}>Current</Text>
                    <Text style={s.th}>New Price</Text>
                    <Text style={s.th}>Margin</Text>
                    <Text style={s.th}>Monthly Profit</Text>
                </View>
                {sortedRows.map(row => (
                    <ProductRow
                        key={row.itemId}
                        row={row}
                        currency={currency}
                        draft={priceOverrides[row.itemId] ?? ''}
                        onChangeDraft={(v) => setPriceOverrides(prev => ({ ...prev, [row.itemId]: v }))}
                    />
                ))}
            </View>
        </View>
    );
}

function ProductRow({ row, currency, draft, onChangeDraft }: {
    row: ProductPricingRow; currency: string; draft: string; onChangeDraft: (v: string) => void;
}) {
    const changed = draft.trim() !== '' && parseFloat(draft) !== row.currentSellingPrice;
    return (
        <View style={s.tableRow}>
            <View style={{ flex: 1.6 }}>
                <Text style={s.productName}>{row.name}</Text>
                <Text style={s.productCategory}>{row.category}{!row.hasSalesData ? ' · no recent sales' : ''}</Text>
            </View>
            <Text style={s.td}>{currency}{row.currentSellingPrice.toLocaleString()}</Text>
            <TextInput
                style={[s.priceInput, changed && { borderColor: Colors.primary, color: Colors.primary }]}
                placeholder={String(row.currentSellingPrice)}
                placeholderTextColor={Colors.textMuted}
                value={draft}
                onChangeText={onChangeDraft}
                keyboardType="decimal-pad"
            />
            {/* Margin is price vs. this item's own cost price -- always
                computable, sales history or not -- so it updates the
                instant a new price is typed. Monthly Profit multiplies
                that margin by units actually sold, which for an item with
                no recorded sales through Inventory's "Sell" action has
                nothing real to multiply by, so it stays blank rather than
                inventing a volume. */}
            <Text style={[s.td, { color: row.scenarioMargin < 0 ? Colors.expense : row.scenarioMargin < 15 ? Colors.warning : Colors.income }]}>
                {row.scenarioMargin.toFixed(0)}%
            </Text>
            <Text style={[s.td, row.hasSalesData ? { fontWeight: '700', color: row.scenarioMonthlyProfit >= 0 ? Colors.income : Colors.expense } : s.noSalesData]}>
                {row.hasSalesData ? fmt(currency, row.scenarioMonthlyProfit) : 'No sales yet'}
            </Text>
        </View>
    );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{label}</Text>
            <Text style={[s.kpiValue, { color }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: 32, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    row: { flexDirection: 'row', gap: 12 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    flex1: { flex: 1 },
    label: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 10, fontSize: 14, color: Colors.textPrimary },

    suggestBox: { marginTop: 12, borderRadius: 10, borderWidth: 1.5, padding: 12 },
    suggestText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    applyBtn: { marginTop: 8, alignSelf: 'flex-start' },
    applyBtnText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },

    paSubtitle: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },
    paResultValue: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
    paResultLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },

    resetLink: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    kpiCard: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
    kpiLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    kpiValue: { fontSize: 14, fontWeight: 'bold' },

    gainBanner: { backgroundColor: Colors.primary + '15', borderRadius: 8, padding: 10, marginBottom: 6 },
    gainLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
    gainValue: { fontSize: 16, fontWeight: 'bold' },
    disc: { fontSize: 10.5, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic', lineHeight: 15 },

    insightRow: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 8 },
    insightText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 4 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 4 },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },
    noSalesData: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic' },
    productName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    productCategory: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
    // minWidth: 0 overrides a browser default that plain Text siblings
    // don't have -- without it, this <input> (via react-native-web) refuses
    // to shrink as much as the other flex:1 columns on a narrow phone
    // screen, so it ends up visibly wider than "Current"/"Margin"/"Monthly
    // Profit" despite sharing the exact same flex value.
    priceInput: { flex: 1, minWidth: 0, backgroundColor: Colors.bg, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingVertical: 6, paddingHorizontal: 6, fontSize: 12, color: Colors.textPrimary },
});
