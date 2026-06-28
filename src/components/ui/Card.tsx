import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
}

function CardComponent({ children, title, subtitle, onPress, style, padded = true }: CardProps) {
  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress
    ? { onPress, activeOpacity: 0.75, accessibilityRole: 'button' as const }
    : {};

  return (
    <Container style={[styles.card, padded && styles.padded, style]} {...containerProps}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      {children}
    </Container>
  );
}

export const Card = memo(CardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  padded: { padding: 16 },
  header: { marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  subtitle: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
});
