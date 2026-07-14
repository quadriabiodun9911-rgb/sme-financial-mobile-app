import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function UnderstandBusinessScreen() {
  const { transactions, invoices, finance, settings } = useApp();

  const businessInsights = useMemo(() => {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

    const thisMonthRevenue = transactions
      .filter(t => t.type === 'income' && t.date.startsWith(thisMonth))
      .reduce((s, t) => s + t.amount, 0);

    const lastMonthRevenue = transactions
      .filter(t => t.type === 'income' && t.date.startsWith(lastMonth))
      .reduce((s, t) => s + t.amount, 0);

    const revenueGrowth = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

    const topCategory = Object.entries(
      transactions
        .filter(t => t.type === 'income')
        .reduce((acc, t) => {
          const cat = t.category || 'Other';
          acc[cat] = (acc[cat] || 0) + t.amount;
          return acc;
        }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1])[0];

    const overdueInvoices = invoices.filter(i => {
      const dueDate = new Date(i.dueDate);
      const today = new Date();
      return dueDate < today && i.status !== 'paid';
    }).length;

    const totalOutstanding = invoices
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + i.total, 0);

    return {
      revenueGrowth,
      thisMonthRevenue,
      lastMonthRevenue,
      topCategory,
      overdueInvoices,
      totalOutstanding,
    };
  }, [transactions, invoices]);

  const weeklyAnalysis = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    const weeklyRevenue = transactions
      .filter(t => t.type === 'income' && t.date >= sevenDaysAgoStr)
      .reduce((s, t) => s + t.amount, 0);

    const weeklyExpenses = transactions
      .filter(t => t.type === 'expense' && t.date >= sevenDaysAgoStr)
      .reduce((s, t) => s + t.amount, 0);

    const dailyAverage = weeklyRevenue / 7;

    return {
      weeklyRevenue,
      weeklyExpenses,
      dailyAverage,
      weeklyProfit: weeklyRevenue - weeklyExpenses,
    };
  }, [transactions]);

  const monthlyAnalysis = useMemo(() => {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);

    const monthlyRevenue = transactions
      .filter(t => t.type === 'income' && t.date.startsWith(thisMonth))
      .reduce((s, t) => s + t.amount, 0);

    const monthlyExpenses = transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(thisMonth))
      .reduce((s, t) => s + t.amount, 0);

    const monthlyProfit = monthlyRevenue - monthlyExpenses;
    const profitMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;

    return {
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
      profitMargin,
    };
  }, [transactions]);

  const quarterlyAnalysis = useMemo(() => {
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
    const quarterStartStr = quarterStart.toISOString().slice(0, 7);

    const quarterlyRevenue = transactions
      .filter(t => t.type === 'income' && t.date >= quarterStartStr)
      .reduce((s, t) => s + t.amount, 0);

    const quarterlyExpenses = transactions
      .filter(t => t.type === 'expense' && t.date >= quarterStartStr)
      .reduce((s, t) => s + t.amount, 0);

    const quarterlyProfit = quarterlyRevenue - quarterlyExpenses;
    const quarterNumber = currentQuarter + 1;

    return {
      quarterNumber,
      quarterlyRevenue,
      quarterlyExpenses,
      quarterlyProfit,
    };
  }, [transactions]);

  const yearlyAnalysis = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();

    const yearlyRevenue = transactions
      .filter(t => t.type === 'income' && t.date.startsWith(currentYear))
      .reduce((s, t) => s + t.amount, 0);

    const yearlyExpenses = transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(currentYear))
      .reduce((s, t) => s + t.amount, 0);

    const yearlyProfit = yearlyRevenue - yearlyExpenses;
    const yearlyProfitMargin = yearlyRevenue > 0 ? (yearlyProfit / yearlyRevenue) * 100 : 0;

    return {
      yearlyRevenue,
      yearlyExpenses,
      yearlyProfit,
      yearlyProfitMargin,
    };
  }, [transactions]);

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `${settings.currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${settings.currency}${(amount / 1000).toFixed(0)}K`;
    return `${settings.currency}${amount.toFixed(0)}`;
  };

  const generateAIInsights = () => {
    const insights = [];

    if (businessInsights.revenueGrowth > 20) {
      insights.push({
        emoji: '🚀',
        title: 'Strong Growth Momentum',
        text: `Revenue up ${businessInsights.revenueGrowth.toFixed(0)}% this month. Maintain this momentum with strategic marketing.`,
        type: 'positive',
      });
    } else if (businessInsights.revenueGrowth < -10) {
      insights.push({
        emoji: '⚠️',
        title: 'Revenue Decline Alert',
        text: `Revenue down ${Math.abs(businessInsights.revenueGrowth).toFixed(0)}% this month. Review sales & pricing strategy.`,
        type: 'warning',
      });
    }

    if (businessInsights.overdueInvoices > 0) {
      insights.push({
        emoji: '💬',
        title: 'Follow Up Customers',
        text: `${businessInsights.overdueInvoices} invoice(s) overdue. ${formatCurrency(businessInsights.totalOutstanding)} at stake.`,
        type: 'urgent',
      });
    }

    if (monthlyAnalysis.profitMargin > 50) {
      insights.push({
        emoji: '💎',
        title: 'Excellent Profitability',
        text: `${monthlyAnalysis.profitMargin.toFixed(0)}% profit margin this month. Premium positioning working well.`,
        type: 'positive',
      });
    } else if (monthlyAnalysis.profitMargin < 10 && monthlyAnalysis.monthlyRevenue > 0) {
      insights.push({
        emoji: '📉',
        title: 'Low Margin Alert',
        text: `Only ${monthlyAnalysis.profitMargin.toFixed(0)}% profit margin. Review costs or increase pricing.`,
        type: 'warning',
      });
    }

    if (finance.cashBalance < finance.expense) {
      insights.push({
        emoji: '🚨',
        title: 'Cash Crisis Risk',
        text: `Low cash position. You need ${formatCurrency(finance.expense - finance.cashBalance)} more to stay afloat.`,
        type: 'critical',
      });
    }

    if (businessInsights.topCategory) {
      insights.push({
        emoji: '⭐',
        title: 'Top Revenue Driver',
        text: `${businessInsights.topCategory[0]} is your strongest category. Focus marketing here.`,
        type: 'positive',
      });
    }

    return insights;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>🧠 UNDERSTAND BUSINESS</Text>
          <Text style={styles.subtitle}>AI-Driven Business Intelligence</Text>
        </View>

        {/* AI Insights */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>💡 AI Insights</Text>

          {generateAIInsights().map((insight, idx) => (
            <View key={idx} style={styles.insightCard}>
              <Text style={styles.insightEmoji}>{insight.emoji}</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightText}>{insight.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Weekly Analysis */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📅 This Week</Text>

          <View style={styles.analysisGrid}>
            <View style={styles.analysisCard}>
              <Text style={styles.analysisLabel}>Revenue</Text>
              <Text style={styles.analysisValue}>{formatCurrency(weeklyAnalysis.weeklyRevenue)}</Text>
            </View>

            <View style={styles.analysisCard}>
              <Text style={styles.analysisLabel}>Expenses</Text>
              <Text style={styles.analysisValue}>{formatCurrency(weeklyAnalysis.weeklyExpenses)}</Text>
            </View>

            <View style={styles.analysisCard}>
              <Text style={styles.analysisLabel}>Profit</Text>
              <Text style={[styles.analysisValue, { color: weeklyAnalysis.weeklyProfit > 0 ? '#10b981' : '#ef4444' }]}>
                {formatCurrency(weeklyAnalysis.weeklyProfit)}
              </Text>
            </View>

            <View style={styles.analysisCard}>
              <Text style={styles.analysisLabel}>Daily Avg</Text>
              <Text style={styles.analysisValue}>{formatCurrency(weeklyAnalysis.dailyAverage)}</Text>
            </View>
          </View>
        </View>

        {/* Monthly Analysis */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📊 This Month</Text>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Revenue</Text>
            <Text style={styles.periodValue}>{formatCurrency(monthlyAnalysis.monthlyRevenue)}</Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Expenses</Text>
            <Text style={styles.periodValue}>{formatCurrency(monthlyAnalysis.monthlyExpenses)}</Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Profit</Text>
            <Text style={[styles.periodValue, { color: monthlyAnalysis.monthlyProfit > 0 ? '#10b981' : '#ef4444' }]}>
              {formatCurrency(monthlyAnalysis.monthlyProfit)}
            </Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Margin</Text>
            <Text style={styles.periodValue}>{monthlyAnalysis.profitMargin.toFixed(1)}%</Text>
          </View>
        </View>

        {/* Quarterly Analysis */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📈 Q{quarterlyAnalysis.quarterNumber} {new Date().getFullYear()}</Text>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Revenue</Text>
            <Text style={styles.periodValue}>{formatCurrency(quarterlyAnalysis.quarterlyRevenue)}</Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Expenses</Text>
            <Text style={styles.periodValue}>{formatCurrency(quarterlyAnalysis.quarterlyExpenses)}</Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Profit</Text>
            <Text style={[styles.periodValue, { color: quarterlyAnalysis.quarterlyProfit > 0 ? '#10b981' : '#ef4444' }]}>
              {formatCurrency(quarterlyAnalysis.quarterlyProfit)}
            </Text>
          </View>
        </View>

        {/* Yearly Analysis */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🎯 Year-to-Date {new Date().getFullYear()}</Text>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Revenue</Text>
            <Text style={styles.periodValue}>{formatCurrency(yearlyAnalysis.yearlyRevenue)}</Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Expenses</Text>
            <Text style={styles.periodValue}>{formatCurrency(yearlyAnalysis.yearlyExpenses)}</Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Profit</Text>
            <Text style={[styles.periodValue, { color: yearlyAnalysis.yearlyProfit > 0 ? '#10b981' : '#ef4444' }]}>
              {formatCurrency(yearlyAnalysis.yearlyProfit)}
            </Text>
          </View>

          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Margin</Text>
            <Text style={styles.periodValue}>{yearlyAnalysis.yearlyProfitMargin.toFixed(1)}%</Text>
          </View>
        </View>

        {/* Business Benchmarks */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📋 Performance vs Benchmarks</Text>

          <View style={styles.benchmarkRow}>
            <View style={styles.benchmarkItem}>
              <Text style={styles.benchmarkLabel}>Profit Margin</Text>
              <Text style={styles.benchmarkValue}>{monthlyAnalysis.profitMargin.toFixed(0)}%</Text>
            </View>
            <View style={styles.benchmarkBars}>
              <View style={[styles.benchmarkBar, { width: '30%', backgroundColor: '#ef4444' }]} />
              <View style={[styles.benchmarkBar, { width: '35%', backgroundColor: '#f59e0b' }]} />
              <View style={[styles.benchmarkBar, { width: `${Math.min(monthlyAnalysis.profitMargin, 100)}%`, backgroundColor: monthlyAnalysis.profitMargin > 50 ? '#10b981' : '#3b82f6' }]} />
            </View>
            <Text style={styles.benchmarkTarget}>Target: 50%+</Text>
          </View>

          <View style={styles.benchmarkRow}>
            <View style={styles.benchmarkItem}>
              <Text style={styles.benchmarkLabel}>Cash Runway</Text>
              <Text style={styles.benchmarkValue}>
                {Math.round((finance.cashBalance / (finance.expense / 30 || 1)))} days
              </Text>
            </View>
            <View style={styles.benchmarkBars}>
              <View style={[styles.benchmarkBar, { width: '25%', backgroundColor: '#ef4444' }]} />
              <View style={[styles.benchmarkBar, { width: '40%', backgroundColor: '#f59e0b' }]} />
              <View style={[styles.benchmarkBar, { width: '35%', backgroundColor: '#10b981' }]} />
            </View>
            <Text style={styles.benchmarkTarget}>Target: 90+ days</Text>
          </View>

          <View style={styles.benchmarkRow}>
            <View style={styles.benchmarkItem}>
              <Text style={styles.benchmarkLabel}>Revenue Growth</Text>
              <Text style={styles.benchmarkValue}>{businessInsights.revenueGrowth.toFixed(0)}%</Text>
            </View>
            <View style={styles.benchmarkBars}>
              <View style={[styles.benchmarkBar, { width: `${Math.min(Math.max(businessInsights.revenueGrowth + 20, 0), 100)}%`, backgroundColor: businessInsights.revenueGrowth > 10 ? '#10b981' : '#3b82f6' }]} />
            </View>
            <Text style={styles.benchmarkTarget}>Target: 15%+ MoM</Text>
          </View>
        </View>

        {/* Recommendations */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>✨ Next Steps</Text>

          <TouchableOpacity style={styles.recommendationCard}>
            <Text style={styles.recEmoji}>📊</Text>
            <View style={styles.recContent}>
              <Text style={styles.recTitle}>Export Monthly Report</Text>
              <Text style={styles.recText}>Download this month's financial summary for records</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.recommendationCard}>
            <Text style={styles.recEmoji}>💬</Text>
            <View style={styles.recContent}>
              <Text style={styles.recTitle}>Schedule Planning Session</Text>
              <Text style={styles.recText}>Review quarterly goals & adjust strategy</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.recommendationCard}>
            <Text style={styles.recEmoji}>🤖</Text>
            <View style={styles.recContent}>
              <Text style={styles.recTitle}>Get AI Business Advisor</Text>
              <Text style={styles.recText}>Chat with AI about your business strategy</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <FooterNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 20 },
  headerSection: { paddingHorizontal: 16, paddingVertical: 16 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted },
  sectionBox: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  insightCard: { flexDirection: 'row', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10, marginBottom: 8, alignItems: 'flex-start' },
  insightEmoji: { fontSize: 18, marginRight: 10 },
  insightContent: { flex: 1 },
  insightTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  insightText: { fontSize: 10, color: Colors.textSecondary, lineHeight: 14 },
  analysisGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  analysisCard: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10, minWidth: '45%' },
  analysisLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 6, fontWeight: '600' },
  analysisValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  periodCard: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  periodValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  benchmarkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  benchmarkItem: { width: 70 },
  benchmarkLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  benchmarkValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  benchmarkBars: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, marginHorizontal: 10, overflow: 'hidden', flexDirection: 'row' },
  benchmarkBar: { height: '100%' },
  benchmarkTarget: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', width: 70, textAlign: 'right' },
  recommendationCard: { flexDirection: 'row', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10, marginBottom: 8, alignItems: 'flex-start' },
  recEmoji: { fontSize: 18, marginRight: 10 },
  recContent: { flex: 1 },
  recTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  recText: { fontSize: 10, color: Colors.textSecondary, lineHeight: 13 },
});
