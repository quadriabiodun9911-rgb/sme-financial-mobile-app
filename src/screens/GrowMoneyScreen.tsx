import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function GrowMoneyScreen() {
  const { transactions, finance, navigate, currency } = useApp();

  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

    const thisRevenue = transactions.filter(t => t.type === 'income' && t.date.startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0);
    const lastRevenue = transactions.filter(t => t.type === 'income' && t.date.startsWith(lastMonth)).reduce((s, t) => s + t.amount, 0);
    const revGrowth = lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue) * 100 : 0;

    const thisProfit = thisRevenue - transactions.filter(t => t.type === 'expense' && t.date.startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0);
    const lastProfit = lastRevenue - transactions.filter(t => t.type === 'expense' && t.date.startsWith(lastMonth)).reduce((s, t) => s + t.amount, 0);
    const profitGrowth = lastProfit > 0 ? ((thisProfit - lastProfit) / lastProfit) * 100 : 0;

    return { revGrowth, profitGrowth, thisRevenue, thisProfit };
  }, [transactions]);

  const businessValue = useMemo(() => {
    const annualRevenue = finance.income * 12;
    const valMultiple = Math.max(2, 5 - (Math.max(0, -finance.profit) / (finance.income || 1)));
    return Math.round(annualRevenue * valMultiple);
  }, [finance]);

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `${currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${currency}${(amount / 1000).toFixed(0)}K`;
    return `${currency}${amount.toFixed(0)}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>📈 GROW MONEY</Text>
          <Text style={styles.subtitle}>Growth Analytics & Valuation</Text>
        </View>

        {/* Growth Metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Revenue Growth</Text>
            <Text style={[styles.metricValue, { color: metrics.revGrowth > 0 ? '#10b981' : '#ef4444' }]}>
              {metrics.revGrowth > 0 ? '+' : ''}{metrics.revGrowth.toFixed(1)}%
            </Text>
            <Text style={styles.metricSubtext}>MoM</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Profit Growth</Text>
            <Text style={[styles.metricValue, { color: metrics.profitGrowth > 0 ? '#10b981' : '#ef4444' }]}>
              {metrics.profitGrowth > 0 ? '+' : ''}{metrics.profitGrowth.toFixed(1)}%
            </Text>
            <Text style={styles.metricSubtext}>MoM</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Profit Margin</Text>
            <Text style={[styles.metricValue, { color: finance.profit > 0 ? '#10b981' : '#ef4444' }]}>
              {finance.profit > 0 ? (finance.profit / finance.income * 100).toFixed(0) : '0'}%
            </Text>
            <Text style={styles.metricSubtext}>Current</Text>
          </View>
        </View>

        {/* Business Value */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>💎 Business Valuation</Text>

          <View style={styles.valuationCard}>
            <Text style={styles.valuationLabel}>Estimated Business Worth</Text>
            <Text style={styles.valuationValue}>{formatCurrency(businessValue)}</Text>
            <Text style={styles.valuationSubtext}>Based on revenue multiple × {(businessValue / (finance.income * 12)).toFixed(1)}x</Text>

            <View style={styles.valuationBreakdown}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Annual Revenue</Text>
                <Text style={styles.breakdownValue}>{formatCurrency(finance.income * 12)}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Multiple</Text>
                <Text style={styles.breakdownValue}>{(businessValue / (finance.income * 12)).toFixed(1)}x</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Valuation</Text>
                <Text style={styles.breakdownValue}>{formatCurrency(businessValue)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Growth Opportunities */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🎯 Growth Opportunities</Text>

          {metrics.revGrowth > 15 && (
            <View style={styles.opportunityCard}>
              <Text style={styles.oppEmoji}>🚀</Text>
              <View style={styles.oppContent}>
                <Text style={styles.oppTitle}>Strong Momentum</Text>
                <Text style={styles.oppText}>Revenue up {metrics.revGrowth.toFixed(0)}%. Scale operations to maintain growth.</Text>
              </View>
            </View>
          )}

          {metrics.profitGrowth < 0 && (
            <View style={styles.opportunityCard}>
              <Text style={styles.oppEmoji}>⚠️</Text>
              <View style={styles.oppContent}>
                <Text style={styles.oppTitle}>Improve Profitability</Text>
                <Text style={styles.oppText}>Profit down {Math.abs(metrics.profitGrowth).toFixed(0)}%. Review pricing and costs.</Text>
              </View>
            </View>
          )}

          {businessValue > finance.income * 12 * 3 && (
            <View style={styles.opportunityCard}>
              <Text style={styles.oppEmoji}>💰</Text>
              <View style={styles.oppContent}>
                <Text style={styles.oppTitle}>Ready for Expansion</Text>
                <Text style={styles.oppText}>Your business value supports expansion or acquisition.</Text>
              </View>
            </View>
          )}

          <View style={styles.opportunityCard}>
            <Text style={styles.oppEmoji}>📊</Text>
            <View style={styles.oppContent}>
              <Text style={styles.oppTitle}>Data-Driven Insights</Text>
              <Text style={styles.oppText}>Review detailed analytics in Reports to identify growth levers.</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigate('reports')}>
            <Text style={styles.actionEmoji}>📊</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Analytics</Text>
              <Text style={styles.actionSubtext}>Detailed reports</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigate('goals')}>
            <Text style={styles.actionEmoji}>🎯</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Set Growth Goals</Text>
              <Text style={styles.actionSubtext}>Define targets</Text>
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
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 20 },
  headerSection: { paddingHorizontal: 16, paddingVertical: 16 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted },
  metricsGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 },
  metricCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  metricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 6, fontWeight: '600' },
  metricValue: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  metricSubtext: { fontSize: 9, color: Colors.textMuted },
  sectionBox: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  valuationCard: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 8, padding: 12 },
  valuationLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  valuationValue: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  valuationSubtext: { fontSize: 10, color: Colors.textSecondary, marginBottom: 12 },
  valuationBreakdown: { flexDirection: 'row', gap: 12 },
  breakdownItem: { flex: 1, alignItems: 'center' },
  breakdownLabel: { fontSize: 9, color: Colors.textMuted, marginBottom: 2 },
  breakdownValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  opportunityCard: { flexDirection: 'row', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10, marginBottom: 8, alignItems: 'flex-start' },
  oppEmoji: { fontSize: 18, marginRight: 10 },
  oppContent: { flex: 1 },
  oppTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  oppText: { fontSize: 10, color: Colors.textSecondary, lineHeight: 14 },
  actionsSection: { paddingHorizontal: 16, gap: 10 },
  actionButton: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  actionEmoji: { fontSize: 22, marginRight: 12 },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  actionSubtext: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  actionArrow: { fontSize: 16, color: Colors.primary },
});
