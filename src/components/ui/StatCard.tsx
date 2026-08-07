import React, { memo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Radius, Shadow } from '../../theme/tokens';

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
  up: Colors.success,
  down: Colors.danger,
  neutral: Colors.textMuted,
};
const TREND_ICON: Record<Trend, string> = { up: '↑', down: '↓', neutral: '→' };

function StatCardComponent({ label, value, trend, trendLabel, accent = Colors.primary, style }: StatCardProps) {
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

export const StatCard = memo(StatCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
  label: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginTop: 8 },
  value: { fontSize: 22, color: Colors.textPrimary, fontWeight: '800', marginTop: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 3 },
  trendIcon: { fontSize: 12, fontWeight: '700' },
  trendLabel: { fontSize: 12, fontWeight: '500' },
});
