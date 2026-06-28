import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Card, CardBody } from '../common/Card';

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  subtitle?: string;
  icon?: React.ReactNode;
  status?: 'success' | 'warning' | 'error' | 'neutral';
  loading?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'success': return Colors.income;
    case 'warning': return Colors.warning;
    case 'error': return Colors.expense;
    default: return Colors.textSecondary;
  }
};

export const MetricCard = ({
  label,
  value,
  trend,
  trendValue,
  subtitle,
  icon,
  status = 'neutral',
  loading = false,
  onPress,
  style,
  testID,
}: MetricCardProps) => {
  const statusColor = getStatusColor(status);
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';
  const trendColor = trend === 'up' ? Colors.income : trend === 'down' ? Colors.expense : Colors.textSecondary;

  const content = (
    <CardBody>
      <View style={[styles.container, style]}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}

        <View style={styles.content}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>

          {loading ? (
            <View style={styles.skeletonValue} />
          ) : (
            <View style={styles.valueRow}>
              <Text style={[styles.value, { color: statusColor }]} numberOfLines={1}>
                {value}
              </Text>
              {trend && trendValue !== undefined && (
                <Text style={[styles.trend, { color: trendColor }]}>
                  {trendIcon} {Math.abs(trendValue)}%
                </Text>
              )}
            </View>
          )}

          {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </View>
    </CardBody>
  );

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Card
      variant="outlined"
      clickable={!!onPress}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={`${label}: ${value}${trendValue ? ` ${trend === 'up' ? 'up' : 'down'} ${trendValue}%` : ''}`}
      accessibilityRole="button"
    >
      {content}
    </Card>
  );
};

MetricCard.displayName = 'MetricCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
  },
  trend: {
    fontSize: 12,
    fontWeight: '600',
  },
  skeletonValue: {
    height: 18,
    borderRadius: 4,
    backgroundColor: Colors.bg,
    width: '60%',
    marginVertical: 4,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
