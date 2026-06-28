# Production-Grade Component System Architecture

## Executive Summary

This document outlines a scalable, accessible, production-ready component system for the SME financial app. It covers:
- Component hierarchy and reusability patterns
- State management best practices
- Accessibility-first approach
- Performance optimization
- Developer experience
- Real-world production examples

---

## Part 1: Design System Foundations

### 1.1 Theme System (Extensible)

**Problem**: Current theme is hardcoded dark mode only. Startup needs:
- Light/dark mode support
- Brand color customization
- Dynamic theming for white-label
- Consistent spacing/typography scales

**Solution**: Create extensible theme provider with constants

```typescript
// src/theme/tokens.ts
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  pill: 999,
} as const;

export const TYPOGRAPHY = {
  heading: {
    xl: { fontSize: 24, fontWeight: '800', lineHeight: 32 },
    lg: { fontSize: 20, fontWeight: '800', lineHeight: 28 },
    md: { fontSize: 18, fontWeight: '700', lineHeight: 26 },
    sm: { fontSize: 16, fontWeight: '700', lineHeight: 24 },
  },
  body: {
    lg: { fontSize: 16, fontWeight: '500', lineHeight: 24 },
    md: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
    sm: { fontSize: 13, fontWeight: '500', lineHeight: 20 },
  },
  label: {
    lg: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
    md: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
    sm: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  },
  caption: {
    md: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
    sm: { fontSize: 11, fontWeight: '500', lineHeight: 16 },
  },
} as const;

export const SHADOWS = {
  none: { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 12 },
} as const;

export type SpacingKey = keyof typeof SPACING;
export type RadiusKey = keyof typeof RADIUS;
export type ShadowKey = keyof typeof SHADOWS;
```

```typescript
// src/theme/themes.ts
export interface ThemeColors {
  // Backgrounds
  bg: string;           // Page background
  surface: string;      // Card/surface background
  surfaceVariant: string; // Alternative surface
  border: string;       // Border color
  
  // Text
  textPrimary: string;     // High contrast foreground
  textSecondary: string;   // Secondary text
  textMuted: string;       // Muted/hint text
  textInverse: string;     // Inverse for overlays
  
  // Semantic
  success: string;      // Income/positive
  danger: string;       // Expense/negative
  warning: string;      // Warning state
  info: string;         // Info state
  
  // Financial
  income: string;       // Revenue/income
  expense: string;      // Costs/expense
  asset: string;        // Assets
  liability: string;    // Debt/liability
  equity: string;       // Equity/net worth
  
  // Primary brand
  primary: string;      // Primary action color
  primaryHover: string; // Hover state
  primaryActive: string;// Active state
}

export const LIGHT_THEME: ThemeColors = {
  bg: '#ffffff',
  surface: '#f8f9fa',
  surfaceVariant: '#f0f1f3',
  border: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textInverse: '#ffffff',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  income: '#10b981',
  expense: '#ef4444',
  asset: '#3b82f6',
  liability: '#f97316',
  equity: '#8b5cf6',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryActive: '#1e40af',
};

export const DARK_THEME: ThemeColors = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceVariant: '#334155',
  border: '#475569',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textInverse: '#1e293b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#60a5fa',
  income: '#10b981',
  expense: '#ef4444',
  asset: '#60a5fa',
  liability: '#f97316',
  equity: '#a78bfa',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryActive: '#1d4ed8',
};

export type ThemeMode = 'light' | 'dark';

// Theme provider for context
export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  typography: typeof TYPOGRAPHY;
  shadows: typeof SHADOWS;
}

export function createTheme(mode: ThemeMode = 'dark'): Theme {
  return {
    mode,
    colors: mode === 'light' ? LIGHT_THEME : DARK_THEME,
    spacing: SPACING,
    radius: RADIUS,
    typography: TYPOGRAPHY,
    shadows: SHADOWS,
  };
}
```

### 1.2 Theme Provider Context

```typescript
// src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useState, useMemo } from 'react';
import { createTheme, Theme, ThemeMode } from '../theme/themes';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  const theme = useMemo(() => createTheme(mode), [mode]);

  const toggleMode = () => {
    setMode(m => m === 'dark' ? 'light' : 'dark');
  };

  const value: ThemeContextValue = {
    theme,
    mode,
    toggleMode,
    setMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context.theme;
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void, () => void] {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return [context.mode, context.setMode, context.toggleMode];
}
```

---

## Part 2: Core Component Patterns

### 2.1 State Management Hooks

#### useAsync Hook (for any async operation)

```typescript
// src/hooks/useAsync.ts
import { useState, useCallback, useEffect } from 'react';

interface AsyncState<T> {
  status: 'idle' | 'pending' | 'success' | 'error';
  data: T | null;
  error: Error | null;
}

interface UseAsyncOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  immediate?: boolean;
}

export function useAsync<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncOptions = {}
): AsyncState<T> & { execute: () => Promise<void> } {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'idle',
    data: null,
    error: null,
  });

  const execute = useCallback(async () => {
    setState({ status: 'pending', data: null, error: null });
    try {
      const result = await asyncFn();
      setState({ status: 'success', data: result, error: null });
      options.onSuccess?.(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState({ status: 'error', data: null, error: err });
      options.onError?.(err);
    }
  }, [asyncFn, options]);

  useEffect(() => {
    if (options.immediate !== false && state.status === 'idle') {
      execute();
    }
  }, [execute, options.immediate, state.status]);

  return { ...state, execute };
}
```

**Usage:**
```typescript
const { status, data, error, execute } = useAsync(
  () => fetch('/api/endpoint').then(r => r.json()),
  { onSuccess: (data) => console.log('Loaded', data) }
);

return (
  <>
    {status === 'pending' && <Spinner />}
    {status === 'error' && <ErrorAlert error={error} retry={execute} />}
    {status === 'success' && <DataDisplay data={data} />}
  </>
);
```

#### useForm Hook (for form state + validation)

```typescript
// src/hooks/useForm.ts
import { useState, useCallback } from 'react';

export interface FormErrors<T> {
  [K in keyof T]?: string;
}

export interface UseFormOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void> | void;
  validate?: (values: T) => FormErrors<T>;
  onSuccess?: () => void;
}

export function useForm<T extends Record<string, any>>({
  initialValues,
  onSubmit,
  validate,
  onSuccess,
}: UseFormOptions<T>) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setValues(v => ({ ...v, [field]: value }));
  }, []);

  const setFieldTouched = useCallback((field: keyof T, touched = true) => {
    setTouched(t => ({ ...t, [field]: touched }));
  }, []);

  const handleSubmit = useCallback(async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    
    if (validate) {
      const newErrors = validate(values);
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
      onSuccess?.();
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Submit failed' } as any);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit, onSuccess]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setFieldValue,
    setFieldTouched,
    handleSubmit,
    reset,
  };
}
```

**Usage:**
```typescript
const form = useForm({
  initialValues: { email: '', password: '' },
  validate: (values) => ({
    ...(!values.email && { email: 'Email required' }),
    ...(!values.password && { password: 'Password required' }),
  }),
  onSubmit: (values) => api.login(values),
  onSuccess: () => navigate('dashboard'),
});

return (
  <Form onSubmit={form.handleSubmit}>
    <TextField
      label="Email"
      value={form.values.email}
      onChangeText={(email) => form.setFieldValue('email', email)}
      error={form.touched.email ? form.errors.email : undefined}
    />
    <Button loading={form.isSubmitting} onPress={form.handleSubmit}>
      Login
    </Button>
  </Form>
);
```

#### useApi Hook (for API calls with retry)

```typescript
// src/hooks/useApi.ts
import { useState, useCallback, useEffect, useRef } from 'react';

export interface ApiError {
  status: number;
  message: string;
  details?: any;
}

export interface UseApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  onSuccess?: (data: any) => void;
  onError?: (error: ApiError) => void;
  retry?: number;
  timeout?: number;
  immediate?: boolean;
}

export function useApi<T>(
  url: string,
  options: UseApiOptions = {}
) {
  const [state, setState] = useState<{
    status: 'idle' | 'pending' | 'success' | 'error';
    data: T | null;
    error: ApiError | null;
  }>({
    status: 'idle',
    data: null,
    error: null,
  });

  const retryCount = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (body?: any) => {
      if (abortController.current) {
        abortController.current.abort();
      }

      abortController.current = new AbortController();
      setState({ status: 'pending', data: null, error: null });

      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: abortController.current.signal,
          ...(options.timeout && { timeout: options.timeout }),
        });

        if (!response.ok) {
          const error: ApiError = {
            status: response.status,
            message: `HTTP ${response.status}`,
          };

          if (response.headers.get('content-type')?.includes('json')) {
            error.details = await response.json();
          }

          throw error;
        }

        const data = await response.json();
        setState({ status: 'success', data, error: null });
        options.onSuccess?.(data);
        retryCount.current = 0;

        return data;
      } catch (error) {
        const apiError: ApiError = error instanceof Error
          ? { status: 0, message: error.message }
          : error as ApiError;

        if ((options.retry || 0) > retryCount.current && apiError.status === 0) {
          // Network error, retry
          retryCount.current++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount.current));
          return fetchData(body);
        }

        setState({ status: 'error', data: null, error: apiError });
        options.onError?.(apiError);
        throw apiError;
      }
    },
    [url, options]
  );

  useEffect(() => {
    if (options.immediate !== false) {
      fetchData();
    }
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, [fetchData, options.immediate]);

  return {
    ...state,
    execute: fetchData,
    retry: () => fetchData(),
  };
}
```

---

## Part 3: Component Library (Production Components)

### 3.1 Base Components with Accessibility

See Part 4 for complete implementations...

---

## Part 4: Best Practices

### Accessibility Checklist
- [ ] All interactive elements have `accessibilityRole`
- [ ] All inputs have `accessibilityLabel` and `accessibilityHint`
- [ ] Color not the only indicator (use icons + text)
- [ ] Touch targets minimum 44px
- [ ] Focus states visible
- [ ] Live regions for dynamic content
- [ ] Semantic HTML structure (roles, headings)

### Performance Optimizations
- `useMemo` for expensive computations
- `useCallback` for stable function references
- `VirtualizedList` for large lists
- Image optimization
- Code splitting by route
- Bundle size monitoring

### State Management Principles
- Single source of truth per data type
- Derived state via selectors
- Immutable updates
- Avoid prop drilling (use context)
- Minimize re-renders

### Testing Strategy
- Unit tests for utilities and hooks
- Component tests with React Testing Library
- Integration tests for flows
- Visual regression testing
- E2E tests for critical paths
- Accessibility testing with axe-core

---

## Part 5: Real-World Examples

(See subsequent implementation files for complete examples)

