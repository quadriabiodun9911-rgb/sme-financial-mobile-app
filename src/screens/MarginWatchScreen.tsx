/**
 * Margin Watch -- one screen for the inflation/cost-pressure and FX
 * questions that don't already have a home elsewhere in the app:
 *
 * 0. Hidden Growth Risk (hiddenGrowthRisk.ts) -- a leading banner, not a
 *    card: is revenue growing while several of inventory cost, expenses,
 *    margin and cash burn are quietly weakening underneath it. The one
 *    place several existing individual diagnoses get checked together.
 * 1. Supplier Price Pressure (supplierPricePressure.ts) -- which items'
 *    real purchase cost is outrunning the price charged for them, shown
 *    as margin at old cost vs. margin at today's replacement cost.
 * 2. Affordable Stock Level (affordableInventory.ts) -- how much new
 *    inventory the current cash position can actually absorb without
 *    pushing runway below the app's own safe-runway benchmark.
 * 3. Discretionary Cash (discretionaryCash.ts) -- the cash balance, plus
 *    what customers already owe that isn't seriously overdue, minus
 *    what's already spoken for (near-term operating burn, scheduled loan
 *    repayments, vendor bills awaiting review, and any planned purchase
 *    entered in the FX calculator below), so "how much is actually free
 *    to spend" replaces just watching the raw balance.
 * 4. FX Purchase Impact (fxPurchaseImpact.ts) -- what one upcoming
 *    foreign-currency purchase costs across a few rate scenarios, and
 *    what paying it today would do to runway -- deliberately narrower
 *    than MacroShield's whole-business inflation/FX shock, for the
 *    concrete "I need $X, what if the rate moves" question an owner
 *    staring at one import actually has.
 * 5. Product Cash Contribution (productCashContribution.ts) -- which
 *    products convert to real cash fastest vs which ones just tie
 *    working capital up in stock.
 *
 * Each already has a partial answer elsewhere (margin-compression
 * diagnosis on Insights, MacroShield's inflation/FX shock simulator,
 * CustomerProfitability's customer-side view) -- this screen is
 * deliberately the one place that keeps the SUPPLY-SIDE, ITEM-LEVEL view
 * together, so "is inflation quietly costing me money, and where" has a
 * single, findable answer instead of being scattered across screens.
 */
import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import { detectSupplierPricePressure } from '../utils/supplierPricePressure';
import { computeAffordableInventoryLevel } from '../utils/affordableInventory';
import { computeProductCashContribution, ProductCashContribution } from '../utils/productCashContribution';
import { computeDiscretionaryCash } from '../utils/discretionaryCash';
import { computeFxPurchaseImpact } from '../utils/fxPurchaseImpact';
import { computeHiddenGrowthRisk } from '../utils/hiddenGrowthRisk';

function fmt(currency: string, value: number): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

function SectionCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <View style={s.cardHead}>
                <View style={s.cardIconWrap}><Icon name={icon as any} size={16} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{title}</Text>
                    <Text style={s.cardSubtitle}>{subtitle}</Text>
                </View>
            </View>
            {children}
        </View>
    );
}

export default function MarginWatchScreen() {
    const { inventory, transactions, finance, settings, loans, bills, invoices } = useApp();
    const cur = settings.currency || '';
    const [sortBy, setSortBy] = useState<'efficiency' | 'revenue' | 'tiedUp'>('efficiency');
    const [fxAmount, setFxAmount] = useState('');
    const [fxRate, setFxRate] = useState('');

    const pressureFlags = useMemo(() => detectSupplierPricePressure(inventory), [inventory]);

    const hiddenRisk = useMemo(
        () => computeHiddenGrowthRisk(transactions, inventory, finance.cashBalance),
        [transactions, inventory, finance.cashBalance]
    );

    const affordable = useMemo(
        () => computeAffordableInventoryLevel(transactions, finance.cashBalance, inventory),
        [transactions, finance.cashBalance, inventory]
    );

    const fxAmountNum = parseFloat(fxAmount) || 0;
    const fxRateNum = parseFloat(fxRate) || 0;
    const fxImpact = useMemo(
        () => (fxAmountNum > 0 && fxRateNum > 0)
            ? computeFxPurchaseImpact(fxAmountNum, fxRateNum, { transactions, cashBalance: finance.cashBalance })
            : null,
        [fxAmountNum, fxRateNum, transactions, finance.cashBalance]
    );

    // A purchase actively being sized in the FX calculator above counts as
    // a planned commitment here too -- the two cards are answering related
    // questions about the same real, specific spend, not independent ones.
    // Same reserve target the low-cash alert (alertEngine.ts) already
    // compares current cash against -- netting it here too so "safe to
    // spend" doesn't show a number that would immediately eat into the
    // business's own rainy-day target.
    const emergencyBufferTarget = parseFloat(settings?.minReserve || '') || 0;

    const discretionary = useMemo(
        () => computeDiscretionaryCash(transactions, finance.cashBalance, loans, bills, invoices, fxImpact?.baseCost ?? 0, new Date(), emergencyBufferTarget),
        [transactions, finance.cashBalance, loans, bills, invoices, fxImpact, emergencyBufferTarget]
    );

    const productRows = useMemo(() => {
        const rows = computeProductCashContribution(inventory, transactions);
        const sorted = [...rows].sort((a, b) => {
            if (sortBy === 'revenue') return b.revenue - a.revenue;
            if (sortBy === 'tiedUp') return b.cashTiedUp - a.cashTiedUp;
            // 'efficiency' -- items with no cash tied up (null efficiency) sort last, not first.
            const ae = a.cashEfficiency ?? -Infinity;
            const be = b.cashEfficiency ?? -Infinity;
            return be - ae;
        });
        return sorted.slice(0, 8);
    }, [inventory, transactions, sortBy]);

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <Text style={s.title}>Margin Watch</Text>
                    <Text style={s.subtitle}>
                        Where rising costs are quietly eating into your business, and how much room you actually have to respond.
                    </Text>

                    {hiddenRisk.available && hiddenRisk.flagged && (
                        <View style={s.riskBanner}>
                            <Icon name="alert-triangle" size={18} color="#92400E" />
                            <View style={{ flex: 1 }}>
                                <Text style={s.riskBannerTitle}>Hidden risk behind your growth</Text>
                                <Text style={s.riskBannerText}>{hiddenRisk.headline}</Text>
                                <Text style={s.riskBannerDetail}>
                                    Revenue is up {hiddenRisk.revenueGrowthPct!.toFixed(0)}%, but {hiddenRisk.flaggedSignals.map(sig =>
                                        sig === 'inventoryCost' ? 'inventory cost is outrunning it' :
                                        sig === 'expenses' ? 'expenses are outrunning it' :
                                        sig === 'margin' ? 'margin is compressing' : 'the burn rate is climbing'
                                    ).join(', ')}.
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* 1. Supplier Price Pressure */}
                    <SectionCard
                        icon="trending-up"
                        title="Supplier Price Pressure"
                        subtitle="Items whose real purchase cost has outrun what you charge for them"
                    >
                        {pressureFlags.length === 0 ? (
                            <View style={s.emptyBox}>
                                <Icon name="check-circle" size={18} color={Colors.income} />
                                <Text style={s.emptyText}>
                                    No item's cost is currently outrunning its price by a meaningful margin. This needs at least two recorded purchase lots per item to say anything — restock through Inventory's Stock In to build that history.
                                </Text>
                            </View>
                        ) : (
                            pressureFlags.slice(0, 6).map(f => (
                                <View key={f.itemId} style={s.flagRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.flagItemName}>{f.itemName}</Text>
                                        <Text style={s.flagSupplier}>{f.supplier}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={s.flagGap}>{f.marginAtOldCostPct.toFixed(0)}% → {f.marginAtReplacementCostPct.toFixed(0)}% margin</Text>
                                        <Text style={s.flagDetail}>
                                            cost +{f.costGrowthPct.toFixed(0)}% · price +{f.priceGrowthPct.toFixed(0)}%
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                        {pressureFlags.length > 0 && (
                            <Text style={s.footnote}>
                                Margin shown is at the item's earliest recorded cost vs. today's replacement cost, both against the same selling price basis — the gap is what's silently happening to your margin even if you haven't touched your price.
                            </Text>
                        )}
                    </SectionCard>

                    {/* 2. Affordable Stock Level */}
                    <SectionCard
                        icon="shield"
                        title="Affordable Stock Level"
                        subtitle="How much you can put into new inventory right now without risking your runway"
                    >
                        {affordable.alreadyTightRunway ? (
                            <View style={s.warnBox}>
                                <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                <Text style={s.warnText}>
                                    Runway is already {Number.isFinite(affordable.currentRunwayDays) ? `${affordable.currentRunwayDays} days` : 'unavailable'} — under the {affordable.safeRunwayDays}-day safe line. Any new stock purchase right now would stretch it further, not just spend cash.
                                </Text>
                            </View>
                        ) : (
                            <View style={s.affordRow}>
                                <View style={s.affordFigure}>
                                    <Text style={s.affordValue}>{fmt(cur, affordable.maxAffordableSpend)}</Text>
                                    <Text style={s.affordLabel}>can go into new stock and still keep {affordable.safeRunwayDays}+ days of runway</Text>
                                </View>
                            </View>
                        )}
                        <View style={s.affordMetaRow}>
                            <View style={s.affordMetaItem}>
                                <Text style={s.affordMetaValue}>{Number.isFinite(affordable.currentRunwayDays) ? `${affordable.currentRunwayDays}d` : '∞'}</Text>
                                <Text style={s.affordMetaLabel}>current runway</Text>
                            </View>
                            <View style={s.affordMetaItem}>
                                <Text style={s.affordMetaValue}>{fmt(cur, affordable.currentInventoryValue)}</Text>
                                <Text style={s.affordMetaLabel}>stock on hand (cost)</Text>
                            </View>
                            <View style={s.affordMetaItem}>
                                <Text style={[s.affordMetaValue, affordable.slowMovingValue > 0 && { color: Colors.warning }]}>{fmt(cur, affordable.slowMovingValue)}</Text>
                                <Text style={s.affordMetaLabel}>already trapped in slow stock</Text>
                            </View>
                        </View>
                    </SectionCard>

                    {/* 3. Discretionary Cash */}
                    <SectionCard
                        icon="unlock"
                        title="Discretionary Cash"
                        subtitle="Your real balance minus what's already spoken for"
                    >
                        <View style={s.affordRow}>
                            <View style={s.affordFigure}>
                                <Text style={[s.affordValue, discretionary.discretionaryCash <= 0 && { color: Colors.danger }]}>
                                    {fmt(cur, discretionary.discretionaryCash)}
                                </Text>
                                <Text style={s.affordLabel}>actually free to spend, of {fmt(cur, discretionary.cashBalance)} in the bank</Text>
                            </View>
                        </View>
                        {discretionary.discretionaryCash <= 0 && (
                            <View style={s.warnBox}>
                                <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                <Text style={s.warnText}>
                                    Everything in the account is already committed to near-term costs, loan repayments and bills awaiting your review — there's nothing free to spend right now.
                                </Text>
                            </View>
                        )}
                        <View style={s.commitList}>
                            {discretionary.expectedNearTermReceivables > 0 && (
                                <View style={s.commitRow}>
                                    <Text style={s.commitLabel}>+ Owed by customers, not seriously overdue</Text>
                                    <Text style={[s.commitValue, { color: Colors.income }]}>{fmt(cur, discretionary.expectedNearTermReceivables)}</Text>
                                </View>
                            )}
                            <View style={s.commitRow}>
                                <Text style={s.commitLabel}>− Near-term operating costs (30 days)</Text>
                                <Text style={s.commitValue}>{fmt(cur, discretionary.operatingCommitment)}</Text>
                            </View>
                            <View style={s.commitRow}>
                                <Text style={s.commitLabel}>− Loan repayments due this cycle</Text>
                                <Text style={s.commitValue}>{fmt(cur, discretionary.debtServiceCommitment)}</Text>
                            </View>
                            <View style={s.commitRow}>
                                <Text style={s.commitLabel}>− Vendor bills awaiting your review</Text>
                                <Text style={s.commitValue}>{fmt(cur, discretionary.pendingBillsCommitment)}</Text>
                            </View>
                            {discretionary.plannedPurchasesCommitment > 0 && (
                                <View style={s.commitRow}>
                                    <Text style={s.commitLabel}>− Planned purchase (from FX calculator below)</Text>
                                    <Text style={s.commitValue}>{fmt(cur, discretionary.plannedPurchasesCommitment)}</Text>
                                </View>
                            )}
                            {discretionary.emergencyBufferCommitment > 0 && (
                                <View style={s.commitRow}>
                                    <Text style={s.commitLabel}>− Emergency buffer (your reserve target)</Text>
                                    <Text style={s.commitValue}>{fmt(cur, discretionary.emergencyBufferCommitment)}</Text>
                                </View>
                            )}
                        </View>
                        {discretionary.emergencyBufferCommitment === 0 && (
                            <Text style={s.footnote}>
                                No reserve target set yet — set one in Settings to have it counted as spoken-for here too, not just spendable cash.
                            </Text>
                        )}
                    </SectionCard>

                    {/* 4. FX Purchase Impact */}
                    <SectionCard
                        icon="repeat"
                        title="FX Purchase Impact"
                        subtitle="What an upcoming foreign-currency purchase actually costs if the rate moves"
                    >
                        <View style={s.fxInputRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.fieldLabel}>Purchase amount (foreign currency)</Text>
                                <TextInput style={s.input} value={fxAmount} onChangeText={setFxAmount} keyboardType="numeric" placeholder="e.g. 10000" placeholderTextColor={Colors.textMuted} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.fieldLabel}>Current rate (1 unit = ? {cur})</Text>
                                <TextInput style={s.input} value={fxRate} onChangeText={setFxRate} keyboardType="numeric" placeholder="e.g. 1330" placeholderTextColor={Colors.textMuted} />
                            </View>
                        </View>

                        {!fxImpact ? (
                            <View style={s.emptyBox}>
                                <Icon name="repeat" size={18} color={Colors.textMuted} />
                                <Text style={s.emptyText}>Enter an amount and your current rate to see what this purchase costs if the rate moves before you pay.</Text>
                            </View>
                        ) : (
                            <>
                                {fxImpact.scenarios.map(sc => (
                                    <View key={sc.ratePct} style={s.fxScenarioRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fxScenarioLabel}>
                                                {sc.ratePct === 0 ? 'At your current rate' : `${sc.ratePct > 0 ? '+' : ''}${sc.ratePct}% (${fmt(cur, sc.rate)})`}
                                            </Text>
                                            {sc.runwayDaysAfter != null && (
                                                <Text style={s.fxScenarioDetail}>
                                                    Runway after: {Number.isFinite(sc.runwayDaysAfter) ? `${sc.runwayDaysAfter}d` : '∞'}
                                                </Text>
                                            )}
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={s.fxScenarioCost}>{fmt(cur, sc.totalCost)}</Text>
                                            {sc.deltaVsBase !== 0 && (
                                                <Text style={[s.fxScenarioDelta, sc.deltaVsBase > 0 && { color: Colors.danger }]}>
                                                    {sc.deltaVsBase > 0 ? '+' : ''}{fmt(cur, sc.deltaVsBase)}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </SectionCard>

                    {/* 5. Product Cash Contribution */}
                    <SectionCard
                        icon="bar-chart-2"
                        title="Product Cash Contribution"
                        subtitle="Revenue is only half the story — which products convert to real cash fastest"
                    >
                        <View style={s.sortRow}>
                            {(['efficiency', 'revenue', 'tiedUp'] as const).map(key => (
                                <TouchableOpacity key={key} onPress={() => setSortBy(key)} style={[s.sortChip, sortBy === key && s.sortChipActive]}>
                                    <Text style={[s.sortChipText, sortBy === key && s.sortChipTextActive]}>
                                        {key === 'efficiency' ? 'Cash efficiency' : key === 'revenue' ? 'Revenue' : 'Cash tied up'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {productRows.length === 0 ? (
                            <View style={s.emptyBox}>
                                <Icon name="inbox" size={18} color={Colors.textMuted} />
                                <Text style={s.emptyText}>No products with recorded sales or stock on hand yet.</Text>
                            </View>
                        ) : (
                            productRows.map((p: ProductCashContribution) => (
                                <View key={p.itemId} style={s.productRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.productName}>{p.itemName}</Text>
                                        <Text style={s.productDetail}>
                                            {fmt(cur, p.revenue)} revenue · {p.marginPct.toFixed(0)}% margin · {fmt(cur, p.cashTiedUp)} tied up
                                        </Text>
                                    </View>
                                    <Text style={s.productEfficiency}>
                                        {p.cashEfficiency == null ? '—' : `${p.cashEfficiency.toFixed(2)}×`}
                                    </Text>
                                </View>
                            ))
                        )}
                        <Text style={s.footnote}>
                            Cash efficiency = gross profit ÷ cash tied up in that product's stock. Higher means a product turns working capital into profit faster.
                        </Text>
                    </SectionCard>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 18 },

    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg,
        marginBottom: Spacing.md, ...Shadow.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
    cardIconWrap: {
        width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceVariant,
        alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

    emptyBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.md },
    emptyText: { flex: 1, fontSize: 12.5, color: Colors.textMuted, lineHeight: 17 },

    flagRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    flagItemName: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    flagSupplier: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
    flagGap: { fontSize: 13, fontWeight: '700', color: Colors.danger },
    flagDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

    warnBox: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: '#FEF3C7', borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'flex-start' },
    warnText: { flex: 1, fontSize: 12.5, color: '#92400E', lineHeight: 17 },

    riskBanner: {
        flexDirection: 'row', gap: Spacing.sm, backgroundColor: '#FEF3C7', borderRadius: Radius.md,
        padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'flex-start',
    },
    riskBannerTitle: { fontSize: 12, fontWeight: '700', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.4 },
    riskBannerText: { fontSize: 14.5, fontWeight: '700', color: '#78350F', marginTop: 4, lineHeight: 19 },
    riskBannerDetail: { fontSize: 12, color: '#92400E', marginTop: 4, lineHeight: 16 },

    affordRow: { alignItems: 'center', paddingVertical: Spacing.sm },
    affordFigure: { alignItems: 'center' },
    affordValue: { fontSize: 28, fontWeight: '800', color: Colors.income },
    affordLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth: 240 },

    affordMetaRow: { flexDirection: 'row', marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
    affordMetaItem: { flex: 1, alignItems: 'center' },
    affordMetaValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    affordMetaLabel: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

    sortRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
    sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    sortChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    sortChipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    sortChipTextActive: { color: '#fff' },

    commitList: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
    commitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    commitLabel: { fontSize: 12.5, color: Colors.textMuted, flex: 1, paddingRight: Spacing.sm },
    commitValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },

    fieldLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    fxInputRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    fxScenarioRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    fxScenarioLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    fxScenarioDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    fxScenarioCost: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    fxScenarioDelta: { fontSize: 11.5, fontWeight: '600', color: Colors.income, marginTop: 1 },

    productRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    productName: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    productDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    productEfficiency: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginLeft: Spacing.sm },
    footnote: { fontSize: 10.5, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 14 },
});
