import { useColorScheme } from 'react-native';
import { Colors } from './colors';

export const LIGHT_THEME = {
  bg: '#ffffff',
  surface: '#f9fafb',
  surfaceVariant: '#f3f4f6',
  border: '#e5e7eb',
  muted: '#d1d5db',
  card: '#ffffff',

  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#9ca3af',
  text: '#1f2937',

  income: '#059669',
  expense: '#dc2626',
  asset: '#0284c7',
  liability: '#ea580c',
  equity: '#7c3aed',
  warning: '#d97706',
  primary: '#2563eb',
  secondary: '#7c3aed',

  danger: '#dc2626',
  success: '#059669',

  criticalBorder: '#dc2626',
  warningBorder: '#d97706',
  healthyBorder: '#059669',
};

export const DARK_THEME = Colors;

export const useTheme = () => {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME;
};

export const getThemeByScheme = (scheme: 'light' | 'dark') => {
  return scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
};
