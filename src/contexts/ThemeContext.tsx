import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  bg: string;
  surface: string;
  surfaceVariant: string;
  border: string;
  muted: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ThemeRadius {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  typography: {
    heading: { lg: any; md: any; sm: any };
    body: { lg: any; md: any; sm: any };
    label: { lg: any; md: any; sm: any };
    caption: { md: any; sm: any };
  };
  shadows: {
    sm: any;
    md: any;
    lg: any;
  };
}

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#eab308',
    info: '#06b6d4',
    textPrimary: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    bg: '#0f172a',
    surface: '#1e293b',
    surfaceVariant: '#334155',
    border: '#334155',
    muted: '#475569',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { xs: 4, sm: 6, md: 8, lg: 10, pill: 999 },
  typography: {
    heading: {
      lg: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
      md: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
      sm: { fontSize: 20, fontWeight: '700', lineHeight: 28 },
    },
    body: {
      lg: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
      md: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
      sm: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
    },
    label: {
      lg: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
      md: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
      sm: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
    },
    caption: {
      md: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
      sm: { fontSize: 10, fontWeight: '400', lineHeight: 14 },
    },
  },
  shadows: {
    sm: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    md: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
    lg: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  },
};

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#eab308',
    info: '#06b6d4',
    textPrimary: '#1e293b',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    bg: '#f8fafc',
    surface: '#ffffff',
    surfaceVariant: '#f1f5f9',
    border: '#e2e8f0',
    muted: '#f1f5f9',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { xs: 4, sm: 6, md: 8, lg: 10, pill: 999 },
  typography: {
    heading: {
      lg: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
      md: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
      sm: { fontSize: 20, fontWeight: '700', lineHeight: 28 },
    },
    body: {
      lg: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
      md: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
      sm: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
    },
    label: {
      lg: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
      md: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
      sm: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
    },
    caption: {
      md: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
      sm: { fontSize: 10, fontWeight: '400', lineHeight: 14 },
    },
  },
  shadows: {
    sm: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    md: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
    lg: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  },
};

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  const value: ThemeContextValue = useMemo(
    () => ({
      theme,
      mode,
      toggleTheme: () => setMode(m => (m === 'dark' ? 'light' : 'dark')),
    }),
    [theme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context.theme;
}

export function useThemeMode(): { mode: ThemeMode; toggleTheme: () => void } {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return { mode: context.mode, toggleTheme: context.toggleTheme };
}
