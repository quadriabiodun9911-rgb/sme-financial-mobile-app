/**
 * Production-Grade Button Component
 *
 * Features:
 * - 5 semantic variants: primary, secondary, success, danger, ghost
 * - 3 sizes: sm, md, lg
 * - Loading state with spinner
 * - Disabled state
 * - Full width option
 * - Icon support
 * - Accessibility-first design
 * - Touch feedback
 * - Type-safe TypeScript
 */

import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  AccessibilityRole,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  // Content
  children: React.ReactNode;
  icon?: React.ReactNode;

  // State
  disabled?: boolean;
  loading?: boolean;

  // Appearance
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;

  // Callbacks
  onPress: () => void | Promise<void>;

  // Accessibility
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  testID?: string;

  // Styling
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const Button = React.forwardRef<TouchableOpacity, ButtonProps>(({
  children,
  icon,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  onPress,
  accessibilityLabel: customLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  testID,
  style,
  textStyle,
}, ref) => {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  // Get variant colors
  const getVariantColors = () => {
    const variantMap: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
      primary: {
        bg: theme.colors.primary,
        text: '#ffffff',
        border: theme.colors.primary,
      },
      secondary: {
        bg: 'transparent',
        text: theme.colors.primary,
        border: theme.colors.primary,
      },
      success: {
        bg: theme.colors.success,
        text: '#ffffff',
        border: theme.colors.success,
      },
      danger: {
        bg: theme.colors.danger,
        text: '#ffffff',
        border: theme.colors.danger,
      },
      ghost: {
        bg: 'transparent',
        text: theme.colors.textPrimary,
        border: theme.colors.border,
      },
    };

    return variantMap[variant];
  };

  // Size styles
  const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; lineHeight: number }> = {
    sm: {
      height: 32,
      paddingHorizontal: 12,
      fontSize: 13,
      lineHeight: 18,
    },
    md: {
      height: 44,
      paddingHorizontal: 16,
      fontSize: 15,
      lineHeight: 20,
    },
    lg: {
      height: 52,
      paddingHorizontal: 20,
      fontSize: 16,
      lineHeight: 24,
    },
  };

  const variantColors = getVariantColors();
  const sizeStyle = sizeStyles[size];

  const styles = StyleSheet.create({
    button: {
      height: sizeStyle.height,
      paddingHorizontal: sizeStyle.paddingHorizontal,
      borderRadius: theme.radius.md,
      backgroundColor: variantColors.bg,
      borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0,
      borderColor: variantColors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      ...(fullWidth && { alignSelf: 'stretch', width: '100%' }),
      ...(isDisabled && { opacity: 0.6 }),
    },
    text: {
      ...theme.typography.label.lg,
      color: variantColors.text,
      fontSize: sizeStyle.fontSize,
      lineHeight: sizeStyle.lineHeight,
      fontWeight: '600',
    },
    icon: {},
  });

  const accessibilityLabel = customLabel || (typeof children === 'string' ? children : 'Button');
  const loadingLabel = loading ? `Loading ${accessibilityLabel}` : accessibilityLabel;

  return (
    <TouchableOpacity
      ref={ref}
      style={[styles.button, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={loadingLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={variantColors.text}
          size={size === 'sm' ? 'small' : 'small'}
          testID={testID ? `${testID}-loader` : undefined}
        />
      ) : (
        <>
          {icon && (
            <View style={styles.icon} pointerEvents="none">
              {icon}
            </View>
          )}
          {typeof children === 'string' ? (
            <Text style={[styles.text, textStyle]}>
              {children}
            </Text>
          ) : (
            children
          )}
        </>
      )}
    </TouchableOpacity>
  );
});

Button.displayName = 'Button';

export default Button;

/**
 * Usage Examples:
 *
 * Basic primary button:
 * <Button onPress={() => handleSubmit()}>
 *   Save Changes
 * </Button>
 *
 * Danger button with loading state:
 * <Button
 *   variant="danger"
 *   loading={isDeleting}
 *   onPress={() => handleDelete()}
 * >
 *   Delete Account
 * </Button>
 *
 * Secondary button, full width:
 * <Button
 *   variant="secondary"
 *   fullWidth
 *   onPress={() => navigate('login')}
 * >
 *   Cancel
 * </Button>
 *
 * With icon:
 * <Button
 *   variant="success"
 *   icon={<CheckIcon />}
 *   onPress={() => handleConfirm()}
 * >
 *   Confirm Payment
 * </Button>
 *
 * Small ghost button:
 * <Button
 *   variant="ghost"
 *   size="sm"
 *   onPress={() => handleSkip()}
 * >
 *   Skip
 * </Button>
 *
 * Disabled state:
 * <Button
 *   disabled={!isFormValid}
 *   onPress={() => submit()}
 * >
 *   Submit
 * </Button>
 */
