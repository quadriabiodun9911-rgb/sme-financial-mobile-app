import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Input } from '../common/Input';

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  required?: boolean;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'decimal-pad';
  secureTextEntry?: boolean;
  maxLength?: number;
  style?: ViewStyle;
  testID?: string;
}

export const FormField = React.forwardRef<any, FormFieldProps>(
  ({
    label,
    value,
    onChangeText,
    error,
    required = false,
    helperText,
    placeholder,
    disabled = false,
    multiline = false,
    numberOfLines,
    keyboardType = 'default',
    secureTextEntry = false,
    maxLength,
    style,
    testID,
  }, ref) => {
    const fieldId = React.useId();

    return (
      <View style={[styles.container, style]}>
        <View style={styles.labelRow}>
          <Text style={styles.labelText} nativeID={`label-${fieldId}`}>
            {label}
          </Text>
          {required && <Text style={styles.required}>*</Text>}
        </View>

        <Input
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          label={undefined}
          error={error}
          disabled={disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          testID={testID}
          accessibilityLabel={label}
          aria-describedby={`label-${fieldId} ${error ? `error-${fieldId}` : ''} ${helperText ? `helper-${fieldId}` : ''}`}
        />

        {helperText && !error && (
          <Text style={styles.helperText} nativeID={`helper-${fieldId}`}>
            {helperText}
          </Text>
        )}
      </View>
    );
  }
);

FormField.displayName = 'FormField';

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  required: {
    color: Colors.expense,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  helperText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
});
