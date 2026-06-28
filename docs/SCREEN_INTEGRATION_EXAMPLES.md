# Screen Integration Examples

Real-world examples of how to refactor screens to use the production component library.

## Dashboard Screen Refactor

### Before: Monolithic Component (Large, Hard to Test)

```typescript
// ❌ OLD: 300+ lines, 15+ useMemo hooks, tight coupling
export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');

  // 15+ separate useMemo hooks for filtering, grouping, etc.
  const activeGoals = useMemo(() => goals.filter(...), [goals]);
  const achievedGoals = useMemo(() => goals.filter(...), [goals]);
  // ... many more

  const handleRefresh = async () => {
    setRefreshing(true);
    // Complex refresh logic
    setRefreshing(false);
  };

  return (
    <SafeAreaView>
      <ScrollView onMomentumScrollEnd={handleRefresh}>
        {/* Inline styling */}
        <View style={{ padding: 16, backgroundColor: Colors.bg }}>
          {/* Hardcoded layouts */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {/* Inline renderers */}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

### After: Composed Components (Maintainable, Testable)

```typescript
// ✅ NEW: Composed from reusable components, ~100 lines, clean separation
import { PaddedView, Row, Column, Spacer } from '@/components';
import { MetricCard } from '@/components/financial';
import { SkeletonCard } from '@/components/feedback';
import { useDashboardMetrics } from './hooks/useDashboardMetrics';

export default function DashboardScreen() {
  const { metrics, loading, error, refetch } = useDashboardMetrics();

  if (error) {
    return (
      <EmptyState
        icon={<AlertIcon />}
        title="Unable to Load Dashboard"
        description={error.message}
        actionLabel="Try Again"
        onAction={refetch}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} />
        }
      >
        <PaddedView padding={16}>
          <DashboardHeader user={metrics.user} />

          <Spacer height={20} />

          {loading ? (
            <DashboardSkeleton />
          ) : metrics.cards.length === 0 ? (
            <EmptyDashboardState onAddTransaction={() => navigate('AddTx')} />
          ) : (
            <DashboardMetrics metrics={metrics} />
          )}
        </PaddedView>
      </ScrollView>
    </SafeAreaView>
  );
}

// Composed subcomponent: Clear responsibility
function DashboardHeader({ user }: { user: User }) {
  return (
    <Column>
      <Text style={styles.greeting}>
        Hello, {user.businessName}
      </Text>
      <Text style={styles.date}>
        {new Date().toLocaleDateString()}
      </Text>
    </Column>
  );
}

// Composed subcomponent: Metrics display
function DashboardMetrics({ metrics }: { metrics: DashboardMetricsData }) {
  return (
    <Column gap={12}>
      <MetricCard
        label="Total Revenue"
        value={`₦${metrics.revenue.toLocaleString()}`}
        trend="up"
        trendValue={12.5}
        status="success"
        onPress={() => navigate('RevenueDetails')}
      />
      <MetricCard
        label="Total Expenses"
        value={`₦${metrics.expenses.toLocaleString()}`}
        trend="down"
        trendValue={8.2}
        status="error"
        onPress={() => navigate('ExpensesDetails')}
      />
      <MetricCard
        label="Net Profit"
        value={`₦${(metrics.revenue - metrics.expenses).toLocaleString()}`}
        status={metrics.revenue > metrics.expenses ? 'success' : 'error'}
      />
    </Column>
  );
}

// Composed subcomponent: Loading skeleton
function DashboardSkeleton() {
  return (
    <Column gap={12}>
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
    </Column>
  );
}

// Composed subcomponent: Empty state
function EmptyDashboardState({ onAddTransaction }: { onAddTransaction: () => void }) {
  return (
    <EmptyState
      icon={<AddTransactionIcon />}
      title="No Transactions Yet"
      description="Start tracking your business by adding your first transaction."
      actionLabel="Add Transaction"
      onAction={onAddTransaction}
    />
  );
}
```

## Transactions List Screen

### Refactored with Components

```typescript
import {
  Button,
  Input,
  Card,
  Column,
  Row,
  PaddedView,
  Badge,
} from '@/components';
import {
  TransactionCard,
  CurrencyDisplay,
} from '@/components/financial';
import { EmptyState, Skeleton } from '@/components/feedback';
import { useMemo, useState, useCallback } from 'react';
import { FlatList, View } from 'react-native';

export function TransactionsScreen() {
  const { transactions, loading, filter, setFilter, refetch } = useTransactionList();
  const [searchText, setSearchText] = useState('');

  // Memoize filtered results
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) =>
        tx.description.toLowerCase().includes(searchText.toLowerCase())
      ),
    [transactions, searchText]
  );

  const handleSelectTransaction = useCallback(
    (tx: Transaction) => {
      navigate('TransactionDetail', { id: tx.id });
    },
    [navigate]
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header with filters */}
      <PaddedView padding={16}>
        <Column gap={12}>
          <Input
            placeholder="Search transactions..."
            value={searchText}
            onChangeText={setSearchText}
            keyboardType="default"
          />

          {/* Filter badges */}
          <Row gap={8}>
            {['all', 'income', 'expense'].map((f) => (
              <Badge
                key={f}
                label={f.charAt(0).toUpperCase() + f.slice(1)}
                variant={filter === f ? 'default' : undefined}
                size="sm"
              />
            ))}
          </Row>

          {/* Summary metrics */}
          <Card padding="md">
            <Row justifyContent="space-between">
              <Column gap={4}>
                <Text style={styles.label}>Total Income</Text>
                <CurrencyDisplay
                  amount={transactions
                    .filter((t) => t.type === 'income')
                    .reduce((a, t) => a + t.amount, 0)}
                  currency="₦"
                  variant="income"
                  size="lg"
                />
              </Column>

              <Column gap={4}>
                <Text style={styles.label}>Total Expense</Text>
                <CurrencyDisplay
                  amount={transactions
                    .filter((t) => t.type === 'expense')
                    .reduce((a, t) => a + t.amount, 0)}
                  currency="₦"
                  variant="expense"
                  size="lg"
                />
              </Column>
            </Row>
          </Card>
        </Column>
      </PaddedView>

      {/* List */}
      <FlatList
        data={filteredTransactions}
        renderItem={({ item }) => (
          <PaddedView paddingH={16} paddingV={8}>
            <TransactionCard
              transaction={item}
              onPress={() => handleSelectTransaction(item)}
            />
          </PaddedView>
        )}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          loading ? (
            <PaddedView padding={16}>
              <Skeleton count={5} height={60} borderRadius={8} />
            </PaddedView>
          ) : (
            <EmptyState
              title="No Transactions"
              description="Add your first transaction to get started."
              actionLabel="Add Transaction"
              onAction={() => navigate('AddTransaction')}
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} />
        }
      />
    </View>
  );
}
```

## Settings Form Refactor

### Before: Monolithic with Inline Styles

```typescript
// ❌ OLD: Mixed concerns, no reusable form logic
export default function SettingsScreen() {
  const [form, setForm] = useState({ currency: '$', minReserve: '' });

  const handleSave = () => {
    // Validation mixed with UI logic
    if (!form.minReserve || isNaN(parseFloat(form.minReserve))) {
      setErrors({ minReserve: 'Invalid' });
      return;
    }
    updateSettings(form);
  };

  return (
    <View>
      <TextInput
        style={{ padding: 12, borderWidth: 1, borderColor: '#ccc' }}
        value={form.minReserve}
        onChangeText={(v) => setForm({ ...form, minReserve: v })}
      />
      <TouchableOpacity style={{ backgroundColor: 'blue', padding: 12 }}>
        <Text>Save</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### After: Composed with Validation

```typescript
// ✅ NEW: Separated concerns, reusable form logic
import { FormField, CurrencyInput, Button } from '@/components';
import { Column, PaddedView } from '@/components/layout';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/common';
import { useForm } from '@/hooks/useForm';

const VALIDATION_RULES = {
  minReserve: [
    (val: string) => (!val ? 'Required' : ''),
    (val: string) => (isNaN(parseFloat(val)) ? 'Must be a number' : ''),
    (val: string) => (parseFloat(val) < 0 ? 'Must be positive' : ''),
  ],
  targetMargin: [
    (val: string) => (!val ? 'Required' : ''),
    (val: string) => {
      const num = parseFloat(val);
      return isNaN(num) ? 'Must be a number' : '';
    },
    (val: string) => {
      const num = parseFloat(val);
      return num < 0 || num > 100 ? 'Must be 0-100' : '';
    },
  ],
};

export default function SettingsScreen() {
  const { values, errors, touched, setValues, setTouched, validate } = useForm(
    { minReserve: '', targetMargin: '', currency: '₦' },
    VALIDATION_RULES
  );

  const handleChange = (name: string, value: any) => {
    setValues({ ...values, [name]: value });
  };

  const handleBlur = (name: string) => {
    setTouched({ ...touched, [name]: true });
  };

  const handleSave = async () => {
    if (!validate()) return;

    try {
      await updateSettings(values);
      Alert.alert('Success', 'Settings saved');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <PaddedView padding={16}>
      <Column gap={20}>
        {/* My Business Card */}
        <Card>
          <CardHeader>
            <Text style={styles.cardTitle}>My Business</Text>
          </CardHeader>
          <CardBody>
            <Column gap={16}>
              <CurrencyInput
                label="Minimum Reserve"
                value={values.minReserve}
                onChangeText={(v) => handleChange('minReserve', v)}
                currency={values.currency}
                error={touched.minReserve ? errors.minReserve : undefined}
                required
                helperText="The app warns if you fall below this amount"
              />

              <FormField
                label="Target Profit Margin"
                value={values.targetMargin}
                onChangeText={(v) => handleChange('targetMargin', v)}
                error={touched.targetMargin ? errors.targetMargin : undefined}
                required
                keyboardType="numeric"
                placeholder="65"
                helperText="Percentage of revenue you want as profit"
              />
            </Column>
          </CardBody>
          <CardFooter>
            <Row gap={12} justifyContent="flex-end">
              <Button variant="secondary" onPress={() => navigate('Dashboard')}>
                Cancel
              </Button>
              <Button variant="primary" onPress={handleSave}>
                Save
              </Button>
            </Row>
          </CardFooter>
        </Card>

        {/* Tax Settings Card */}
        <Card>
          <CardHeader>
            <Text style={styles.cardTitle}>Tax Settings</Text>
          </CardHeader>
          <CardBody>
            <FormField
              label="Default Tax Rate"
              value={values.defaultTaxRate}
              onChangeText={(v) => handleChange('defaultTaxRate', v)}
              keyboardType="numeric"
              placeholder="0"
              helperText="Applied to new transactions (can override per transaction)"
            />
          </CardBody>
        </Card>
      </Column>
    </PaddedView>
  );
}
```

## Form Hooks Pattern

### Custom Form Hook for Validation

```typescript
// hooks/useForm.ts
import { useState, useCallback } from 'react';

type ValidationRule = (value: any) => string; // Returns error message or ''
type ValidationRules = Record<string, ValidationRule[]>;

export const useForm = <T extends Record<string, any>>(
  initialValues: T,
  rules: Partial<Record<keyof T, ValidationRule[]>> = {}
) => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const validateField = useCallback(
    (name: keyof T, value: any) => {
      const fieldRules = rules[name];
      if (!fieldRules) return '';

      for (const rule of fieldRules) {
        const error = rule(value);
        if (error) return error;
      }
      return '';
    },
    [rules]
  );

  const validate = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(values).forEach((key) => {
      const error = validateField(key as keyof T, values[key as keyof T]);
      if (error) {
        newErrors[key as keyof T] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, validateField]);

  const handleChange = useCallback(
    (name: keyof T, value: any) => {
      setValues((prev) => ({ ...prev, [name]: value }));

      // Validate on change if field was touched
      if (touched[name]) {
        const error = validateField(name, value);
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    },
    [touched, validateField]
  );

  const handleBlur = useCallback((name: keyof T) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, values[name]);
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, [values, validateField]);

  return {
    values,
    setValues,
    errors,
    touched,
    setTouched,
    validate,
    handleChange,
    handleBlur,
  };
};
```

## Usage Example

```typescript
const { values, errors, touched, handleChange, handleBlur, validate } = useForm(
  { email: '', password: '' },
  {
    email: [
      (val) => (!val ? 'Required' : ''),
      (val) => (!val.includes('@') ? 'Invalid email' : ''),
    ],
    password: [
      (val) => (!val ? 'Required' : ''),
      (val) => (val.length < 8 ? 'Minimum 8 characters' : ''),
    ],
  }
);

return (
  <FormField
    label="Email"
    value={values.email}
    onChangeText={(v) => handleChange('email', v)}
    onBlur={() => handleBlur('email')}
    error={touched.email ? errors.email : undefined}
    required
  />
);
```

## Layout Patterns

### Consistent Spacing with Layout Components

```typescript
import { Column, Row, PaddedView, Spacer } from '@/components/layout';

// ✅ Good: Semantic, consistent spacing
<PaddedView padding={16}>
  <Column gap={12}>
    <Text>Header</Text>

    <Spacer height={8} />

    <Row gap={8} justifyContent="space-between">
      <Text>Left</Text>
      <Text>Right</Text>
    </Row>

    <Spacer height={16} />

    <Button fullWidth>Action</Button>
  </Column>
</PaddedView>
```

## Summary: Benefits of Refactoring

| Aspect | Before | After |
|--------|--------|-------|
| Lines per screen | 300+ | ~100 |
| Reusable components | Few | Many |
| Testability | Hard | Easy |
| Accessibility | Manual | Built-in |
| Type safety | Partial | Complete |
| Loading states | Missing | Included |
| Error handling | Scattered | Centralized |
| Theme consistency | Manual | Automatic |
| Bundle size | Large | ~20KB |
| Maintenance | Hard | Easy |

---

**Next Steps:**
1. Convert one screen per week
2. Build component library coverage
3. Create Storybook for visual documentation
4. Set up component testing harness
5. Monitor performance metrics

**Last Updated:** June 27, 2026
