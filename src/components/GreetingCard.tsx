import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
  userName: string;
  financialScore: number;
  status: 'healthy' | 'warning' | 'critical';
}

export default function GreetingCard({ userName, financialScore, status }: Props) {
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getStatusEmoji = (s: string) => {
    switch (s) {
      case 'healthy':
        return '🟢';
      case 'warning':
        return '🟡';
      case 'critical':
        return '🔴';
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'healthy':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'critical':
        return '#ef4444';
    }
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'healthy':
        return 'Healthy';
      case 'warning':
        return 'Warning';
      case 'critical':
        return 'Critical';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>{getTimeBasedGreeting()}, {userName} 👋</Text>
          <Text style={styles.subtitle}>Your Business Today</Text>
        </View>
      </View>

      <View style={styles.scoreContainer}>
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Financial Score</Text>
          <Text style={styles.scoreValue}>{financialScore}/100</Text>
          <View
            style={[
              styles.scoreBar,
              {
                width: `${financialScore}%`,
                backgroundColor: getStatusColor(status),
              },
            ]}
          />
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusEmoji}>{getStatusEmoji(status)}</Text>
          <Text style={[styles.statusLabel, { color: getStatusColor(status) }]}>
            {getStatusLabel(status)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: Colors.bg,
  },

  header: {
    marginBottom: 16,
  },

  greeting: {
    marginBottom: 16,
  },

  greetingText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  scoreContainer: {
    flexDirection: 'row',
    gap: 12,
  },

  scoreCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
  },

  scoreLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 8,
    fontWeight: '600',
  },

  scoreValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },

  scoreBar: {
    height: 4,
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },

  statusCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    aspectRatio: 1,
  },

  statusEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },

  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
