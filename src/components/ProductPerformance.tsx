import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, InventoryItem } from '../types';

interface Props {
    transactions: Transaction[];
    inventory: InventoryItem[];
    currency: string;
}

interface ProductMetrics {
    category: string;
    itemCount: number;
    totalRevenue: number;
    totalCost: number;
    netProfit: number;
    margin: number;
    avgPrice: number;
    avgCost: number;
    totalUnits: number;
    stockValue: number;
    stockTurnover: number;
}

export default function ProductPerformance({ transactions, inventory, currency }: Props) {
    const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'margin' | 'turnover'>('profit');

    const productMetrics = useMemo(() => {
        // Group by category
        const categoryMap = new Map<string, {
            revenue: number;
            transactionCount: number;
            inventoryItems: InventoryItem[];
        }>();

        // Aggregate transactions by category
        for (const tx of transactions.filter(t => t.type === 'income')) {
            const category = tx.category || 'General';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, { revenue: 0, transactionCount: 0, inventoryItems: [] });
            }
            const data = categoryMap.get(category)!;
            data.revenue += tx.amount;
            data.transactionCount += 1;
        }

        // Match inventory items to categories
        for (const item of inventory) {
            const category = item.category || 'General';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, { revenue: 0, transactionCount: 0, inventoryItems: [] });
            }
            categoryMap.get(category)!.inventoryItems.push(item);
        }

        // Calculate metrics for each category
        const metrics: ProductMetrics[] = Array.from(categoryMap.entries()).map(([category, data]) => {
            const revenue = data.revenue;
            const inventoryCost = data.inventoryItems.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
            const profit = revenue - inventoryCost;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            const totalUnits = data.inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
            const avgPrice = data.transactionCount > 0 ? revenue / data.transactionCount : 0;
            const avgCost = data.inventoryItems.length > 0 ? inventoryCost / data.inventoryItems.length : 0;
            const stockTurnover = data.transactionCount > 0 ? totalUnits / (data.transactionCount || 1) : 0;

            return {
                category,
                itemCount: data.inventoryItems.length,
                totalRevenue: revenue,
                totalCost: inventoryCost,
                netProfit: profit,
                margin,
                avgPrice,
                avgCost,
                totalUnits,
                stockValue: inventoryCost,
                stockTurnover,
            };
        }).filter(m => m.totalRevenue > 0 || m.stockValue > 0);

        // Sort by selected metric
        return metrics.sort((a, b) => {
            if (sortBy === 'profit') return b.netProfit - a.netProfit;
            if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
            if (sortBy === 'margin') return b.margin - a.margin;
            return b.stockTurnover - a.stockTurnover;
        });
    }, [transactions, inventory, sortBy]);

    const totals = useMemo(() => ({
        revenue: productMetrics.reduce((sum, p) => sum + p.totalRevenue, 0),
        cost: productMetrics.reduce((sum, p) => sum + p.totalCost, 0),
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

                        {/* Profitability Bar */}
                        <View style={styles.barContainer}>
                            <View style={styles.barLabel}>
                                <Text style={styles.barText}>Profit Margin</Text>
                                <Text style={[styles.barPercent, { color: product.margin > 40 ? Colors.income : product.margin > 25 ? Colors.warning : Colors.expense }]}>
                                    {product.margin.toFixed(1)}%
                                </Text>
                            </View>
                            <View style={[styles.bar, { backgroundColor: Colors.border }]}>
                                <View
                                    style={[
                                        styles.barFill,
                                        {
                                            width: `${Math.min(100, product.margin)}%`,
                                            backgroundColor: product.margin > 40 ? Colors.income : product.margin > 25 ? Colors.warning : Colors.expense,
                                        },
                                    ]}
                                />
                            </View>
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
                    const slowMovingProducts = productMetrics.filter(p => p.stockValue > 1000 && p.stockTurnover < 1);

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
    barLabel: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    barText: {
        fontSize: 11,
        color: Colors.textSecondary,
    },
    barPercent: {
        fontSize: 12,
        fontWeight: '600',
    },
    bar: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 3,
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
