# Production Component System - Quick Reference

## Theme Tokens

```typescript
import { useTheme } from '../contexts/ThemeContext';

const theme = useTheme();

// Colors
theme.colors.primary          // Main brand color
theme.colors.success          // Income/positive
theme.colors.danger           // Expense/negative
theme.colors.textPrimary      // High contrast text
theme.colors.textMuted        // Hint text

// Spacing
theme.spacing.xs (4px)
theme.spacing.sm (8px)
theme.spacing.md (12px)
theme.spacing.lg (16px)
theme.spacing.xl (24px)
theme.spacing.xxl (32px)

// Borders
theme.radius.xs (4px)
theme.radius.sm (6px)
theme.radius.md (8px)
theme.radius.lg (10px)
theme.radius.pill (999px)

// Typography
theme.typography.heading.lg/md/sm
theme.typography.body.lg/md/sm
theme.typography.label.lg/md/sm
theme.typography.caption.md/sm
```

---

## Components API

### TextField

```typescript
<TextField
  label="Email"                    // Optional label
  type="email|text|password|..."   // Input type (default: text)
  value={value}                    // Controlled value
  onChangeText={(text) => {}}      // Change handler
  error={error}                    // Error message
  hint="Help text"                 // Additional hint
  placeholder="..."                // Placeholder
  disabled={false}                 // Disabled state
  loading={false}                  // Loading spinner
  required={true}                  // Required indicator
  showPasswordToggle={true}        // For password type
  variant="outline|filled|ghost"   // Style variant (default: outline)
  size="sm|md|lg"                  // Size (default: md)
  startIcon={<Icon />}             // Left icon
  endIcon={<Icon />}               // Right icon
  accessibilityLabel="..."         // Screen reader label
  accessibilityHint="..."          // Screen reader hint
/>
```

### Button

```typescript
<Button
  onPress={() => {}}               // Handler (required)
  variant="primary|secondary|..."  // Style (default: primary)
  size="sm|md|lg"                  // Size (default: md)
  loading={false}                  // Loading state
  disabled={false}                 // Disabled state
  fullWidth={false}                // Stretch to full width
  icon={<Icon />}                  // Left icon
  accessibilityLabel="..."         // Screen reader label
  accessibilityHint="..."          // Screen reader hint
>
  Click me
</Button>
```

### AsyncBoundary

```typescript
const { status, data, error, execute } = useAsync(fetchFn);

<AsyncBoundary
  status={status}                  // 'idle'|'pending'|'success'|'error'|'empty'
  data={data}                      // Data to display
  error={error}                    // Error object
  errorTitle="Failed"              // Error heading
  errorMessage="..."               // Error description
  onRetry={execute}                // Retry handler
  retryLabel="Retry"               // Retry button text
  emptyTitle="No data"             // Empty heading
  emptyMessage="..."               // Empty description
  emptyIcon="📭"                   // Empty icon emoji
  loadingComponent={<Loader />}    // Custom loader
  emptyComponent={<Empty />}       // Custom empty
  testID="test-id"                 // Testing ID
>
  {(data) => <Content data={data} />}
</AsyncBoundary>
```

---

## Hooks API

### useAsync

```typescript
const {
  status,    // 'idle' | 'pending' | 'success' | 'error'
  data,      // T | null
  error,     // Error | null
  execute,   // () => Promise<T>
} = useAsync(
  async () => {
    const res = await fetch('/api/endpoint');
    return res.json();
  },
  {
    onSuccess: (data) => {},      // Success callback
    onError: (error) => {},       // Error callback
    immediate: true,              // Auto-fetch on mount (default: true)
  }
);
```

### useForm

```typescript
const form = useForm({
  initialValues: {
    email: '',
    password: '',
  },
  validate: (values) => ({
    ...(!values.email && { email: 'Required' }),
    ...(!values.password && { password: 'Required' }),
  }),
  onSubmit: async (values) => {
    await api.login(values);
  },
  onSuccess: () => {
    navigate('dashboard');
  },
});

// Usage
form.values.email              // Current value
form.errors.email              // Error for field
form.touched.email             // Was field touched?
form.isSubmitting              // Currently submitting?

form.setFieldValue('email', value)    // Set field value
form.setFieldTouched('email', true)   // Mark as touched
form.handleSubmit()                   // Submit form
form.reset()                          // Reset to initial state
```

### useApi

```typescript
const {
  status,    // 'idle' | 'pending' | 'success' | 'error'
  data,      // T | null
  error,     // ApiError | null
  execute,   // (body?: any) => Promise<T>
  retry,     // () => void
} = useApi('/api/endpoint', {
  method: 'GET',                      // HTTP method
  headers: {},                        // Custom headers
  immediate: true,                    // Auto-fetch
  retry: 3,                           // Retry count
  timeout: 5000,                      // Request timeout (ms)
  onSuccess: (data) => {},            // Success callback
  onError: (error) => {},             // Error callback
});

// POST example
await execute({ name: 'John' });
```

---

## Common Patterns

### Login Form

```typescript
export function LoginScreen() {
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: (v) => ({
      ...(!v.email && { email: 'Email required' }),
      ...(!v.password && { password: 'Password required' }),
    }),
    onSubmit: async (v) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error('Login failed');
      return res.json();
    },
    onSuccess: () => navigate('dashboard'),
  });

  return (
    <ScrollView>
      <TextField
        label="Email"
        type="email"
        value={form.values.email}
        onChangeText={(v) => form.setFieldValue('email', v)}
        error={form.touched.email ? form.errors.email : undefined}
      />

      <TextField
        label="Password"
        type="password"
        showPasswordToggle
        value={form.values.password}
        onChangeText={(v) => form.setFieldValue('password', v)}
        error={form.touched.password ? form.errors.password : undefined}
      />

      <Button
        onPress={form.handleSubmit}
        loading={form.isSubmitting}
        fullWidth
      >
        Login
      </Button>
    </ScrollView>
  );
}
```

### Data List with Filters

```typescript
export function ListScreen() {
  const [search, setSearch] = useState('');

  const { status, data, error, execute } = useAsync(
    () => fetch(`/api/items?q=${search}`).then(r => r.json()),
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  return (
    <View>
      <TextField
        placeholder="Search..."
        value={search}
        onChangeText={setSearch}
      />

      <AsyncBoundary
        status={status}
        data={filtered}
        error={error}
        onRetry={execute}
        emptyMessage="No items found"
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

### Delete with Confirmation

```typescript
const handleDelete = (id: string) => {
  Alert.alert(
    'Delete Item',
    'Are you sure? This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            Alert.alert('Success', 'Item deleted');
            refetch(); // Refresh list
          } catch (error) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]
  );
};
```

---

## Styling Examples

### Using Theme in StyleSheet

```typescript
const theme = useTheme();

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
  },
  title: {
    ...theme.typography.heading.lg,
    color: theme.colors.textPrimary,
  },
  button: {
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
  },
});
```

---

## Accessibility Checklist (Per Component)

### For Every Text Input
- [ ] `accessibilityLabel` on input
- [ ] `accessibilityHint` for instructions
- [ ] `label` prop for visual label
- [ ] Error message announced

### For Every Button
- [ ] `accessibilityLabel` describing action
- [ ] Loading state announced as "Loading..."
- [ ] Disabled state marked

### For Every List
- [ ] Items have `accessibilityRole="button"` if clickable
- [ ] Empty state has `accessibilityLiveRegion="polite"`
- [ ] Load more button labeled clearly

### For Every Error
- [ ] Error text has `accessibilityRole="alert"`
- [ ] Error announced immediately
- [ ] Clear suggestion for fix

---

## Testing Utilities

```typescript
// In your test file
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../contexts/ThemeContext';

function renderWithTheme(component: React.ReactNode) {
  return render(
    <ThemeProvider>
      {component}
    </ThemeProvider>
  );
}

// Usage
test('button calls onPress', () => {
  const onPress = jest.fn();
  const { getByRole } = renderWithTheme(
    <Button onPress={onPress}>Click</Button>
  );

  fireEvent.press(getByRole('button'));
  expect(onPress).toHaveBeenCalled();
});

test('form validates email', async () => {
  const { getByPlaceholder, getByRole, queryByText } = renderWithTheme(
    <LoginForm />
  );

  fireEvent.press(getByRole('button'));

  await waitFor(() => {
    expect(queryByText(/email required/i)).toBeTruthy();
  });
});
```

---

## Performance Tips

```typescript
// ❌ Bad: Recreates object every render
render() {
  const style = { color: theme.colors.primary };
  return <View style={style} />;
}

// ✅ Good: Memoized object
const style = StyleSheet.create({
  text: { color: theme.colors.primary },
});
render() {
  return <View style={style.text} />;
}

// ✅ Good: Expensive computation memoized
const items = useMemo(() => {
  return data.filter(...).sort(...).map(...);
}, [data, filter, sort]);

// ✅ Good: Callback memoized
const handlePress = useCallback(() => {
  navigate('details');
}, [navigate]);
```

---

## Debugging Tips

### Console Logging
```typescript
// Log theme changes
useEffect(() => {
  console.log('Current theme:', theme.mode);
}, [theme.mode]);

// Log form state
useEffect(() => {
  console.log('Form values:', form.values);
  console.log('Form errors:', form.errors);
  console.log('Form touched:', form.touched);
}, [form.values, form.errors, form.touched]);
```

### React DevTools
- Inspect component tree
- Edit props in real-time
- View hooks state
- Track renders

### Network Debugging
```typescript
// Intercept all fetches
const originalFetch = window.fetch;
window.fetch = (...args) => {
  console.log('API Request:', args[0]);
  return originalFetch(...args).then(r => {
    console.log('API Response:', r.status);
    return r;
  });
};
```

---

**Quick Links:**
- 📖 [Component System Architecture](./COMPONENT_SYSTEM.md)
- 🛠️ [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- ✅ [Production Checklist](./PRODUCTION_CHECKLIST.md)
- 🎯 [This Quick Reference](./QUICK_REFERENCE.md)

