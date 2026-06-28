import React, { useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function FinancialHealthCoachScreen() {
    const { user, finance, transactions, settings, navigate } = useApp();
    const { currency } = settings;

    // Generate personalized recommendations
    const recommendations = useMemo(() => {
        const recs: Array<{
            priority: 'high' | 'medium' | 'low';
            category: string;
            title: string;
            description: string;
            action: string;
            impact: string;
            emoji: string;
        }> = [];

        // 1. Profitability
        const profitMargin = finance.profit > 0 && finance.income > 0
            ? (finance.profit / finance.income) * 100
            : 0;

        if (profitMargin < 20) {
            recs.push({
                priority: 'high',
                category: 'Profitability',
                title: 'Increase Profit Margin',
                description: `Your current profit margin is ${profitMargin.toFixed(1)}%. Industry average is 20-30%.`,
                action: 'Review expenses and find opportunities to reduce costs or increase prices',
                impact: 'Could increase monthly profit by 10-20%',
                emoji: '📈',
            });
        }

        // 2. Cash Flow
        const runway = finance.runway || 0;
        if (runway < 90) {
            recs.push({
                priority: 'high',
                category: 'Cash Flow',
                title: 'Build Emergency Fund',
                description: `You have ${Math.round(runway)} days of runway. Experts recommend 3-6 months.`,
                action: 'Set aside 10-20% of profit as emergency fund',
                impact: 'Protects business from unexpected challenges',
                emoji: '💰',
            });
        }

        // 3. Revenue Growth
        if ((user?.avgMonthlyRevenue || 0) < 500000) {
            recs.push({
                priority: 'medium',
                category: 'Growth',
                title: 'Scale Revenue',
                description: `Current monthly revenue: ${currency}${(user?.avgMonthlyRevenue || 0).toLocaleString()}. Target: ${currency}500k.`,
                action: 'Add new products/services or expand customer base',
                impact: 'Opens access to better financing and bank loans',
                emoji: '🚀',
            });
        }

        // 4. Business Age
        if ((user?.daysActive || 0) < 365) {
            recs.push({
                priority: 'medium',
                category: 'Stability',
                title: 'Build Operating History',
                description: `You've been operating for ${Math.round((user?.daysActive || 0) / 30)} months. Reach 12 months for better access.`,
                action: 'Maintain consistent transactions and grow steadily',
                impact: 'Qualifies you for traditional bank loans',
                emoji: '📅',
            });
        }

        // 5. Expense Control
        const expenseRatio = finance.income > 0 ? (finance.expense / finance.income) * 100 : 0;
        if (expenseRatio > 80) {
            recs.push({
                priority: 'high',
                category: 'Cost Control',
                title: 'Optimize Expenses',
                description: `Expenses are ${expenseRatio.toFixed(0)}% of revenue. Healthy range is 60-75%.`,
                action: 'Audit expenses and negotiate better supplier rates',
                impact: 'Can improve profit by 5-10 percentage points',
                emoji: '💸',
            });
        }

        // 6. Diversification
        const topCategoryIncome = transactions
            .filter(t => t.category !== 'Expense')
            .reduce((acc, t) => {
                const existing = acc.find(a => a.category === t.category);
                if (existing) existing.amount += t.amount;
                else acc.push({ category: t.category, amount: t.amount });
                return acc;
            }, [] as Array<{ category: string; amount: number }>)
            .sort((a, b) => b.amount - a.amount)[0];

        if (topCategoryIncome) {
            const topCategoryPercent = (topCategoryIncome.amount / finance.income) * 100;
            if (topCategoryPercent > 60) {
                recs.push({
                    priority: 'medium',
                    category: 'Risk Management',
                    title: 'Diversify Income',
                    description: `${topCategoryPercent.toFixed(0)}% of revenue from one category. High risk concentration.`,
                    action: 'Add complementary products/services',
                    impact: 'Reduces business risk and improves stability',
                    emoji: '🎯',
                });
            }
        }

        // 7. Tax Planning
        recs.push({
            priority: 'low',
            category: 'Tax Planning',
            title: 'Prepare for Tax Filing',
            description: 'Stay organized and track deductible expenses throughout the year',
            action: 'Use Tax Planning module to estimate quarterly taxes',
            impact: 'Saves 5-10% through proper deduction tracking',
            emoji: '📋',
        });

        return recs.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }, [user, finance, transactions, currency]);

    // Industry benchmarks
    const benchmarks = useMemo(() => {
        const profitMargin = finance.profit > 0 && finance.income > 0
            ? (finance.profit / finance.income) * 100
            : 0;
        const expenseRatio = finance.income > 0 ? (finance.expense / finance.income) * 100 : 0;
        const runway = finance.runway || 0;

        return [
            {
                metric: 'Profit Margin',
                yours: `${profitMargin.toFixed(1)}%`,
                benchmark: '20-30%',
                status: profitMargin >= 20 ? 'Good' : 'Needs Work',
            },
            {
                metric: 'Expense Ratio',
                yours: `${expenseRatio.toFixed(0)}%`,
                benchmark: '60-75%',
                status: expenseRatio >= 60 && expenseRatio <= 75 ? 'Good' : 'Adjust',
            },
            {
                metric: 'Cash Runway',
                yours: `${Math.round(runway)} days`,
                benchmark: '90-180 days',
                status: runway >= 90 ? 'Good' : 'Build Fund',
            },
            {
                metric: 'Monthly Revenue',
                yours: `${currency}${((user?.avgMonthlyRevenue || 0) / 1000).toLocaleString()}k`,
                benchmark: `${currency}200k+`,
                status: (user?.avgMonthlyRevenue || 0) >= 200000 ? 'Good' : 'Growing',
            },
        ];
    }, [finance, user, currency]);

    const highPriorityCount = recommendations.filter(r => r.priority === 'high').length;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>🏆 Financial Health Coach</Text>
                <Text style={s.subtitle}>Personalized recommendations to grow your business</Text>

                {/* Health Score Summary */}
                <View style={s.healthSummary}>
                    <View style={s.healthScoreBox}>
                        <Text style={s.healthLabel}>Health Score</Text>
                        <Text style={[s.healthValue, { color: (user?.financialHealthScore || 0) >= 70 ? Colors.income : Colors.warning }]}>
                            {Math.round(user?.financialHealthScore || 0)}
                        </Text>
                        <Text style={s.healthStatus}>
                            {(user?.financialHealthScore || 0) >= 80 ? 'Excellent' : (user?.financialHealthScore || 0) >= 60 ? 'Good' : 'Fair'}
                        </Text>
                    </View>

                    <View style={s.healthMetrics}>
                        <MetricItem label="Revenue" value={`${currency}${((user?.avgMonthlyRevenue || 0) / 1000).toLocaleString()}k/mo`} />
                        <MetricItem label="Profit" value={`${currency}${((finance.profit || 0) / 1000).toLocaleString()}k`} />
                        <MetricItem label="Runway" value={`${Math.round(finance.runway || 0)} days`} />
                    </View>
                </View>

                {/* Recommendations */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>🎯 Recommendations</Text>
                        {highPriorityCount > 0 && (
                            <View style={s.priorityBadge}>
                                <Text style={s.priorityText}>{highPriorityCount} Priority</Text>
                            </View>
                        )}
                    </View>

                    {recommendations.length === 0 ? (
                        <Text style={s.emptyText}>🎉 Great job! No critical recommendations at this time.</Text>
                    ) : (
                        recommendations.map((rec, idx) => (
                            <RecommendationCard key={idx} rec={rec} />
                        ))
                    )}
                </View>

                {/* Benchmarks */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>📊 Your vs Industry Benchmarks</Text>
                    {benchmarks.map((bench, idx) => (
                        <BenchmarkRow key={idx} benchmark={bench} />
                    ))}
                </View>

                {/* Goals & Milestones */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>🎯 Growth Milestones</Text>
                    <MilestoneItem
                        icon="📅"
                        title="100 Days Operating"
                        subtitle={`${Math.round((user?.daysActive || 0) / 30)} / 3+ months`}
                        progress={(user?.daysActive || 0) / 100}
                        reward="Basic financing eligibility"
                    />
                    <MilestoneItem
                        icon="💰"
                        title={`${currency}500k Monthly Revenue`}
                        subtitle={`${currency}${((user?.avgMonthlyRevenue || 0) / 1000).toLocaleString()}k / ${currency}500k`}
                        progress={(user?.avgMonthlyRevenue || 0) / 500000}
                        reward="Bank loan eligibility"
                    />
                    <MilestoneItem
                        icon="💎"
                        title="80+ Health Score"
                        subtitle={`${Math.round(user?.financialHealthScore || 0)} / 80 points`}
                        progress={(user?.financialHealthScore || 0) / 80}
                        reward="Excellent credit profile"
                    />
                    <MilestoneItem
                        icon="🏆"
                        title="12 Months Operating"
                        subtitle={`${Math.round((user?.daysActive || 0) / 30)} / 12 months`}
                        progress={(user?.daysActive || 0) / 365}
                        reward="Prime financing rates"
                    />
                </View>

                {/* Action Items */}
                <View style={s.actionBox}>
                    <Text style={s.actionTitle}>📋 Next Steps</Text>
                    <ActionItem emoji="📊" text="Review your dashboard daily - stay informed" />
                    <ActionItem emoji="💳" text="Work on improving your credit profile" />
                    <ActionItem emoji="📈" text="Focus on revenue growth and profitability" />
                    <ActionItem emoji="📝" text="Prepare tax documents quarterly" />
                    <ActionItem emoji="🤝" text="Explore loan options when ready" />
                </View>
            </ScrollView>

            <FooterNav />
        </SafeAreaView>
    );
}

function MetricItem({ label, value }: { label: string; value: string }) {
    return (
        <View>
            <Text style={s.metricLabel}>{label}</Text>
            <Text style={s.metricValue}>{value}</Text>
        </View>
    );
}

function RecommendationCard({ rec }: { rec: any }) {
    const priorityColor = rec.priority === 'high' ? Colors.expense : rec.priority === 'medium' ? Colors.warning : Colors.income;

    return (
        <View style={[s.recCard, { borderLeftColor: priorityColor, borderLeftWidth: 4 }]}>
            <View style={s.recHeader}>
                <Text style={s.recEmoji}>{rec.emoji}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.recTitle}>{rec.title}</Text>
                    <Text style={s.recCategory}>{rec.category}</Text>
                </View>
                <View style={[s.priorityTag, { backgroundColor: priorityColor + '20' }]}>
                    <Text style={[s.priorityTagText, { color: priorityColor }]}>{rec.priority}</Text>
                </View>
            </View>
            <Text style={s.recDescription}>{rec.description}</Text>
            <View style={s.recAction}>
                <Text style={s.recActionLabel}>Action:</Text>
                <Text style={s.recActionText}>{rec.action}</Text>
            </View>
            <View style={s.recImpact}>
                <Text style={s.recImpactLabel}>💡 Impact:</Text>
                <Text style={s.recImpactText}>{rec.impact}</Text>
            </View>
        </View>
    );
}

function BenchmarkRow({ benchmark }: { benchmark: any }) {
    return (
        <View style={s.benchmarkRow}>
            <View style={{ flex: 1 }}>
                <Text style={s.benchmarkLabel}>{benchmark.metric}</Text>
                <Text style={s.benchmarkDetail}>You: {benchmark.yours}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.benchmarkTarget, { color: benchmark.status === 'Good' ? Colors.income : Colors.warning }]}>
                    {benchmark.benchmark}
                </Text>
                <Text style={s.benchmarkStatus}>{benchmark.status}</Text>
            </View>
        </View>
    );
}

function MilestoneItem({ icon, title, subtitle, progress, reward }: any) {
    return (
        <View style={s.milestoneCard}>
            <View style={s.milestoneHeader}>
                <Text style={s.milestoneIcon}>{icon}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.milestoneTitle}>{title}</Text>
                    <Text style={s.milestoneSubtitle}>{subtitle}</Text>
                </View>
            </View>
            <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
            </View>
            <Text style={s.milestoneReward}>🎁 {reward}</Text>
        </View>
    );
}

function ActionItem({ emoji, text }: { emoji: string; text: string }) {
    return (
        <View style={s.actionItem}>
            <Text style={s.actionEmoji}>{emoji}</Text>
            <Text style={s.actionText}>{text}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
    healthSummary: { marginBottom: 24 },
    healthScoreBox: { backgroundColor: Colors.primary + '15', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: Colors.primary, alignItems: 'center' },
    healthLabel: { fontSize: 12, color: Colors.textSecondary },
    healthValue: { fontSize: 48, fontWeight: 'bold', marginVertical: 4 },
    healthStatus: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    healthMetrics: { flexDirection: 'row', gap: 12 },
    metricLabel: { fontSize: 11, color: Colors.textSecondary },
    metricValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginTop: 4 },
    section: { marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
    priorityBadge: { backgroundColor: Colors.expense + '20', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 },
    priorityText: { fontSize: 11, fontWeight: '600', color: Colors.expense },
    emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
    recCard: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 12 },
    recHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    recEmoji: { fontSize: 24 },
    recTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    recCategory: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    priorityTag: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 },
    priorityTagText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
    recDescription: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
    recAction: { backgroundColor: Colors.muted + '40', borderRadius: 6, padding: 8, marginBottom: 8 },
    recActionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
    recActionText: { fontSize: 12, color: Colors.textPrimary, marginTop: 4, lineHeight: 18 },
    recImpact: { backgroundColor: Colors.income + '10', borderRadius: 6, padding: 8 },
    recImpactLabel: { fontSize: 11, fontWeight: '600', color: Colors.income },
    recImpactText: { fontSize: 12, color: Colors.textPrimary, marginTop: 4 },
    benchmarkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.muted },
    benchmarkLabel: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
    benchmarkDetail: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    benchmarkTarget: { fontSize: 12, fontWeight: '600' },
    benchmarkStatus: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
    milestoneCard: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 12 },
    milestoneHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    milestoneIcon: { fontSize: 24 },
    milestoneTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
    milestoneSubtitle: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    progressBar: { height: 6, backgroundColor: Colors.muted, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
    progressFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
    milestoneReward: { fontSize: 11, fontWeight: '600', color: Colors.income },
    actionBox: { backgroundColor: Colors.primary + '15', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary, marginBottom: 24 },
    actionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    actionItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
    actionEmoji: { fontSize: 18 },
    actionText: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
});
