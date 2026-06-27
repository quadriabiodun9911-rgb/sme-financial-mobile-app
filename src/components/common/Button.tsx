import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
}

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  xs: {
    container: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    text: { fontSize: 12, fontWeight: '600' },
  },
  sm: {
    container: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
    text: { fontSize: 13, fontWeight: '600' },
  },
  md: {
    container: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    text: { fontSize: 14, fontWeight: '600' },
  },
  lg: {
    container: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
    text: { fontSize: 15, fontWeight: '700' },
  },
  xl: {
    container: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
    text: { fontSize: 16, fontWeight: '700' },
  },
};

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
  primary: { bg: Colors.primary, text: Colors.textPrimary, border: Colors.primary },
  secondary: { bg: Colors.surface, text: Colors.primary, border: Colors.border },
  ghost: { bg: 'transparent', text: Colors.primary, border: 'transparent' },
  danger: { bg: Colors.expense, text: Colors.textPrimary, border: Colors.expense },
  success: { bg: Colors.income, text: Colors.textPrimary, border: Colors.income },
};

export const Button = React.forwardRef<TouchableOpacity, ButtonProps>(
  ({
    children,
    onPress,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    fullWidth = false,
    style,
    testID,
    accessibilityLabel,
  }, ref) => {
    const sizeStyle = sizeStyles[size];
    const variantStyle = variantStyles[variant];

    return (
      <TouchableOpacity
        ref={ref}
        style={[
          styles.base,
          sizeStyle.container,
          {
            backgroundColor: disabled ? Colors.muted : variantStyle.bg,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: variantStyle.border,
            width: fullWidth ? '100%' : 'auto',
          },
          style,
        ]}
        onPress={onPress}
        disabled={disabled || loading}
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel || (typeof children === 'string' ? children : 'Button')}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
      >
        {loading && <ActivityIndicator color={variantStyle.text} size="small" style={styles.loader} />}
        {typeof children === 'string' ? (
          <Text style={[sizeStyle.text, { color: disabled ? Colors.textMuted : variantStyle.text }]}>
            {children}
          </Text>
        ) : (
          children
        )}
      </TouchableOpacity>
    );
  }
);

Button.displayName = 'Button';

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  loader: { marginRight: 8 },
});
