import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { CurrencyDisplay } from './CurrencyDisplay';

export interface TransactionData {
  id: string;
  description: string;
  amount: number;
  category?: string;
  type: 'income' | 'expense';
  date: Date;
  currency: string;
}

interface TransactionCardProps {
  transaction: TransactionData;
  onPress?: () => void;
  showCategory?: boolean;
  highlighted?: boolean;
  testID?: string;
}

export const TransactionCard = ({
  transaction,
  onPress,
  showCategory = true,
  highlighted = false,
  testID,
}: TransactionCardProps) => {
  const isIncome = transaction.type === 'income';
  const categoryBadgeVariant = isIncome ? 'success' : 'error';
  const amountVariant = isIncome ? 'income' : 'expense';

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <Card
      clickable={!!onPress}
      onPress={onPress}
      variant={highlighted ? 'elevated' : 'default'}
      padding="md"
      testID={testID}
      accessibilityLabel={`${transaction.description}: ${transaction.currency}${transaction.amount}`}
    >
      <View style={styles.container}>
        {/* Left: Description & Category */}
        <View style={styles.content}>
          <Text style={styles.description} numberOfLines={1}>
            {transaction.description}
          </Text>

          {showCategory && transaction.category && (
            <Badge
              label={transaction.category}
              variant={categoryBadgeVariant}
              size="sm"
            />
          )}

          <Text style={styles.date}>{formatDate(transaction.date)}</Text>
        </View>

        {/* Right: Amount */}
        <View style={styles.amountContainer}>
          <CurrencyDisplay
            amount={transaction.amount}
            currency={transaction.currency}
            variant={amountVariant}
            size="md"
            showPrefix
            showSign={isIncome}
          />
        </View>
      </View>
    </Card>
  );
};

TransactionCard.displayName = 'TransactionCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  description: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  date: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
});
