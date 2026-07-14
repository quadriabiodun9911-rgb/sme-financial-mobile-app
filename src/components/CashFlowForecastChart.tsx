import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Colors } from '../theme/colors';
import { CashFlowForecast, ScenarioType } from '../types/forecast';

interface Props {
  forecast: CashFlowForecast;
  currency: string;
}

export default function CashFlowForecastChart({ forecast, currency }: Props) {
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('base');
  const { width } = Dimensions.get('window');

  const scenarios = [
    { key: 'pessimistic' as const, label: '📉 Pessimistic', color: '#ef4444' },
    { key: 'base' as const, label: '📊 Base', color: '#3b82f6' },
    { key: 'optimistic' as const, label: '📈 Optimistic', color: '#10b981' },
  ];

  const currentScenario =
    activeScenario === 'base'
      ? forecast.baseCase
      : activeScenario === 'optimistic'
        ? forecast.optimistic
        : forecast.pessimistic;

  const getMetricColor = (value: number): string => {
    if (value > 0) return '#10b981';
    if (value < 0) return '#ef4444';
    return Colors.textMuted;
  };

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) {
      return `${currency}${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `${currency}${(amount / 1000).toFixed(0)}K`;
    }
    return `${currency}${amount.toFixed(0)}`;
  };

  return (
    <View style={styles.container}>
      {/* Forecast Header */}
      <View style={styles.header}>
        <Text style={styles.title}>💰 Cash Flow Forecast</Text>
        <Text style={styles.subtitle}>Next {forecast.forecastPeriod.months} months</Text>
      </View>

      {/* Health Score & Risk Level */}
      <View style={styles.healthContainer}>
        <View style={styles.healthCard}>
          <Text style={styles.healthLabel}>Health Score</Text>
          <Text style={[styles.healthValue, { color: getScoreColor(forecast.healthScore) }]}>
            {forecast.healthScore}/100
          </Text>
        </View>
        <View style={styles.healthCard}>
          <Text style={styles.healthLabel}>Risk Level</Text>
          <Text
            style={[
              styles.healthValue,
              {
                color:
                  forecast.riskLevel === 'high'
                    ? '#ef4444'
                    : forecast.riskLevel === 'medium'
                      ? '#f59e0b'
                      : '#10b981',
              },
            ]}>
            {forecast.riskLevel.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Scenario Selector */}
      <View style={styles.scenarioSelector}>
        {scenarios.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[
              styles.scenarioBtn,
              activeScenario === s.key && styles.scenarioBtnActive,
              activeScenario === s.key && { borderBottomColor: s.color },
            ]}
            onPress={() => setActiveScenario(s.key)}>
            <Text
              style={[
                styles.scenarioBtnText,
                activeScenario === s.key && styles.scenarioBtnTextActive,
              ]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Current Scenario Details */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthsScroll}>
        <View style={styles.monthsContainer}>
          {currentScenario.months.map((month, idx) => (
            <View key={month.month} style={styles.monthCard}>
              <Text style={styles.monthLabel}>{month.month.slice(-2)}</Text>

              <View style={styles.monthData}>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>In</Text>
                  <Text style={[styles.dataValue, { color: '#10b981' }]}>
                    +{formatCurrency(month.projectedIncome)}
                  </Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Out</Text>
                  <Text style={[styles.dataValue, { color: '#ef4444' }]}>
                    -{formatCurrency(month.projectedExpenses)}
                  </Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>End</Text>
                  <Text
                    style={[
                      styles.dataValue,
                      styles.balanceValue,
                      { color: getMetricColor(month.closingBalance) },
                    ]}>
                    {formatCurrency(month.closingBalance)}
                  </Text>
                </View>
              </View>

              {month.closingBalance < 0 && <View style={styles.riskIndicator} />}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Risk Indicators */}
      {currentScenario.runsOutOfCash && (
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Cash Shortage Risk</Text>
            <Text style={styles.warningText}>
              Cash projects to run out in {currentScenario.runOutDate}
            </Text>
          </View>
        </View>
      )}

      {/* Lowest Cash Point */}
      <View style={styles.statsBox}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Lowest Cash Point</Text>
          <Text style={[styles.statValue, { color: getMetricColor(currentScenario.lowestCash) }]}>
            {formatCurrency(currentScenario.lowestCash)}
          </Text>
          <Text style={styles.statSubtext}>in {currentScenario.lowestCashMonth}</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Scenario</Text>
          <Text style={styles.statValue}>{currentScenario.label}</Text>
          <Text style={styles.statSubtext}>{currentScenario.description}</Text>
        </View>
      </View>

      {/* All Scenarios Comparison */}
      <View style={styles.comparisonBox}>
        <Text style={styles.comparisonTitle}>Scenario Comparison</Text>

        {[forecast.pessimistic, forecast.baseCase, forecast.optimistic].map(scenario => (
          <View key={scenario.scenario} style={styles.comparisonRow}>
            <View style={styles.comparisonLabel}>
              <Text style={styles.comparisonLabelText}>{scenario.label}</Text>
            </View>

            <View style={styles.comparisonMetrics}>
              <View style={styles.comparisonMetric}>
                <Text style={styles.comparisonMetricLabel}>Lowest</Text>
                <Text
                  style={[
                    styles.comparisonMetricValue,
                    { color: getMetricColor(scenario.lowestCash) },
                  ]}>
                  {formatCurrency(scenario.lowestCash)}
                </Text>
              </View>

              <View style={styles.comparisonMetric}>
                <Text style={styles.comparisonMetricLabel}>Status</Text>
                <Text
                  style={[
                    styles.comparisonMetricValue,
                    {
                      color: scenario.runsOutOfCash ? '#ef4444' : '#10b981',
                      fontSize: 12,
                    },
                  ]}>
                  {scenario.runsOutOfCash ? '❌ Runs out' : '✅ Survives'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Helper function (moved outside component)
const getScoreColor = (score: number): string => {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.bg,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  healthContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  healthCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  healthLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  healthValue: {
    fontSize: 20,
    fontWeight: '700',
  },

  scenarioSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scenarioBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  scenarioBtnActive: {
    borderBottomColor: '#3b82f6',
  },
  scenarioBtnText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  scenarioBtnTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },

  monthsScroll: {
    marginBottom: 16,
  },
  monthsContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 8,
  },
  monthCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    width: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  monthData: {
    gap: 6,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dataLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  dataValue: {
    fontSize: 10,
    fontWeight: '600',
  },
  balanceValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },

  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },

  statsBox: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  statSubtext: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: '70%',
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },

  comparisonBox: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  comparisonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  comparisonLabel: {
    flex: 1,
  },
  comparisonLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  comparisonMetrics: {
    flexDirection: 'row',
    gap: 12,
  },
  comparisonMetric: {
    alignItems: 'center',
  },
  comparisonMetricLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  comparisonMetricValue: {
    fontSize: 11,
    fontWeight: '600',
  },
});
