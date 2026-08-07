import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Radius, Shadow } from '../../theme/tokens';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
  /** 'flat' drops the shadow for cards already nested inside an elevated
   *  surface (a modal sheet, another card) where a second shadow would just
   *  look like a mistake. */
  variant?: 'elevated' | 'flat';
}

function CardComponent({ children, title, subtitle, onPress, style, padded = true, variant = 'elevated' }: CardProps) {
  const Container = (onPress ? TouchableOpacity : View) as React.ComponentType<any>;
  const containerProps = onPress
    ? { onPress, activeOpacity: 0.75, accessibilityRole: 'button' as const }
    : {};

  return (
    <Container
      style={[styles.card, padded && styles.padded, variant === 'elevated' && Shadow.sm, style]}
      {...containerProps}
    >
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  padded: { padding: 16 },
  header: { marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
});
