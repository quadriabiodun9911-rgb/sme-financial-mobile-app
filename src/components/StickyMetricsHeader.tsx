import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData } from '../types';

interface Props {
  finance: FinanceData;
  currency: string;
  isSticky?: boolean;
}

export default function StickyMetricsHeader({ finance, currency, isSticky = false }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 48) / 3; // 3 cards with padding

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
      color: (finance.runway || 0) > 30 ? '#10b981' : (finance.runway || 0) > 7 ? '#f59e0b' : '#ef4444',
      icon: '📅',
    },
  ];

  return (
    <View style={[styles.container, isSticky && styles.sticky]}>
      <View style={styles.metricsRow}>
        {metrics.map((metric, idx) => (
          <View key={idx} style={[styles.metricCard, { width: cardWidth }]}>
            <Text style={styles.icon}>{metric.icon}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={[styles.metricValue, { color: metric.color }]}>
              {metric.format === 'days'
                ? `${Math.floor(metric.value)}d`
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
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border || '#e5e7eb',
  },
  sticky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricCard: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
