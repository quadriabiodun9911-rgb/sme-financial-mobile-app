import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Input } from '../common/Input';

interface CurrencyInputProps {
  value: number | string;
  onChangeText: (value: number) => void;
  currency: string;
  label?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  decimals?: number;
  minValue?: number;
  maxValue?: number;
  style?: ViewStyle;
  testID?: string;
}

const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    '$': '$', '£': '£', '€': '€', '₦': '₦', '₹': '₹', '¥': '¥',
    'R': 'R', 'KSh': 'KSh', '₵': '₵', 'E£': 'E£', 'AED': 'AED',
    'C$': 'C$', 'A$': 'A$',
  };
  return symbols[currency] || currency;
};

export const CurrencyInput = React.forwardRef<any, CurrencyInputProps>(
  ({
    value,
    onChangeText,
    currency,
    label,
    error,
    required = false,
    placeholder,
    disabled = false,
    decimals = 2,
    minValue,
    maxValue,
    style,
    testID,
  }, ref) => {
    const symbol = getCurrencySymbol(currency);
    const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
    const displayValue = numValue.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    const handleChange = (text: string) => {
      const cleaned = text.replace(/[^0-9.]/g, '');
      const num = parseFloat(cleaned) || 0;

      if (minValue !== undefined && num < minValue) return;
      if (maxValue !== undefined && num > maxValue) return;

      onChangeText(num);
    };

    return (
      <View style={[styles.container, style]}>
        {label && (
          <View style={styles.labelRow}>
            <Text style={styles.labelText}>{label}</Text>
            {required && <Text style={styles.required}>*</Text>}
          </View>
        )}

        <View style={styles.inputWrapper}>
          <Text style={[styles.currencySymbol, ...(error ? [styles.symbolError] : [])]}>
            {symbol}
          </Text>
          <Input
            ref={ref}
            value={displayValue}
            onChangeText={handleChange}
            placeholder={placeholder || '0.00'}
            keyboardType="decimal-pad"
            error={error}
            disabled={disabled}
            testID={testID}
            accessibilityLabel={label}
            inputStyle={styles.input}
          />
        </View>
      </View>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 4,
  },
  symbolError: {
    color: Colors.expense,
  },
  input: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    flex: 1,
    paddingLeft: 0,
  },
});
