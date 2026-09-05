import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, FlatList } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { RecurringFrequency, Transaction } from '../types';
import { confirmAction } from '../utils/webAlert';
import { nextRecurringDueDate, daysUntilRecurringDue } from '../utils/recurringTransactions';

const DUE_SOON_DAYS = 3;

interface RecurringTransaction extends Transaction {
  id: string;
  isRecurring: true;
  recurringFrequency: RecurringFrequency;
  createdAt?: string;
}

interface Props {
  recurringTransactions: RecurringTransaction[];
  currency?: string;
  onEdit?: (transaction: RecurringTransaction) => void;
  onDelete?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
}

export default function RecurringTransactionManager({
  recurringTransactions,
  currency = '₦',
  onEdit,
  onDelete,
  onToggle,
}: Props) {
  const frequencies = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

  const renderFrequencyLabel = (freq: RecurringFrequency): string => {
    const labels = { weekly: '📅 Weekly', monthly: '📆 Monthly', quarterly: '📅 Quarterly', yearly: '📅 Yearly' };
    return labels[freq] || freq;
  };

  const handleDelete = (id: string) => {
    confirmAction('Delete Recurring', 'Stop this recurring transaction?', 'Delete', () => onDelete?.(id));
  };

  if (!recurringTransactions.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No recurring transactions set up</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💫 Recurring Transactions</Text>
      <FlatList
        data={recurringTransactions}
        keyExtractor={item => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.description}</Text>
                <Text style={styles.cardCategory}>{item.category}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => onEdit?.(item)}>
                  <Text style={styles.editBtn}>✏️</Text>
                </TouchableOpacity>
                {onDelete && (
                    <TouchableOpacity onPress={() => handleDelete(item.id)}>
                      <Text style={styles.deleteBtn}>🗑️</Text>
                    </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.cardDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Amount</Text>
                <Text style={[styles.detailValue, { color: item.type === 'income' ? '#10b981' : '#ef4444' }]}>
                  {item.type === 'income' ? '+' : '-'}{currency}{Math.round(item.amount ?? 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Frequency</Text>
                <Text style={styles.detailValue}>{renderFrequencyLabel(item.recurringFrequency)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Next</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.detailValue}>
                    {nextRecurringDueDate(item).toLocaleDateString()}
                  </Text>
                  {(() => {
                    const daysUntilDue = daysUntilRecurringDue(item);
                    if (daysUntilDue < 0) {
                      return <Text style={styles.dueOverdue}>{Math.abs(daysUntilDue)}d overdue — log it or edit the date</Text>;
                    }
                    if (daysUntilDue <= DUE_SOON_DAYS) {
                      return <Text style={styles.dueSoon}>Due in {daysUntilDue}d</Text>;
                    }
                    return null;
                  })()}
                </View>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  card: { backgroundColor: Colors.card, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  cardCategory: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  editBtn: { fontSize: 18, padding: 4 },
  deleteBtn: { fontSize: 18, padding: 4 },
  cardDetails: { backgroundColor: Colors.bg, borderRadius: 8, padding: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailLabel: { fontSize: 12, color: Colors.textMuted },
  detailValue: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  dueOverdue: { fontSize: 11, fontWeight: '600', color: '#ef4444', marginTop: 2 },
  dueSoon: { fontSize: 11, fontWeight: '600', color: '#f59e0b', marginTop: 2 },
});
