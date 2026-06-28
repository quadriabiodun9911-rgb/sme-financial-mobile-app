# Screen Refactoring Roadmap

Strategic plan to refactor existing screens to use the new component library.

## Phase 1: Foundation (Week 1-2)

### Priority 1: SettingsScreen
**Current State:** 868 lines, monolithic, custom styling
**Target:** ~300 lines, composed components, reusable
**Impact:** Settings used by all users, high visibility
**Effort:** 4-6 hours

**What to refactor:**
- [ ] Replace all TextInput with `FormField` components
- [ ] Replace TouchableOpacity buttons with `Button` component
- [ ] Replace View/Text styling with `Card`, `Row`, `Column`, `PaddedView`
- [ ] Extract "My Business" section into `SettingsSection` component
- [ ] Extract "Payment Gateways" section into `PaymentGatewaysSection` component
- [ ] Extract "Team" section into `TeamSection` component
- [ ] Use `CurrencyInput` for currency fields
- [ ] Use `EmptyState` when no team members exist
- [ ] Add proper validation with `useForm` hook
- [ ] Add loading skeleton during form operations

**Metrics:**
- Before: 868 lines
- After: ~300 lines (65% reduction)
- Components used: 12
- Subcomponents created: 3

### Priority 2: DashboardScreen
**Current State:** 600+ lines, 15+ useMemo hooks
**Target:** ~150 lines (with MetricsComputer optimization)
**Impact:** Main screen, user sees daily
**Effort:** 3-4 hours

**What to refactor:**
- [ ] Replace MetricsComputer computation (already optimized)
- [ ] Use `MetricCard` for KPIs
- [ ] Use `TransactionCard` for recent transactions
- [ ] Replace custom loading with `SkeletonCard`
- [ ] Replace custom empty state with `EmptyState`
- [ ] Use `PaddedView` + `Column` for layout
- [ ] Add refresh control
- [ ] Implement FlatList for transaction list

**Metrics:**
- Before: 600+ lines
- After: ~150 lines (75% reduction)
- Performance: 2000ms → 80ms dashboard render

### Priority 3: TransactionsScreen
**Current State:** 500+ lines, manual filtering
**Target:** ~200 lines
**Impact:** Data entry screen, frequently used
**Effort:** 3-4 hours

**What to refactor:**
- [ ] Replace with FlatList + `TransactionCard`
- [ ] Use `Input` for search
- [ ] Use `Badge` for filter indicators
- [ ] Use `Card` for summary metrics
- [ ] Add `CurrencyDisplay` for totals
- [ ] Use `EmptyState` when no results
- [ ] Add virtual scrolling

---

## Phase 2: Core Screens (Week 3-4)

### Priority 4: AddTransactionScreen
**Current State:** 400+ lines, complex form
**Target:** ~120 lines
**Impact:** Core data entry, used constantly
**Effort:** 4-5 hours

**What to refactor:**
- [ ] Use `FormField` for all inputs
- [ ] Use `CurrencyInput` for amount
- [ ] Use `Button` with variants
- [ ] Use `Card` for sections
- [ ] Implement `useForm` hook for validation
- [ ] Use `EmptyState` for category selection
- [ ] Add loading state during save

### Priority 5: InvoicesScreen
**Current State:** 450+ lines
**Target:** ~180 lines
**Impact:** B2B features, important
**Effort:** 3-4 hours

**What to refactor:**
- [ ] Replace with FlatList + invoice card component
- [ ] Use `MetricCard` for invoice stats
- [ ] Use `Badge` for status (Draft/Sent/Paid)
- [ ] Add `EmptyState`
- [ ] Use `CurrencyDisplay` for amounts

### Priority 6: ReportsScreen
**Current State:** 350+ lines
**Target:** ~140 lines
**Impact:** Analytics, less frequently used
**Effort:** 2-3 hours

**What to refactor:**
- [ ] Use `MetricCard` for KPIs
- [ ] Replace charts with data visualization
- [ ] Use `Card` for report sections
- [ ] Add `EmptyState` when no data
- [ ] Use `Button` for export/print

---

## Phase 3: Secondary Screens (Week 5)

### Remaining Screens (alphabetically)
- [ ] BankAggregatorScreen
- [ ] BudgetScreen
- [ ] EmployeesScreen
- [ ] GoalsScreen
- [ ] InventoryScreen
- [ ] LoansScreen
- [ ] PaymentLinkScreen
- [ ] ProfileScreen
- [ ] TwoFactorScreen

**General approach for all:**
1. Replace TextInput → `FormField`
2. Replace TouchableOpacity → `Button`
3. Replace View/Text styling → `Card`, `Row`, `Column`, `PaddedView`
4. Extract large sections into components
5. Add loading/empty states
6. Implement validation with `useForm`

---

## Refactoring Template

Use this template for each screen:

```typescript
// BEFORE: Monolithic approach
export default function MyScreen() {
  const [form, setForm] = useState({ field1: '', field2: '' });
  const [errors, setErrors] = useState({});
  
  return (
    <SafeAreaView>
      <ScrollView>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Title</Text>
          <TextInput
            style={{ borderWidth: 1, padding: 10 }}
            value={form.field1}
            onChangeText={(v) => setForm({ ...form, field1: v })}
          />
          <TouchableOpacity style={{ backgroundColor: 'blue', padding: 12 }}>
            <Text>Save</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// AFTER: Composed approach
import { Button, Column, PaddedView, FormField } from '@/components';
import { useForm } from '@/hooks/useForm';

const VALIDATION_RULES = {
  field1: [(val) => (!val ? 'Required' : '')],
  field2: [(val) => (!val ? 'Required' : '')],
};

export default function MyScreen() {
  const { values, errors, handleChange, handleBlur, validate } = useForm(
    { field1: '', field2: '' },
    VALIDATION_RULES
  );

  const handleSubmit = async () => {
    if (!validate()) return;
    await api.submit(values);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <PaddedView padding={16}>
          <Column gap={16}>
            <Text style={styles.title}>Title</Text>

            <FormField
              label="Field 1"
              value={values.field1}
              onChangeText={(v) => handleChange('field1', v)}
              error={errors.field1}
              required
            />

            <FormField
              label="Field 2"
              value={values.field2}
              onChangeText={(v) => handleChange('field2', v)}
              error={errors.field2}
              required
            />

            <Button fullWidth onPress={handleSubmit} variant="primary">
              Save
            </Button>
          </Column>
        </PaddedView>
      </ScrollView>
    </SafeAreaView>
  );
}
```

---

## Code Review Checklist

Before marking a screen as refactored:

### Styling
- [ ] No inline `StyleSheet.create` in component
- [ ] Using `PaddedView`, `Row`, `Column` for layout
- [ ] Using centralized `Colors` theme
- [ ] Consistent spacing via `Spacer` or component gaps

### Components
- [ ] Using `Button` not `TouchableOpacity` + Text
- [ ] Using `FormField` not `TextInput` directly
- [ ] Using `Card` for containers
- [ ] Using `Badge` for status indicators
- [ ] Using `CurrencyDisplay` for amounts
- [ ] Using `MetricCard` for KPIs

### Accessibility
- [ ] All interactive elements have `accessibilityLabel`
- [ ] Form fields have `accessibilityRole="text"`
- [ ] Buttons have `accessibilityRole="button"`
- [ ] Error messages use `role="alert"`
- [ ] Focus indicators visible
- [ ] Keyboard navigation works

### States
- [ ] Loading states with skeleton/spinner
- [ ] Empty states with `EmptyState` component
- [ ] Error states with error messages
- [ ] Disabled states on buttons during operations

### Validation
- [ ] Client-side validation on all forms
- [ ] Error messages under fields
- [ ] Form submission blocked if invalid
- [ ] Success feedback after save

### Performance
- [ ] No inline object literals in render
- [ ] Using `useMemo` for expensive computations
- [ ] Using `useCallback` for event handlers
- [ ] FlatList for long lists (not ScrollView)
- [ ] Virtual scrolling for 100+ items

### Testing
- [ ] Unit tests for component logic
- [ ] Accessibility tests (screen reader simulation)
- [ ] Integration tests for forms
- [ ] Visual regression tests

---

## Success Metrics

### Code Quality
- Lines of code reduced: Target 60-75%
- Component reuse: 80%+ of components used
- Type coverage: 100% TypeScript
- Accessibility: WCAG 2.1 AA compliance

### Performance
- Render time: Reduced by 30%+
- Bundle size: No increase (tree-shakeable)
- Memory: No significant increase
- Runtime performance: 60fps animations

### Maintainability
- Cyclomatic complexity: Reduced
- Dependency injection: Clear data flow
- Testing: >90% code coverage
- Documentation: JSDoc comments on all exports

---

## Timeline

```
Week 1-2: SettingsScreen + DashboardScreen (Priority 1)
Week 3-4: TransactionsScreen + AddTransactionScreen (Priority 4)
Week 5:   InvoicesScreen + ReportsScreen
Week 6:   Remaining screens (9 screens)
Week 7:   Testing, QA, Performance validation
Week 8:   Staging deployment, canary rollout
```

**Total Effort:** 4-5 weeks (3-4 engineers)
**Expected Result:** 100% of screens refactored, 65-75% LOC reduction, 30% performance improvement

---

## Risk Mitigation

### Testing Strategy
1. Unit test each component in isolation
2. Integration test component combinations
3. Accessibility test with screen readers
4. Performance test with React DevTools Profiler
5. Visual regression test against old screens

### Rollout Strategy
1. Refactor in feature branch
2. Code review before merge
3. Deploy to staging environment
4. Load test with 1000+ users
5. Canary rollout (10% → 25% → 50% → 100%)
6. Monitor for regressions 24/7

### Rollback Plan
- Keep old screens in parallel initially
- Feature flags to switch between old/new
- 1-click rollback if regression detected
- Monitor error rate < 1%, crash rate < 0.1%

---

## Resources

- Component Library: `src/components/`
- Integration Guide: `docs/COMPONENT_INTEGRATION_GUIDE.md`
- Best Practices: `docs/COMPONENT_BEST_PRACTICES.md`
- Examples: `docs/SCREEN_INTEGRATION_EXAMPLES.md`
- Form Patterns: `docs/COMPONENT_INTEGRATION_GUIDE.md#form-validation-patterns`

---

## Next Steps

1. **Review** this roadmap with the team
2. **Assign** priority screens to engineers
3. **Create** GitHub issues for each screen
4. **Start** with Priority 1 screens (SettingsScreen)
5. **Track** progress on project board
6. **Deploy** to staging after Priority 1 complete
7. **Canary rollout** after 50% screens refactored

---

**Version:** 1.0.0
**Status:** Ready to execute
**Owner:** Engineering Lead
**Last Updated:** June 27, 2026
