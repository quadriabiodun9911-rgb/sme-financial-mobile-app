/**
 * Production-Grade TextField Component
 *
 * Features:
 * - Accessibility first (labels, hints, error announcements)
 * - Loading state support
 * - Error state with clear messaging
 * - Icon support (prefix/suffix)
 * - Multiple variants (outline, filled, ghost)
 * - Full TypeScript support
 * - Responsive sizing
 * - Clear & intuitive API
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  AccessibilityInfo,
  ViewStyle,
  TextStyle,
  ReturnKeyTypeOptions,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export interface TextFieldProps {
  // Content
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;

  // State
  disabled?: boolean;
  readOnly?: boolean;
  loading?: boolean;
  error?: string;
  hint?: string;

  // Type
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'numeric' | 'decimal';
  multiline?: boolean;
  numberOfLines?: number;
  returnKeyType?: ReturnKeyTypeOptions;

  // Appearance
  variant?: 'outline' | 'filled' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  required?: boolean;

  // Icons
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  showPasswordToggle?: boolean;

  // Callbacks
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;

  // Accessibility
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;

  // Styling
  style?: ViewStyle;
  inputStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

const TextField = React.forwardRef<TextInput, TextFieldProps>(({
  label,
  placeholder,
  value,
  onChangeText,
  disabled = false,
  readOnly = false,
  loading = false,
  error,
  hint,
  type = 'text',
  multiline = false,
  numberOfLines = 1,
  returnKeyType = 'default',
  variant = 'outline',
  size = 'md',
  required = false,
  startIcon,
  endIcon,
  showPasswordToggle = false,
  onFocus,
  onBlur,
  onSubmitEditing,
  accessibilityLabel: customA11yLabel,
  accessibilityHint: customA11yHint,
  testID,
  style,
  inputStyle,
  containerStyle,
}, ref) => {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  const inputType = showPassword && type === 'password' ? 'text' : type;

  const keyboardType =
    type === 'email' ? 'email-address' :
    type === 'tel' ? 'phone-pad' :
    type === 'url' ? 'url' :
    type === 'numeric' ? 'decimal-pad' :
    type === 'decimal' ? 'decimal-pad' :
    'default';

  const secureTextEntry = type === 'password' && !showPassword;

  // Accessibility labels
  const accessibilityLabel = customA11yLabel || label;
  const accessibilityHint = customA11yHint || (hint || (error ? `Error: ${error}` : undefined));
  const isError = !!error;

  // Size styles
  const sizeStyles = {
    sm: { height: 36, paddingHorizontal: 8, fontSize: 13 },
    md: { height: 44, paddingHorizontal: 12, fontSize: 15 },
    lg: { height: 52, paddingHorizontal: 16, fontSize: 16 },
  } as const;

  // Variant styles
  const getVariantStyles = () => {
    const base = {
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: isFocused ? theme.colors.primary : theme.colors.border,
    };

    if (isError) {
      base.borderColor = theme.colors.danger;
    }

    switch (variant) {
      case 'filled':
        return {
          ...base,
          backgroundColor: theme.colors.surfaceVariant,
          borderWidth: 0,
        };
      case 'ghost':
        return {
          ...base,
          backgroundColor: 'transparent',
          borderWidth: isFocused ? 1 : 0,
        };
      default:
        return base;
    }
  };

  const styles = StyleSheet.create({
    container: {
      marginBottom: error || hint ? theme.spacing.md : 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
    label: {
      ...theme.typography.label.md,
      color: disabled ? theme.colors.textMuted : theme.colors.textPrimary,
    },
    required: {
      color: theme.colors.danger,
      marginLeft: theme.spacing.xs,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      ...getVariantStyles(),
      ...(disabled && { opacity: 0.5 }),
    },
    input: {
      flex: 1,
      ...sizeStyles[size],
      color: disabled ? theme.colors.textMuted : theme.colors.textPrimary,
      paddingHorizontal: theme.spacing.md,
      ...theme.typography.body.md,
    },
    icon: {
      paddingHorizontal: theme.spacing.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hint: {
      ...theme.typography.caption.sm,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.xs,
    },
    error: {
      ...theme.typography.caption.sm,
      color: theme.colors.danger,
      marginTop: theme.spacing.xs,
    },
    loader: {
      marginHorizontal: theme.spacing.md,
    },
  });

  return (
    <View
      style={[styles.container, containerStyle]}
      testID={testID}
    >
      {label && (
        <View style={styles.header}>
          <Text
            style={styles.label}
            accessibilityRole="header"
          >
            {label}
            {required && <Text style={styles.required}>*</Text>}
          </Text>
        </View>
      )}

      <View
        style={[styles.inputWrapper, style]}
        accessibilityRole="textbox"
        accessibilityState={{
          disabled,
          editable: !disabled && !readOnly,
        }}
      >
        {startIcon && (
          <View style={styles.icon}>
            {startIcon}
          </View>
        )}

        <TextInput
          ref={ref}
          style={[styles.input, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          editable={!disabled && !readOnly}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityState={{
            disabled,
            required,
          }}
          {...(Platform.OS === 'web' && {
            aria: {
              label: accessibilityLabel,
              hint: accessibilityHint,
            },
          })}
        />

        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator
              color={theme.colors.primary}
              size="small"
              accessibilityLabel="Loading"
            />
          </View>
        )}

        {showPasswordToggle && type === 'password' && !loading && (
          <TouchableOpacity
            style={styles.icon}
            onPress={() => setShowPassword(!showPassword)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityHint="Toggle password visibility"
          >
            <Text style={{ fontSize: 18 }}>
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </Text>
          </TouchableOpacity>
        )}

        {endIcon && !loading && !showPasswordToggle && (
          <View style={styles.icon}>
            {endIcon}
          </View>
        )}
      </View>

      {hint && !error && (
        <Text
          style={styles.hint}
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
        >
          {hint}
        </Text>
      )}

      {error && (
        <Text
          style={styles.error}
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          role="alert"
        >
          ⚠️ {error}
        </Text>
      )}
    </View>
  );
});

TextField.displayName = 'TextField';

export default TextField;

/**
 * Usage Examples:
 *
 * Basic:
 * <TextField
 *   label="Email"
 *   type="email"
 *   value={email}
 *   onChangeText={setEmail}
 *   placeholder="your@email.com"
 * />
 *
 * With Error:
 * <TextField
 *   label="Amount"
 *   type="decimal"
 *   value={amount}
 *   onChangeText={setAmount}
 *   error={error ? "Invalid amount" : undefined}
 *   hint="Enter amount in naira"
 * />
 *
 * With Password Toggle:
 * <TextField
 *   label="Password"
 *   type="password"
 *   value={password}
 *   onChangeText={setPassword}
 *   showPasswordToggle
 * />
 *
 * With Icons:
 * <TextField
 *   label="Search"
 *   value={search}
 *   onChangeText={setSearch}
 *   startIcon={<SearchIcon />}
 *   endIcon={search && <ClearIcon />}
 * />
 */
