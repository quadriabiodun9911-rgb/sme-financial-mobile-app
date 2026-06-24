import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Button } from './Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.container, style]} accessibilityLiveRegion="polite">
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <Button onPress={onAction} title={actionLabel} style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  action: { marginTop: 20 },
});
