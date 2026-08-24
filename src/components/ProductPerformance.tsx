import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, InventoryItem } from '../types';
import { computeInventoryValue, computeStockVelocity } from '../utils/stockVelocity';
import BarList from './BarList';

interface Props {
    transactions: Transaction[];
    inventory: InventoryItem[];
    currency: string;
}

interface ProductMetrics {
    category: string;
    itemCount: number;
    totalRevenue: number;
    totalExpense: number;
    netProfit: number;
    margin: number;
    avgPrice: number;
    totalUnits: number;
    stockValue: number;
    unitsPerDay: number;
}

export default function ProductPerformance({ transactions, inventory, currency }: Props) {
    const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'margin' | 'turnover'>('profit');

    const productMetrics = useMemo(() => {
        // Group by category
        const categoryMap = new Map<string, {
            revenue: number;
            cogs: number;
            otherExpense: number;
            transactionCount: number;
            inventoryItems: InventoryItem[];
        }>();
        const emptyBucket = () => ({ revenue: 0, cogs: 0, otherExpense: 0, transactionCount: 0, inventoryItems: [] as InventoryItem[] });

        // Inventory's own Sell/Stock In actions record transactions under a
        // generic bucket (category: 'Sales' / 'Inventory'), NOT the item's
        // real category -- so grouping by tx.category alone silently
        // separates a sale from the product it was actually selling.
        // They do carry an exact inventoryItemId link though, so resolve
        // through that first and only fall back to tx.category for
        // transactions that were never tied to a specific inventory item
        // (a manually-entered sale, or a category-specific cost logged by
        // hand, e.g. a "Fabric" expense with no linked item).
        const itemById = new Map(inventory.map(item => [item.id, item]));
        const resolveCategory = (tx: Transaction): string => {
            const linkedItem = tx.inventoryItemId ? itemById.get(tx.inventoryItemId) : undefined;
            return linkedItem?.category || tx.category || 'General';
        };

        // Aggregate income transactions. Where a sale carries its own
        // costOfGoodsSold (every sale recorded through Inventory's Sell
        // action does), that -- not a category-level expense guess -- is
        // the real cost of that specific revenue, matched to the period it
        // was earned rather than whenever the stock happened to be bought.
        for (const tx of transactions.filter(t => t.type === 'income')) {
            const category = resolveCategory(tx);
            if (!categoryMap.has(category)) categoryMap.set(category, emptyBucket());
            const data = categoryMap.get(category)!;
            data.revenue += (tx.amount ?? 0);
            data.cogs += (tx.costOfGoodsSold ?? 0);
            data.transactionCount += 1;
        }

        // Aggregate other (non-purchase) expenses the same way. Stock-In
        // purchases are deliberately excluded -- buying stock capitalizes
        // it onto the balance sheet; it isn't a period cost until it's
        // actually sold, which is exactly what costOfGoodsSold above
        // already accounts for. Counting both would double-charge the
        // same inventory once as a purchase and again as COGS.
        for (const tx of transactions.filter(t => t.type === 'expense' && t.transactionCategory !== 'purchase')) {
            const category = resolveCategory(tx);
            if (!categoryMap.has(category)) categoryMap.set(category, emptyBucket());
            categoryMap.get(category)!.otherExpense += (tx.amount ?? 0);
        }

        // Match inventory items to categories
        for (const item of inventory) {
            const category = item.category || 'General';
            if (!categoryMap.has(category)) categoryMap.set(category, emptyBucket());
            categoryMap.get(category)!.inventoryItems.push(item);
        }

        // Calculate metrics for each category
        const metrics: ProductMetrics[] = Array.from(categoryMap.entries()).map(([category, data]) => {
            const revenue = data.revenue;
            const profit = revenue - data.cogs - data.otherExpense;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            const totalUnits = data.inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
            const stockValue = computeInventoryValue(data.inventoryItems);
            const avgPrice = data.transactionCount > 0 ? revenue / data.transactionCount : 0;
            // Real sell-through, not a made-up ratio -- same signal Inventory's
            // own velocity badges and the Pricing tab's scenarios use, summed
            // across every item in this category.
            const unitsPerDay = data.inventoryItems.reduce(
                (sum, item) => sum + computeStockVelocity(item, transactions).avgDailyUnitsSold, 0
            );

            return {
                category,
                itemCount: data.inventoryItems.length,
                totalRevenue: revenue,
                totalExpense: data.cogs + data.otherExpense,
                netProfit: profit,
                margin,
                avgPrice,
                totalUnits,
                stockValue,
                unitsPerDay,
            };
        }).filter(m => m.totalRevenue > 0 || m.stockValue > 0);

        // Sort by selected metric
        return metrics.sort((a, b) => {
            if (sortBy === 'profit') return b.netProfit - a.netProfit;
            if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
            if (sortBy === 'margin') return b.margin - a.margin;
            return b.unitsPerDay - a.unitsPerDay;
        });
    }, [transactions, inventory, sortBy]);

    const totals = useMemo(() => ({
        revenue: productMetrics.reduce((sum, p) => sum + p.totalRevenue, 0),
        expense: productMetrics.reduce((sum, p) => sum + p.totalExpense, 0),
        profit: productMetrics.reduce((sum, p) => sum + p.netProfit, 0),
        avgMargin: productMetrics.length > 0
            ? productMetrics.reduce((sum, p) => sum + p.margin, 0) / productMetrics.length
            : 0,
    }), [productMetrics]);

    if (productMetrics.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>No product data yet. Add inventory items and sales to see performance analysis.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.scroll}>
            {/* Portfolio Overview */}
            <View style={styles.summaryRow}>
                <SummaryCard
                    label="Total Revenue"
                    value={`${currency}${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    color={Colors.income}
                />
                <SummaryCard
                    label="Avg Margin"
                    value={`${totals.avgMargin.toFixed(1)}%`}
                    color={totals.avgMargin > 40 ? Colors.income : totals.avgMargin > 25 ? Colors.warning : Colors.expense}
                />
            </View>

            {/* Sort buttons */}
            <View style={styles.sortRow}>
                <TouchableOpacity
                    style={[styles.sortBtn, sortBy === 'profit' && styles.sortBtnActive]}
                    onPress={() => setSortBy('profit')}
                >
                    <Text style={[styles.sortText, sortBy === 'profit' && styles.sortTextActive]}>By Profit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.sortBtn, sortBy === 'margin' && styles.sortBtnActive]}
                    onPress={() => setSortBy('margin')}
                >
                    <Text style={[styles.sortText, sortBy === 'margin' && styles.sortTextActive]}>By Margin</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.sortBtn, sortBy === 'turnover' && styles.sortBtnActive]}
                    onPress={() => setSortBy('turnover')}
                >
                    <Text style={[styles.sortText, sortBy === 'turnover' && styles.sortTextActive]}>By Velocity</Text>
                </TouchableOpacity>
            </View>

            {/* Best Products -- ranked by the active sort metric */}
            <View style={styles.bestProductsCard}>
                <Text style={styles.summaryLabel}>
                    Best Products by {sortBy === 'profit' ? 'Profit' : sortBy === 'revenue' ? 'Revenue' : sortBy === 'margin' ? 'Margin' : 'Velocity'}
                </Text>
                <View style={{ marginTop: 8 }}>
                    <BarList
                        items={productMetrics.slice(0, 8).map(p => {
                            const metricValue = sortBy === 'profit' ? p.netProfit
                                : sortBy === 'revenue' ? p.totalRevenue
                                : sortBy === 'margin' ? p.margin
                                : p.unitsPerDay;
                            const displayValue = sortBy === 'margin'
                                ? `${metricValue.toFixed(1)}%`
                                : sortBy === 'turnover'
                                    ? `${metricValue.toFixed(2)}/day`
                                    : `${currency}${Math.round(metricValue).toLocaleString()}`;
                            return { label: p.category, value: metricValue, displayValue };
                        })}
                    />
                </View>
            </View>

            {/* Product Categories */}
            <View>
                {productMetrics.map((product, idx) => (
                    <View key={idx} style={styles.productCard}>
                        <View style={styles.productHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.productName}>{product.category}</Text>
                                <Text style={styles.productMeta}>{product.itemCount} items in stock</Text>
                            </View>
                            <Text style={[styles.profit, { color: product.netProfit >= 0 ? Colors.income : Colors.expense }]}>
                                {product.netProfit >= 0 ? '+' : ''}{currency}{product.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={styles.metricsGrid}>
                            <Metric
                                label="Revenue"
                                value={`${currency}${product.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                color={Colors.income}
                            />
                            <Metric
                                label="Margin"
                                value={`${product.margin.toFixed(1)}%`}
                                color={product.margin > 40 ? Colors.income : product.margin > 25 ? Colors.warning : Colors.expense}
                            />
                            <Metric label="Avg Price" value={`${currency}${product.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                            <Metric label="Stock Value" value={`${currency}${product.stockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                        </View>

                        {/* Profitability Bar -- a margin health reading (good/
                            watch/poor), not a rank, so it keeps the fixed
                            status color rather than the sequential ramp. */}
                        <View style={styles.barContainer}>
                            <BarList
                                maxValue={100}
                                barHeight={6}
                                items={[{
                                    label: 'Profit Margin',
                                    value: Math.min(100, product.margin),
                                    displayValue: `${product.margin.toFixed(1)}%`,
                                    color: product.margin > 40 ? Colors.income : product.margin > 25 ? Colors.warning : Colors.expense,
                                }]}
                            />
                        </View>
                    </View>
                ))}
            </View>

            {/* Strategic Insights */}
            <View style={styles.insightCard}>
                <Text style={styles.insightTitle}>🎯 Product Strategy Insights</Text>

                {(() => {
                    const insights: string[] = [];
                    const highMarginProducts = productMetrics.filter(p => p.margin > 40);
                    const lowMarginProducts = productMetrics.filter(p => p.margin < 25);
                    const highRevenueProducts = productMetrics.slice(0, 2);
                    const slowMovingProducts = productMetrics.filter(p => p.stockValue > 1000 && p.unitsPerDay < 1);

                    if (highMarginProducts.length > 0) {
                        const top = highMarginProducts[0];
                        insights.push(`⭐ Focus on "${top.category}" - highest margin (${top.margin.toFixed(1)}%). Scale this line.`);
                    }

                    if (lowMarginProducts.length > 0) {
                        insights.push(`⚠️ "${lowMarginProducts[0].category}" has low margin (<25%). Review pricing or reduce costs.`);
                    }

                    if (slowMovingProducts.length > 0) {
                        insights.push(`💤 ${slowMovingProducts.length} product(s) have slow turnover. Consider discontinuing or repricing.`);
                    }

                    if (insights.length < 2 && productMetrics.length > 1) {
                        insights.push('📊 Well-balanced product mix. Consider expanding top revenue generators.');
                    }

                    return insights.slice(0, 3).map((insight, i) => (
                        <Text key={i} style={styles.insight}>{insight}</Text>
                    ));
                })()}
            </View>

            {/* Profitability Matrix */}
            <View style={styles.matrixCard}>
                <Text style={styles.matrixTitle}>💡 Product Mix Optimization</Text>
                <Text style={styles.matrixDesc}>
                    Focus on products with HIGH margin and HIGH revenue (top-right quadrant)
                </Text>

                <ScrollView
                    horizontal
                    style={styles.matrixScroll}
                    contentContainerStyle={styles.matrixContent}
                >
                    <View style={styles.matrix}>
                        {productMetrics.map((p, idx) => {
                            const revenuePct = Math.min(1, p.totalRevenue / (totals.revenue || 1));
                            const marginNorm = Math.min(1, p.margin / 100);
                            return (
                                <View
                                    key={idx}
                                    style={[
                                        styles.matrixDot,
                                        {
                                            left: `${revenuePct * 90}%`,
                                            top: `${marginNorm * 80}%`,
                                        },
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.dotCircle,
                                            {
                                                backgroundColor: p.margin > 40 && revenuePct > 0.1 ? Colors.income : Colors.warning,
                                            },
                                        ]}
                                    />
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>

                <View style={styles.matrixLegend}>
                    <Text style={styles.matrixLegendText}>→ Revenue Scale (left to right)</Text>
                    <Text style={styles.matrixLegendText}>↑ Margin % (bottom to top)</Text>
                </View>
            </View>
        </ScrollView>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}

function Metric({ label, value, color = Colors.textSecondary }: { label: string; value: string; color?: string }) {
    return (
        <View style={styles.metric}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    empty: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
    },
    bestProductsCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
    },
    summaryLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    sortRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    sortBtn: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: Colors.border,
        alignItems: 'center',
    },
    sortBtnActive: {
        backgroundColor: Colors.primary,
    },
    sortText: {
        fontSize: 10,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
    sortTextActive: {
        color: '#fff',
    },
    productCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
    },
    productHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    productName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: Colors.textPrimary,
    },
    productMeta: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 2,
    },
    profit: {
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    metric: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: Colors.bg,
        borderRadius: 6,
        padding: 8,
        alignItems: 'center',
    },
    metricLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        marginBottom: 4,
    },
    metricValue: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    barContainer: {
        marginTop: 8,
    },
    insightCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        marginVertical: 16,
        borderLeftWidth: 4,
        borderLeftColor: Colors.warning,
    },
    insightTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    insight: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
        marginBottom: 6,
    },
    matrixCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        marginBottom: 24,
        borderLeftWidth: 4,
        borderLeftColor: Colors.income,
    },
    matrixTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    matrixDesc: {
        fontSize: 11,
        color: Colors.textMuted,
        marginBottom: 12,
    },
    matrixScroll: {
        marginBottom: 8,
    },
    matrixContent: {
        minWidth: '100%',
    },
    matrix: {
        height: 160,
        width: '100%',
        backgroundColor: Colors.bg,
        borderRadius: 6,
        position: 'relative',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    matrixDot: {
        position: 'absolute',
        width: 30,
        height: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    matrixLegend: {
        gap: 4,
    },
    matrixLegendText: {
        fontSize: 10,
        color: Colors.textMuted,
    },
});
