import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
  growth: number;
  profit: number;
  cash: number;
  funding: number;
  control: number;
  overall: number;
}

export default function BusinessHealthWheel({ growth, profit, cash, funding, control, overall }: Props) {
  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#3b82f6'; // Blue
    if (score >= 40) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Weak';
  };

  const metrics = [
    { label: 'Growth', value: growth, icon: '📈' },
    { label: 'Profit', value: profit, icon: '💰' },
    { label: 'Cash', value: cash, icon: '💵' },
    { label: 'Funding', value: funding, icon: '🏦' },
    { label: 'Control', value: control, icon: '⚙️' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Business Health Wheel</Text>
        <Text style={styles.subtitle}>Your financial vitals</Text>
      </View>

      {/* Overall Score - Center */}
      <View style={styles.centerContainer}>
        <View
          style={[
            styles.overallCircle,
            {
              borderColor: getScoreColor(overall),
              backgroundColor: `${getScoreColor(overall)}15`,
            },
          ]}>
          <Text style={styles.overallLabel}>Overall</Text>
          <Text style={[styles.overallScore, { color: getScoreColor(overall) }]}>
            {overall}
          </Text>
          <Text style={[styles.overallStatus, { color: getScoreColor(overall) }]}>
            {getScoreLabel(overall)}
          </Text>
        </View>
      </View>

      {/* Metrics Grid - Around the center */}
      <View style={styles.metricsGrid}>
        {metrics.map((metric, idx) => (
          <View key={idx} style={styles.metricItem}>
            <View
              style={[
                styles.metricCircle,
                {
                  borderColor: getScoreColor(metric.value),
                  backgroundColor: `${getScoreColor(metric.value)}15`,
                },
              ]}>
              <Text style={styles.metricIcon}>{metric.icon}</Text>
              <Text style={[styles.metricScore, { color: getScoreColor(metric.value) }]}>
                {metric.value}
              </Text>
            </View>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor: '#10b981',
              },
            ]}
          />
          <Text style={styles.legendText}>80+ Strong</Text>

          <View
            style={[
              styles.legendDot,
              {
                backgroundColor: '#3b82f6',
              },
            ]}
          />
          <Text style={styles.legendText}>60-79 Good</Text>
        </View>
        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor: '#f59e0b',
              },
            ]}
          />
          <Text style={styles.legendText}>40-59 Fair</Text>

          <View
            style={[
              styles.legendDot,
              {
                backgroundColor: '#ef4444',
              },
            ]}
          />
          <Text style={styles.legendText}>Below 40 Weak</Text>
        </View>
      </View>

      {/* Insight */}
      <View style={styles.insightBox}>
        <Text style={styles.insightTitle}>💡 Your Score</Text>
        <Text style={styles.insightText}>
          This health score is like a credit score for SMEs. Banks and investors use it to assess
          your business readiness. Improve weaker areas to unlock better funding options.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
  },

  header: {
    marginBottom: 16,
  },

  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
  },

  centerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },

  overallCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },

  overallLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },

  overallScore: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 2,
  },

  overallStatus: {
    fontSize: 11,
    fontWeight: '600',
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    justifyContent: 'space-around',
  },

  metricItem: {
    alignItems: 'center',
    width: '30%',
  },

  metricCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },

  metricIcon: {
    fontSize: 20,
    marginBottom: 2,
  },

  metricScore: {
    fontSize: 14,
    fontWeight: '700',
  },

  metricLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },

  legend: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  legendText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  insightBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  insightTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },

  insightText: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 14,
  },
});
