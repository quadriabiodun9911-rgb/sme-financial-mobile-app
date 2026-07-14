import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { analyzeRevenue, analyzeSalesFunnel } from '../utils/revenueAnalytics';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function MakeMoneyScreen() {
  const { transactions, invoices, finance, setCurrentScreen, currency } = useApp();

  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);

  // Analyze revenue
  const metrics = useMemo(
    () => analyzeRevenue(transactions, invoices, thisMonth, lastMonth),
    [transactions, invoices, thisMonth, lastMonth]
  );

  const funnel = useMemo(
    () => analyzeSalesFunnel(transactions, invoices),
    [transactions, invoices]
  );

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) {
      return `${currency}${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `${currency}${(amount / 1000).toFixed(0)}K`;
    }
    return `${currency}${amount.toFixed(0)}`;
  };

  const getGrowthColor = (growth: number): string => {
    if (growth > 0) return '#10b981';
    if (growth < 0) return '#ef4444';
    return Colors.textMuted;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.title}>💰 MAKE MONEY</Text>
          <Text style={styles.subtitle}>Revenue & Profit Dashboard</Text>
        </View>

        {/* Revenue Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This Month</Text>
            <Text style={styles.summaryValue}>{formatCurrency(metrics.thisMonthRevenue)}</Text>
            <Text style={styles.summarySubtext}>Revenue</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Last Month</Text>
            <Text style={styles.summaryValue}>{formatCurrency(metrics.lastMonthRevenue)}</Text>
            <Text style={styles.summarySubtext}>Revenue</Text>
          </View>

          <View style={[styles.summaryCard, styles.highlightCard]}>
            <Text style={styles.summaryLabel}>Growth</Text>
            <Text style={[styles.summaryValue, { color: getGrowthColor(metrics.monthOverMonthGrowth) }]}>
              {metrics.monthOverMonthGrowth > 0 ? '+' : ''}
              {metrics.monthOverMonthGrowth.toFixed(1)}%
            </Text>
            <Text style={styles.summarySubtext}>MoM</Text>
          </View>
        </View>

        {/* Profit Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📊 Profit Breakdown</Text>

          <View style={styles.profitGrid}>
            <View style={styles.profitCard}>
              <Text style={styles.profitLabel}>Profit</Text>
              <Text style={[styles.profitValue, { color: '#10b981' }]}>
                {formatCurrency(metrics.totalProfit)}
              </Text>
              <View style={styles.marginBar}>
                <View
                  style={[
                    styles.marginFill,
                    { width: `${Math.min(Math.max(metrics.profitMargin, 0), 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.profitMarginText}>{metrics.profitMargin.toFixed(1)}% margin</Text>
            </View>

            <View style={styles.profitCard}>
              <Text style={styles.profitLabel}>Avg Monthly</Text>
              <Text style={styles.profitValue}>{formatCurrency(metrics.averageMonthlyRevenue)}</Text>
              <Text style={styles.profitSubtext}>Annual average</Text>
            </View>
          </View>
        </View>

        {/* Sales Funnel */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🎯 Sales Funnel</Text>

          <View style={styles.funnelContainer}>
            <View style={[styles.funnelStep, { width: '100%' }]}>
              <Text style={styles.funnelLabel}>Leads</Text>
              <Text style={styles.funnelValue}>{funnel.leads}</Text>
            </View>

            <View style={[styles.funnelStep, { width: '85%' }]}>
              <Text style={styles.funnelLabel}>Prospects</Text>
              <Text style={styles.funnelValue}>{funnel.prospects}</Text>
            </View>

            <View style={[styles.funnelStep, { width: '60%' }]}>
              <Text style={styles.funnelLabel}>Customers</Text>
              <Text style={styles.funnelValue}>{funnel.customers}</Text>
            </View>

            <View style={[styles.funnelStep, { width: `${Math.max((funnel.paidCustomers / funnel.leads) * 100, 20)}%` }]}>
              <Text style={styles.funnelLabel}>Paid</Text>
              <Text style={styles.funnelValue}>{funnel.paidCustomers}</Text>
            </View>
          </View>

          <View style={styles.funnelStats}>
            <View style={styles.funnelStat}>
              <Text style={styles.funnelStatLabel}>Conversion</Text>
              <Text style={styles.funnelStatValue}>{funnel.conversionRate.toFixed(1)}%</Text>
            </View>
            <View style={styles.funnelStat}>
              <Text style={styles.funnelStatLabel}>Avg Order</Text>
              <Text style={styles.funnelStatValue}>{formatCurrency(funnel.avgOrderValue)}</Text>
            </View>
          </View>
        </View>

        {/* Top Categories */}
        {metrics.topCategories.length > 0 && (
          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>📈 Top Categories</Text>

            {metrics.topCategories.map((cat, idx) => (
              <View key={idx} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName}>{cat.category}</Text>
                  <Text style={styles.categoryMeta}>
                    {cat.count} transaction{cat.count > 1 ? 's' : ''} • {cat.margin.toFixed(0)}% margin
                  </Text>
                </View>
                <View style={styles.categoryValues}>
                  <Text style={styles.categoryRevenue}>{formatCurrency(cat.revenue)}</Text>
                  <Text style={[styles.categoryTrend, { color: cat.trend >= 0 ? '#10b981' : '#ef4444' }]}>
                    {cat.trend >= 0 ? '▲' : '▼'}{Math.abs(cat.trend).toFixed(0)}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* AI Recommendations */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>💡 AI Insights</Text>

          {metrics.profitMargin > 50 && (
            <View style={styles.insightCard}>
              <Text style={styles.insightEmoji}>✅</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Excellent Margins</Text>
                <Text style={styles.insightText}>Your {metrics.profitMargin.toFixed(0)}% margin is above industry average. Consider expanding.</Text>
              </View>
            </View>
          )}

          {metrics.monthOverMonthGrowth > 15 && (
            <View style={styles.insightCard}>
              <Text style={styles.insightEmoji}>🚀</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Strong Growth</Text>
                <Text style={styles.insightText}>Revenue up {metrics.monthOverMonthGrowth.toFixed(0)}% MoM. Keep momentum going!</Text>
              </View>
            </View>
          )}

          {metrics.topProducts.length > 0 && (
            <View style={styles.insightCard}>
              <Text style={styles.insightEmoji}>⭐</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Top Performer</Text>
                <Text style={styles.insightText}>{metrics.topProducts[0].name} generates {metrics.topProducts[0].margin.toFixed(0)}% margin. Stock up.</Text>
              </View>
            </View>
          )}

          {metrics.monthOverMonthGrowth < 0 && (
            <View style={styles.insightCard}>
              <Text style={styles.insightEmoji}>⚠️</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Revenue Down</Text>
                <Text style={styles.insightText}>Revenue declined {Math.abs(metrics.monthOverMonthGrowth).toFixed(0)}%. Review marketing & pricing.</Text>
              </View>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton} onPress={() => setCurrentScreen('transactions')}>
            <Text style={styles.actionEmoji}>📝</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Record Sale</Text>
              <Text style={styles.actionSubtext}>Add new income</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setCurrentScreen('invoices')}>
            <Text style={styles.actionEmoji}>🧾</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Create Invoice</Text>
              <Text style={styles.actionSubtext}>Send to customer</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setCurrentScreen('reports')}>
            <Text style={styles.actionEmoji}>📊</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Reports</Text>
              <Text style={styles.actionSubtext}>Detailed analytics</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <FooterNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingBottom: 20,
  },

  headerSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
  },

  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },

  highlightCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },

  summaryLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 6,
    fontWeight: '600',
  },

  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  summarySubtext: {
    fontSize: 9,
    color: Colors.textMuted,
  },

  sectionBox: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },

  profitGrid: {
    gap: 12,
  },

  profitCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 12,
  },

  profitLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 4,
  },

  profitValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },

  profitSubtext: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  marginBar: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },

  marginFill: {
    height: '100%',
    backgroundColor: '#10b981',
  },

  profitMarginText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  funnelContainer: {
    gap: 8,
    marginBottom: 12,
  },

  funnelStep: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  funnelLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },

  funnelValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3b82f6',
  },

  funnelStats: {
    flexDirection: 'row',
    gap: 12,
  },

  funnelStat: {
    flex: 1,
    alignItems: 'center',
  },

  funnelStatLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    marginBottom: 2,
  },

  funnelStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  categoryInfo: {
    flex: 1,
  },

  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  categoryMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  categoryValues: {
    alignItems: 'flex-end',
  },

  categoryRevenue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  categoryTrend: {
    fontSize: 10,
    fontWeight: '600',
  },

  insightCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    alignItems: 'flex-start',
  },

  insightEmoji: {
    fontSize: 18,
    marginRight: 10,
  },

  insightContent: {
    flex: 1,
  },

  insightTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  insightText: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 14,
  },

  actionsSection: {
    paddingHorizontal: 16,
    gap: 10,
  },

  actionButton: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },

  actionEmoji: {
    fontSize: 22,
    marginRight: 12,
  },

  actionContent: {
    flex: 1,
  },

  actionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  actionSubtext: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },

  actionArrow: {
    fontSize: 16,
    color: Colors.primary,
  },
});
