import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Linking } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function BorrowMoneyScreen() {
  const { transactions, invoices, finance, settings } = useApp();

  const creditScore = useMemo(() => {
    const profitMargin = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;
    const cashPosition = Math.min((finance.cashBalance / (finance.income || 1)) * 100, 100);
    const invoiceHealth = invoices.filter(i => i.status === 'paid').length / Math.max(invoices.length, 1);

    const score = (profitMargin * 0.3) + (cashPosition * 0.3) + (invoiceHealth * 100 * 0.4);
    return Math.round(Math.max(0, Math.min(100, score)));
  }, [finance, invoices]);

  const lendingReadiness = useMemo(() => {
    const factors = {
      revenue: finance.income > 0 ? 100 : 20,
      profitability: finance.profit > 0 ? 100 : 40,
      cashFlow: finance.cashBalance > 0 ? 80 : 30,
      paymentHistory: invoices.length > 0
        ? (invoices.filter(i => i.status === 'paid').length / invoices.length) * 100
        : 50,
    };

    const readiness = (factors.revenue * 0.25 + factors.profitability * 0.25 + factors.cashFlow * 0.25 + factors.paymentHistory * 0.25);
    return {
      score: Math.round(readiness),
      factors,
    };
  }, [finance, invoices]);

  const fundingNeeds = useMemo(() => {
    const monthlyExpense = finance.expense / 12;
    const optimalCash = monthlyExpense * 3;
    const shortfall = Math.max(0, optimalCash - finance.cashBalance);

    return {
      optimalCash,
      shortfall,
      months: shortfall > 0 ? Math.ceil(shortfall / monthlyExpense) : 0,
    };
  }, [finance]);

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `${settings.currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${settings.currency}${(amount / 1000).toFixed(0)}K`;
    return `${settings.currency}${amount.toFixed(0)}`;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const getLenders = () => [
    {
      name: 'Access Bank',
      maxAmount: Math.min(finance.income * 6, 5000000),
      rate: 12,
      tenure: 12,
      emoji: '🏦',
      requiredScore: 60,
      ready: creditScore >= 60,
    },
    {
      name: 'First Bank SME',
      maxAmount: Math.min(finance.income * 4, 3000000),
      rate: 14,
      tenure: 12,
      emoji: '🏛️',
      requiredScore: 50,
      ready: creditScore >= 50,
    },
    {
      name: 'Kuda Business',
      maxAmount: Math.min(finance.income * 3, 2000000),
      rate: 10,
      tenure: 6,
      emoji: '📱',
      requiredScore: 70,
      ready: creditScore >= 70,
    },
    {
      name: 'Flutterwave Lending',
      maxAmount: Math.min(finance.income * 2, 1000000),
      rate: 8,
      tenure: 3,
      emoji: '⚡',
      requiredScore: 65,
      ready: creditScore >= 65,
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>🏦 BORROW MONEY</Text>
          <Text style={styles.subtitle}>Lending & Funding Readiness</Text>
        </View>

        {/* Credit Score */}
        <View style={styles.creditScoreCard}>
          <Text style={styles.scoreLabel}>Your Credit Score</Text>
          <View style={styles.scoreDisplay}>
            <Text style={[styles.scoreNumber, { color: getScoreColor(creditScore) }]}>
              {creditScore}
            </Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          <Text style={styles.scoreStatus}>
            {creditScore >= 80 ? '✅ Excellent' : creditScore >= 60 ? '🟢 Good' : creditScore >= 40 ? '🟡 Fair' : '🔴 Poor'}
          </Text>

          <View style={styles.scoreBar}>
            <View
              style={[
                styles.scoreFill,
                {
                  width: `${creditScore}%`,
                  backgroundColor: getScoreColor(creditScore),
                },
              ]}
            />
          </View>
        </View>

        {/* Readiness Breakdown */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>📊 Lending Readiness: {lendingReadiness.score}%</Text>

          <View style={styles.readinessGrid}>
            <View style={styles.readinessCard}>
              <Text style={styles.readinessLabel}>Revenue</Text>
              <Text style={[styles.readinessValue, { color: getScoreColor(lendingReadiness.factors.revenue) }]}>
                {Math.round(lendingReadiness.factors.revenue)}%
              </Text>
            </View>

            <View style={styles.readinessCard}>
              <Text style={styles.readinessLabel}>Profitability</Text>
              <Text style={[styles.readinessValue, { color: getScoreColor(lendingReadiness.factors.profitability) }]}>
                {Math.round(lendingReadiness.factors.profitability)}%
              </Text>
            </View>

            <View style={styles.readinessCard}>
              <Text style={styles.readinessLabel}>Cash Flow</Text>
              <Text style={[styles.readinessValue, { color: getScoreColor(lendingReadiness.factors.cashFlow) }]}>
                {Math.round(lendingReadiness.factors.cashFlow)}%
              </Text>
            </View>

            <View style={styles.readinessCard}>
              <Text style={styles.readinessLabel}>Payment History</Text>
              <Text style={[styles.readinessValue, { color: getScoreColor(lendingReadiness.factors.paymentHistory) }]}>
                {Math.round(lendingReadiness.factors.paymentHistory)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Funding Needs */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>💰 Funding Strategy</Text>

          <View style={styles.fundingCard}>
            <Text style={styles.fundingLabel}>Optimal Cash Reserve</Text>
            <Text style={styles.fundingValue}>{formatCurrency(fundingNeeds.optimalCash)}</Text>
            <Text style={styles.fundingSubtext}>3 months of expenses</Text>
          </View>

          {fundingNeeds.shortfall > 0 && (
            <View style={styles.fundingCard}>
              <Text style={styles.fundingLabel}>Funding Gap</Text>
              <Text style={[styles.fundingValue, { color: '#ef4444' }]}>{formatCurrency(fundingNeeds.shortfall)}</Text>
              <Text style={styles.fundingSubtext}>
                Would cover {fundingNeeds.months} additional months of operations
              </Text>
            </View>
          )}

          <View style={styles.fundingCard}>
            <Text style={styles.fundingLabel}>Current Cash Runway</Text>
            <Text style={[styles.fundingValue, { color: finance.cashBalance > fundingNeeds.optimalCash ? '#10b981' : '#f59e0b' }]}>
              {Math.round((finance.cashBalance / (finance.expense / 30 || 1)))} days
            </Text>
          </View>
        </View>

        {/* Lender Options */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🏦 Recommended Lenders</Text>

          {getLenders().map((lender, idx) => (
            <TouchableOpacity key={idx} style={styles.lenderCard}>
              <View style={styles.lenderHeader}>
                <Text style={styles.lenderEmoji}>{lender.emoji}</Text>
                <View style={styles.lenderInfo}>
                  <Text style={styles.lenderName}>{lender.name}</Text>
                  {lender.ready && <Text style={styles.lenderReady}>✅ You Qualify</Text>}
                  {!lender.ready && <Text style={styles.lenderNotReady}>❌ Need Score {lender.requiredScore}</Text>}
                </View>
              </View>

              <View style={styles.lenderTerms}>
                <View style={styles.termItem}>
                  <Text style={styles.termLabel}>Max Loan</Text>
                  <Text style={styles.termValue}>{formatCurrency(lender.maxAmount)}</Text>
                </View>
                <View style={styles.termItem}>
                  <Text style={styles.termLabel}>Rate</Text>
                  <Text style={styles.termValue}>{lender.rate}%</Text>
                </View>
                <View style={styles.termItem}>
                  <Text style={styles.termLabel}>Tenure</Text>
                  <Text style={styles.termValue}>{lender.tenure}mo</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Funding Roadmap */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🗺️ Funding Roadmap</Text>

          <View style={styles.roadmapStep}>
            <Text style={styles.stepNumber}>1</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Build Credit Profile</Text>
              <Text style={styles.stepText}>Maintain payment history, track metrics</Text>
            </View>
            <Text style={[styles.stepStatus, { color: creditScore >= 50 ? '#10b981' : '#f59e0b' }]}>
              {creditScore >= 50 ? '✅' : '⏳'}
            </Text>
          </View>

          <View style={styles.roadmapStep}>
            <Text style={styles.stepNumber}>2</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Gather Documentation</Text>
              <Text style={styles.stepText}>Financial statements, tax returns, business plan</Text>
            </View>
            <Text style={styles.stepStatus}>📋</Text>
          </View>

          <View style={styles.roadmapStep}>
            <Text style={styles.stepNumber}>3</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Apply for Funding</Text>
              <Text style={styles.stepText}>Start with qualified lenders above</Text>
            </View>
            <Text style={styles.stepStatus}>🎯</Text>
          </View>

          <View style={styles.roadmapStep}>
            <Text style={styles.stepNumber}>4</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Optimize Use of Funds</Text>
              <Text style={styles.stepText}>Focus on revenue-generating activities</Text>
            </View>
            <Text style={styles.stepStatus}>📈</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton} onPress={() => Linking.openURL('https://www.accessbank.com')}>
            <Text style={styles.actionEmoji}>🏦</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Apply for Loan</Text>
              <Text style={styles.actionSubtext}>Direct to lender</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionEmoji}>📋</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Download Documents</Text>
              <Text style={styles.actionSubtext}>For loan application</Text>
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
  creditScoreCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 16, padding: 16 },
  scoreLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, fontWeight: '600' },
  scoreDisplay: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  scoreNumber: { fontSize: 56, fontWeight: '700' },
  scoreMax: { fontSize: 14, color: Colors.textMuted, marginTop: 8, marginLeft: 4 },
  scoreStatus: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, fontWeight: '600' },
  scoreBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  scoreFill: { height: '100%' },
  sectionBox: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  readinessGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  readinessCard: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10, minWidth: '45%' },
  readinessLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, fontWeight: '600' },
  readinessValue: { fontSize: 16, fontWeight: '700' },
  fundingCard: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 8, padding: 12, marginBottom: 10 },
  fundingLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  fundingValue: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  fundingSubtext: { fontSize: 10, color: Colors.textSecondary },
  lenderCard: { backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: 8, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  lenderHeader: { flexDirection: 'row', marginBottom: 10 },
  lenderEmoji: { fontSize: 24, marginRight: 10 },
  lenderInfo: { flex: 1 },
  lenderName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  lenderReady: { fontSize: 10, color: '#10b981', fontWeight: '600' },
  lenderNotReady: { fontSize: 10, color: '#f59e0b', fontWeight: '600' },
  lenderTerms: { flexDirection: 'row', gap: 10 },
  termItem: { flex: 1, alignItems: 'center' },
  termLabel: { fontSize: 9, color: Colors.textMuted, marginBottom: 2 },
  termValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  roadmapStep: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#3b82f6', color: '#fff', textAlign: 'center', lineHeight: 28, fontWeight: '700', marginRight: 12 },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  stepText: { fontSize: 10, color: Colors.textMuted },
  stepStatus: { fontSize: 16, marginLeft: 10 },
  actionsSection: { paddingHorizontal: 16, gap: 10 },
  actionButton: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  actionEmoji: { fontSize: 22, marginRight: 12 },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  actionSubtext: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  actionArrow: { fontSize: 16, color: Colors.primary },
});
