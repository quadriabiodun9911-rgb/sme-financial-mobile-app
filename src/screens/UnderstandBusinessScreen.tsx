import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DailyReportModal from '../components/DailyReportModal';
import MonthlyReview from '../components/MonthlyReview';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';

const SEVERITY_COLOR: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Moderate', hard: 'Hard' };

export default function UnderstandBusinessScreen() {
  const { transactions, invoices, finance, settings, goals } = useApp();
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showMonthlyReview, setShowMonthlyReview] = useState(false);

  // ── Real diagnosis + action engines (root-cause analysis + prioritized,
  //    impact-scored tactics) — replaces the previous fixed-threshold rules
  //    with the same machinery already used by Goal Bridge, so the AI
  //    Advisor gives sophisticated, actionable, ranked guidance instead of
  //    generic one-off observations. ──
  const avgMonthlyExpense = useMemo(() => {
    const months = new Set(transactions.filter(t => t.type === 'expense').map(t => (t.date || '').slice(0, 7)).filter(Boolean));
    return months.size > 0 ? finance.expense / months.size : finance.expense;
  }, [transactions, finance.expense]);

  const diagnosis = useMemo(
    () => performFinancialDiagnosis(transactions, invoices, finance.cashBalance, avgMonthlyExpense || 1, settings.currency),
    [transactions, invoices, finance.cashBalance, avgMonthlyExpense, settings.currency]
  );

  const actionPlan = useMemo(
    () => generateActionPlan(diagnosis, diagnosis.metrics, settings.currency),
    [diagnosis, settings.currency]
  );

  // Data-sufficiency guard: a diagnosis from 1-2 transactions is noise, not
  // insight — don't present it with false confidence.
  const hasEnoughData = transactions.length >= 5;

  const topTactics = [
    ...actionPlan.immediateActions,
    ...actionPlan.shortTermActions,
    ...actionPlan.strategicActions,
  ].slice(0, 4);

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

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>🧠 UNDERSTAND BUSINESS</Text>
          <Text style={styles.subtitle}>AI-Driven Business Intelligence</Text>
        </View>

        {/* AI Advisor Reports */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📊 AI ADVISOR</Text>

          <TouchableOpacity style={styles.reportCard} onPress={() => setShowDailyReport(true)}>
            <Text style={styles.reportEmoji}>📈</Text>
            <View style={styles.reportContent}>
              <Text style={styles.reportTitle}>Today's Report</Text>
              <Text style={styles.reportSubtext}>End-of-day summary & action plan</Text>
            </View>
            <Text style={styles.reportArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.reportCard} onPress={() => setShowMonthlyReview(true)}>
            <Text style={styles.reportEmoji}>📋</Text>
            <View style={styles.reportContent}>
              <Text style={styles.reportTitle}>Monthly Review</Text>
              <Text style={styles.reportSubtext}>Profit, spending, collections & trends</Text>
            </View>
            <Text style={styles.reportArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {!hasEnoughData ? (
          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>💡 AI Insights</Text>
            <Text style={styles.insightText}>
              Add a few more transactions (at least 5) so the advisor has enough history to diagnose your business reliably — early insights from very little data can be misleading.
            </Text>
          </View>
        ) : (
          <>
            {/* Business Health Score — from the same root-cause engine that
                powers Goal Bridge, not a separate shallow calculation. */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionTitle}>🩺 Business Health</Text>
              <View style={styles.healthRow}>
                <Text style={[styles.healthScore, { color: diagnosis.healthStatus === 'healthy' ? '#10b981' : diagnosis.healthStatus === 'warning' ? '#f59e0b' : '#ef4444' }]}>
                  {diagnosis.overallHealth}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.healthStatus}>{diagnosis.healthStatus.toUpperCase()}</Text>
                  <Text style={styles.healthSub}>
                    {diagnosis.diagnoses.filter(d => d.severity === 'critical').length} critical · {diagnosis.diagnoses.filter(d => d.severity === 'warning').length} warning issue(s) found
                  </Text>
                </View>
              </View>
            </View>

            {/* Root Cause Diagnosis — ranked by severity, each with WHY it's
                happening and the financial impact, not just "revenue is down". */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionTitle}>🔍 Root Cause Diagnosis</Text>
              {diagnosis.diagnoses.length === 0 ? (
                <Text style={styles.insightText}>No significant issues detected — your finances look healthy against industry benchmarks.</Text>
              ) : diagnosis.diagnoses.slice(0, 5).map((d, idx) => (
                <View key={idx} style={[styles.diagCard, { borderLeftColor: SEVERITY_COLOR[d.severity] }]}>
                  <View style={styles.diagHeader}>
                    <Text style={styles.diagProblem}>{d.problem}</Text>
                    <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLOR[d.severity] + '22', borderColor: SEVERITY_COLOR[d.severity] }]}>
                      <Text style={[styles.severityText, { color: SEVERITY_COLOR[d.severity] }]}>{d.severity.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.diagLabel}>Why this is happening:</Text>
                  <Text style={styles.diagText}>{d.rootCause}</Text>
                  <Text style={styles.diagLabel}>Impact:</Text>
                  <Text style={styles.diagText}>{d.impact}</Text>
                  {d.financialImpact !== 0 && (
                    <Text style={styles.diagImpact}>
                      {settings.currency}{Math.abs(d.financialImpact).toLocaleString(undefined, { maximumFractionDigits: 0 })} {d.financialImpact > 0 ? 'opportunity' : 'at risk'}
                    </Text>
                  )}
                  <Text style={styles.diagLabel}>Opportunity:</Text>
                  <Text style={styles.diagOpportunity}>{d.opportunity}</Text>
                </View>
              ))}
            </View>

            {/* Prioritized Tactics — concrete, sequenced actions with success
                probability and expected impact, not vague advice. */}
            {topTactics.length > 0 && (
              <View style={styles.sectionBox}>
                <Text style={styles.sectionTitle}>🎯 Recommended Actions</Text>
                {topTactics.map((tac) => (
                  <View key={tac.id} style={styles.tacticCard}>
                    <View style={styles.diagHeader}>
                      <Text style={styles.diagProblem}>{tac.title}</Text>
                      <View style={[styles.severityBadge, { backgroundColor: Colors.primary + '22', borderColor: Colors.primary }]}>
                        <Text style={[styles.severityText, { color: Colors.primary }]}>P{tac.priority}</Text>
                      </View>
                    </View>
                    <Text style={styles.diagText}>{tac.rationale}</Text>
                    <View style={styles.tacticMetaRow}>
                      <Text style={styles.tacticMeta}>⏱ {tac.timeframe}</Text>
                      <Text style={styles.tacticMeta}>⚙ {DIFFICULTY_LABEL[tac.difficulty]}</Text>
                      <Text style={styles.tacticMeta}>✓ {(tac.successProbability * 100).toFixed(0)}% likely</Text>
                      <Text style={[styles.tacticMeta, { color: '#10b981', fontWeight: '700' }]}>
                        +{settings.currency}{Math.round(tac.expectedImpact).toLocaleString()}
                      </Text>
                    </View>
                    {tac.steps.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        {tac.steps.slice(0, 3).map((step, i) => (
                          <Text key={i} style={styles.diagText}>• {step}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

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

      <DailyReportModal
        visible={showDailyReport}
        onClose={() => setShowDailyReport(false)}
        transactions={transactions}
        goals={goals}
        finance={finance}
        settings={settings}
        currency={settings.currency}
      />
      <MonthlyReview visible={showMonthlyReview} onClose={() => setShowMonthlyReview(false)} />

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
  reportCard: { flexDirection: 'row', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 12, marginBottom: 10, alignItems: 'center' },
  reportEmoji: { fontSize: 22, marginRight: 12 },
  reportContent: { flex: 1 },
  reportTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  reportSubtext: { fontSize: 10, color: Colors.textMuted },
  reportArrow: { fontSize: 16, color: Colors.primary },

  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  healthScore: { fontSize: 40, fontWeight: '800' },
  healthStatus: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.5 },
  healthSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  diagCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3 },
  diagHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  diagProblem: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  severityText: { fontSize: 9, fontWeight: '800' },
  diagLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, marginTop: 6, marginBottom: 2, textTransform: 'uppercase' },
  diagText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  diagImpact: { fontSize: 13, fontWeight: '800', color: '#ef4444', marginTop: 4 },
  diagOpportunity: { fontSize: 12, color: '#10b981', lineHeight: 17, fontWeight: '600' },

  tacticCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  tacticMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  tacticMeta: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
});
