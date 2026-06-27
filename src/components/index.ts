/* ========================================
   PRODUCTION-GRADE COMPONENT LIBRARY

   Organized by layer and concern for clean imports:
   - common/: Primitives (Button, Input, Card, Badge)
   - financial/: Domain-specific (CurrencyDisplay, MetricCard)
   - form/: Form components with validation
   - layout/: Layout utilities and spacing

   Import patterns:
   import { Button, Input, Card } from '@/components';
   import { CurrencyDisplay, MetricCard } from '@/components/financial';
   import { FormField, CurrencyInput } from '@/components/form';
   import { Row, Column, PaddedView, Spacer } from '@/components/layout';
   ======================================== */

// ============ COMMON PRIMITIVES ============
export { Button, type ButtonVariant, type ButtonSize } from './common/Button';
export { Input } from './common/Input';
export { Card, CardHeader, CardBody, CardFooter } from './common/Card';
export { Badge } from './common/Badge';

// ============ FINANCIAL DOMAIN ============
export { CurrencyDisplay } from './financial/CurrencyDisplay';
export { MetricCard } from './financial/MetricCard';

// ============ FORM COMPONENTS ============
export { FormField } from './form/FormField';
export { CurrencyInput } from './form/CurrencyInput';

// ============ LAYOUT & SPACING ============
export { Spacer, PaddedView, Row, Column } from './layout/Spacer';

// ============ UTILITY EXPORTS ============
export { cn, formatCurrency, useId } from './utils';

/* Re-exports from React for convenience */
export { useMemo, useCallback, useState, useEffect, useRef, useContext } from 'react';
