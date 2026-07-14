import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';

interface AIUpdate {
  type: 'insight' | 'alert' | 'success';
  emoji: string;
  message: string;
}

interface Props {
  updates: AIUpdate[];
  recommendedAction: string;
  onViewDetails?: () => void;
}

export default function QuadAICard({ updates, recommendedAction, onViewDetails }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖 Quad AI</Text>
        <Text style={styles.subtitle}>Your business update</Text>
      </View>

      {/* Updates */}
      <View style={styles.updatesContainer}>
        {updates.slice(0, 3).map((update, idx) => (
          <View key={idx} style={styles.updateItem}>
            <Text style={styles.updateEmoji}>{update.emoji}</Text>
            <Text style={styles.updateText}>{update.message}</Text>
          </View>
        ))}
      </View>

      {/* Recommended Action */}
      <View style={styles.actionBox}>
        <Text style={styles.actionLabel}>Recommended action:</Text>
        <Text style={styles.actionText}>{recommendedAction}</Text>
      </View>

      {/* View Details Button */}
      <TouchableOpacity style={styles.detailsButton} onPress={onViewDetails} activeOpacity={0.7}>
        <Text style={styles.detailsButtonText}>View Full Report →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },

  header: {
    marginBottom: 12,
  },

  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  subtitle: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  updatesContainer: {
    gap: 8,
    marginBottom: 12,
  },

  updateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  updateEmoji: {
    fontSize: 14,
    minWidth: 20,
  },

  updateText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 14,
  },

  actionBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },

  actionLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },

  actionText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '600',
    lineHeight: 16,
  },

  detailsButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },

  detailsButtonText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});
