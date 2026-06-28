/**
 * AsyncBoundary Component
 *
 * Encapsulates async state handling (loading, error, empty, success)
 * Eliminates repetitive conditional rendering across screens
 *
 * Features:
 * - Clean loading state with skeleton or spinner
 * - Empty state with icon and action
 * - Error state with retry button
 * - Success state with content
 * - Accessibility support
 * - TypeScript generics for type-safe data
 */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  AccessibilityRole,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import Button from './Button';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error' | 'empty';

export interface AsyncBoundaryProps<T> {
  // Data
  status: AsyncStatus;
  data?: T | null;
  error?: Error | null;

  // Content rendering
  children: (data: T) => ReactNode;
  loadingComponent?: ReactNode;
  emptyComponent?: ReactNode;

  // Error handling
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;

  // Empty state
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: string;

  // Accessibility
  testID?: string;
  accessibilityLabel?: string;

  // Styling
  style?: ViewStyle;
}

export function AsyncBoundary<T = any>({
  status,
  data,
  error,
  children,
  loadingComponent,
  emptyComponent,
  errorTitle = 'Something went wrong',
  errorMessage = error?.message || 'Unable to load data. Please try again.',
  onRetry,
  retryLabel = 'Try Again',
  emptyTitle = 'No data',
  emptyMessage = 'No results found',
  emptyIcon = '📭',
  testID,
  accessibilityLabel,
  style,
}: AsyncBoundaryProps<T>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.lg,
    },
    loadingContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
    emptyContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.xxl,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: theme.spacing.md,
    },
    emptyTitle: {
      ...theme.typography.heading.sm,
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    emptyMessage: {
      ...theme.typography.body.md,
      color: theme.colors.textMuted,
      textAlign: 'center',
      maxWidth: 300,
    },
    errorContainer: {
      backgroundColor: `${theme.colors.danger}15`,
      borderRadius: theme.radius.md,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.danger,
    },
    errorTitle: {
      ...theme.typography.heading.sm,
      color: theme.colors.danger,
    },
    errorMessage: {
      ...theme.typography.body.md,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    errorButtonContainer: {
      marginTop: theme.spacing.md,
    },
    spinner: {
      marginVertical: theme.spacing.xl,
    },
  });

  // Loading state
  if (status === 'pending') {
    return (
      <View
        style={[styles.container, style]}
        testID={testID ? `${testID}-loading` : undefined}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel || 'Loading'}
        accessibilityLiveRegion="polite"
      >
        {loadingComponent ? (
          loadingComponent
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              style={styles.spinner}
              testID={testID ? `${testID}-spinner` : undefined}
            />
            <Text
              style={{ color: theme.colors.textMuted, ...theme.typography.body.md }}
              accessibilityLiveRegion="polite"
            >
              Loading...
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <View
        style={[styles.centerContainer, style]}
        testID={testID ? `${testID}-error` : undefined}
        accessibilityRole="alert"
        accessibilityLabel={accessibilityLabel || errorTitle}
        accessible
      >
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>
            ⚠️ {errorTitle}
          </Text>
          <Text style={styles.errorMessage}>
            {errorMessage}
          </Text>
          {onRetry && (
            <View style={styles.errorButtonContainer}>
              <Button
                onPress={onRetry}
                variant="primary"
                size="md"
                testID={testID ? `${testID}-retry` : undefined}
              >
                {retryLabel}
              </Button>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Empty state
  if (status === 'empty' || (status === 'success' && !data)) {
    return (
      <View
        style={[styles.centerContainer, style]}
        testID={testID ? `${testID}-empty` : undefined}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel || emptyTitle}
        accessibilityLiveRegion="polite"
      >
        {emptyComponent ? (
          emptyComponent
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon} accessibilityLabel="Empty">
              {emptyIcon}
            </Text>
            <Text style={styles.emptyTitle}>
              {emptyTitle}
            </Text>
            <Text style={styles.emptyMessage}>
              {emptyMessage}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Success state - render children with data
  if (status === 'success' && data) {
    return (
      <View
        style={[styles.container, style]}
        testID={testID ? `${testID}-success` : undefined}
      >
        {children(data)}
      </View>
    );
  }

  // Idle state - render nothing or placeholder
  return (
    <View
      style={[styles.container, style]}
      testID={testID ? `${testID}-idle` : undefined}
    />
  );
}

/**
 * Usage Examples:
 *
 * Basic usage:
 * const { status, data, error, execute } = useAsync(fetchTransactions);
 *
 * <AsyncBoundary
 *   status={status}
 *   data={data}
 *   error={error}
 *   errorTitle="Failed to load transactions"
 *   emptyTitle="No transactions yet"
 *   emptyMessage="Start by adding your first transaction"
 *   onRetry={execute}
 * >
 *   {(transactions) => (
 *     <FlatList
 *       data={transactions}
 *       renderItem={({ item }) => <TransactionItem {...item} />}
 *     />
 *   )}
 * </AsyncBoundary>
 *
 * With custom loading component:
 * <AsyncBoundary
 *   status={status}
 *   data={data}
 *   error={error}
 *   loadingComponent={<SkeletonList count={5} />}
 *   onRetry={execute}
 * >
 *   {(items) => <ItemList items={items} />}
 * </AsyncBoundary>
 *
 * With custom empty component:
 * <AsyncBoundary
 *   status={status}
 *   data={data}
 *   error={error}
 *   emptyComponent={
 *     <EmptyStateHero
 *       title="Get Started"
 *       subtitle="Create your first invoice"
 *       icon="📄"
 *     />
 *   }
 *   onRetry={execute}
 * >
 *   {(invoices) => <InvoiceList invoices={invoices} />}
 * </AsyncBoundary>
 */
