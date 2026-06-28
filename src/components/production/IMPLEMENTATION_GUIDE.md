# Production Component System - Implementation Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    App Component Tree                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  App                                                      │
│  ├─ ThemeProvider (Theme Context)                        │
│  │  ├─ AppProvider (App State Context)                   │
│  │  │  └─ Navigator (Screen Router)                      │
│  │  │     ├─ Screen 1                                    │
│  │  │     │  ├─ AsyncBoundary (async state wrapper)      │
│  │  │     │  │  ├─ ScreenContent                         │
│  │  │     │  │  │  ├─ TextField (forms)                  │
│  │  │     │  │  │  ├─ Button (actions)                   │
│  │  │     │  │  │  ├─ Card (containers)                  │
│  │  │     │  │  │  └─ ...more components                 │
│  │  │     │  │  ├─ ErrorBoundary (error fallback)        │
│  │  │     ├─ Screen 2                                    │
│  │  │     └─ ...more screens                             │
│  │  └─ FooterNav (Global Navigation)                     │
│  └─ ErrorBoundary (Root Error Boundary)                  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Production-Ready Screen Pattern

### Pattern 1: Simple Data Fetching

```typescript
// src/screens/TransactionsScreen.tsx
import { AsyncBoundary } from '../components/production/AsyncBoundary';
import { useAsync } from '../hooks/useAsync';
import Button from '../components/production/Button';

export default function TransactionsScreen() {
  // Fetch with automatic retry
  const { status, data: transactions, error, execute } = useAsync(
    () => fetch('/api/transactions').then(r => r.json()),
    {
      onError: (error) => {
        // Log to error tracking service
        console.error('Failed to fetch transactions:', error);
      },
    }
  );

  return (
    <AsyncBoundary
      status={status}
      data={transactions}
      error={error}
      errorTitle="Failed to load transactions"
      errorMessage="We couldn't fetch your transactions. Please check your connection and try again."
      onRetry={execute}
      retryLabel="Retry"
      emptyTitle="No Transactions Yet"
      emptyMessage="Start tracking your business transactions to see them here"
      emptyIcon="📊"
      testID="transactions"
    >
      {(transactions) => (
        <FlatList
          data={transactions}
          renderItem={({ item }) => <TransactionItem transaction={item} />}
          keyExtractor={item => item.id}
          ListFooterComponent={
            transactions.length > 10 ? (
              <Button variant="ghost" onPress={() => loadMore()}>
                Load More
              </Button>
            ) : null
          }
        />
      )}
    </AsyncBoundary>
  );
}
```

### Pattern 2: Form with Validation

```typescript
// src/screens/AddTransactionScreen.tsx
import { useForm } from '../hooks/useForm';
import TextField from '../components/production/TextField';
import Button from '../components/production/Button';

interface TransactionForm {
  description: string;
  amount: string;
  date: string;
  category: string;
}

export default function AddTransactionScreen() {
  const form = useForm<TransactionForm>({
    initialValues: {
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category: '',
    },
    validate: (values) => {
      const errors: Record<string, string> = {};

      if (!values.description.trim()) {
        errors.description = 'Description is required';
      }

      if (!values.amount || isNaN(parseFloat(values.amount))) {
        errors.amount = 'Please enter a valid amount';
      }

      if (parseFloat(values.amount) <= 0) {
        errors.amount = 'Amount must be greater than 0';
      }

      if (!values.category) {
        errors.category = 'Please select a category';
      }

      return errors;
    },
    onSubmit: async (values) => {
      // API call
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to add transaction');
      }

      return response.json();
    },
    onSuccess: () => {
      // Show success message
      Alert.alert('Success', 'Transaction added successfully');
      // Navigate back or refresh
      navigation.goBack();
    },
  });

  return (
    <ScrollView>
      <TextField
        label="Description"
        placeholder="e.g., Office supplies"
        value={form.values.description}
        onChangeText={(description) => form.setFieldValue('description', description)}
        onBlur={() => form.setFieldTouched('description')}
        error={form.touched.description ? form.errors.description : undefined}
        required
      />

      <TextField
        label="Amount"
        type="decimal"
        placeholder="0.00"
        value={form.values.amount}
        onChangeText={(amount) => form.setFieldValue('amount', amount)}
        onBlur={() => form.setFieldTouched('amount')}
        error={form.touched.amount ? form.errors.amount : undefined}
        hint="Amount in Nigerian Naira"
        required
      />

      <CategoryPicker
        value={form.values.category}
        onChange={(category) => form.setFieldValue('category', category)}
        error={form.touched.category ? form.errors.category : undefined}
      />

      <Button
        onPress={form.handleSubmit}
        loading={form.isSubmitting}
        fullWidth
        size="lg"
      >
        Add Transaction
      </Button>

      <Button
        variant="ghost"
        onPress={form.reset}
        fullWidth
        disabled={form.isSubmitting}
      >
        Clear
      </Button>
    </ScrollView>
  );
}
```

### Pattern 3: Complex Data Fetching with Filters

```typescript
// src/screens/FilteredListScreen.tsx
import { useAsync } from '../hooks/useAsync';
import { useMemo, useState } from 'react';

interface ListFilters {
  search: string;
  category: string;
  status: string;
}

export default function FilteredListScreen() {
  const [filters, setFilters] = useState<ListFilters>({
    search: '',
    category: '',
    status: '',
  });

  // Memoize query string to prevent unnecessary refetches
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.append('q', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);
    return params.toString();
  }, [filters]);

  const { status, data: items, error, execute } = useAsync(
    () => fetch(`/api/items?${queryString}`).then(r => r.json()),
    {
      immediate: true, // Auto-fetch on component mount
    }
  );

  // Handle filter changes
  const handleFilterChange = (key: keyof ListFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <View>
      {/* Search and Filter Controls */}
      <TextField
        label="Search"
        value={filters.search}
        onChangeText={(value) => handleFilterChange('search', value)}
        placeholder="Search items..."
        startIcon={<SearchIcon />}
      />

      <StatusFilter
        value={filters.status}
        onChange={(value) => handleFilterChange('status', value)}
      />

      {/* Data Display with Async Handling */}
      <AsyncBoundary
        status={status}
        data={items}
        error={error}
        onRetry={execute}
        emptyMessage={
          filters.search || filters.category || filters.status
            ? 'No items match your filters'
            : 'No items available'
        }
      >
        {(items) => (
          <FlatList
            data={items}
            renderItem={({ item }) => <ItemRow item={item} />}
            keyExtractor={item => item.id}
          />
        )}
      </AsyncBoundary>
    </View>
  );
}
```

### Pattern 4: Modal Form Dialog

```typescript
// src/components/AddItemModal.tsx
import { Modal, StyleSheet, View } from 'react-native';
import { useForm } from '../hooks/useForm';
import Button from './production/Button';
import TextField from './production/TextField';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddItemModal({ visible, onClose, onSuccess }: AddItemModalProps) {
  const form = useForm({
    initialValues: { name: '', amount: '' },
    validate: (v) => ({
      ...(!v.name && { name: 'Name required' }),
      ...(!v.amount && { amount: 'Amount required' }),
    }),
    onSubmit: async (values) => {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to add');
      return res.json();
    },
    onSuccess: () => {
      form.reset();
      onClose();
      onSuccess();
    },
  });

  const theme = useTheme();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modal: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.md,
    },
    title: {
      ...theme.typography.heading.md,
      color: theme.colors.textPrimary,
    },
    buttons: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Item</Text>
            <Button
              variant="ghost"
              size="sm"
              onPress={onClose}
              accessibilityLabel="Close modal"
            >
              ✕
            </Button>
          </View>

          <TextField
            label="Name"
            value={form.values.name}
            onChangeText={(v) => form.setFieldValue('name', v)}
            error={form.touched.name ? form.errors.name : undefined}
            required
          />

          <TextField
            label="Amount"
            type="decimal"
            value={form.values.amount}
            onChangeText={(v) => form.setFieldValue('amount', v)}
            error={form.touched.amount ? form.errors.amount : undefined}
            required
          />

          <View style={styles.buttons}>
            <Button
              variant="secondary"
              onPress={onClose}
              style={{ flex: 1 }}
              disabled={form.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={form.handleSubmit}
              loading={form.isSubmitting}
              style={{ flex: 1 }}
            >
              Add
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

---

## Complete Screen Example: Transactions List with CRUD

```typescript
// src/screens/TransactionsListScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAsync } from '../hooks/useAsync';
import { AsyncBoundary } from '../components/production/AsyncBoundary';
import Button from '../components/production/Button';
import TextField from '../components/production/TextField';
import { AddItemModal } from '../components/AddItemModal';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
}

export default function TransactionsListScreen() {
  const theme = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch transactions
  const {
    status,
    data: allTransactions,
    error,
    execute: refetch,
  } = useAsync(
    () => fetch('/api/transactions').then(r => r.json()),
    { onError: (e) => console.error('Transaction fetch failed:', e) }
  );

  // Filter locally
  const filteredTransactions = useMemo(() => {
    if (!allTransactions) return [];
    if (!searchQuery) return allTransactions;
    
    return allTransactions.filter(t =>
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allTransactions, searchQuery]);

  // Handle delete
  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error('Failed to delete');
              Alert.alert('Success', 'Transaction deleted');
              refetch(); // Refresh list
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed');
            }
          },
        },
      ]
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    header: {
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    controls: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    content: {
      flex: 1,
    },
    transactionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    transactionInfo: {
      flex: 1,
    },
    transactionDesc: {
      ...theme.typography.body.md,
      color: theme.colors.textPrimary,
    },
    transactionCat: {
      ...theme.typography.caption.sm,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.xs,
    },
    transactionAmount: {
      ...theme.typography.body.lg,
      fontWeight: '700',
      color: theme.colors.income,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TextField
          label="Search"
          placeholder="Search transactions..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          startIcon={<Text>🔍</Text>}
        />

        <View style={styles.controls}>
          <Button
            variant="primary"
            size="sm"
            onPress={() => setShowAddModal(true)}
            fullWidth
          >
            + Add Transaction
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={refetch}
          >
            🔄
          </Button>
        </View>
      </View>

      {/* Content */}
      <AsyncBoundary
        status={status}
        data={filteredTransactions}
        error={error}
        emptyMessage={
          searchQuery 
            ? 'No transactions match your search'
            : 'No transactions yet. Add your first one!'
        }
        onRetry={refetch}
        style={styles.content}
        testID="transactions-list"
      >
        {(transactions) => (
          <FlatList
            data={transactions}
            renderItem={({ item }) => (
              <View style={styles.transactionRow}>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionDesc}>
                    {item.description}
                  </Text>
                  <Text style={styles.transactionCat}>
                    {item.category} • {new Date(item.date).toLocaleDateString()}
                  </Text>
                </View>

                <Text style={styles.transactionAmount}>
                  ₦{item.amount.toLocaleString()}
                </Text>

                <View style={styles.actionButtons}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => {/* Edit handler */}}
                  >
                    ✏️
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onPress={() => handleDelete(item.id)}
                  >
                    🗑️
                  </Button>
                </View>
              </View>
            )}
            keyExtractor={item => item.id}
            scrollEnabled={false}
          />
        )}
      </AsyncBoundary>

      {/* Modal */}
      <AddItemModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={refetch}
      />
    </View>
  );
}
```

---

## Best Practices Summary

### ✅ DO
- Use `AsyncBoundary` for all async state handling
- Use `useForm` for all forms to standardize validation
- Use `useAsync` or `useApi` for data fetching
- Memoize computed/filtered data with `useMemo`
- Handle errors gracefully with try/catch and user-friendly messages
- Use theme tokens for all styling (colors, spacing, radius)
- Add `testID` to components for testing
- Include accessibility labels and hints

### ❌ DON'T
- Mix async state handling logic in components
- Use inline styles (use `StyleSheet.create()`)
- Hardcode colors instead of using theme
- Skip error boundaries
- Forget accessibility labels
- Create deeply nested component trees (use composition)
- Update state in render functions
- Use `any` types in TypeScript

---

## File Structure

```
src/
├── components/
│   ├── production/          # Production-ready components
│   │   ├── TextField.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── AsyncBoundary.tsx
│   │   └── ...
│   ├── system/              # System documentation
│   │   └── COMPONENT_SYSTEM.md
│   └── ui/                  # Existing UI components
├── hooks/                   # Reusable hooks
│   ├── useAsync.ts
│   ├── useForm.ts
│   ├── useApi.ts
│   └── ...
├── contexts/
│   ├── ThemeContext.tsx
│   └── AppContext.tsx
├── theme/
│   ├── tokens.ts            # Design tokens
│   ├── themes.ts            # Theme definitions
│   └── colors.ts            # Legacy colors
└── screens/                 # Screen implementations
    ├── ...Screen.tsx
    └── ...
```

---

## Testing Components

```typescript
// src/components/production/Button.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import Button from './Button';

describe('Button', () => {
  it('calls onPress when clicked', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress}>Click me</Button>
    );

    fireEvent.press(getByText('Click me'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    const { getByTestId } = render(
      <Button loading onPress={() => {}} testID="btn">
        Save
      </Button>
    );

    expect(getByTestId('btn-loader')).toBeTruthy();
  });

  it('is disabled when prop is true', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <Button disabled onPress={onPress}>
        Disabled
      </Button>
    );

    expect(getByRole('button')).toHaveAccessibilityState({ disabled: true });
  });
});
```

---

## Migration Path

### Phase 1: Theme System (Week 1)
- [ ] Add ThemeProvider to App.tsx
- [ ] Migrate colors to theme tokens
- [ ] Update existing components to use theme hooks

### Phase 2: Core Hooks (Week 2)
- [ ] Implement useAsync, useForm, useApi
- [ ] Document patterns
- [ ] Add to 2-3 screens

### Phase 3: Production Components (Week 3-4)
- [ ] Build TextField, Button, Card
- [ ] Add AsyncBoundary
- [ ] Migrate all screens to use new components

### Phase 4: Testing & Documentation (Week 5)
- [ ] Add unit tests
- [ ] Document component API
- [ ] Create Storybook stories
- [ ] Team training

