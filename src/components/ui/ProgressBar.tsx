import React, { memo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';

type ProgressVariant = 'primary' | 'success' | 'warning' | 'danger';

const VARIANT_COLOR: Record<ProgressVariant, string> = {
  primary: Colors.primary,
  success: Colors.success,
  warning: Colors.warning,
  danger: Colors.danger,
};

interface ProgressBarProps {
  progress: number; // 0–1
  label?: string;
  valueLabel?: string;
  variant?: ProgressVariant;
  height?: number;
  style?: ViewStyle;
}

function ProgressBarComponent({
  progress,
  label,
  valueLabel,
  variant = 'primary',
  height = 8,
  style,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const color = VARIANT_COLOR[variant];

  return (
    <View style={[styles.container, style]}>
      {(label || valueLabel) && (
        <View style={styles.row}>
          {label && <Text style={styles.label}>{label}</Text>}
          {valueLabel && <Text style={[styles.valueLabel, { color }]}>{valueLabel}</Text>}
        </View>
      )}
      <View
        style={[styles.track, { height, borderRadius: height / 2 }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      >
        <View
          style={[
            styles.fill,
            { width: `${clamped * 100}%`, backgroundColor: color, borderRadius: height / 2 },
          ]}
        />
      </View>
    </View>
  );
}

export const ProgressBar = memo(ProgressBarComponent);

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  valueLabel: { fontSize: 13, fontWeight: '700' },
  track: { backgroundColor: Colors.surfaceVariant, overflow: 'hidden' },
  fill: { height: '100%' },
});
