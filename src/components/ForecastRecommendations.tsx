import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { ForecastRecommendation } from '../types/forecast';

interface Props {
  recommendations: ForecastRecommendation[];
  currency: string;
}

export default function ForecastRecommendations({ recommendations, currency }: Props) {
  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#3b82f6';
      default:
        return Colors.textMuted;
    }
  };

  const getPriorityIcon = (priority: string): string => {
    switch (priority) {
      case 'high':
        return '🔴';
      case 'medium':
        return '🟡';
      case 'low':
        return '🔵';
      default:
        return '⚪';
    }
  };

  const getActionIcon = (actionType: string): string => {
    switch (actionType) {
      case 'accelerate_collection':
        return '⚡';
      case 'reduce_expenses':
        return '💰';
      case 'secure_credit':
        return '🏦';
      case 'optimize_timing':
        return '📅';
      default:
        return '💡';
    }
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

  if (!recommendations || recommendations.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>✅ No recommendations at this time. Your cash flow looks healthy!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💡 Recommendations</Text>

      <ScrollView scrollEnabled={false} showsVerticalScrollIndicator={false}>
        {recommendations.map((rec, idx) => (
          <TouchableOpacity key={rec.id} style={styles.recommendationCard} activeOpacity={0.7}>
            <View style={styles.cardHeader}>
              <View style={styles.headerLeft}>
                <Text style={styles.priorityIcon}>{getPriorityIcon(rec.priority)}</Text>
                <View style={styles.titleContainer}>
                  <Text style={styles.recTitle}>{rec.title}</Text>
                  <Text style={styles.actionType}>
                    {getActionIcon(rec.actionType)} {formatActionType(rec.actionType)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.description}>{rec.description}</Text>

            <View style={styles.cardFooter}>
              {rec.impactAmount !== undefined && (
                <View style={styles.impactBadge}>
                  <Text style={styles.impactLabel}>Impact:</Text>
                  <Text
                    style={[
                      styles.impactAmount,
                      { color: rec.impactAmount > 0 ? '#10b981' : '#ef4444' },
                    ]}>
                    {rec.impactAmount > 0 ? '+' : ''}
                    {formatCurrency(rec.impactAmount)}
                  </Text>
                </View>
              )}

              {rec.targetMonth && (
                <View style={styles.targetBadge}>
                  <Text style={styles.targetLabel}>Target:</Text>
                  <Text style={styles.targetMonth}>{rec.targetMonth}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.helpBox}>
        <Text style={styles.helpTitle}>💬 Need help?</Text>
        <Text style={styles.helpText}>
          Review these recommendations regularly and take action on high-priority items first.
        </Text>
      </View>
    </View>
  );
}

function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
  },

  recommendationCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },

  cardHeader: {
    marginBottom: 8,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  priorityIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },

  titleContainer: {
    flex: 1,
  },

  recTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },

  actionType: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  description: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
  },

  cardFooter: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },

  impactBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  impactLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  impactAmount: {
    fontSize: 11,
    fontWeight: '700',
  },

  targetBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  targetLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  targetMonth: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  helpBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    padding: 12,
    marginTop: 12,
  },

  helpTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },

  helpText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
