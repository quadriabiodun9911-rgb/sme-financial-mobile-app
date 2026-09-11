import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { FinanceData } from '../types';

interface Props {
  finance: FinanceData;
  currency: string;
}

export default function StickyMetricsHeader({ finance, currency }: Props) {
  const metrics = [
    {
      label: 'Profit',
      value: finance.profit,
      color: finance.profit >= 0 ? '#10b981' : '#ef4444',
      icon: '📊',
    },
    {
      label: 'Cash',
      value: finance.cashBalance,
      color: finance.cashBalance >= 0 ? '#3b82f6' : '#ef4444',
      icon: '💰',
    },
    {
      label: 'Runway',
      value: finance.runway || 0,
      format: 'days',
      // Infinite runway (no burn recorded) only reads as good news when
      // there's actual cash it's protecting -- at ₦0 cash there's nothing
      // to be reassured about, just no data yet, so it's shown muted
      // rather than the same green as a real long runway.
      color: !Number.isFinite(finance.runway || 0)
        ? (finance.cashBalance > 0 ? '#10b981' : Colors.textMuted)
        : (finance.runway || 0) > 30 ? '#10b981' : (finance.runway || 0) > 7 ? '#f59e0b' : '#ef4444',
      icon: '📅',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.metricsRow}>
        {metrics.map((metric, idx) => (
          <View key={idx} style={styles.metricCard}>
            <Text style={styles.icon}>{metric.icon}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={[styles.metricValue, { color: metric.color }]}>
              {metric.format === 'days'
                ? (!Number.isFinite(metric.value)
                    // No burn recorded -- only a genuine "5+ years" floor
                    // when there's real cash behind it; ₦0 cash with no
                    // burn data is "no data yet", not a healthy runway.
                    ? (finance.cashBalance > 0 ? '5+yrs' : '—')
                    : metric.value >= 365
                        ? `${(metric.value / 365).toFixed(1)}yrs`
                        : `${Math.floor(metric.value)}d`)
                : `${currency}${Math.abs(metric.value).toLocaleString()}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border || '#e5e7eb',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  icon: {
    fontSize: 22,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
});
