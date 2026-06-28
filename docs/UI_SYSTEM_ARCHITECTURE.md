# Quad360 UI System Architecture
**Production-Grade Component System for 1M+ Users**

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Component Hierarchy](#component-hierarchy)
3. [Directory Structure](#directory-structure)
4. [Component API Guidelines](#component-api-guidelines)
5. [Accessibility Standards](#accessibility-standards)
6. [Responsive Design System](#responsive-design-system)
7. [State Management Patterns](#state-management-patterns)
8. [Performance Optimization](#performance-optimization)

---

## Design Principles

### 1. **Composition Over Inheritance**
```
❌ AVOID: Extended base classes
const ExtendedButton = Button.extend({ /* ... */ });

✅ USE: Slot-based composition
<Button variant="primary" icon={<Icon />} loading={isLoading} />
```

### 2. **Props Over Context (for styling)**
```
❌ AVOID: Global theme context for every prop
<ThemeContext.Provider value={darkMode}>
  <Button />
</ThemeContext.Provider>

✅ USE: Explicit props with sensible defaults
<Button variant="primary" size="lg" />
```

### 3. **Single Responsibility**
```
❌ AVOID: God components
<Card title="Users" data={users} onEdit={edit} onDelete={delete} ... />

✅ USE: Focused components
<Card>
  <CardHeader title="Users" />
  <CardBody>{/* content */}</CardBody>
  <CardFooter actions={[...]} />
</Card>
```

### 4. **Accessibility First**
```
✅ ALWAYS:
- Semantic HTML (button not div)
- aria-labels for icons
- keyboard navigation
- Focus visible states
- Color contrast ratios (WCAG AA)
```

### 5. **Progressive Enhancement**
```
✅ USE:
- HTML semantics as foundation
- CSS for presentation
- JavaScript for enhancement
- Graceful degradation without JS
```

---

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                   QUAD360 UI SYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LEVEL 1: PRIMITIVES (Atomic)                              │
│  ├─ Button, Input, Select, Checkbox, Radio                 │
│  ├─ Text, Heading, Link                                    │
│  └─ Icon, Avatar, Badge                                    │
│                                                             │
│  LEVEL 2: LAYOUT (Molecular)                               │
│  ├─ Box, Flex, Grid, Stack                                 │
│  ├─ Card, Paper, Modal                                     │
│  └─ Container, Spacer, Divider                             │
│                                                             │
│  LEVEL 3: COMPOSITE (Molecular)                            │
│  ├─ FormField (Input + Label + Error)                      │
│  ├─ SearchInput (Input + Icon + Clear)                     │
│  ├─ CurrencyInput (Input + Currency symbol)                │
│  ├─ MetricCard (Card + Icon + Value + Trend)               │
│  └─ DataTable (Table + Pagination + Sorting)               │
│                                                             │
│  LEVEL 4: MODULES (Organismic)                             │
│  ├─ Form (FormField[] + validation)                        │
│  ├─ Dialog (Modal + Actions)                               │
│  ├─ Drawer (Offcanvas)                                     │
│  ├─ Popover, Tooltip                                       │
│  ├─ Notification, Toast                                    │
│  └─ Skeleton (Loading state)                               │
│                                                             │
│  LEVEL 5: SCREENS (Organisms)                              │
│  ├─ Dashboard (Module[] + Layout)                          │
│  ├─ ListScreen (DataTable + Filters + Actions)             │
│  ├─ DetailScreen (Form + Sidebar)                          │
│  └─ SettingsScreen (FormGroup[] + Navigation)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── components/
│   ├── primitives/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.types.ts
│   │   │   ├── Button.styles.ts
│   │   │   ├── Button.test.tsx
│   │   │   └── index.ts
│   │   ├── Input/
│   │   ├── Checkbox/
│   │   ├── Text/
│   │   └── Icon/
│   │
│   ├── layout/
│   │   ├── Box/
│   │   ├── Flex/
│   │   ├── Grid/
│   │   ├── Card/
│   │   └── Container/
│   │
│   ├── composite/
│   │   ├── FormField/
│   │   ├── CurrencyInput/
│   │   ├── MetricCard/
│   │   ├── DataTable/
│   │   └── SearchInput/
│   │
│   ├── modules/
│   │   ├── Dialog/
│   │   ├── Form/
│   │   ├── Popover/
│   │   ├── Notification/
│   │   └── Skeleton/
│   │
│   └── index.ts (exports all)
│
├── theme/
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   ├── breakpoints.ts
│   └── shadows.ts
│
├── hooks/
│   ├── useResponsive.ts
│   ├── useAsync.ts
│   ├── useClickOutside.ts
│   ├── useFocus.ts
│   └── useKeyboard.ts
│
└── utils/
    ├── cn.ts (classname merger)
    ├── createFactory.ts (component factory)
    └── testUtils.ts
```

---

## Component API Guidelines

### Props Pattern

```typescript
// ✅ GOOD: Clear, predictable props
interface ButtonProps {
  // Visual
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'danger' | 'success';

  // State
  disabled?: boolean;
  loading?: boolean;
  isActive?: boolean;

  // Content
  children?: ReactNode;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';

  // Behavior
  onClick?: (e: MouseEvent) => void;
  type?: 'button' | 'submit' | 'reset';

  // Accessibility
  aria-label?: string;
  aria-pressed?: boolean;
  aria-describedby?: string;

  // Styling
  className?: string;
  style?: CSSProperties;

  // Layout
  fullWidth?: boolean;
}

// ❌ AVOID: Catch-all props
interface ButtonProps {
  [key: string]: any; // Never!
}
```

### Naming Conventions

```typescript
// ✅ Boolean props start with is/has/should/can
<Checkbox isChecked={true} />
<Button isLoading={true} />
<Field hasError={true} />
<Form canSubmit={true} />

// ✅ Event handlers are on + PastTense
<Button onClick={() => {}} />
<Input onChange={(val) => {}} />
<Modal onClose={() => {}} />

// ✅ Sizes: xs, sm, md, lg, xl (not small, large)
<Button size="md" />

// ✅ Variants describe visual differences
<Button variant="primary" | "secondary" | "ghost" />

// ✅ No abbreviations (except well-known: min, max, id)
✓ isVisible, maxWidth, minHeight
✗ isVis, mxW, mnH
```

### Composition API

```typescript
// ✅ Composable subcomponents
<Dialog>
  <DialogHeader title="Delete item?" />
  <DialogBody>Are you sure?</DialogBody>
  <DialogFooter>
    <Button variant="ghost">Cancel</Button>
    <Button variant="danger">Delete</Button>
  </DialogFooter>
</Dialog>

// ✅ Render props for advanced use cases
<DataTable
  data={items}
  renderCell={(item, column) => <Custom>{item[column]}</Custom>}
/>

// ✅ Slots pattern for layout flexibility
<Card>
  <Card.Header>{/* Custom header */}</Card.Header>
  <Card.Body>{/* Custom body */}</Card.Body>
  <Card.Footer>{/* Custom footer */}</Card.Footer>
</Card>
```

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

#### Semantic HTML
```typescript
// ✅ Use semantic elements
<button>Click me</button>
<nav>{/* navigation */}</nav>
<main>{/* main content */}</main>
<section>{/* grouped content */}</section>
<article>{/* self-contained content */}</article>

// ❌ Avoid generic divs for interactive elements
<div onClick={...}>Click me</div> // NO! Not accessible
```

#### Keyboard Navigation
```typescript
// ✅ All interactive elements must be keyboard accessible
export function Button({ children, onClick, disabled, ...props }: ButtonProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <button
      {...props}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      {children}
    </button>
  );
}
```

#### ARIA Labels
```typescript
// ✅ All icons need labels
<button aria-label="Close dialog">
  <Icon.Close />
</button>

// ✅ Form fields need labels
<label htmlFor="email">Email Address</label>
<input id="email" type="email" />

// ✅ Live regions for dynamic updates
<div role="status" aria-live="polite">
  {successMessage}
</div>

// ✅ Error associations
<input
  id="password"
  aria-describedby="password-error"
  aria-invalid={hasError}
/>
<span id="password-error" role="alert">
  {errorMessage}
</span>
```

#### Color Contrast
```typescript
// ✅ Minimum contrast ratios (WCAG AA)
// Normal text: 4.5:1
// Large text (18pt+): 3:1
// UI components: 3:1

const Colors = {
  text: {
    primary: '#0f172a',    // 14.5:1 on white
    secondary: '#475569',  // 7.2:1 on white
    muted: '#94a3b8',      // 4.5:1 on white
    // ✗ Avoid: '#b0b9c3' (3.2:1 - fails WCAG AA)
  },
};
```

#### Focus Indicators
```typescript
// ✅ Visible focus states (at least 3px)
button {
  &:focus-visible {
    outline: 3px solid #3b82f6;
    outline-offset: 2px;
  }
}

// ✓ Good: High contrast, clearly visible
// ✗ Bad: Same color as background
// ✗ Bad: Less than 2px thickness
```

#### Responsive Text
```typescript
// ✅ Zoom to 200% must still work
// ✅ Don't disable zoom
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />

// ❌ Disable zoom (breaks accessibility)
// user-scalable=no

// ✅ Relative units (em, rem)
button {
  font-size: 1rem; // ✓ Scales with user prefs
  padding: 0.75rem; // ✓ Scales with user prefs
}

// ❌ Fixed units
button {
  font-size: 16px; // ✗ Doesn't scale
}
```

#### Form Accessibility
```typescript
// ✅ Complete form pattern
<FormField
  label="Email Address"
  htmlFor="email"
  required
  error={errors.email}
>
  <Input
    id="email"
    name="email"
    type="email"
    placeholder="you@example.com"
    aria-describedby={errors.email ? 'email-error' : undefined}
    aria-required={true}
    required
  />
  {errors.email && (
    <span id="email-error" role="alert" className="error">
      {errors.email}
    </span>
  )}
</FormField>
```

---

## Responsive Design System

### Breakpoints

```typescript
// src/theme/breakpoints.ts

export const Breakpoints = {
  xs: 0,      // Mobile
  sm: 640,    // Tablet
  md: 768,    // Small desktop
  lg: 1024,   // Desktop
  xl: 1280,   // Large desktop
  '2xl': 1536, // Extra large
} as const;

// ✅ Mobile-first approach
<Grid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} />

// ✅ Semantic breakpoint names
const isMobile = useResponsive('xs'); // 0-640px
const isTablet = useResponsive('sm'); // 640-768px
const isDesktop = useResponsive('md'); // 768+px
```

### Responsive Hook

```typescript
// src/hooks/useResponsive.ts

export function useResponsive(breakpoint: keyof typeof Breakpoints): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      `(min-width: ${Breakpoints[breakpoint]}px)`
    );

    const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Check initial value
    setMatches(query.matches);

    // Listen for changes
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [breakpoint]);

  return matches;
}

// Usage:
function MyComponent() {
  const isMobile = useResponsive('xs');
  return isMobile ? <MobileNav /> : <DesktopNav />;
}
```

### Responsive Props Pattern

```typescript
// ✅ Accept responsive props
interface GridProps {
  columns?: number | ResponsiveValue<number>;
  gap?: number | ResponsiveValue<number>;
}

type ResponsiveValue<T> = {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
};

// Usage:
<Grid
  columns={{ xs: 1, sm: 2, md: 3, lg: 4 }}
  gap={{ xs: 16, sm: 20, md: 24 }}
/>

// ✅ Implement with CSS variables
export function Grid({ columns, gap, children }: GridProps) {
  const style = {
    '--grid-columns-xs': columns?.xs ?? 1,
    '--grid-columns-sm': columns?.sm ?? columns?.xs ?? 1,
    '--grid-gap-xs': gap?.xs ?? 0,
    '--grid-gap-sm': gap?.sm ?? gap?.xs ?? 0,
  } as CSSProperties;

  return (
    <div
      style={style}
      className={cn(
        'grid',
        'gap-[var(--grid-gap-xs)] sm:gap-[var(--grid-gap-sm)]',
        'grid-cols-[var(--grid-columns-xs)] sm:grid-cols-[var(--grid-columns-sm)]',
      )}
    >
      {children}
    </div>
  );
}
```

### Touch Targets

```typescript
// ✅ Minimum 44x44px (WCAG) for touch devices
button {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px; // Still works at this size
}

// ✅ Increase spacing on mobile
@media (max-width: 640px) {
  button {
    padding: 14px 20px; // Larger on small screens
  }
}
```

---

## State Management Patterns

### Loading States

```typescript
// ✅ Explicit loading prop
<Button loading={isLoading}>
  {isLoading ? 'Saving...' : 'Save'}
</Button>

// ✅ Disable while loading
<Button loading={isLoading} disabled={isLoading} />

// ✅ Show spinner + text
<Button loading={isLoading} loadingText="Saving...">
  Save
</Button>
```

### Empty States

```typescript
// ✅ Clear empty state messaging
<EmptyState
  icon={<Icon.FileText />}
  title="No transactions yet"
  description="Start by adding your first transaction"
  action={<Button>Add Transaction</Button>}
/>

// ✅ Empty state component pattern
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-4xl opacity-50">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

### Error States

```typescript
// ✅ Clear error messaging
interface FieldErrorProps {
  error?: string;
  success?: string;
}

<FormField
  label="Email"
  error={errors.email}
  success={touched.email && !errors.email ? 'Verified' : undefined}
>
  <Input name="email" />
</FormField>

// ✅ Inline error handling
<DataTable
  error={error}
  renderError={(error) => (
    <div role="alert" className="text-red-600">
      Failed to load data: {error.message}
    </div>
  )}
/>
```

### Skeleton Loading

```typescript
// ✅ Skeleton states for perceived performance
<Skeleton isLoading={isLoading} count={3}>
  {data?.map(item => (
    <Card key={item.id}>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </Card>
  ))}
</Skeleton>
```

---

## Performance Optimization

### Component Memoization

```typescript
// ✅ Memoize expensive components
export const MetricCard = memo(function MetricCard({
  label,
  value,
  trend,
}: MetricCardProps) {
  return (
    <Card>
      <p className="text-sm text-gray-600">{label}</p>
      <div className="text-2xl font-bold">{value}</div>
      {trend && <TrendIndicator trend={trend} />}
    </Card>
  );
}, (prev, next) => {
  // Custom comparison (optional)
  return (
    prev.label === next.label &&
    prev.value === next.value &&
    prev.trend === next.trend
  );
});
```

### Dynamic Imports

```typescript
// ✅ Lazy load heavy components
const DataTableAdvanced = lazy(() => import('./DataTableAdvanced'));

<Suspense fallback={<Skeleton />}>
  <DataTableAdvanced data={largeDataset} />
</Suspense>
```

### CSS-in-JS Optimization

```typescript
// ✅ Use CSS modules or styled-components with proper caching
// Avoid creating styles in render

// ❌ BAD: Creates new style object every render
function Button() {
  const style = { color: variant === 'primary' ? 'blue' : 'gray' };
  return <button style={style} />;
}

// ✅ GOOD: Use className with pre-computed styles
function Button({ variant }) {
  return <button className={cn('btn', `btn--${variant}`)} />;
}
```

### Render Optimization

```typescript
// ✅ Use useCallback for event handlers
export function DataTable({ data, onSort }) {
  const handleSort = useCallback((column: string) => {
    onSort(column);
  }, [onSort]);

  return (
    <table>
      {/* headers use handleSort */}
    </table>
  );
}

// ✅ Virtualize long lists
<VirtualList
  items={items}
  height={400}
  itemHeight={60}
  renderItem={(item) => <ListItem item={item} />}
/>
```

---

## Summary: Component Maturity Checklist

For each component, ensure:

- [ ] **Props**: Documented, typed, consistent naming
- [ ] **Accessibility**: WCAG 2.1 AA compliant
- [ ] **States**: Loading, empty, error, success
- [ ] **Responsiveness**: Works at xs-2xl breakpoints
- [ ] **Keyboard Navigation**: Full keyboard support
- [ ] **Focus Management**: Visible focus indicators
- [ ] **Testing**: Unit + integration tests
- [ ] **Storybook**: Visual documentation
- [ ] **Performance**: Memoized, optimized renders
- [ ] **TypeScript**: Fully typed, no `any`
- [ ] **Mobile**: Touch-friendly (44x44px min)
- [ ] **RTL**: Supports right-to-left languages

This foundation enables scaling to 1M+ users with confidence. 🚀
