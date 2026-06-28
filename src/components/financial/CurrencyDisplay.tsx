import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../theme/colors';

interface CurrencyDisplayProps {
  amount: number;
  currency: string;
  variant?: 'default' | 'income' | 'expense' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  showPrefix?: boolean;
  showSign?: boolean;
  decimals?: number;
  style?: ViewStyle;
  amountStyle?: TextStyle;
  currencyStyle?: TextStyle;
  testID?: string;
  accessibilityLabel?: string;
}

const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    '$': '$',
    '£': '£',
    '€': '€',
    '₦': '₦',
    '₹': '₹',
    '¥': '¥',
    'R': 'R',
    'KSh': 'KSh',
    '₵': '₵',
    'E£': 'E£',
    'AED': 'AED',
    'C$': 'C$',
    'A$': 'A$',
  };
  return symbols[currency] || currency;
};

const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const variantColors: Record<string, { color: string }> = {
  default: { color: Colors.textPrimary },
  income: { color: Colors.income },
  expense: { color: Colors.expense },
  neutral: { color: Colors.textSecondary },
};

const sizeStyles = {
  sm: { amount: 14, currency: 12, fontWeight: '600' as const },
  md: { amount: 18, currency: 14, fontWeight: '700' as const },
  lg: { amount: 24, currency: 16, fontWeight: '700' as const },
};

export const CurrencyDisplay = ({
  amount,
  currency,
  variant = 'default',
  size = 'md',
  showPrefix = true,
  showSign = false,
  decimals = 2,
  style,
  amountStyle,
  currencyStyle,
  testID,
  accessibilityLabel,
}: CurrencyDisplayProps) => {
  const symbol = getCurrencySymbol(currency);
  const formattedAmount = formatNumber(amount, decimals);
  const variantColor = variantColors[variant].color;
  const sizeStyle = sizeStyles[size];
  const sign = showSign && amount >= 0 ? '+' : '';

  const accessibleText = accessibilityLabel || `${symbol}${formattedAmount}`;

  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      accessible
      accessibilityLabel={accessibleText}
      accessibilityRole="text"
    >
      {showPrefix && (
        <Text
          style={[
            { fontSize: sizeStyle.currency, color: variantColor },
            currencyStyle,
          ]}
        >
          {symbol}
        </Text>
      )}
      <Text
        style={[
          {
            fontSize: sizeStyle.amount,
            fontWeight: sizeStyle.fontWeight,
            color: variantColor,
          },
          amountStyle,
        ]}
      >
        {sign}{formattedAmount}
      </Text>
    </View>
  );
};

CurrencyDisplay.displayName = 'CurrencyDisplay';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
});
