import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type Trend = 'up' | 'down' | 'neutral';

interface StatCardProps {
  label: string;
  value: string;
  trend?: Trend;
  trendLabel?: string;
  accent?: string;
  style?: ViewStyle;
}

const TREND_COLOR: Record<Trend, string> = {
  up: '#22c55e',
  down: '#ef4444',
  neutral: '#94a3b8',
};
const TREND_ICON: Record<Trend, string> = { up: '↑', down: '↓', neutral: '→' };

export function StatCard({ label, value, trend, trendLabel, accent = '#3b82f6', style }: StatCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {trend && trendLabel && (
        <View style={styles.trendRow}>
          <Text style={[styles.trendIcon, { color: TREND_COLOR[trend] }]}>{TREND_ICON[trend]}</Text>
          <Text style={[styles.trendLabel, { color: TREND_COLOR[trend] }]}>{trendLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  label: { fontSize: 12, color: '#94a3b8', fontWeight: '500', marginTop: 8 },
  value: { fontSize: 22, color: '#f1f5f9', fontWeight: '800', marginTop: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 3 },
  trendIcon: { fontSize: 12, fontWeight: '700' },
  trendLabel: { fontSize: 12, fontWeight: '500' },
});
