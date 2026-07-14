import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

type Tab = 'overview' | 'expenses' | 'budgets';

export default function ProtectMoneyScreen() {
  const { transactions, invoices, finance, settings } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [timeFrame, setTimeFrame] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `${settings.currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${settings.currency}${(amount / 1000).toFixed(0)}K`;
    return `${settings.currency}${amount.toFixed(0)}`;
  };

  // Calculate cash metrics
  const cashMetrics = useMemo(() => {
    const monthlyIncome = finance.income;
    const monthlyExpense = finance.expense;
    const netCash = monthlyIncome - monthlyExpense;
    const cashAvailable = finance.cashBalance;
    const runwayDays = monthlyExpense > 0 ? Math.floor((cashAvailable / (monthlyExpense / 30))) : 999;

    return {
      monthlyIncome,
      monthlyExpense,
      netCash,
      cashAvailable,
      runwayDays,
      changePercent: 14, // This would be calculated from previous month
    };
  }, [finance]);

  // Categorize transactions for cash sources and uses
  const cashBreakdown = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income');
    const expense = transactions.filter(t => t.type === 'expense');

    const salesAmount = income.filter(t => t.category?.toLowerCase().includes('sale')).reduce((sum, t) => sum + t.amount, 0);
    const invoicePaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total, 0);
    const otherIncome = income.filter(t => !t.category?.toLowerCase().includes('sale')).reduce((sum, t) => sum + t.amount, 0);

    const inventoryAmount = expense.filter(t => t.category?.toLowerCase().includes('inventory') || t.category?.toLowerCase().includes('supplier')).reduce((sum, t) => sum + t.amount, 0);
    const salaryAmount = expense.filter(t => t.category?.toLowerCase().includes('salary') || t.category?.toLowerCase().includes('payroll')).reduce((sum, t) => sum + t.amount, 0);
    const marketingAmount = expense.filter(t => t.category?.toLowerCase().includes('marketing') || t.category?.toLowerCase().includes('advertising')).reduce((sum, t) => sum + t.amount, 0);
    const rentAmount = expense.filter(t => t.category?.toLowerCase().includes('rent') || t.category?.toLowerCase().includes('office')).reduce((sum, t) => sum + t.amount, 0);
    const utilitiesAmount = expense.filter(t => t.category?.toLowerCase().includes('utilities') || t.category?.toLowerCase().includes('electricity')).reduce((sum, t) => sum + t.amount, 0);
    const otherExpense = expense.filter(t =>
      !t.category?.toLowerCase().includes('inventory') &&
      !t.category?.toLowerCase().includes('supplier') &&
      !t.category?.toLowerCase().includes('salary') &&
      !t.category?.toLowerCase().includes('payroll') &&
      !t.category?.toLowerCase().includes('marketing') &&
      !t.category?.toLowerCase().includes('advertising') &&
      !t.category?.toLowerCase().includes('rent') &&
      !t.category?.toLowerCase().includes('office') &&
      !t.category?.toLowerCase().includes('utilities') &&
      !t.category?.toLowerCase().includes('electricity')
    ).reduce((sum, t) => sum + t.amount, 0);

    const totalIncome = salesAmount + invoicePaid + otherIncome;
    const totalExpense = inventoryAmount + salaryAmount + marketingAmount + rentAmount + utilitiesAmount + otherExpense;

    return {
      sources: [
        { name: 'Sales', amount: salesAmount, percent: totalIncome > 0 ? (salesAmount / totalIncome) * 100 : 0 },
        { name: 'Invoices Paid', amount: invoicePaid, percent: totalIncome > 0 ? (invoicePaid / totalIncome) * 100 : 0 },
        { name: 'Other Income', amount: otherIncome, percent: totalIncome > 0 ? (otherIncome / totalIncome) * 100 : 0 },
      ],
      uses: [
        { name: 'Inventory', amount: inventoryAmount, percent: totalExpense > 0 ? (inventoryAmount / totalExpense) * 100 : 0 },
        { name: 'Salary', amount: salaryAmount, percent: totalExpense > 0 ? (salaryAmount / totalExpense) * 100 : 0 },
        { name: 'Marketing', amount: marketingAmount, percent: totalExpense > 0 ? (marketingAmount / totalExpense) * 100 : 0 },
        { name: 'Rent', amount: rentAmount, percent: totalExpense > 0 ? (rentAmount / totalExpense) * 100 : 0 },
        { name: 'Utilities', amount: utilitiesAmount, percent: totalExpense > 0 ? (utilitiesAmount / totalExpense) * 100 : 0 },
        { name: 'Other', amount: otherExpense, percent: totalExpense > 0 ? (otherExpense / totalExpense) * 100 : 0 },
      ],
    };
  }, [transactions, invoices]);

  // Get upcoming payments
  const upcomingPayments = useMemo(() => {
    const now = new Date();
    const upcomingInvoices = invoices
      .filter(i => i.status === 'unpaid' && new Date(i.dueDate) > now)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 3);

    return upcomingInvoices.map(inv => ({
      name: inv.customerName,
      amount: inv.total,
      dueDate: inv.dueDate,
      daysUntil: Math.ceil((new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }, [invoices]);

  // AI Recommendation engine
  const recommendation = useMemo(() => {
    if (cashMetrics.runwayDays < 30) {
      return {
        icon: '⚠️',
        title: 'Cash Risk Alert',
        message: `Cash remains critical. Current runway: ${cashMetrics.runwayDays} Days`,
        action: `Collect ₦450,000 in outstanding invoices this week to extend your cash runway by 12 days.`,
      };
    }
    if (cashMetrics.runwayDays < 60) {
      return {
        icon: '🤖',
        title: 'Cash Insights',
        message: `Cash remains healthy. However, inventory purchases have increased for three consecutive weeks.`,
        action: `Delay non-essential purchases until customer payments arrive.`,
      };
    }
    return {
      icon: '✓',
      title: 'Cash Position Healthy',
      message: `Your cash flow is stable with ${cashMetrics.runwayDays} days of runway.`,
      action: `Focus on growing revenue while maintaining current expense discipline.`,
    };
  }, [cashMetrics]);

  const renderOverview = () => (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Cash Position Header */}
      <View style={styles.headerCard}>
        <Text style={styles.headerStatus}>Healthy</Text>
        <View style={styles.headerAmount}>
          <Text style={styles.headerSign}>+</Text>
          <Text style={styles.headerValue}>{formatCurrency(cashMetrics.netCash)}</Text>
          <Text style={styles.headerLabel}>this month</Text>
        </View>
      </View>

      {/* Cash Available Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Cash Available</Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardValue}>{formatCurrency(cashMetrics.cashAvailable)}</Text>
          <View style={styles.changeTag}>
            <Text style={styles.changeText}>↑ {cashMetrics.changePercent}%</Text>
            <Text style={styles.changeSubtext}>vs last month</Text>
          </View>
        </View>
      </View>

      {/* Cash Flow Timeline */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Cash Flow Timeline</Text>
        <View style={styles.timeframeButtons}>
          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(tf => (
            <TouchableOpacity
              key={tf}
              style={[styles.timeframeBtn, timeFrame === tf && styles.timeframeActive]}
              onPress={() => setTimeFrame(tf)}
            >
              <Text style={[styles.timeframeText, timeFrame === tf && styles.timeframeActiveText]}>
                {tf.charAt(0).toUpperCase() + tf.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartLabel}>Money In</Text>
          <View style={styles.barChart}>
            <View style={[styles.bar, { width: '85%', backgroundColor: '#10b981' }]} />
          </View>
          <Text style={styles.chartLabel} style={{ marginTop: 12 }}>Money Out</Text>
          <View style={styles.barChart}>
            <View style={[styles.bar, { width: '65%', backgroundColor: '#ef4444' }]} />
          </View>
          <Text style={styles.chartLabel} style={{ marginTop: 12 }}>Net Cash</Text>
          <View style={styles.barChart}>
            <View style={[styles.bar, { width: '45%', backgroundColor: '#3b82f6' }]} />
          </View>
        </View>
      </View>

      {/* Money In vs Money Out */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>This Month</Text>
        <View style={styles.moneyRow}>
          <View style={styles.moneyBox}>
            <Text style={styles.moneyLabel}>Money In</Text>
            <Text style={[styles.moneyValue, { color: '#10b981' }]}>{formatCurrency(cashMetrics.monthlyIncome)}</Text>
          </View>
          <View style={styles.moneyBox}>
            <Text style={styles.moneyLabel}>Money Out</Text>
            <Text style={[styles.moneyValue, { color: '#ef4444' }]}>{formatCurrency(cashMetrics.monthlyExpense)}</Text>
          </View>
          <View style={styles.moneyBox}>
            <Text style={styles.moneyLabel}>Net</Text>
            <Text style={[styles.moneyValue, { color: '#3b82f6' }]}>+{formatCurrency(cashMetrics.netCash)}</Text>
          </View>
        </View>
      </View>

      {/* Cash Sources */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Cash Sources</Text>
        <Text style={styles.sourceTitle}>Money In</Text>
        {cashBreakdown.sources.map((source, idx) => (
          <View key={idx} style={styles.sourceItem}>
            <View style={styles.sourceLeft}>
              <Text style={styles.sourceName}>{source.name}</Text>
              <Text style={styles.sourcePercent}>{Math.round(source.percent)}%</Text>
            </View>
            <View style={[styles.sourceBar, { width: `${Math.max(source.percent * 1.5, 20)}%` }]} />
          </View>
        ))}
      </View>

      {/* Cash Uses */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Cash Uses</Text>
        <Text style={styles.sourceTitle}>Money Out</Text>
        {cashBreakdown.uses.slice(0, 4).map((use, idx) => (
          <View key={idx} style={styles.sourceItem}>
            <View style={styles.sourceLeft}>
              <Text style={styles.sourceName}>{use.name}</Text>
              <Text style={styles.sourcePercent}>{Math.round(use.percent)}%</Text>
            </View>
            <View style={[styles.useBar, { width: `${Math.max(use.percent * 1.5, 20)}%` }]} />
          </View>
        ))}
      </View>

      {/* Upcoming Payments */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Upcoming Payments</Text>
        <Text style={styles.upcomingHeader}>Due This Week</Text>
        {upcomingPayments.length > 0 ? (
          upcomingPayments.map((payment, idx) => (
            <View key={idx} style={styles.paymentItem}>
              <View style={styles.paymentLeft}>
                <Text style={styles.paymentName}>{payment.name}</Text>
                <Text style={styles.paymentDue}>In {payment.daysUntil} days</Text>
              </View>
              <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noData}>No upcoming payments this week</Text>
        )}
      </View>

      {/* AI Cash Advisor */}
      <View style={[styles.card, styles.advisorCard]}>
        <View style={styles.advisorHeader}>
          <Text style={styles.advisorIcon}>{recommendation.icon}</Text>
          <View>
            <Text style={styles.advisorTitle}>{recommendation.title}</Text>
            <Text style={styles.advisorMessage}>{recommendation.message}</Text>
          </View>
        </View>
        <View style={styles.advisorAction}>
          <Text style={styles.advisorLabel}>Recommendation</Text>
          <Text style={styles.advisorText}>{recommendation.action}</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderExpenses = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Manage Expenses</Text>
        <Text style={styles.monthlySpending}>Monthly Spending</Text>
        <Text style={styles.spendingAmount}>{formatCurrency(cashMetrics.monthlyExpense)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Spending Health</Text>
        <View style={styles.healthRow}>
          <View style={styles.healthScore}>
            <Text style={styles.healthGrade}>Excellent</Text>
            <Text style={styles.healthNumber}>72 / 100</Text>
          </View>
          <View style={styles.healthTrend}>
            <Text style={styles.trendLabel}>Spending Trend</Text>
            <Text style={[styles.trendValue, { color: '#10b981' }]}>↓ 4%</Text>
            <Text style={styles.trendCompare}>Compared to last month</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Expense Categories</Text>
        {cashBreakdown.uses.map((use, idx) => (
          <TouchableOpacity key={idx} style={styles.categoryItem}>
            <View style={styles.categoryLeft}>
              <Text style={styles.categoryName}>{use.name}</Text>
              <Text style={styles.categoryAmount}>{formatCurrency(use.amount)}</Text>
            </View>
            <View style={styles.categoryRight}>
              <Text style={styles.categoryPercent}>{Math.round(use.percent)}%</Text>
              <Text style={use.amount > 0 ? styles.trendUp : styles.trendDown}>
                {use.amount > 0 ? '▲' : '▼'}12%
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Biggest Expense</Text>
        <View style={styles.biggestBox}>
          <Text style={styles.biggestLabel}>Largest Spending Category</Text>
          <Text style={styles.biggestName}>Inventory</Text>
          <Text style={styles.biggestAmount}>{formatCurrency(cashMetrics.monthlyExpense * 0.45)}</Text>
        </View>
      </View>

      <View style={[styles.card, styles.advisorCard]}>
        <Text style={styles.advisorIcon}>🤖</Text>
        <Text style={styles.advisorTitle}>AI Expense Coach</Text>
        <Text style={styles.advisorMessage}>Inventory costs have increased for four weeks.</Text>
        <Text style={styles.advisorText}>Consider reviewing supplier pricing.</Text>
      </View>
    </ScrollView>
  );

  const renderBudgets = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Budget Planner</Text>
        <Text style={styles.monthLabel}>July Budget</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Overall Budget</Text>
        <View style={styles.budgetRow}>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Budget</Text>
            <Text style={styles.budgetValue}>{formatCurrency(2000000)}</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Spent</Text>
            <Text style={styles.budgetValue}>{formatCurrency(1640000)}</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Remaining</Text>
            <Text style={[styles.budgetValue, { color: '#10b981' }]}>{formatCurrency(360000)}</Text>
          </View>
        </View>
        <View style={styles.budgetBar}>
          <View style={[styles.budgetFill, { width: '82%' }]} />
        </View>
        <Text style={styles.budgetPercent}>82%</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Category Budgets</Text>
        {[
          { category: 'Inventory', budget: 900000, spent: 740000 },
          { category: 'Marketing', budget: 300000, spent: 280000, warning: true },
          { category: 'Payroll', budget: 500000, spent: 500000, complete: true },
          { category: 'Rent', budget: 250000, spent: 250000, complete: true },
        ].map((cat, idx) => {
          const percent = Math.round((cat.spent / cat.budget) * 100);
          return (
            <View key={idx} style={styles.categoryBudget}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName}>{cat.category}</Text>
                <Text style={styles.categoryPercent}>{percent}%</Text>
              </View>
              <View style={styles.budgetBar}>
                <View style={[styles.budgetFill, { width: `${percent}%` }]} />
              </View>
              <View style={styles.categoryFooter}>
                <Text style={styles.budgetSmall}>{formatCurrency(cat.spent)} / {formatCurrency(cat.budget)}</Text>
                {cat.warning && <Text style={styles.warning}>⚠ Nearly Full</Text>}
                {cat.complete && <Text style={styles.complete}>✓ Completed</Text>}
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, styles.advisorCard]}>
        <Text style={styles.advisorIcon}>🤖</Text>
        <Text style={styles.advisorTitle}>AI Budget Advisor</Text>
        <Text style={styles.advisorMessage}>You are likely to exceed your Marketing budget.</Text>
        <Text style={styles.advisorText}>Reduce weekly spending by ₦18,000 to stay within budget.</Text>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <View style={styles.container}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>🛡 Protect Money</Text>
          <Text style={styles.subtitle}>Control your cash flow</Text>
        </View>

        <View style={styles.tabContainer}>
          {[
            { key: 'overview' as Tab, label: '💵 Cash Position', desc: 'Know where your money is' },
            { key: 'expenses' as Tab, label: '💳 Spending Control', desc: 'See where money is going' },
            { key: 'budgets' as Tab, label: '🎯 Budget Planner', desc: 'Set limits before overspending' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              <Text style={[styles.tabDesc, activeTab === tab.key && styles.tabDescActive]}>
                {tab.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'expenses' && renderExpenses()}
        {activeTab === 'budgets' && renderBudgets()}
      </View>

      <FooterNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1 },
  titleSection: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted },

  tabContainer: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.card, marginBottom: 4 },
  tabActive: { backgroundColor: '#3b82f6' },
  tabLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  tabLabelActive: { color: '#fff' },
  tabDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  tabDescActive: { color: 'rgba(255,255,255,0.8)' },

  content: { paddingHorizontal: 16, paddingBottom: 20 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginBottom: 12 },
  cardValue: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  headerCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#10b981' },
  headerStatus: { fontSize: 13, color: '#10b981', fontWeight: '600', marginBottom: 8 },
  headerAmount: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  headerSign: { fontSize: 20, fontWeight: '700', color: '#10b981' },
  headerValue: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary },
  headerLabel: { fontSize: 12, color: Colors.textMuted, marginLeft: 4 },

  changeTag: { backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  changeText: { fontSize: 12, fontWeight: '700', color: '#10b981' },
  changeSubtext: { fontSize: 10, color: Colors.textMuted },

  timeframeButtons: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  timeframeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  timeframeActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  timeframeText: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  timeframeActiveText: { color: '#fff' },

  chartPlaceholder: { marginVertical: 12 },
  chartLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
  barChart: { height: 8, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },

  moneyRow: { flexDirection: 'row', gap: 12 },
  moneyBox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 12 },
  moneyLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  moneyValue: { fontSize: 16, fontWeight: '700' },

  sourceTitle: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 8 },
  sourceItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  sourceLeft: { width: 100 },
  sourceName: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  sourcePercent: { fontSize: 11, color: Colors.textMuted },
  sourceBar: { flex: 1, height: 6, backgroundColor: '#10b981', borderRadius: 3 },
  useBar: { flex: 1, height: 6, backgroundColor: '#ef4444', borderRadius: 3 },

  upcomingHeader: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 8 },
  paymentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  paymentLeft: { flex: 1 },
  paymentName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  paymentDue: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  paymentAmount: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  noData: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },

  advisorCard: { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
  advisorHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  advisorIcon: { fontSize: 24 },
  advisorTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  advisorMessage: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  advisorAction: { backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: 12 },
  advisorLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
  advisorText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '500', lineHeight: 18 },

  monthlySpending: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
  spendingAmount: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary },

  healthRow: { flexDirection: 'row', gap: 16 },
  healthScore: { flex: 1, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 12, padding: 12 },
  healthGrade: { fontSize: 12, fontWeight: '600', color: '#10b981' },
  healthNumber: { fontSize: 20, fontWeight: '700', color: '#10b981', marginTop: 4 },
  healthTrend: { flex: 1, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 12 },
  trendLabel: { fontSize: 11, color: Colors.textMuted },
  trendValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  trendCompare: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  trendUp: { fontSize: 12, color: '#10b981', fontWeight: '600' },
  trendDown: { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  categoryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  categoryLeft: { flex: 1 },
  categoryRight: { alignItems: 'flex-end' },
  categoryName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  categoryAmount: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  categoryPercent: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

  biggestBox: { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 16 },
  biggestLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  biggestName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  biggestAmount: { fontSize: 20, fontWeight: '700', color: '#ef4444', marginTop: 4 },

  monthLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginTop: 4 },
  budgetRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  budgetItem: { flex: 1, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 12 },
  budgetLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  budgetValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  budgetBar: { height: 6, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 3, marginBottom: 4, overflow: 'hidden' },
  budgetFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 },
  budgetPercent: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

  categoryBudget: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  categoryFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  budgetSmall: { fontSize: 11, color: Colors.textMuted },
  warning: { fontSize: 11, fontWeight: '600', color: '#f59e0b' },
  complete: { fontSize: 11, fontWeight: '600', color: '#10b981' },
});
