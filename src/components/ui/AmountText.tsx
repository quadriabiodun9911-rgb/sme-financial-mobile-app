import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';

interface AmountTextProps {
  amount: number;
  currency?: string;
  style?: TextStyle;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  colorize?: boolean; // green if positive, red if negative
  showSign?: boolean;
}

const SIZE_MAP = { sm: 13, md: 16, lg: 20, xl: 26 };

export function AmountText({ amount, currency = '₦', style, size = 'md', colorize = false, showSign = false }: AmountTextProps) {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = showSign && amount !== 0 ? (amount > 0 ? '+' : '-') : amount < 0 ? '-' : '';
  const color = colorize ? (amount >= 0 ? '#22c55e' : '#ef4444') : undefined;

  return (
    <Text
      style={[styles.base, { fontSize: SIZE_MAP[size] }, color ? { color } : undefined, style]}
      accessibilityLabel={`${currency}${formatted}`}
    >
      {sign}{currency}{formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { color: '#f1f5f9', fontWeight: '700', fontVariant: ['tabular-nums'] as any },
});
