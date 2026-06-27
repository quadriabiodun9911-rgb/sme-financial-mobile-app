import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  testID?: string;
  accessibilityLabel?: string;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: `${Colors.primary}22`, text: Colors.primary },
  success: { bg: `${Colors.income}22`, text: Colors.income },
  error: { bg: `${Colors.expense}22`, text: Colors.expense },
  warning: { bg: `${Colors.warning}22`, text: Colors.warning },
  info: { bg: `${Colors.secondary}22`, text: Colors.secondary },
};

const sizeStyles = {
  sm: { padding: 4, fontSize: 11 },
  md: { padding: 6, fontSize: 12 },
};

export const Badge = ({
  label,
  variant = 'default',
  size = 'md',
  testID,
  accessibilityLabel,
}: BadgeProps) => {
  const colors = variantColors[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.bg,
          paddingHorizontal: sizeStyle.padding,
          paddingVertical: sizeStyle.padding / 2,
        },
      ]}
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="status"
    >
      <Text
        style={[
          styles.text,
          {
            fontSize: sizeStyle.fontSize,
            color: colors.text,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

Badge.displayName = 'Badge';

const styles = StyleSheet.create({
  base: {
    borderRadius: 4,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '600',
  },
});
