import { useId as useReactId } from 'react';

/**
 * Merge classNames (for web compatibility, no-op on React Native)
 */
export const cn = (...classes: (string | undefined | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Format currency with locale support
 */
export const formatCurrency = (value: number, currency: string, decimals: number = 2): string => {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currency}${formatted}`;
};

/**
 * Generate unique IDs for form fields (accessibility)
 */
export const useId = (): string => {
  try {
    return useReactId();
  } catch {
    return `id-${Math.random().toString(36).substr(2, 9)}`;
  }
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone format (international)
 */
export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-().]{7,20}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate numeric input
 */
export const isValidNumber = (value: string, decimals: number = 2): boolean => {
  const numRegex = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  return numRegex.test(value) || value === '';
};

/**
 * Sanitize numeric input
 */
export const sanitizeNumeric = (value: string, decimals: number = 2): string => {
  const parts = value.split('.');
  if (parts.length > 2) return '';

  const intPart = parts[0].replace(/\D/g, '');
  const decPart = parts[1]?.substring(0, decimals) || '';

  return decPart ? `${intPart}.${decPart}` : intPart;
};

/**
 * Format large numbers with K, M, B abbreviations
 */
export const formatLargeNumber = (value: number, decimals: number = 1): string => {
  if (Math.abs(value) >= 1e9) {
    return (value / 1e9).toFixed(decimals) + 'B';
  }
  if (Math.abs(value) >= 1e6) {
    return (value / 1e6).toFixed(decimals) + 'M';
  }
  if (Math.abs(value) >= 1e3) {
    return (value / 1e3).toFixed(decimals) + 'K';
  }
  return value.toFixed(decimals);
};

/**
 * Accessibility: Generate ARIA label for financial amount
 */
export const getAccessibilityLabel = (amount: number, label: string, currency: string): string => {
  const trend = amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'neutral';
  return `${label}: ${currency} ${Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}, ${trend}`;
};

/**
 * Debounce function for input handling
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Get color based on value (income/expense/neutral)
 */
export const getAmountColor = (amount: number): 'income' | 'expense' | 'neutral' => {
  if (amount > 0) return 'income';
  if (amount < 0) return 'expense';
  return 'neutral';
};
