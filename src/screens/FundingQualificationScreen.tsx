import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import NextStepLink from '../components/NextStepLink';

export default function FundingQualificationScreen() {
  const { transactions, finance, user, settings, setCurrentScreen } = useApp();

  const qualificationMetrics = useMemo(() => {
    const daysActive = user?.daysActive || 0;
    const avgMonthlyRevenue = user?.avgMonthlyRevenue || finance.income / 12;
    const totalRecordedRevenue = user?.totalRecordedRevenue || finance.income;
    const healthScore = user?.financialHealthScore || 75;

    const businessHistoryScore = Math.min((daysActive / 180) * 100, 100);
    const revenueScore = Math.min((totalRecordedRevenue / 25000000) * 100, 100);
    const profitScore = finance.profit > 0 ? Math.min((finance.profit / (finance.income * 0.3)) * 100, 100) : 40;
    const cashFlowScore = finance.cashBalance > (finance.expense * 3) ? 90 : finance.cashBalance > finance.expense ? 70 : 40;

    const overallScore = Math.round((businessHistoryScore * 0.25 + revenueScore * 0.25 + profitScore * 0.25 + cashFlowScore * 0.15 + healthScore * 0.1));

    return {
      overall: overallScore,
      businessHistory: Math.round(businessHistoryScore),
      revenue: Math.round(revenueScore),
      profit: Math.round(profitScore),
      cashFlow: Math.round(cashFlowScore),
      health: Math.round(healthScore),
      daysActive,
      daysUntilQualified: Math.max(0, 180 - daysActive),
      totalRecordedRevenue,
      targetRevenue: 25000000,
    };
  }, [transactions, finance, user]);

  const getQualificationStatus = (score: number) => {
    if (score < 40) return { status: 'Not Ready', color: '#ef4444', emoji: '🔴' };
    if (score < 60) return { status: 'Building History', color: '#f59e0b', emoji: '🟠' };
    if (score < 80) return { status: 'Nearly Ready', color: '#eab308', emoji: '🟡' };
    return { status: 'Funding Ready', color: '#10b981', emoji: '🟢' };
  };

  const status = getQualificationStatus(qualificationMetrics.overall);
  const daysRemaining = Math.max(0, 180 - qualificationMetrics.daysActive);

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `${settings.currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${settings.currency}${(amount / 1000).toFixed(0)}K`;
    return `${settings.currency}${amount.toFixed(0)}`;
  };

  const estimatedDaysToRevenueTarget = qualificationMetrics.revenue >= 100 ? 0 :
    Math.ceil((qualificationMetrics.targetRevenue - qualificationMetrics.totalRecordedRevenue) / Math.max(finance.income / 30, 1));

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>🏦 BORROW MONEY</Text>
          <Text style={styles.subtitle}>Funding Qualification</Text>
          <Text style={styles.description}>You're building a business that lenders can trust.</Text>
        </View>

        {/* Overall Qualification Score */}
        <View style={styles.scoreCard}>
          <View style={styles.circularScore}>
            <Text style={[styles.scorePercentage, { color: status.color }]}>
              {qualificationMetrics.overall}%
            </Text>
            <Text style={styles.scoreLabel}>Funding Readiness</Text>
            <Text style={styles.scoreStars}>★★★★☆</Text>
          </View>

          <View style={styles.scoreMessage}>
            <Text style={[styles.statusBadge, { color: status.color }]}>{status.emoji} {status.status}</Text>
            <Text style={styles.statusText}>
              You are {100 - qualificationMetrics.overall}% away from becoming loan ready.
            </Text>
            {status.status === 'Funding Ready' ? (
              <NextStepLink text="Compare loan options now" onPress={() => setCurrentScreen('loan-eligibility')} />
            ) : (
              <NextStepLink text="See what's holding your score back" onPress={() => setCurrentScreen('cfo')} />
            )}
          </View>
        </View>

        {/* Qualification Breakdown */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Qualification Breakdown</Text>

          <QualificationMetric
            label="Business History"
            value={qualificationMetrics.businessHistory}
            subtitle={`${qualificationMetrics.daysActive} Active Days`}
            status={qualificationMetrics.businessHistory >= 80 ? '✔ Good' : '⏳ Building'}
          />

          <QualificationMetric
            label="Revenue History"
            value={qualificationMetrics.revenue}
            subtitle={`${formatCurrency(qualificationMetrics.totalRecordedRevenue)} Recorded`}
            status={qualificationMetrics.revenue >= 70 ? 'On track' : 'Needs more consistent revenue'}
          />

          <QualificationMetric
            label="Profit History"
            value={qualificationMetrics.profit}
            subtitle={finance.profit > 0 ? 'Profitable' : 'Not yet profitable'}
            status={qualificationMetrics.profit >= 70 ? '✔ Keep going' : 'Keep recording profits'}
          />

          <QualificationMetric
            label="Cash Flow"
            value={qualificationMetrics.cashFlow}
            subtitle={finance.cashBalance > 0 ? 'Healthy' : 'Needs improvement'}
            status={qualificationMetrics.cashFlow >= 80 ? '✔ Excellent' : '⏳ Monitor'}
          />

          <QualificationMetric
            label="Business Health"
            value={qualificationMetrics.health}
            subtitle="Overall health score"
            status={qualificationMetrics.health >= 70 ? '✔ Good' : '⚠️ Needs improvement'}
          />
        </View>

        {/* Days Until Qualification */}
        <View style={styles.countdownCard}>
          <Text style={styles.countdownEmoji}>⏳</Text>
          <Text style={styles.countdownNumber}>{daysRemaining}</Text>
          <Text style={styles.countdownText}>Days until your business reaches minimum age for funding</Text>
          <View style={styles.countdownBar}>
            <View style={[styles.countdownFill, { width: `${(qualificationMetrics.daysActive / 180) * 100}%` }]} />
          </View>
          <View style={styles.countdownLabels}>
            <Text style={styles.countdownLabel}>0</Text>
            <Text style={styles.countdownLabel}>90</Text>
            <Text style={styles.countdownLabel}>180 Days</Text>
          </View>
        </View>

        {/* Revenue Qualification */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Revenue Target Progress</Text>

          <View style={styles.revenueCard}>
            <Text style={styles.revenueLabel}>Recorded Revenue</Text>
            <Text style={styles.revenueValue}>{formatCurrency(qualificationMetrics.totalRecordedRevenue)}</Text>
          </View>

          <View style={styles.revenueCard}>
            <Text style={styles.revenueLabel}>Minimum Target</Text>
            <Text style={styles.revenueValue}>{formatCurrency(qualificationMetrics.targetRevenue)}</Text>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(qualificationMetrics.revenue, 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>{qualificationMetrics.revenue}% Complete</Text>
          </View>

          {estimatedDaysToRevenueTarget > 0 && (
            <Text style={styles.projectionText}>
              If you maintain your average sales, you'll reach the target in {estimatedDaysToRevenueTarget} days.
            </Text>
          )}
        </View>

        {/* Funding Timeline */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Loan Qualification Journey</Text>

          <MilestoneItem completed status="Registered Business" />
          <MilestoneItem completed status="Connected Bank" />
          <MilestoneItem completed status="Recorded Revenue" />
          <MilestoneItem completed status="Recorded Expenses" />
          <MilestoneItem completed status="Positive Cash Flow" />
          <MilestoneItem completed={qualificationMetrics.daysActive >= 180} status="Six Months Profit History" />
          <MilestoneItem completed={qualificationMetrics.daysActive >= 365} status="One Year Business History" />
          <MilestoneItem completed={false} status="Financial Statements" />
          <MilestoneItem completed={qualificationMetrics.health >= 70} status="Business Health Above 70" />
        </View>

        {/* AI Funding Coach */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🤖 Quad AI - Funding Coach</Text>

          <View style={styles.aiCard}>
            <Text style={styles.aiLabel}>Current Funding Score</Text>
            <Text style={[styles.aiScore, { color: status.color }]}>{qualificationMetrics.overall}%</Text>
            <Text style={styles.aiMessage}>You're progressing well.</Text>
          </View>

          <View style={styles.aiRecommendations}>
            <Text style={styles.aiTitle}>To increase your score this month:</Text>
            <AiRecommendation text="Record revenue every day" />
            <AiRecommendation text="Keep profit positive" />
            <AiRecommendation text="Avoid negative cash flow" />
            <AiRecommendation text="Maintain consistent cash balance" />
          </View>

          <View style={styles.aiProjection}>
            <Text style={styles.aiProjectionLabel}>Estimated score next month:</Text>
            <Text style={[styles.aiProjectionValue, { color: '#10b981' }]}>
              {Math.min(qualificationMetrics.overall + 3, 100)}%
            </Text>
          </View>
        </View>

        {/* Bank Requirements */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>What Lenders Look For</Text>

          <BankRequirement met={true} text="Active Business History" />
          <BankRequirement met={qualificationMetrics.revenue >= 70} text="Consistent Revenue" />
          <BankRequirement met={qualificationMetrics.cashFlow >= 70} text="Positive Cash Flow" />
          <BankRequirement met={finance.profit > 0} text="Profitability" />
          <BankRequirement met={transactions.length >= 10} text="Financial Records" />
          <BankRequirement met={qualificationMetrics.health >= 70} text="Business Health" />

          <View style={styles.progressSummary}>
            <Text style={styles.progressSummaryText}>
              5 of 6 Complete
            </Text>
          </View>
        </View>

        {/* Achievements */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>🏅 Achievements</Text>

          <AchievementItem earned title="First 30 Days" progress={qualificationMetrics.daysActive >= 30 ? 100 : (qualificationMetrics.daysActive / 30) * 100} />
          <AchievementItem earned={qualificationMetrics.totalRecordedRevenue >= 1000000} title={`First ${settings.currency}1 Million Revenue`} progress={Math.min((qualificationMetrics.totalRecordedRevenue / 1000000) * 100, 100)} />
          <AchievementItem earned={qualificationMetrics.daysActive >= 90} title="90 Consecutive Active Days" progress={Math.min((qualificationMetrics.daysActive / 90) * 100, 100)} />
          <AchievementItem earned={qualificationMetrics.daysActive >= 180} title="Six Months Profit History" progress={Math.min((qualificationMetrics.daysActive / 180) * 100, 100)} />
          <AchievementItem earned={qualificationMetrics.overall >= 80} title="Funding Ready" progress={qualificationMetrics.overall} />
        </View>
      </ScrollView>

      <FooterNav />
    </SafeAreaView>
  );
}

function QualificationMetric({ label, value, subtitle, status }: any) {
  return (
    <View style={styleMetric.container}>
      <Text style={styleMetric.label}>{label}</Text>
      <View style={styleMetric.bar}>
        <View style={[styleMetric.fill, { width: `${value}%` }]} />
      </View>
      <View style={styleMetric.info}>
        <Text style={styleMetric.subtitle}>{subtitle}</Text>
        <Text style={styleMetric.status}>{status}</Text>
      </View>
    </View>
  );
}

function MilestoneItem({ completed, status }: any) {
  return (
    <View style={styleMilestone.container}>
      <Text style={styleMilestone.icon}>{completed ? '✔' : '◯'}</Text>
      <Text style={[styleMilestone.text, { color: completed ? '#10b981' : '#6b7280' }]}>{status}</Text>
    </View>
  );
}

function AiRecommendation({ text }: any) {
  return (
    <View style={styleAi.recommendation}>
      <Text style={styleAi.checkmark}>✓</Text>
      <Text style={styleAi.text}>{text}</Text>
    </View>
  );
}

function BankRequirement({ met, text }: any) {
  return (
    <View style={styleBankReq.container}>
      <Text style={[styleBankReq.icon, { color: met ? '#10b981' : '#6b7280' }]}>{met ? '✅' : '◯'}</Text>
      <Text style={[styleBankReq.text, { color: met ? Colors.textPrimary : '#6b7280' }]}>{text}</Text>
    </View>
  );
}

function AchievementItem({ earned, title, progress }: any) {
  return (
    <View style={styleAchievement.container}>
      <Text style={styleAchievement.icon}>🏅</Text>
      <View style={styleAchievement.content}>
        <Text style={styleAchievement.title}>{title}</Text>
        <View style={styleAchievement.bar}>
          <View style={[styleAchievement.fill, { width: `${progress}%` }]} />
        </View>
      </View>
      <Text style={[styleAchievement.status, { color: earned ? '#10b981' : '#f59e0b' }]}>
        {earned ? '✔' : `${Math.round(progress)}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 20 },
  headerSection: { paddingHorizontal: 16, paddingVertical: 16 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  description: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
  scoreCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 16, padding: 20, alignItems: 'center' },
  circularScore: { alignItems: 'center', marginBottom: 16 },
  scorePercentage: { fontSize: 56, fontWeight: '700', marginBottom: 4 },
  scoreLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 8, fontWeight: '600' },
  scoreStars: { fontSize: 16, color: '#f59e0b' },
  scoreMessage: { width: '100%', alignItems: 'center' },
  statusBadge: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  statusText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  sectionBox: { marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  countdownCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, padding: 16, alignItems: 'center' },
  countdownEmoji: { fontSize: 32, marginBottom: 8 },
  countdownNumber: { fontSize: 48, fontWeight: '700', color: '#3b82f6', marginBottom: 4 },
  countdownText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: 12 },
  countdownBar: { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  countdownFill: { height: '100%', backgroundColor: '#3b82f6' },
  countdownLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  countdownLabel: { fontSize: 9, color: Colors.textMuted },
  revenueCard: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 8, padding: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  revenueLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  revenueValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  progressContainer: { marginTop: 12 },
  progressBar: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#3b82f6' },
  progressText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  projectionText: { fontSize: 10, color: Colors.textSecondary, marginTop: 8, fontStyle: 'italic' },
  aiCard: { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 12, marginBottom: 12 },
  aiLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  aiScore: { fontSize: 32, fontWeight: '700', marginBottom: 4 },
  aiMessage: { fontSize: 12, color: Colors.textSecondary },
  aiRecommendations: { marginBottom: 12 },
  aiTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  aiProjection: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, padding: 12 },
  aiProjectionLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  aiProjectionValue: { fontSize: 24, fontWeight: '700' },
  progressSummary: { marginTop: 12, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 10 },
  progressSummaryText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
});

const styleMetric = StyleSheet.create({
  container: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  bar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  fill: { height: '100%', backgroundColor: '#3b82f6' },
  info: { flexDirection: 'row', justifyContent: 'space-between' },
  subtitle: { fontSize: 10, color: Colors.textMuted },
  status: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600' },
});

const styleMilestone = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icon: { fontSize: 16, marginRight: 12, fontWeight: '700' },
  text: { fontSize: 12, fontWeight: '500' },
});

const styleAi = StyleSheet.create({
  recommendation: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  checkmark: { color: '#10b981', marginRight: 8, fontWeight: '700', fontSize: 14 },
  text: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
});

const styleBankReq = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icon: { fontSize: 14, marginRight: 10 },
  text: { fontSize: 12, fontWeight: '500', flex: 1 },
});

const styleAchievement = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icon: { fontSize: 18, marginRight: 10 },
  content: { flex: 1 },
  title: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  bar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#3b82f6' },
  status: { marginLeft: 10, fontSize: 12, fontWeight: '700' },
});
