import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { generateCashFlowForecast, detectForecastAlerts } from '../utils/forecastEngine';
import CashFlowForecastChart from '../components/CashFlowForecastChart';
import ForecastRecommendations from '../components/ForecastRecommendations';
import AlertsWidget from '../components/AlertsWidget';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function ProtectMoneyScreen() {
  const { transactions, invoices, finance, settings, navigate, currency } = useApp();

  // Generate forecast
  const forecast = useMemo(() => {
    return generateCashFlowForecast({
      currentCash: finance.cashBalance,
      currentRevenue: finance.income,
      currentExpenses: finance.expense,
      transactions: transactions.map(t => ({
        date: t.date,
        amount: t.amount,
        type: t.type,
        isRecurring: t.isRecurring || false,
        frequency: t.recurringFrequency,
      })),
      invoices: invoices.map(i => ({
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        amount: i.total,
        status: i.status,
        paymentTermsDays: 30,
      })),
      forecastMonths: 6,
      currency: settings.currencyCode,
    });
  }, [transactions, invoices, finance, settings]);

  // Detect alerts
  const alerts = useMemo(() => {
    return detectForecastAlerts(forecast, {
      lowCashThreshold: parseFloat(settings.minReserve || '500000'),
      negativeForcastThreshold: 0,
      negativeForcastDays: 60,
      overdueInvoiceThreshold: 7,
      largeExpenseComing: 7,
      largeExpenseAmount: 0.5,
    });
  }, [forecast, settings]);

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) {
      return `${currency}${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `${currency}${(amount / 1000).toFixed(0)}K`;
    }
    return `${currency}${amount.toFixed(0)}`;
  };

  const runwayDays = Math.max(
    0,
    Math.floor(
      finance.cashBalance /
        (Math.max(finance.expense / 30, 1) || 1)
    )
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={styles.title}>🛡️ PROTECT MONEY</Text>
          <Text style={styles.subtitle}>Cash Survival & Protection</Text>
        </View>

        {/* Runway Card - Most Important */}
        <View style={styles.runwayCard}>
          <Text style={styles.runwayLabel}>Your Money Lasts</Text>
          <View style={styles.runwayValue}>
            <Text style={styles.runwayNumber}>{runwayDays}</Text>
            <Text style={styles.runwayUnit}>days</Text>
          </View>
          <Text style={styles.runwaySubtext}>At current spending rate</Text>

          <View style={styles.runwayBar}>
            <View
              style={[
                styles.runwayFill,
                {
                  width: `${Math.min((runwayDays / 180) * 100, 100)}%`,
                  backgroundColor:
                    runwayDays > 90
                      ? '#10b981'
                      : runwayDays > 30
                        ? '#f59e0b'
                        : '#ef4444',
                },
              ]}
            />
          </View>

          <View style={styles.runwayAlert}>
            {runwayDays > 90 ? (
              <Text style={styles.alertText}>✅ Healthy cash position. You're safe for 3+ months.</Text>
            ) : runwayDays > 30 ? (
              <Text style={styles.alertText}>⚠️ Fair position. Manage spending or increase income.</Text>
            ) : (
              <Text style={styles.alertText}>🚨 Critical. Take immediate action to improve cash.</Text>
            )}
          </View>
        </View>

        {/* Current Financial Position */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>💰 Current Position</Text>

          <View style={styles.positionGrid}>
            <View style={styles.positionCard}>
              <Text style={styles.positionLabel}>Cash Balance</Text>
              <Text style={styles.positionValue}>{formatCurrency(finance.cashBalance)}</Text>
            </View>

            <View style={styles.positionCard}>
              <Text style={styles.positionLabel}>Min Reserve</Text>
              <Text style={styles.positionValue}>{formatCurrency(parseFloat(settings.minReserve || '0'))}</Text>
            </View>

            <View style={styles.positionCard}>
              <Text style={styles.positionLabel}>Available</Text>
              <Text style={[styles.positionValue, { color: finance.cashBalance > parseFloat(settings.minReserve || '0') ? '#10b981' : '#ef4444' }]}>
                {formatCurrency(Math.max(finance.cashBalance - parseFloat(settings.minReserve || '0'), 0))}
              </Text>
            </View>
          </View>
        </View>

        {/* Alerts */}
        {alerts.length > 0 && (
          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>⚠️ Active Alerts ({alerts.length})</Text>

            {alerts.map(alert => (
              <View key={alert.id} style={styles.alertItem}>
                <Text style={styles.alertItemEmoji}>
                  {alert.priority === 'high' ? '🔴' : alert.priority === 'medium' ? '🟡' : '🔵'}
                </Text>
                <View style={styles.alertItemContent}>
                  <Text style={styles.alertItemTitle}>{alert.title}</Text>
                  <Text style={styles.alertItemDescription}>{alert.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Forecast Chart */}
        <View style={styles.sectionBox}>
          <CashFlowForecastChart forecast={forecast} currency={currency} />
        </View>

        {/* Recommendations */}
        <View style={styles.sectionBox}>
          <ForecastRecommendations recommendations={forecast.recommendations} currency={currency} />
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigate('reports', { reportSection: 'planning', reportTab: 'cash_flow_statement' })}
          >
            <Text style={styles.actionEmoji}>📊</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Cash Flow</Text>
              <Text style={styles.actionSubtext}>Detailed report</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigate('transactions')}>
            <Text style={styles.actionEmoji}>📝</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Manage Expenses</Text>
              <Text style={styles.actionSubtext}>Control spending</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigate('budget')}>
            <Text style={styles.actionEmoji}>💼</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Set Budgets</Text>
              <Text style={styles.actionSubtext}>Limit categories</Text>
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

  runwayCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },

  runwayLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 8,
    fontWeight: '600',
  },

  runwayValue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },

  runwayNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  runwayUnit: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
    marginLeft: 8,
  },

  runwaySubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 12,
  },

  runwayBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },

  runwayFill: {
    height: '100%',
  },

  runwayAlert: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    padding: 10,
  },

  alertText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
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

  positionGrid: {
    flexDirection: 'row',
    gap: 10,
  },

  positionCard: {
    flex: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    padding: 10,
  },

  positionLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 4,
  },

  positionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  alertItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  alertItemEmoji: {
    fontSize: 16,
    marginRight: 10,
  },

  alertItemContent: {
    flex: 1,
  },

  alertItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  alertItemDescription: {
    fontSize: 11,
    color: Colors.textSecondary,
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
