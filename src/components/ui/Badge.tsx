import React, { memo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'paid' | 'overdue' | 'sent' | 'draft' | 'partial';

const VARIANT_MAP: Record<BadgeVariant, { bg: string; text: string; label?: string }> = {
  success:  { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
  warning:  { bg: 'rgba(234,179,8,0.15)',  text: '#eab308' },
  danger:   { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  info:     { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
  neutral:  { bg: 'rgba(148,163,184,0.15)',text: '#94a3b8' },
  paid:     { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e',  label: 'Paid' },
  overdue:  { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444',  label: 'Overdue' },
  sent:     { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6',  label: 'Sent' },
  draft:    { bg: 'rgba(148,163,184,0.15)',text: '#94a3b8',  label: 'Draft' },
  partial:  { bg: 'rgba(234,179,8,0.15)',  text: '#eab308',  label: 'Partial' },
};

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  style?: ViewStyle;
}

function BadgeComponent({ variant, label, style }: BadgeProps) {
  const config = VARIANT_MAP[variant] ?? VARIANT_MAP.neutral;
  const text = label ?? config.label ?? variant;

  return (
    <View style={[styles.base, { backgroundColor: config.bg }, style]}>
      <Text style={[styles.text, { color: config.text }]}>{text}</Text>
    </View>
  );
}

export const Badge = memo(BadgeComponent);

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
