import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function RunBusinessScreen() {
  const { transactions, invoices, finance, navigate, currency } = useApp();

  const operationalMetrics = useMemo(() => {
    const totalTransactions = transactions.length;
    const monthlyTransactions = transactions.filter(t => {
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      return t.date.startsWith(thisMonth);
    }).length;

    const uniqueSuppliers = new Set(
      transactions
        .filter(t => t.type === 'expense' && t.vendorCustomer)
        .map(t => t.vendorCustomer)
    ).size;

    const uniqueCustomers = new Set(
      transactions
        .filter(t => t.type === 'income' && t.vendorCustomer)
        .map(t => t.vendorCustomer)
    ).size;

    const recurringTransactions = transactions.filter(t => t.isRecurring).length;
    const recurringPercentage = totalTransactions > 0 ? (recurringTransactions / totalTransactions) * 100 : 0;

    return {
      totalTransactions,
      monthlyTransactions,
      uniqueSuppliers,
      uniqueCustomers,
      recurringPercentage,
    };
  }, [transactions]);

  const teamMetrics = useMemo(() => {
    const monthlyPayroll = transactions
      .filter(t => t.type === 'expense' && t.category === 'Payroll')
      .reduce((sum, t) => sum + t.amount, 0);

    const estimatedTeamSize = Math.max(1, Math.round(monthlyPayroll / 50000));

    return {
      monthlyPayroll,
      estimatedTeamSize,
      payrollAsPercentage: finance.expense > 0 ? (monthlyPayroll / finance.expense) * 100 : 0,
    };
  }, [transactions, finance]);

  const assetMetrics = useMemo(() => {
    const capitalExpense = transactions
      .filter(t => t.type === 'expense' && (t.category === 'Equipment' || t.category === 'Assets'))
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      capitalExpense,
      estimatedAssets: capitalExpense * 1.5,
    };
  }, [transactions]);

  const operationalHealth = useMemo(() => {
    let score = 50;

    if (operationalMetrics.monthlyTransactions > 20) score += 15;
    if (operationalMetrics.recurringPercentage > 50) score += 15;
    if (teamMetrics.payrollAsPercentage < 40) score += 10;
    if (operationalMetrics.uniqueSuppliers > 5) score += 10;

    return Math.min(score, 100);
  }, [operationalMetrics, teamMetrics]);

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `${currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${currency}${(amount / 1000).toFixed(0)}K`;
    return `${currency}${amount.toFixed(0)}`;
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>⚙️ RUN BUSINESS</Text>
          <Text style={styles.subtitle}>Operations & Execution</Text>
        </View>

        {/* Operational Health */}
        <View style={styles.healthCard}>
          <Text style={styles.healthLabel}>Operational Health</Text>
          <View style={styles.healthDisplay}>
            <Text style={[styles.healthScore, { color: getHealthColor(operationalHealth) }]}>
              {operationalHealth}
            </Text>
            <Text style={styles.healthMax}>/100</Text>
          </View>
          <Text style={styles.healthSubtext}>
            {operationalHealth >= 80 ? '✅ Excellent execution' : operationalHealth >= 60 ? '🟢 Good operational flow' : '🟡 Room for improvement'}
          </Text>

          <View style={styles.healthBar}>
            <View
              style={[
                styles.healthFill,
                {
                  width: `${operationalHealth}%`,
                  backgroundColor: getHealthColor(operationalHealth),
                },
              ]}
            />
          </View>
        </View>

        {/* Transaction Metrics */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📋 Transaction Activity</Text>

          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>This Month</Text>
              <Text style={styles.metricValue}>{operationalMetrics.monthlyTransactions}</Text>
              <Text style={styles.metricSubtext}>transactions</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Total</Text>
              <Text style={styles.metricValue}>{operationalMetrics.totalTransactions}</Text>
              <Text style={styles.metricSubtext}>all-time</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Recurring</Text>
              <Text style={styles.metricValue}>{operationalMetrics.recurringPercentage.toFixed(0)}%</Text>
              <Text style={styles.metricSubtext}>automated</Text>
            </View>
          </View>
        </View>

        {/* Supplier & Customer Network */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🤝 Business Network</Text>

          <View style={styles.networkGrid}>
            <View style={styles.networkCard}>
              <Text style={styles.networkEmoji}>🏢</Text>
              <Text style={styles.networkValue}>{operationalMetrics.uniqueSuppliers}</Text>
              <Text style={styles.networkLabel}>Suppliers</Text>
              <Text style={styles.networkSubtext}>Active partners</Text>
            </View>

            <View style={styles.networkCard}>
              <Text style={styles.networkEmoji}>👥</Text>
              <Text style={styles.networkValue}>{operationalMetrics.uniqueCustomers}</Text>
              <Text style={styles.networkLabel}>Customers</Text>
              <Text style={styles.networkSubtext}>Active clients</Text>
            </View>
          </View>

          <View style={styles.networkInsight}>
            {operationalMetrics.uniqueSuppliers < 3 && (
              <Text style={styles.insightText}>⚠️ Diversify suppliers to reduce risk</Text>
            )}
            {operationalMetrics.uniqueCustomers < 5 && (
              <Text style={styles.insightText}>⚠️ Grow customer base for stable revenue</Text>
            )}
            {operationalMetrics.uniqueSuppliers >= 3 && operationalMetrics.uniqueCustomers >= 5 && (
              <Text style={styles.insightText}>✅ Healthy supplier and customer diversity</Text>
            )}
          </View>
        </View>

        {/* Team Management */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>👨‍💼 Team</Text>

          <View style={styles.teamCard}>
            <Text style={styles.teamLabel}>Estimated Team Size</Text>
            <Text style={styles.teamValue}>{teamMetrics.estimatedTeamSize} {teamMetrics.estimatedTeamSize === 1 ? 'person' : 'people'}</Text>
            <Text style={styles.teamSubtext}>Based on payroll</Text>
          </View>

          <View style={styles.teamCard}>
            <Text style={styles.teamLabel}>Monthly Payroll</Text>
            <Text style={styles.teamValue}>{formatCurrency(teamMetrics.monthlyPayroll)}</Text>
            <Text style={styles.teamSubtext}>{teamMetrics.payrollAsPercentage.toFixed(0)}% of expenses</Text>
          </View>

          <View style={styles.teamHealthBar}>
            <View
              style={[
                styles.teamHealthFill,
                {
                  width: `${Math.min(Math.max(teamMetrics.payrollAsPercentage, 0), 100)}%`,
                  backgroundColor: teamMetrics.payrollAsPercentage < 40 ? '#10b981' : teamMetrics.payrollAsPercentage < 60 ? '#f59e0b' : '#ef4444',
                },
              ]}
            />
          </View>
          <Text style={styles.teamHealthText}>
            {teamMetrics.payrollAsPercentage < 40 ? '✅ Optimal payroll ratio' : teamMetrics.payrollAsPercentage < 60 ? '🟡 Monitor payroll' : '🔴 High payroll burden'}
          </Text>
        </View>

        {/* Assets & Equipment */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🛠️ Assets & Equipment</Text>

          <View style={styles.assetCard}>
            <Text style={styles.assetLabel}>Capital Invested</Text>
            <Text style={styles.assetValue}>{formatCurrency(assetMetrics.capitalExpense)}</Text>
            <Text style={styles.assetSubtext}>In equipment & assets</Text>
          </View>

          <View style={styles.assetCard}>
            <Text style={styles.assetLabel}>Estimated Asset Base</Text>
            <Text style={styles.assetValue}>{formatCurrency(assetMetrics.estimatedAssets)}</Text>
            <Text style={styles.assetSubtext}>Depreciated value</Text>
          </View>
        </View>

        {/* Compliance Checklist */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>✅ Compliance & Setup</Text>

          <View style={styles.checklistItem}>
            <Text style={styles.checklistIcon}>✅</Text>
            <View style={styles.checklistContent}>
              <Text style={styles.checklistTitle}>Business Registered</Text>
              <Text style={styles.checklistText}>Formal business entity setup</Text>
            </View>
          </View>

          <View style={styles.checklistItem}>
            <Text style={styles.checklistIcon}>✅</Text>
            <View style={styles.checklistContent}>
              <Text style={styles.checklistTitle}>Tax Compliant</Text>
              <Text style={styles.checklistText}>Tax returns filed & paid</Text>
            </View>
          </View>

          <View style={styles.checklistItem}>
            <Text style={styles.checklistIcon}>⏳</Text>
            <View style={styles.checklistContent}>
              <Text style={styles.checklistTitle}>Insurance Coverage</Text>
              <Text style={styles.checklistText}>Business & liability insurance</Text>
            </View>
          </View>

          <View style={styles.checklistItem}>
            <Text style={styles.checklistIcon}>⏳</Text>
            <View style={styles.checklistContent}>
              <Text style={styles.checklistTitle}>Bank Account Optimized</Text>
              <Text style={styles.checklistText}>Multiple accounts for separation</Text>
            </View>
          </View>
        </View>

        {/* Operational Improvements */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>💡 Operational Improvements</Text>

          {operationalMetrics.recurringPercentage < 50 && (
            <View style={styles.improvementCard}>
              <Text style={styles.improvementEmoji}>🤖</Text>
              <View style={styles.improvementContent}>
                <Text style={styles.improvementTitle}>Automate Recurring Tasks</Text>
                <Text style={styles.improvementText}>Set up recurring transactions for salary, rent, subscriptions</Text>
              </View>
            </View>
          )}

          {operationalMetrics.uniqueSuppliers < 5 && (
            <View style={styles.improvementCard}>
              <Text style={styles.improvementEmoji}>🤝</Text>
              <View style={styles.improvementContent}>
                <Text style={styles.improvementTitle}>Diversify Supplier Base</Text>
                <Text style={styles.improvementText}>Build relationships with 5+ suppliers for redundancy</Text>
              </View>
            </View>
          )}

          {teamMetrics.payrollAsPercentage > 60 && (
            <View style={styles.improvementCard}>
              <Text style={styles.improvementEmoji}>💰</Text>
              <View style={styles.improvementContent}>
                <Text style={styles.improvementTitle}>Review Labor Costs</Text>
                <Text style={styles.improvementText}>Explore automation or optimize team structure</Text>
              </View>
            </View>
          )}

          <View style={styles.improvementCard}>
            <Text style={styles.improvementEmoji}>📊</Text>
            <View style={styles.improvementContent}>
              <Text style={styles.improvementTitle}>Track KPIs Daily</Text>
              <Text style={styles.improvementText}>Monitor key operational metrics for early warning</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigate('transactions')}>
            <Text style={styles.actionEmoji}>📝</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Manage Transactions</Text>
              <Text style={styles.actionSubtext}>Record operations</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigate('reports')}>
            <Text style={styles.actionEmoji}>📊</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Reports</Text>
              <Text style={styles.actionSubtext}>Operations analysis</Text>
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
  healthCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 16, padding: 16 },
  healthLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, fontWeight: '600' },
  healthDisplay: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  healthScore: { fontSize: 48, fontWeight: '700' },
  healthMax: { fontSize: 14, color: Colors.textMuted, marginTop: 6, marginLeft: 4 },
  healthSubtext: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, fontWeight: '500' },
  healthBar: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  healthFill: { height: '100%' },
  sectionBox: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 12, alignItems: 'center' },
  metricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 6, fontWeight: '600' },
  metricValue: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  metricSubtext: { fontSize: 9, color: Colors.textMuted },
  networkGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  networkCard: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 12, alignItems: 'center' },
  networkEmoji: { fontSize: 24, marginBottom: 6 },
  networkValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  networkLabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, marginBottom: 2 },
  networkSubtext: { fontSize: 9, color: Colors.textMuted },
  networkInsight: { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10 },
  insightText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  teamCard: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 8, padding: 12, marginBottom: 10 },
  teamLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  teamValue: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  teamSubtext: { fontSize: 10, color: Colors.textSecondary },
  teamHealthBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginBottom: 4, overflow: 'hidden' },
  teamHealthFill: { height: '100%' },
  teamHealthText: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  assetCard: { backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, padding: 12, marginBottom: 10 },
  assetLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  assetValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  assetSubtext: { fontSize: 10, color: Colors.textSecondary },
  checklistItem: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'flex-start' },
  checklistIcon: { fontSize: 16, marginRight: 10, marginTop: 2 },
  checklistContent: { flex: 1 },
  checklistTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  checklistText: { fontSize: 10, color: Colors.textMuted },
  improvementCard: { flexDirection: 'row', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10, marginBottom: 8, alignItems: 'flex-start' },
  improvementEmoji: { fontSize: 18, marginRight: 10 },
  improvementContent: { flex: 1 },
  improvementTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  improvementText: { fontSize: 10, color: Colors.textSecondary, lineHeight: 14 },
  actionsSection: { paddingHorizontal: 16, gap: 10 },
  actionButton: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  actionEmoji: { fontSize: 22, marginRight: 12 },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  actionSubtext: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  actionArrow: { fontSize: 16, color: Colors.primary },
});
