import React from 'react';
import { TextInput, View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../theme/colors';

interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'decimal-pad';
  secureTextEntry?: boolean;
  maxLength?: number;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  testID?: string;
  accessibilityLabel?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({
    value,
    onChangeText,
    placeholder,
    label,
    error,
    disabled = false,
    multiline = false,
    numberOfLines,
    keyboardType = 'default',
    secureTextEntry = false,
    maxLength,
    style,
    inputStyle,
    testID,
    accessibilityLabel,
  }, ref) => {
    const inputId = React.useId();

    return (
      <View style={[styles.container, style]}>
        {label && (
          <Text style={styles.label} nativeID={inputId}>
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          style={[
            styles.input,
            multiline && styles.multiline,
            error && styles.inputError,
            disabled && styles.inputDisabled,
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          testID={testID}
          accessible
          accessibilityLabel={accessibilityLabel || label || placeholder}
          accessibilityRole="text"
          accessibilityState={{ disabled }}
          accessibilityHint={error}
          aria-describedby={error ? `error-${inputId}` : undefined}
        />
        {error && (
          <Text style={styles.errorText} nativeID={`error-${inputId}`} role="alert">
            {error}
          </Text>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingVertical: 12,
  },
  inputError: {
    borderColor: Colors.expense,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  },
  inputDisabled: {
    backgroundColor: Colors.surface,
    opacity: 0.6,
  },
  errorText: {
    fontSize: 12,
    color: Colors.expense,
    fontWeight: '500',
    marginTop: 4,
  },
});
