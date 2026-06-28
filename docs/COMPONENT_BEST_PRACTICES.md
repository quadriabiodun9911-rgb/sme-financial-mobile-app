# Component Architecture & Best Practices

Production-grade patterns for building scalable, maintainable UI systems.

## Design Principles

### 1. Single Responsibility
Each component has ONE reason to change. Keep components focused:

```typescript
// ❌ BAD: TransactionCard does too much
export const TransactionCard = ({ transaction, onEdit, onDelete, settings, user }) => {
  return (
    <View>
      {/* Formatting logic */}
      {/* Edit form */}
      {/* Delete confirmation */}
      {/* User preferences */}
    </View>
  );
};

// ✅ GOOD: Composition of focused components
export const TransactionCard = ({ transaction, onEdit, onDelete }) => {
  return (
    <Card>
      <TransactionDisplay transaction={transaction} />
      <TransactionActions onEdit={onEdit} onDelete={onDelete} />
    </Card>
  );
};
```

### 2. Props Over Configuration
Explicit props are better than nested config objects:

```typescript
// ❌ BAD: Config object hidden details
<Button config={{ variant: 'primary', size: 'md', disabled: false }} />

// ✅ GOOD: Explicit props reveal intent
<Button variant="primary" size="md" disabled={false} />
```

### 3. Composition Over Inheritance
Use React composition, not inheritance:

```typescript
// ❌ BAD: Inheritance for reuse
class BaseButton extends Component { /* ... */ }
class PrimaryButton extends BaseButton { /* ... */ }

// ✅ GOOD: Composition
export const Button = ({ variant = 'primary' }) => { /* ... */ };
```

### 4. Inversion of Control
Let parents control behavior, not the component:

```typescript
// ❌ BAD: Component controls behavior
export const TransactionList = () => {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');
  // Component controls everything
};

// ✅ GOOD: Parent controls, component renders
export const TransactionList = ({ transactions, filter, onFilterChange }) => {
  return (
    <FlatList
      data={filter === 'all' ? transactions : transactions.filter(...)}
      renderItem={/* ... */}
    />
  );
};
```

## Props API Design

### Naming Conventions

```typescript
// Event handlers: on + Action
onPress, onChange, onSelect, onDelete, onSubmit

// Boolean flags: is + Adjective or has + Noun
isLoading, isDisabled, hasError, isSelected

// Data: descriptive nouns
value, label, placeholder, error, items

// Styling: style + Element
style, inputStyle, labelStyle

// State setters: set + Property
setValue, setLoading
```

### Props Interface Template

```typescript
interface ComponentProps {
  // Required props first
  children: React.ReactNode;
  label: string;
  onPress: () => void;

  // Optional props with sensible defaults
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;

  // Styling (last)
  style?: ViewStyle;
  testID?: string;

  // Accessibility (last)
  accessibilityLabel?: string;
}
```

## Type Safety

### Generic Components

```typescript
// ✅ GOOD: Generic list component works with any data
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  onItemPress?: (item: T) => void;
}

export const List = <T,>({
  items,
  renderItem,
  keyExtractor,
  onItemPress,
}: ListProps<T>) => {
  return (
    <FlatList
      data={items}
      renderItem={({ item, index }) => (
        <TouchableOpacity onPress={() => onItemPress?.(item)}>
          {renderItem(item, index)}
        </TouchableOpacity>
      )}
      keyExtractor={(item) => keyExtractor(item)}
    />
  );
};

// Usage
<List
  items={transactions}
  renderItem={(tx) => <TransactionRow transaction={tx} />}
  keyExtractor={(tx) => tx.id}
  onItemPress={(tx) => navigate('Details', { id: tx.id })}
/>
```

## Accessibility Requirements

### Minimum Requirements for Each Component

1. **Semantic Role**
   ```typescript
   <View accessibilityRole="button" />
   <TextInput accessibilityRole="text" />
   <Text accessibilityRole="header" />
   ```

2. **Accessible Label**
   ```typescript
   <TouchableOpacity
     accessible
     accessibilityLabel="Delete transaction"
     accessibilityRole="button"
   />
   ```

3. **State Communication**
   ```typescript
   <TouchableOpacity
     accessibilityState={{ disabled, checked }}
     aria-busy={loading}
   />
   ```

4. **Error Association**
   ```typescript
   <TextInput
     aria-describedby={error ? `error-${id}` : undefined}
   />
   <Text nativeID={`error-${id}`} role="alert">
     {error}
   </Text>
   ```

5. **Keyboard Navigation**
   - All interactive elements reachable by Tab key
   - Focus indicator visible (3px minimum)
   - Proper tab order maintained

### Accessibility Checklist

- [ ] All interactive elements have `accessible={true}`
- [ ] All buttons have `accessibilityRole="button"`
- [ ] All inputs have `accessibilityLabel`
- [ ] All errors have `role="alert"`
- [ ] Form labels associated with inputs
- [ ] Focus indicators visible
- [ ] Color contrast ≥4.5:1 for text
- [ ] No information conveyed by color alone
- [ ] Focus trap in modals
- [ ] Keyboard shortcuts documented

## Error Handling Patterns

### Validation Errors

```typescript
interface FormState {
  values: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

const validateField = (name: string, value: any, rules: ValidationRules) => {
  for (const rule of rules) {
    const error = rule(value);
    if (error) return error;
  }
  return '';
};

const handleChange = (name: string, value: any) => {
  setState((prev) => ({
    ...prev,
    values: { ...prev.values, [name]: value },
    // Only validate if field was touched
    errors: prev.touched[name]
      ? { ...prev.errors, [name]: validateField(name, value, rules[name]) }
      : prev.errors,
  }));
};

const handleBlur = (name: string) => {
  setState((prev) => ({
    ...prev,
    touched: { ...prev.touched, [name]: true },
    errors: {
      ...prev.errors,
      [name]: validateField(name, state.values[name], rules[name]),
    },
  }));
};

const handleSubmit = async () => {
  // Validate all fields
  const allErrors = Object.entries(rules).reduce((acc, [name, fieldRules]) => {
    acc[name] = validateField(name, state.values[name], fieldRules);
    return acc;
  }, {});

  if (Object.values(allErrors).some((e) => e)) {
    setState((prev) => ({ ...prev, errors: allErrors }));
    return;
  }

  try {
    await api.submit(state.values);
    Alert.alert('Success', 'Form submitted');
  } catch (error) {
    setState((prev) => ({
      ...prev,
      errors: { ...prev.errors, submit: error.message },
    }));
  }
};
```

## Performance Optimization

### Memoization Strategy

```typescript
// ✅ GOOD: Memoize components that receive the same props
const TransactionRow = React.memo(({ transaction, onPress }) => {
  return (
    <TouchableOpacity onPress={() => onPress(transaction)}>
      <Text>{transaction.description}</Text>
    </TouchableOpacity>
  );
});

// ✅ GOOD: Custom comparison for complex props
const ComparisonMetrics = React.memo(
  (props: MetricsProps) => { /* ... */ },
  (prev, next) => {
    // Only re-render if these specific values change
    return (
      prev.revenue === next.revenue &&
      prev.expenses === next.expenses &&
      prev.currency === next.currency
    );
  }
);

// ✅ GOOD: Memoize callbacks to prevent unnecessary child renders
const Dashboard = ({ transactions }) => {
  const handleEditTransaction = useCallback(
    (id: string) => {
      navigate('Edit', { id });
    },
    [navigate]
  );

  return (
    <List
      items={transactions}
      renderItem={(tx) => (
        <TransactionRow
          key={tx.id}
          transaction={tx}
          onPress={handleEditTransaction} // Stable reference
        />
      )}
    />
  );
};
```

### Virtual Scrolling for Large Lists

```typescript
import { FlatList } from 'react-native';

<FlatList
  data={transactions}
  renderItem={({ item }) => <TransactionRow transaction={item} />}
  keyExtractor={(item) => item.id}
  // Performance optimizations
  removeClippedSubviews={true}         // Remove off-screen items
  maxToRenderPerBatch={10}             // Render 10 items per batch
  updateCellsBatchingPeriod={50}       // Batch updates every 50ms
  initialNumToRender={20}              // Initial items to render
  scrollEventThrottle={16}             // Throttle scroll events
/>
```

## State Management Patterns

### Local Component State

```typescript
// ✅ GOOD: Use local state for UI-only state
const [isExpanded, setIsExpanded] = useState(false);
const [selectedTab, setSelectedTab] = useState('overview');
```

### Derived State (Avoid)

```typescript
// ❌ BAD: Duplicating data creates sync issues
const [items, setItems] = useState([]);
const [count, setCount] = useState(0); // Derived, can get out of sync

// ✅ GOOD: Compute on render
const count = items.length;
```

### Context for Shared State

```typescript
// ✅ GOOD: Use micro-contexts for specific domains
const TransactionContext = createContext<TransactionContextValue>(null!);

export const TransactionProvider = ({ children }) => {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');

  const value = useMemo(
    () => ({ transactions, filter, setFilter }),
    [transactions, filter]
  );

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  );
};

// Usage: Only re-renders when this specific context changes
const { transactions } = useContext(TransactionContext);
```

## Testing Strategies

### Unit Tests

```typescript
// Test component behavior, not implementation
describe('Button', () => {
  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Click</Button>);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('is disabled when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Integration Tests

```typescript
// Test components working together
describe('TransactionForm', () => {
  it('submits form with valid data', async () => {
    const onSubmit = jest.fn();
    render(<TransactionForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Amount'), { text: '1000' });
    fireEvent.change(screen.getByLabelText('Description'), {
      text: 'Office supplies',
    });
    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        amount: 1000,
        description: 'Office supplies',
      });
    });
  });
});
```

## Documentation Template

```typescript
/**
 * Button component with multiple variants and sizes
 *
 * @component
 * @example
 * <Button variant="primary" onPress={() => console.log('clicked')}>
 *   Click me
 * </Button>
 *
 * @param props - Button props
 * @param props.children - Button label or content
 * @param props.onPress - Callback when button is pressed
 * @param props.variant - Visual variant (primary, secondary, etc.)
 * @param props.size - Button size (sm, md, lg)
 * @param props.disabled - Disable button
 * @param props.loading - Show loading spinner
 *
 * @returns {React.ReactElement} Button component
 */
export const Button = React.forwardRef<TouchableOpacity, ButtonProps>(
  (props, ref) => { /* ... */ }
);
```

## Common Pitfalls

### 1. Over-Memoization
```typescript
// ❌ BAD: Memoizing everything adds overhead
const MemoButton = React.memo(Button);
const MemoCard = React.memo(Card);

// ✅ GOOD: Memoize only expensive components
const ExpensiveList = React.memo(VirtualizedList);
```

### 2. Props Drilling
```typescript
// ❌ BAD: Passing through 5 layers
<Provider user={user} theme={theme} lang={lang} />

// ✅ GOOD: Use context for cross-cutting concerns
<ProviderContext.Provider value={{ user, theme, lang }}>
  {children}
</ProviderContext.Provider>
```

### 3. Missing Dependency Arrays
```typescript
// ❌ BAD: No dependency array
useEffect(() => {
  refreshData();
});

// ✅ GOOD: Explicit dependencies
useEffect(() => {
  refreshData();
}, [userId]); // Re-run when userId changes
```

### 4. Inline Object Props
```typescript
// ❌ BAD: Creates new object every render
<Component style={{ padding: 16, marginTop: 8 }} />

// ✅ GOOD: Extract style to constant
const styles = StyleSheet.create({
  container: { padding: 16, marginTop: 8 }
});
<Component style={styles.container} />
```

## Performance Checklist

- [ ] Components are properly memoized
- [ ] Expensive computations use `useMemo`
- [ ] Callbacks are wrapped with `useCallback`
- [ ] Dependency arrays are correct
- [ ] No object literals in render
- [ ] Large lists use virtual scrolling
- [ ] Images are optimized
- [ ] Unnecessary re-renders eliminated
- [ ] Bundle size monitored
- [ ] Performance metrics tracked

## Summary

**Well-designed components:**
- ✅ Have single responsibility
- ✅ Are fully typed
- ✅ Are accessible by default
- ✅ Handle errors gracefully
- ✅ Are performant
- ✅ Are well-tested
- ✅ Are well-documented
- ✅ Follow conventions

---

**Last Updated:** June 27, 2026  
**Version:** 1.0.0  
**Status:** Production Ready
