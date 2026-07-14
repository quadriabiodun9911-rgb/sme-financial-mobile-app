import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
  sales: number;
  expenses: number;
  profit: number;
  margin: number;
  currency: string;
}

export default function TodaysNumbersCard({ sales, expenses, profit, margin, currency }: Props) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toFixed(0);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TODAY</Text>
      </View>

      <View style={styles.grid}>
        {/* Sales */}
        <View style={styles.numberCard}>
          <Text style={styles.label}>Sales</Text>
          <Text style={[styles.value, { color: '#10b981' }]}>
            {currency}{formatNumber(sales)}
          </Text>
          <Text style={styles.subtext}>Revenue</Text>
        </View>

        {/* Expenses */}
        <View style={styles.numberCard}>
          <Text style={styles.label}>Expenses</Text>
          <Text style={[styles.value, { color: '#ef4444' }]}>
            {currency}{formatNumber(expenses)}
          </Text>
          <Text style={styles.subtext}>Spending</Text>
        </View>

        {/* Profit */}
        <View style={[styles.numberCard, styles.highlightCard]}>
          <Text style={styles.highlightLabel}>Profit</Text>
          <Text style={[styles.highlightValue, { color: profit >= 0 ? '#10b981' : '#ef4444' }]}>
            {profit >= 0 ? '+' : ''}{currency}{formatNumber(Math.abs(profit))}
          </Text>
          <Text style={styles.subtext}>{profit >= 0 ? 'Net' : 'Loss'}</Text>
        </View>

        {/* Margin */}
        <View style={styles.numberCard}>
          <Text style={styles.label}>Margin</Text>
          <Text style={[styles.value, { color: margin > 0 ? '#3b82f6' : '#f59e0b' }]}>
            {margin.toFixed(0)}%
          </Text>
          <Text style={styles.subtext}>Today</Text>
        </View>
      </View>

      {/* Quick Insight */}
      <View style={styles.insightBox}>
        {profit >= 0 ? (
          <Text style={styles.insightText}>
            💰 <Text style={styles.insightHighlight}>Profitable day!</Text> You're on track.
          </Text>
        ) : (
          <Text style={styles.insightText}>
            ⚠️ <Text style={styles.insightHighlight}>Spending exceeds income.</Text> Review expenses.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },

  header: {
    marginBottom: 12,
  },

  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
  },

  grid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  },

  numberCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },

  highlightCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },

  label: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 6,
    fontWeight: '600',
  },

  highlightLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 6,
    fontWeight: '700',
  },

  value: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },

  highlightValue: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },

  subtext: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  insightBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },

  insightText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  insightHighlight: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
