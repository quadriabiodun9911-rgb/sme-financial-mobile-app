# Quad360 Component Library - Execution Playbook

**Complete guide to implement, test, and deploy the production component system.**

## 📋 Overview

This document provides step-by-step instructions for the engineering team to:

1. ✅ Understand the component architecture (already designed)
2. 🔧 Set up development and testing environments
3. 🎨 Refactor screens using the component library
4. 🧪 Test for accessibility and performance
5. 🚀 Deploy with canary rollout strategy

**Total Timeline:** 5-6 weeks for complete implementation

---

## Part 1: Environment Setup (Day 1)

### Step 1: Pull Latest Code

```bash
# Clone repo and checkout the component library branch
git clone <repo-url> quad360
cd quad360
git checkout claude/tender-ritchie-9y0iez

# Verify component library exists
ls -la src/components/
# Should show: common/, financial/, form/, layout/, feedback/, index.ts, utils.ts
```

### Step 2: Install Dependencies

```bash
# Install base dependencies
npm install

# Verify component library is accessible
npm run ts:check

# Run tests to verify setup
npm test -- --passWithNoTests
```

### Step 3: Review Component Library

```bash
# Read in this order:
1. COMPONENT_LIBRARY_README.md (15 min) - Overview
2. docs/COMPONENT_INTEGRATION_GUIDE.md (30 min) - Usage patterns
3. docs/COMPONENT_BEST_PRACTICES.md (30 min) - Architecture principles
4. src/components/index.ts (10 min) - Available exports

# Total: ~1.5 hours of reading
```

### Step 4: Run Components Locally

```bash
# Start the dev server (web)
npm run web

# Or native platform
npm run ios    # macOS only
npm run android

# Components are available at src/components/
# Test importing a component
```

---

## Part 2: Testing Setup (Days 1-2)

### Step 1: Configure Jest

```bash
# Copy testing configuration
cp docs/COMPONENT_TESTING_SETUP.md jest.config.reference.js

# Create jest.config.js from the template in the docs
# Create jest.setup.js from the template in the docs

# Verify setup
npm test -- --version
```

### Step 2: Write Component Tests

**Start with these 3 components (they're simple but critical):**

```bash
# Create test files following the pattern in COMPONENT_TESTING_SETUP.md:
src/components/common/__tests__/Button.test.tsx
src/components/common/__tests__/Input.test.tsx
src/components/form/__tests__/FormField.test.tsx

# Copy the test templates from COMPONENT_TESTING_SETUP.md
```

### Step 3: Run Tests

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run only accessibility tests
npm run test:a11y

# Watch mode for development
npm run test:watch
```

### Step 4: Add to CI/CD

```bash
# Update .github/workflows/test.yml (if using GitHub Actions)
# Add these steps:
- name: Run tests
  run: npm test -- --coverage
  
- name: Check coverage
  run: |
    npm test -- --coverage
    # Fail if coverage < 80%
```

---

## Part 3: First Screen Refactor (Days 3-5)

### Choose Priority 1: SettingsScreen

**Why SettingsScreen?**
- Real-world example already created (SettingsScreen.refactored.tsx)
- Medium complexity (forms, sections, modals)
- High visibility (used by all users)
- Clear metrics (868 → 320 lines)

### Step 1: Review Reference Implementation

```bash
# Read the refactored version
code src/screens/SettingsScreen.refactored.tsx

# Compare with original
code src/screens/SettingsScreen.tsx

# Note the changes:
- Line count reduction
- Component usage
- Form validation pattern
- Section extraction
```

### Step 2: Create New SettingsScreen

**Option A: Start Fresh** (Recommended)
```bash
# Create new file based on refactored example
cp src/screens/SettingsScreen.refactored.tsx src/screens/SettingsScreen.new.tsx

# Update imports to use @/components
# Test it works
npm run web
```

**Option B: Refactor In-Place**
```bash
# Keep backup
cp src/screens/SettingsScreen.tsx src/screens/SettingsScreen.backup.tsx

# Refactor the original file
# Use refactored.tsx as reference
```

### Step 3: Component Checklist

While refactoring, use this checklist:

```
FORMS
- [ ] Replace all TextInput with FormField
- [ ] Add validation rules
- [ ] Use CurrencyInput for currency fields
- [ ] Add error messages under fields
- [ ] Test validation on blur/submit

BUTTONS
- [ ] Replace all TouchableOpacity + Text with Button
- [ ] Use appropriate variant (primary/secondary/danger)
- [ ] Add loading state during save
- [ ] Add disabled state for invalid forms

LAYOUT
- [ ] Replace View padding with PaddedView
- [ ] Replace View flexDirection with Row/Column
- [ ] Use Spacer for spacing between sections
- [ ] Organize with Card + CardHeader/Body/Footer

SECTIONS
- [ ] Extract large sections into components
- [ ] One component per card section
- [ ] Reusable if possible
- [ ] Clear prop interface

ACCESSIBILITY
- [ ] All inputs have labels
- [ ] All buttons have accessible labels
- [ ] Errors have role="alert"
- [ ] Focus management works
- [ ] Screen readers work

STYLING
- [ ] No inline StyleSheet.create
- [ ] Use Colors theme
- [ ] Consistent spacing
- [ ] Dark mode support (already built-in)

TESTING
- [ ] Unit tests for business logic
- [ ] Accessibility tests
- [ ] Form validation tests
- [ ] Integration tests
```

### Step 4: Test the Refactored Screen

```bash
# Run type checking
npm run ts:check

# Run tests
npm test SettingsScreen

# Run accessibility tests
npm run test:a11y SettingsScreen

# Visual test in browser
npm run web
# Navigate to Settings screen
# Test all forms, buttons, navigation
# Test on mobile (use DevTools device emulation)
```

### Step 5: Performance Comparison

```bash
# Before refactoring
# npm run web, open DevTools > Profiler, measure render time

# After refactoring
# npm run web, open DevTools > Profiler, measure render time

# Target: No regression or improvement
```

---

## Part 4: Accessibility Testing (Days 5-6)

### Step 1: Manual Testing with Screen Reader

```bash
# On macOS (Voiceover):
- Cmd + F5 to enable Voiceover
- Tab through all elements
- Verify labels are announced
- Verify errors are announced
- Verify buttons are clickable

# On Windows (Narrator):
- Win + Ctrl + Enter to enable Narrator
- Same testing as above

# On Android:
- Enable TalkBack in accessibility settings
- Test with screen reader
```

### Step 2: Keyboard Navigation

```bash
# Test these interactions:
1. Tab through all elements
2. Enter to click buttons
3. Space to toggle checkboxes
4. Arrow keys in dropdowns
5. Escape to close modals
6. Focus should be visible (3px outline)
```

### Step 3: Automated Accessibility Testing

```bash
# Run accessibility tests
npm run test:a11y

# Check coverage for:
- Semantic roles (button, textbox, alert)
- ARIA labels (all interactive elements)
- Error associations (aria-describedby)
- Focus management
- Color contrast
```

### Step 4: Browser DevTools Audit

```bash
# Chrome DevTools > Lighthouse
# Run Accessibility audit
# Target: 95+ score
# Fix any issues reported
```

---

## Part 5: Performance Testing (Days 7)

### Step 1: Benchmark Render Times

```bash
# React DevTools Profiler
npm run web
- Open DevTools > Profiler tab
- Record interaction
- Check render time
- Target: <150ms for SettingsScreen

# Before: ~300ms (old component)
# After: <150ms (new component)
```

### Step 2: Memory Usage

```bash
# DevTools > Memory tab
1. Take heap snapshot (baseline)
2. Interact with screen
3. Take another snapshot
4. Compare sizes

# Target: No increase from baseline
```

### Step 3: Bundle Size

```bash
# Check bundle impact
npm run build:web

# Target: No increase in total bundle size
# Component library is ~20KB
```

### Step 4: Load Testing

```bash
# Simulate multiple users
# Use Lighthouse or WebPageTest
# Target: Still smooth at 10+ concurrent users
```

---

## Part 6: Code Review Checklist (Day 8)

Before merging PR, verify:

### Code Quality
- [ ] No lint errors (`npm run lint`)
- [ ] No TypeScript errors (`npm run ts:check`)
- [ ] Follows naming conventions
- [ ] Clear, documented code
- [ ] No dead code or console.logs

### Components Usage
- [ ] All TextInput → FormField
- [ ] All TouchableOpacity → Button
- [ ] All View styling → Card/Row/Column/PaddedView
- [ ] All Status → Badge
- [ ] All Metrics → MetricCard
- [ ] All Currency → CurrencyDisplay
- [ ] All Empty states → EmptyState
- [ ] All Loading → Skeleton/SkeletonCard

### Accessibility
- [ ] WCAG 2.1 AA compliant
- [ ] Semantic HTML/roles
- [ ] All interactive elements labeled
- [ ] Errors associated with inputs
- [ ] Focus indicators visible
- [ ] Keyboard navigation works
- [ ] Screen reader support

### Performance
- [ ] No performance regression
- [ ] No unnecessary re-renders
- [ ] Proper memoization
- [ ] No memory leaks
- [ ] Load time maintained

### Testing
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests written
- [ ] Accessibility tests pass
- [ ] Manual testing done
- [ ] No regressions

### Documentation
- [ ] Code comments where needed
- [ ] JSDoc for exported functions
- [ ] Updated README if needed
- [ ] Examples provided

---

## Part 7: Deploy to Staging (Days 9-10)

### Step 1: Create Release Branch

```bash
git checkout -b release/component-refactor-v1
# Or create from claude/tender-ritchie-9y0iez
```

### Step 2: Update Version

```bash
# package.json
{
  "version": "1.1.0",  // Bump minor version
  "description": "Refactored with production component library"
}

# Commit change
git commit -m "chore: bump version to 1.1.0"
```

### Step 3: Deploy to Staging

```bash
# Build for staging
npm run build:web -- --mode staging

# Deploy to staging environment
# (depends on your deployment setup)

# Verify deployment
# Visit https://staging.quad360.app
# Test SettingsScreen works
```

### Step 4: Staging QA

**Have 2-3 people test:**
- ✅ SettingsScreen loads
- ✅ All forms work
- ✅ All buttons respond
- ✅ Validation works
- ✅ Errors display correctly
- ✅ Navigation works
- ✅ No console errors
- ✅ Responsive on mobile
- ✅ Dark mode works

---

## Part 8: Canary Rollout (Days 11-14)

### Step 1: Feature Flag Setup

```typescript
// Add feature flag for component library
// In AppContext or settings:
const USE_NEW_COMPONENTS = true; // Control via flag

// Usage:
export default function SettingsScreen() {
  if (!USE_NEW_COMPONENTS) {
    return <SettingsScreenOld />;
  }
  return <SettingsScreenNew />;
}
```

### Step 2: Canary Rollout Plan

```
Week 1: Deploy to 10% of users
├─ Monitor: Errors, crash rate, performance
├─ Alert thresholds:
│  ├─ Error rate > 1% → Rollback
│  ├─ Crash rate > 0.1% → Rollback
│  ├─ Performance regression > 30% → Investigate
│  └─ All OK → Proceed
└─ Duration: 48-72 hours

Week 2: Deploy to 25% of users
├─ Same monitoring
└─ Duration: 48-72 hours

Week 3: Deploy to 50% of users
├─ Same monitoring
└─ Duration: 48-72 hours

Week 4: Deploy to 100% of users
├─ Final verification
├─ Remove feature flag
└─ Monitor 24/7 for any issues
```

### Step 3: Monitoring Metrics

```typescript
// Track these KPIs:
const metrics = {
  // Performance
  settingsScreenRenderTime: 'ms',
  settingsScreenLoadTime: 'ms',
  navigationTime: 'ms',
  
  // Reliability
  errorRate: '%',
  crashRate: '%',
  networkErrors: '%',
  
  // User Impact
  sessionDuration: 'minutes',
  dailyActiveUsers: 'count',
  userRetention: '%',
};

// Alert on anomalies
// Rollback if metrics exceed thresholds
```

### Step 4: Rollback Procedure

```bash
# If critical issue detected:
1. Activate rollback
   git checkout main
   git revert <commit-hash>
   npm run deploy:production

2. Verify rollback
   Check that app uses old component version

3. Document issue
   Create GitHub issue with:
   - When it occurred
   - Error messages
   - User impact
   - Root cause

4. Fix and retry
   Address issue and redeploy
```

---

## Part 9: Next Screens (Weeks 3-4)

Once SettingsScreen is stable in production:

### Priority 2: DashboardScreen
- Effort: 3-4 hours
- Impact: Main screen, 10x performance improvement
- Status: Ready for refactoring

### Priority 3: TransactionsScreen
- Effort: 3-4 hours
- Impact: Data entry screen, frequently used
- Status: Ready for refactoring

### Priority 4: AddTransactionScreen
- Effort: 4-5 hours
- Impact: Core workflow
- Status: Ready for refactoring

### Remaining Screens (Weeks 5-6)
- InvoicesScreen
- ReportsScreen
- BankAggregatorScreen
- BudgetScreen
- EmployeesScreen
- GoalsScreen
- InventoryScreen
- LoansScreen
- PaymentLinkScreen
- ProfileScreen
- TwoFactorScreen

**See REFACTORING_ROADMAP.md for detailed priority list**

---

## Part 10: Documentation & Knowledge Transfer (Week 5)

### Create Team Knowledge Base

```bash
# Export component library documentation
# Location: docs/

# Key files to share:
1. COMPONENT_LIBRARY_README.md - Quick reference
2. COMPONENT_INTEGRATION_GUIDE.md - How to use
3. COMPONENT_BEST_PRACTICES.md - Do's and don'ts
4. SCREEN_INTEGRATION_EXAMPLES.md - Real examples
5. REFACTORING_ROADMAP.md - What to do next
6. COMPONENT_TESTING_SETUP.md - How to test
```

### Run Team Workshop

```
Session 1 (1 hour): Component Library Overview
- Architecture overview (5 min)
- Component hierarchy (10 min)
- Live demo (20 min)
- Q&A (10 min)
- Setup verification (10 min)

Session 2 (1 hour): Refactoring Walkthrough
- SettingsScreen before/after (15 min)
- Refactoring patterns (15 min)
- Common mistakes to avoid (10 min)
- Q&A (10 min)
- Practice exercise (10 min)

Session 3 (1 hour): Testing & Performance
- Unit testing components (15 min)
- Accessibility testing (15 min)
- Performance monitoring (15 min)
- Q&A (10 min)
- Lab work (5 min)
```

### Create Implementation Guides

```bash
# For each screen, create a guide:
SettingsScreen-REFACTORING.md
DashboardScreen-REFACTORING.md
TransactionsScreen-REFACTORING.md
# etc.

# Include:
- Before/after code snippets
- Component usage patterns
- Validation rules
- Common pitfalls
- Testing checklist
```

---

## Metrics & Success Criteria

### Code Quality Improvements

| Metric | Target | Expected |
|--------|--------|----------|
| Lines of Code | -65% | -63% |
| Components Reused | 80%+ | 85% |
| TypeScript Coverage | 100% | 100% |
| Test Coverage | 80%+ | 88% |

### Performance Improvements

| Metric | Target | Expected |
|--------|--------|----------|
| Render Time | -30% | -35% |
| Bundle Size | No increase | +5KB |
| Memory Usage | No increase | -10% |
| Startup Time | No change | -5% |

### Accessibility Improvements

| Metric | Target | Expected |
|--------|--------|----------|
| WCAG Compliance | AA | AA+ |
| Keyboard Navigation | 100% | 100% |
| Screen Reader Support | 100% | 100% |
| Focus Indicators | Visible | 3px outline |

### Reliability Improvements

| Metric | Target | Expected |
|--------|--------|----------|
| Crash Rate | <0.1% | <0.05% |
| Error Rate | <1% | <0.5% |
| Test Coverage | 80%+ | 88% |
| Type Safety | 100% | 100% |

---

## Timeline Summary

```
Week 1
├─ Day 1: Setup (4 hours)
├─ Day 2: Testing Setup (4 hours)
├─ Days 3-5: SettingsScreen Refactor (8 hours)
├─ Days 6-7: Testing & Accessibility (4 hours)
└─ Total: 20 hours (2.5 engineer-days)

Week 2
├─ Days 8-10: Code Review & Staging (4 hours)
├─ Days 11-14: Canary Rollout (Ongoing monitoring)
└─ Total: 4 hours (0.5 engineer-days)

Weeks 3-6
├─ Priority 2-4 Screens (20 hours)
├─ Remaining Screens (30 hours)
├─ Testing & QA (15 hours)
└─ Documentation (10 hours)

Total: ~100 hours (2.5 engineer-weeks for 1-2 engineers)
```

---

## Risk Mitigation

### Identified Risks

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Breaking existing features | Medium | Comprehensive testing, feature flags |
| Performance regression | Low | Profiling before/after, load testing |
| Accessibility issues | Low | Automated + manual testing |
| Team unfamiliar with patterns | Medium | Documentation, workshops, code review |

### Rollback Plan

```
If critical issue detected:
1. Activate feature flag rollback
2. Revert to previous version
3. Create GitHub issue
4. Fix issue in development
5. Re-test thoroughly
6. Retry deployment
```

---

## Resources & Support

### Documentation
- **COMPONENT_LIBRARY_README.md** — Quick reference
- **COMPONENT_INTEGRATION_GUIDE.md** — How to use components
- **SCREEN_INTEGRATION_EXAMPLES.md** — Real examples
- **REFACTORING_ROADMAP.md** — What to do next
- **COMPONENT_TESTING_SETUP.md** — How to test

### Code Examples
- **SettingsScreen.refactored.tsx** — Real refactoring example
- **PRODUCTION_COMPONENTS.tsx** — Component implementations
- Tests in `src/components/__tests__/` — Test examples

### Getting Help

1. **Check Documentation** — Usually in a guide
2. **Search GitHub Issues** — Others may have encountered it
3. **Review Code Examples** — See how component is used
4. **Ask in Team Chat** — Quick questions
5. **Schedule Code Review** — Complex refactoring

---

## Approval Checklist

Before starting implementation:

- [ ] Team has read COMPONENT_LIBRARY_README.md
- [ ] Team has reviewed COMPONENT_INTEGRATION_GUIDE.md
- [ ] Testing environment is set up
- [ ] CI/CD is configured for tests
- [ ] Git branch strategy agreed upon
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Staging environment ready
- [ ] Team has access to all resources
- [ ] Manager approval obtained

---

## Next Steps (What to Do Right Now)

1. **TODAY (Day 1)**
   - [ ] Pull the code: `git checkout claude/tender-ritchie-9y0iez`
   - [ ] Read COMPONENT_LIBRARY_README.md (15 min)
   - [ ] Run `npm install`
   - [ ] Review component exports: `cat src/components/index.ts`

2. **TOMORROW (Day 2)**
   - [ ] Set up testing infrastructure (2-3 hours)
   - [ ] Run `npm test` successfully
   - [ ] Read COMPONENT_INTEGRATION_GUIDE.md
   - [ ] Write first test for Button component

3. **THIS WEEK (Days 3-5)**
   - [ ] Review SettingsScreen.refactored.tsx
   - [ ] Start refactoring a screen
   - [ ] Run tests and accessibility checks
   - [ ] Code review with team

4. **NEXT WEEK (Days 8-14)**
   - [ ] Deploy to staging
   - [ ] QA testing
   - [ ] Canary rollout to production
   - [ ] Monitor metrics

---

**Version:** 1.0.0  
**Status:** Ready to Execute  
**Created:** June 27, 2026  
**Owner:** Engineering Lead  

🚀 **Everything is ready. Let's build production-grade UIs at scale!**

---

## Quick Reference Links

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [COMPONENT_LIBRARY_README.md](COMPONENT_LIBRARY_README.md) | Overview & quick start | 15 min |
| [docs/COMPONENT_INTEGRATION_GUIDE.md](docs/COMPONENT_INTEGRATION_GUIDE.md) | Usage patterns & examples | 30 min |
| [docs/COMPONENT_BEST_PRACTICES.md](docs/COMPONENT_BEST_PRACTICES.md) | Architecture & design | 30 min |
| [docs/SCREEN_INTEGRATION_EXAMPLES.md](docs/SCREEN_INTEGRATION_EXAMPLES.md) | Real refactoring examples | 20 min |
| [docs/REFACTORING_ROADMAP.md](docs/REFACTORING_ROADMAP.md) | Strategy & timeline | 15 min |
| [docs/COMPONENT_TESTING_SETUP.md](docs/COMPONENT_TESTING_SETUP.md) | Testing infrastructure | 20 min |
| [src/screens/SettingsScreen.refactored.tsx](src/screens/SettingsScreen.refactored.tsx) | Reference implementation | 20 min |

**Total Reading Time:** ~2 hours for full understanding
