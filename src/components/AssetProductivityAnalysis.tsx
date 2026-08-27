import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Asset } from '../types';
import { computeLeverageRatios } from '../utils/debtRatios';
import RadialGauge from './RadialGauge';
import BarList from './BarList';

interface Props {
    finance: FinanceData;
    assets: Asset[];
    currency: string;
    accountsReceivable?: number;
    inventoryValue?: number;
}

export interface AssetHealthResult {
    score: number;
    status: 'excellent' | 'good' | 'needs_improvement';
    color: string;
}

// Exported so a summary teaser (e.g. Reports' Assets tab, which links here
// rather than re-rendering the full analysis) can show the same score
// without duplicating the scoring logic.
export function computeAssetHealthScore(
    finance: FinanceData,
    assets: Asset[],
    accountsReceivable: number = 0,
    inventoryValue: number = 0,
): AssetHealthResult {
    const activeAssets = assets.filter(a => a.status === 'active');
    const totalAssetValue = activeAssets.reduce((sum, a) => sum + a.purchaseCost, 0);

    // Asset turnover/revenue-per-asset deliberately stay scoped to the
    // registered asset list (totalAssetValue) -- a narrower, equipment-
    // specific question ("how hard is my registered equipment working").
    // ROA is a different question ("how productive is everything the
    // business owns"), so it uses the same canonical assets figure as the
    // Loans & Debt tab (computeLeverageRatios: finance.assets + AR +
    // inventory) -- using finance.assets alone here used to show a
    // different ROA than the Loans & Debt tab for the exact same business.
    const assetTurnover = finance.income > 0 ? finance.income / Math.max(1, totalAssetValue) : 0;
    const { returnOnAssets } = computeLeverageRatios(finance, [], accountsReceivable, 0, inventoryValue);

    let score = 100;

    // Asset turnover (higher is better)
    if (assetTurnover < 0.5) score -= 30;
    else if (assetTurnover < 1) score -= 15;
    else if (assetTurnover < 1.5) score -= 5;

    // ROA (higher is better)
    if (returnOnAssets < 5) score -= 25;
    else if (returnOnAssets < 10) score -= 10;
    else if (returnOnAssets < 15) score -= 5;

    // Asset utilization
    if (activeAssets.length === 0) score -= 20;

    const status = score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'needs_improvement';
    const color = status === 'excellent' ? Colors.income : status === 'good' ? Colors.warning : Colors.expense;

    return { score: Math.max(0, Math.min(100, score)), status, color };
}

export default function AssetProductivityAnalysis({ finance, assets, currency, accountsReceivable = 0, inventoryValue = 0 }: Props) {
    const activeAssets = assets.filter(a => a.status === 'active');
    const totalAssetValue = useMemo(
        () => activeAssets.reduce((sum, a) => sum + a.purchaseCost, 0),
        [activeAssets],
    );

    const assetTurnover = finance.income > 0 ? finance.income / Math.max(1, totalAssetValue) : 0;
    const { returnOnAssets } = computeLeverageRatios(finance, [], accountsReceivable, 0, inventoryValue);
    const profitMargin = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;

    const health = computeAssetHealthScore(finance, assets, accountsReceivable, inventoryValue);

    // Revenue per asset
    const revenuePerAsset = activeAssets.length > 0 ? finance.income / activeAssets.length : 0;

    // Asset category analysis
    const categoryAnalysis = useMemo(() => {
        const categories = new Map<string, { count: number; value: number }>();
        activeAssets.forEach(a => {
            const cat = a.category;
            if (!categories.has(cat)) {
                categories.set(cat, { count: 0, value: 0 });
            }
            const current = categories.get(cat)!;
            current.count += 1;
            current.value += a.purchaseCost;
        });
        return Array.from(categories.entries()).map(([cat, { count, value }]) => ({
            category: cat,
            count,
            value,
            avgValue: value / count,
        }));
    }, [activeAssets]);

    // Recommendations -- each one states the real number that triggered it,
    // not just the generic advice, so it reads as this business's own
    // situation rather than boilerplate that would show up for anyone.
    const getRecommendations = (): string[] => {
        const recs: string[] = [];

        if (assetTurnover < 1) {
            recs.push(`Low asset turnover (${assetTurnover.toFixed(2)}x): increase revenue generation or reduce underutilized assets`);
        }

        if (returnOnAssets < 10) {
            recs.push(`Improve ROA (currently ${returnOnAssets.toFixed(1)}%): focus on productivity — generate more profit per asset`);
        }

        if (profitMargin < 20 && finance.income > 0) {
            recs.push(`Thin margins (${profitMargin.toFixed(1)}%): reduce costs or increase prices to improve profitability`);
        }

        if (activeAssets.length === 0) {
            recs.push('No assets recorded: track equipment and machinery investments for accurate metrics');
        }

        if (assetTurnover > 2) {
            recs.push(`Excellent asset utilization (${assetTurnover.toFixed(2)}x turnover): your assets are generating strong returns`);
        }

        if (returnOnAssets > 15) {
            recs.push(`Strong ROA (${returnOnAssets.toFixed(1)}%): your assets are highly productive — consider scaling`);
        }

        return recs;
    };

    // Growth opportunities
    const getGrowthOpportunities = (): string[] => {
        const opps: string[] = [];

        if (assetTurnover < 1.5 && finance.income > 0) {
            opps.push(`Optimize current assets (${assetTurnover.toFixed(2)}x turnover): train staff, improve processes to increase output`);
        }

        if (returnOnAssets > 10) {
            opps.push(`Invest in similar assets: at ${returnOnAssets.toFixed(1)}% ROA your current assets are profitable — consider expanding`);
        }

        if (finance.cashBalance > totalAssetValue * 0.2) {
            const idleCash = finance.cashBalance - totalAssetValue * 0.2;
            opps.push(`Unused capital: ~${currency}${idleCash.toLocaleString(undefined, { maximumFractionDigits: 0 })} in cash sits well above your asset base — consider investing in productive assets for growth`);
        }

        if (activeAssets.length < 5) {
            opps.push(`Asset diversification: only ${activeAssets.length} asset${activeAssets.length === 1 ? '' : 's'} recorded — invest in multiple asset types to reduce risk`);
        }

        return opps;
    };

    const recommendations = getRecommendations();
    const opportunities = getGrowthOpportunities();

    return (
        <View>
            {/* Asset Health Score */}
            <View style={[styles.healthCard, { borderColor: health.color }]}>
                <RadialGauge
                    displayValue={health.score.toFixed(0)}
                    label="/ 100"
                    progress={health.score / 100}
                    color={health.color}
                    size={84}
                />
                <View style={styles.healthTextCol}>
                    <Text style={styles.healthLabel}>Asset Productivity Score</Text>
                    <Text style={[styles.healthStatus, { color: health.color }]}>
                        Status: {health.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </Text>
                </View>
            </View>

            {/* Key Metrics */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📊 Asset Productivity Metrics</Text>

                <MetricRow
                    label="Total Active Assets"
                    value={`${activeAssets.length} asset${activeAssets.length !== 1 ? 's' : ''}`}
                    sublabel="Equipment, vehicles, property, and other assets in use"
                />
                <MetricRow
                    label="Total Purchase Cost"
                    value={`${currency}${totalAssetValue.toLocaleString()}`}
                    sublabel="Combined original cost of all active assets, before depreciation"
                />
                <MetricRow
                    label="Revenue per Asset"
                    value={`${currency}${revenuePerAsset.toLocaleString()}`}
                    sublabel="Average revenue generated per asset"
                    color={revenuePerAsset > 10000 ? Colors.income : revenuePerAsset > 5000 ? Colors.warning : Colors.expense}
                />
                <MetricRow
                    label="Asset Turnover Ratio"
                    value={`${assetTurnover.toFixed(2)}x`}
                    sublabel="Revenue ÷ Asset Value. Higher = more efficient"
                    color={assetTurnover > 1.5 ? Colors.income : assetTurnover > 1 ? Colors.warning : Colors.expense}
                />
                <MetricRow
                    label="Return on Assets (ROA)"
                    value={`${returnOnAssets.toFixed(1)}%`}
                    sublabel="Profit generated per dollar of assets"
                    color={returnOnAssets > 15 ? Colors.income : returnOnAssets > 10 ? Colors.warning : Colors.expense}
                />
                <MetricRow
                    label="Profit Margin"
                    value={`${profitMargin.toFixed(1)}%`}
                    sublabel="Profit as % of revenue"
                    color={profitMargin > 20 ? Colors.income : profitMargin > 10 ? Colors.warning : Colors.expense}
                />
            </View>

            {/* Asset Efficiency Insights */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>💡 Asset Efficiency Insights</Text>

                {assetTurnover > 1.5 && (
                    <InsightBox color={Colors.income} title="✓ High Efficiency">
                        Your assets are generating significant revenue. Consider scaling operations.
                    </InsightBox>
                )}

                {assetTurnover < 1 && (
                    <InsightBox color={Colors.expense} title="⚠ Low Utilization">
                        Assets are underutilized. Consider divesting non-productive assets or increasing output.
                    </InsightBox>
                )}

                {returnOnAssets > 15 && (
                    <InsightBox color={Colors.income} title="✓ Profitable Assets">
                        Your assets are highly profitable. This indicates strong operational efficiency.
                    </InsightBox>
                )}

                {profitMargin < 10 && (
                    <InsightBox color={Colors.warning} title="⚠ Thin Margins">
                        Low profit margins reduce funds available for asset maintenance and replacement.
                    </InsightBox>
                )}

                {activeAssets.length === 0 && (
                    <InsightBox color={Colors.warning} title="⚠ No Assets">
                        Add your assets to track productivity and optimize resource allocation.
                    </InsightBox>
                )}
            </View>

            {/* Asset Category Breakdown */}
            {categoryAnalysis.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>🏭 Asset Breakdown by Category</Text>
                    <BarList
                        items={categoryAnalysis
                            .slice()
                            .sort((a, b) => b.value - a.value)
                            .map(cat => ({
                                label: cat.category,
                                value: cat.value,
                                displayValue: `${currency}${cat.value.toLocaleString()}`,
                            }))}
                        color={Colors.asset}
                    />
                    {categoryAnalysis.map((cat, i) => (
                        <View key={i} style={styles.categoryRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.categoryName}>{cat.category}</Text>
                                <Text style={styles.categorySub}>
                                    {cat.count} asset{cat.count > 1 ? 's' : ''} · Avg {currency}
                                    {cat.avgValue.toLocaleString()}
                                </Text>
                            </View>
                            <Text style={styles.categoryValue}>{currency}{cat.value.toLocaleString()}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Business Impact */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>🎯 Impact on Business Performance</Text>
                <Text style={styles.impactTitle}>Revenue Generation</Text>
                <Text style={styles.impactText}>
                    Your assets generate {currency}{finance.income.toLocaleString()} in revenue, with{' '}
                    {profitMargin.toFixed(1)}% profit margin.
                </Text>

                <Text style={[styles.impactTitle, { marginTop: 12 }]}>Operational Efficiency</Text>
                <Text style={styles.impactText}>
                    Each asset generates {currency}
                    {revenuePerAsset.toLocaleString()} in revenue.{' '}
                    {assetTurnover > 1 ? 'Strong asset utilization.' : 'Consider improving asset utilization.'}
                </Text>

                <Text style={[styles.impactTitle, { marginTop: 12 }]}>Scalability</Text>
                <Text style={styles.impactText}>
                    {returnOnAssets > 15
                        ? 'Your ROA is strong - you can scale with confidence'
                        : returnOnAssets > 10
                        ? 'Your ROA is healthy - growth is viable'
                        : 'Improve asset productivity before expanding'}
                </Text>
            </View>

            {/* Recommendations */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>💬 Productivity Recommendations</Text>
                {recommendations.map((rec, i) => (
                    <View key={i} style={styles.recItem}>
                        <Text style={styles.recText}>• {rec}</Text>
                    </View>
                ))}
            </View>

            {/* Growth Opportunities */}
            {opportunities.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>📈 Growth Opportunities</Text>
                    {opportunities.map((opp, i) => (
                        <View key={i} style={styles.oppItem}>
                            <Text style={styles.oppText}>🚀 {opp}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Best Practices */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📚 Asset Management Best Practices</Text>
                <BestPractice title="1. Regular Maintenance" desc="Prevents breakdowns and extends asset life" />
                <BestPractice title="2. Track Depreciation" desc="Understand true asset value and replacement needs" />
                <BestPractice title="3. Monitor Utilization" desc="Identify underused assets that drain resources" />
                <BestPractice title="4. Plan Replacement" desc="Schedule asset upgrades before they fail" />
                <BestPractice title="5. Optimize Allocation" desc="Assign assets to highest-revenue activities" />
                <BestPractice title="6. Regular Audits" desc="Verify asset existence and condition" />
            </View>
        </View>
    );
}

function MetricRow({
    label,
    value,
    sublabel,
    color = Colors.textPrimary,
}: {
    label: string;
    value: string;
    sublabel: string;
    color?: string;
}) {
    return (
        <View style={styles.metricRow}>
            <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricSub}>{sublabel}</Text>
            </View>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

function InsightBox({ color, title, children }: { color: string; title: string; children: string }) {
    return (
        <View style={[styles.insightBox, { borderLeftColor: color, backgroundColor: color + '12' }]}>
            <Text style={[styles.insightTitle, { color }]}>{title}</Text>
            <Text style={styles.insightText}>{children}</Text>
        </View>
    );
}

function BestPractice({ title, desc }: { title: string; desc: string }) {
    return (
        <View style={styles.practiceItem}>
            <Text style={styles.practiceTitle}>{title}</Text>
            <Text style={styles.practiceDesc}>{desc}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 12,
    },

    healthCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    healthTextCol: {
        flex: 1,
    },
    healthLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    healthStatus: {
        fontSize: 13,
        fontWeight: '600',
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    metricLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    metricSub: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    metricValue: {
        fontSize: 14,
        fontWeight: 'bold',
    },

    insightBox: {
        borderLeftWidth: 4,
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    insightTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    insightText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    categoryName: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
        textTransform: 'capitalize',
        marginBottom: 4,
    },
    categorySub: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    categoryValue: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.textPrimary,
    },

    impactTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    impactText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    recItem: {
        paddingVertical: 8,
    },
    recText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    oppItem: {
        paddingVertical: 8,
    },
    oppText: {
        fontSize: 12,
        color: Colors.income,
        fontWeight: '600',
        lineHeight: 18,
    },

    practiceItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    practiceTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    practiceDesc: {
        fontSize: 11,
        color: Colors.textMuted,
    },
});
