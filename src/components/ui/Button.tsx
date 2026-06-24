import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';

const Colors = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  danger: '#ef4444',
  dangerDark: '#dc2626',
  surface: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
};

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'secondary' || variant === 'ghost' ? Colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`], styles[`${size}Text`], textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },

  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: 'transparent', borderColor: Colors.primary },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: Colors.danger },

  sm: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  md: { paddingHorizontal: 18, paddingVertical: 11 },
  lg: { paddingHorizontal: 24, paddingVertical: 15, borderRadius: 12 },

  text: { fontWeight: '600' },
  primaryText: { color: '#fff' },
  secondaryText: { color: Colors.primary },
  ghostText: { color: Colors.primary },
  dangerText: { color: '#fff' },

  smText: { fontSize: 13 },
  mdText: { fontSize: 15 },
  lgText: { fontSize: 17 },
});
