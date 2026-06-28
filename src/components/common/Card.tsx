import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';

interface CardProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outlined' | 'elevated';
  hoverable?: boolean;
  clickable?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
  accessibilityRole?: string;
  accessibilityLabel?: string;
}

const paddingMap = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
};

export const Card = React.forwardRef<View, CardProps>(
  ({
    children,
    padding = 'md',
    variant = 'default',
    hoverable = false,
    clickable = false,
    onPress,
    style,
    testID,
    accessibilityRole,
    accessibilityLabel,
  }, ref) => {
    const paddingValue = paddingMap[padding];
    const Component = clickable ? TouchableOpacity : View;

    return (
      <Component
        ref={ref as any}
        style={[
          styles.base,
          variant === 'outlined' && styles.outlined,
          variant === 'elevated' && styles.elevated,
          hoverable && styles.hoverable,
          { padding: paddingValue },
          style,
        ]}
        onPress={onPress}
        disabled={!clickable}
        testID={testID}
        accessible
        accessibilityRole={accessibilityRole || (clickable ? 'button' : 'region')}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';

// Composable subcomponents
export const CardHeader = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[styles.header, style]}>{children}</View>
);
CardHeader.displayName = 'CardHeader';

export const CardBody = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[styles.body, style]}>{children}</View>
);
CardBody.displayName = 'CardBody';

export const CardFooter = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[styles.footer, style]}>{children}</View>
);
CardFooter.displayName = 'CardFooter';

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 0,
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  hoverable: {
    activeOpacity: 0.8,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 12,
    paddingBottom: 12,
  },
  body: {
    flexGrow: 1,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 12,
    paddingTop: 12,
  },
});
