import React, { memo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/tokens';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'paid' | 'overdue' | 'sent' | 'draft' | 'partial';

const VARIANT_MAP: Record<BadgeVariant, { text: string; label?: string }> = {
  success:  { text: Colors.success },
  warning:  { text: Colors.warning },
  danger:   { text: Colors.danger },
  info:     { text: Colors.primary },
  neutral:  { text: Colors.textMuted },
  paid:     { text: Colors.success,  label: 'Paid' },
  overdue:  { text: Colors.danger,   label: 'Overdue' },
  sent:     { text: Colors.primary,  label: 'Sent' },
  draft:    { text: Colors.textMuted, label: 'Draft' },
  partial:  { text: Colors.warning,  label: 'Partial' },
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
    <View style={[styles.base, { backgroundColor: config.text + '26' }, style]}>
      <Text style={[styles.text, { color: config.text }]}>{text}</Text>
    </View>
  );
}

export const Badge = memo(BadgeComponent);

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
