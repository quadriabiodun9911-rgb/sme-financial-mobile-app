# FinanceBook Implementation Guide: Technical Requirements

This document maps each capability to specific React Native components, TypeScript types, calculation utilities, and data persistence requirements.

---

## Phase 1: Profitability Maximization (✅ COMPLETED)

### 1. Profit Waterfall Analysis

**Component:** `ProfitWaterfall.tsx`
**Status:** ✅ Implemented

**Data Flow:**
```
transactions[] 
  → computeProfitWaterfall()
  → WaterfallItem[]
  → ProfitWaterfall component
  → Bridge visualization
```

**Calculation Logic:**
- Group transactions by period (last 30 days vs previous 30 days)
- Period 1: Sum income - sum expenses = base profit
- Revenue change: (Current period income) - (Previous period income)
- Cost change: (Current period expenses) - (Previous period expenses)
- Period 2: Base + revenue change + cost change = new profit
- Each bar width proportional to impact magnitude

**Types Required:**
```typescript
interface WaterfallItem {
  label: string;
  value: number;
  percentChange: number;
}
```

**Utilities:** `src/utils/profitability.ts`
- `computeProfitWaterfall(transactions)`

---

### 2. Profit Drivers & Headwinds

**Component:** `ProfitDriversInsights.tsx`
**Status:** ✅ Implemented

**Data Flow:**
```
transactions[] + invoices[]
  → identifyProfitDrivers()
  → ProfitDriver[]
  → ProfitDriversInsights component
  → Driver cards + top action card
```

**Calculation Logic:**
- For each category: compare period 1 profit vs period 2 profit
- If improvement > 5%: positive driver
- If decline > 5%: headwind
- Sort by impact magnitude
- Identify single "Top Action" with highest potential impact

**Types Required:**
```typescript
interface ProfitDriver {
  name: string;
  type: 'driver' | 'headwind';
  currentImpact: number;
  percentChange: number;
  description: string;
}
```

**Utilities:** `src/utils/profitability.ts`
- `identifyProfitDrivers(transactions)`

---

### 3. Profit by Dimension

**Component:** `ProfitByDimension.tsx`
**Status:** ✅ Implemented

**Data Flow:**
```
transactions[]
  → computeProfitByCategory() | computeProfitByVendorCustomer()
  → DimensionItem[]
  → Toggle between Category/Customer
  → Profitability matrix visualization
```

**Calculation Logic:**
- **By Category:**
  - Group transactions by category
  - Sum income, expenses, profit per category
  - Calculate margin: profit / income
  - Sort by margin or profit

- **By Vendor/Customer:**
  - Group invoices by customer
  - Match transactions to customers
  - Calculate revenue, expenses, profit per customer
  - Calculate margin and payment rate

**Profitability Matrix:**
- X-axis: Volume (number of transactions/customers)
- Y-axis: Margin (%)
- Quadrants:
  - High volume, high margin (STAR - grow)
  - High volume, low margin (CASH COW - optimize)
  - Low volume, high margin (QUESTION - investigate)
  - Low volume, low margin (DOG - exit)

**Types Required:**
```typescript
interface DimensionItem {
  name: string;
  volume: number;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  percentChange: number;
}
```

**Utilities:** `src/utils/profitability.ts`
- `computeProfitByCategory(transactions)`
- `computeProfitByVendorCustomer(transactions, invoices)`

---

### 4. Breakeven Analysis

**Component:** `BreakevenAnalysis.tsx`
**Status:** ✅ Implemented

**Data Flow:**
```
transactions[] + settings
  → computeBreakeven()
  → BreakevenResult
  → BreakevenAnalysis component
  → Status badge + progress bars + paths cards
```

**Calculation Logic:**
- **Fixed Costs:** Rent, salaries, insurance, recurring subscriptions
  - Identify expenses marked as "recurring"
  - Or use heuristic: expenses that appear every month
  - Default classification: rent, salaries, admin → fixed

- **Variable Cost Ratio:**
  - Sum variable costs (expenses that correlate with revenue)
  - Variable cost ratio = total variable costs / revenue
  - For each dollar of revenue, X cents goes to variable costs

- **Contribution Margin:**
  - Contribution = revenue - variable costs
  - Contribution margin % = contribution / revenue

- **Breakeven Revenue:**
  - Breakeven = fixed costs / contribution margin %
  - Example: $20K fixed costs, 60% contribution margin → breakeven = $33.3K

- **Three Paths to Profitability:**
  1. Revenue path: "Grow revenue $X/month to reach 80% margin"
  2. Cost path: "Cut fixed costs $Y/month to reach 80% margin"
  3. Blended path: "Grow revenue 8% + cut costs 5% to reach 80% margin"

- **ROI Calculation:**
  - For each path, calculate months to profitability
  - Recommend path with shortest timeline

**Types Required:**
```typescript
interface BreakevenResult {
  fixedCosts: number;
  variableCostRatio: number;
  breakevenRevenue: number;
  currentRevenue: number;
  surplusOrGap: number;
  isAboveBreakeven: boolean;
  paths: {
    type: 'revenue' | 'cost' | 'blended';
    action: string;
    investmentNeeded: number;
    targetAchieveDate: string;
    roi: number;
  }[];
}
```

**Utilities:** `src/utils/profitability.ts`
- `computeBreakeven(transactions, settings)`

**Enhancement Needed:**
- Better classification of fixed vs variable expenses
- Machine learning to identify recurring expenses
- Manual override UI in settings

---

## Phase 2: Growth Optimizer (Weeks 9-18)

### 1. Scenario Simulator

**Component:** `ScenarioSimulator.tsx` (NEW)
**Screen:** `GrowthIntelligenceScreen` tab or separate screen
**Timeline:** Weeks 9-11

**User Inputs:**
```typescript
interface ScenarioInput {
  name: string;
  revenueGrowthRate: number;        // % per month
  costReductionRate: number;        // % per month
  newHires: number;                 // per month
  avgSalary: number;                // per new hire
  marketingSpend: number;           // $ per month
  expansionInvestment: number;      // one-time $
  timelineMonths: number;           // 1-36
}
```

**Calculation Logic:**
```
For each month i from 1 to timelineMonths:
  revenue[i] = revenue[i-1] * (1 + revenueGrowthRate/100)
  headcount[i] = headcount[i-1] + newHires
  salaries[i] = headcount[i] * avgSalary
  variableCosts[i] = revenue[i] * variableCostRatio
  totalCosts[i] = salaries[i] + fixedCosts + variableCosts[i] - (costReductionRate * totalCosts[i-1])
  profit[i] = revenue[i] - totalCosts[i]
  cashBalance[i] = cashBalance[i-1] + profit[i] - expansionInvestment
```

**Outputs:**
```typescript
interface ScenarioResult {
  months: MonthlyPoint[];
  breakEvenMonth: number | null;
  profitableMonth: number | null;
  finalCashBalance: number;
  finalProfitMargin: number;
  estimatedValuation: number;
}

interface MonthlyPoint {
  month: number;
  revenue: number;
  costs: number;
  profit: number;
  cashBalance: number;
  headcount: number;
}
```

**Visualization:**
- Line chart: Revenue, costs, profit over time
- Cash balance bar chart (color-coded: red <0, yellow <3 months, green >6 months)
- Key milestones highlighted (breakeven, profitability date)

**Components Needed:**
- ScenarioInput form with sliders
- ScenarioResults display with charts
- ScenarioComparison for side-by-side scenarios
- ScenarioSaver to persist scenarios to AsyncStorage

**Storage:**
```typescript
interface SavedScenario {
  id: string;
  name: string;
  input: ScenarioInput;
  results: ScenarioResult;
  createdAt: string;
  tags: string[];
}
```

---

### 2. Unit Economics Dashboard

**Screen:** New tab in `GrowthIntelligenceScreen` or Reports section
**Timeline:** Weeks 12-14

**Data Collection Requirements:**

Need to enhance `Invoice`, `Transaction` types:
```typescript
interface Invoice {
  // ... existing fields
  customerId: string;           // NEW
  customerSegment: 'small' | 'mid' | 'enterprise' | 'custom';  // NEW
  acquisitionChannel: string;   // NEW (e.g., 'direct-sales', 'paid-ads')
  acquisitionCost: number;      // NEW (CAC for this customer)
  acuisitionDate: string;       // NEW
}

interface Transaction {
  // ... existing fields
  channelSource?: string;       // NEW (for non-invoice income)
}
```

**Calculations:**

**CAC (Customer Acquisition Cost):**
```
CAC = total marketing spend for channel / number of new customers acquired
Tracked by: channel, segment, time period
```

**LTV (Customer Lifetime Value):**
```
LTV = gross profit per customer × expected customer lifetime
Gross profit per customer = ARPU - COGS
Expected lifetime = 1 / monthly churn rate

For SaaS:
LTV = (ARPU × gross margin % × expected months as customer)
```

**CAC Payback Period:**
```
Payback months = CAC / (monthly revenue per customer - monthly COGS)
Alert: if payback > 12 months, unit economics are poor
```

**LTV:CAC Ratio:**
```
Ratio = LTV / CAC
Healthy: > 3x
Target: > 5x
Danger: < 2x
```

**Cohort Retention Metrics:**
```
For each cohort (acquisition month):
  Retention[month 0] = all customers acquired
  Retention[month 1] = % of month 0 customers still active in month 1
  Retention[month 3] = % still active in month 3
  ...
  Retention[month 12] = 12-month retention %
```

**Churn Rate:**
```
Monthly churn = (customers lost in month / customers at start of month) × 100%
Segment churn = churn rate for specific segment
Trend: compare month-over-month churn
```

**Channel Performance:**
```
For each channel: CAC, LTV, retention, revenue, profit
Rankings: which channel has best ROI?
Alerts: CAC rising > 10% month-over-month
```

**Components Needed:**
- `UnitEconomicsDashboard.tsx` - main display
- `CACLTVCard.tsx` - shows CAC, LTV, ratio with alerts
- `PaybackPeriodCard.tsx` - shows payback months
- `ChannelComparison.tsx` - table/chart of all channels
- `CohortRetention.tsx` - retention curves by cohort
- `ChurnTrend.tsx` - churn rate trending
- `SegmentBreakdown.tsx` - by customer segment

**Data Requirements:**
- Enhancement to invoice form to capture customer segment
- Enhancement to transaction form to capture channel source
- Enhancement to settings for channel definitions

**Storage:**
```typescript
interface ChannelDef {
  id: string;
  name: string;
  type: 'paid' | 'organic' | 'direct';
  monthlyBudget?: number;
}

// Add to BusinessSettings
channels: ChannelDef[];
```

---

### 3. Advanced Scenario Comparison

**Component:** `ScenarioComparison.tsx`
**Timeline:** Weeks 15-16

**Features:**
- Load multiple saved scenarios
- Side-by-side comparison (3-4 scenarios)
- Show key metrics: profitability date, final profit, cash required
- Visualization: overlay revenue/profit curves for all scenarios
- Highlight differences between scenarios

**Predefined Templates:**
```typescript
interface ScenarioTemplate {
  name: string;
  description: string;
  input: ScenarioInput;
}

TEMPLATES:
  - Conservative: 10% revenue growth, no new hires, 5% cost reduction
  - Moderate: 25% revenue growth, 2 new hires, 10% cost reduction
  - Aggressive: 50% revenue growth, 5 new hires, 0% cost reduction
  - Profitability-first: 15% growth, 0 hires, 20% cost reduction
  - Growth-first: 60% growth, 8 hires, no cost reduction
```

**Export Functionality:**
- Generate PDF report with assumptions and results
- Share via email or link
- Compare with previous quarters (track accuracy)

---

### 4. Cohort Analysis (Included in Phase 2)

**Component:** `CohortAnalysis.tsx` (or within UnitEconomics)
**Timeline:** Weeks 12-14 (parallel with unit economics)

**Cohort Definition:**
```typescript
interface Cohort {
  month: string;           // "2024-06"
  acuiredCount: number;
  revenue0: number;        // revenue in month 0
  revenue1: number;        // revenue in month 1
  revenue3: number;        // revenue in month 3
  revenue6: number;
  revenue12: number;
  retention0: number;      // 100%
  retention1: number;      // % of acquired customers still paying
  retention3: number;
  retention6: number;
  retention12: number;
  avgLTV: number;
  avgCAC: number;
  health: 'excellent' | 'good' | 'ok' | 'poor';
}
```

**Visualization:**
- Heatmap: cohort month (rows) vs retention month (columns), cells show retention %
- Line chart: retention curves for top 6 cohorts
- Comparison: this quarter vs last quarter vs industry benchmark

**Insights Generated:**
```
"Cohorts from Q2 have 92% month-1 retention, 78% month-3.
Cohorts from Q3 have 85% month-1 retention, 65% month-3.
Signal: Product change in September hurt retention.
Action: Investigate feature rollback or revert recent changes."
```

---

## Phase 3: Strategic Planning (Weeks 19-28)

### 1. Growth Roadmap Builder

**Component:** `GrowthRoadmapBuilder.tsx`
**Timeline:** Weeks 19-21

**User Defines:**
```typescript
interface GrowthVision {
  currentMRR: number;
  targetMRR: number;
  targetYear: number;           // e.g., 2027 for 5-year
  targetMargin: number;         // target profit margin %
}

interface Milestone {
  quarter: string;              // "Q4 2024"
  targetMRR: number;
  targetMargin: number;
  initiatives: Initiative[];
}

interface Initiative {
  name: string;
  category: 'product' | 'sales' | 'marketing' | 'ops';
  estimatedRevenueLift: number; // %
  estimatedCostIncrease: number;// %
  startMonth: string;
  endMonth: string;
  owner: string;
}
```

**Simulation:**
- Simulate roadmap against targets
- Calculate probability of hitting each milestone
- Show risk factors that could derail roadmap
- Compare actual progress vs planned

**Components:**
- `RoadmapTimeline.tsx` - visual roadmap
- `MilestoneEditor.tsx` - add/edit milestones
- `InitiativeImpactCalculator.tsx` - estimate impact of each initiative
- `RoadmapVsActual.tsx` - track execution

---

### 2. Advanced Forecasting

**Component:** `CashFlowForecast.tsx`
**Timeline:** Weeks 22-23

**12-Month Projection:**
```
For each month m from 1 to 12:
  revenue[m] = cohort forecasts + new acquisition forecasts
  churn[m] = historical churn rate applied to customer base
  activeCustomers[m] = activeCustomers[m-1] - churn[m] + newCustomers[m]
  
  fixedCosts[m] = historical average + planned increases (hires, investments)
  variableCosts[m] = revenue[m] × variable cost ratio
  totalCosts[m] = fixed + variable
  
  profit[m] = revenue[m] - totalCosts[m]
  cashBalance[m] = cashBalance[m-1] + profit[m]
  runway[m] = cashBalance[m] / (totalCosts[m] / 30)
```

**Confidence Levels:**
- High (>6 months history): ±10% variance
- Medium (3-6 months): ±20% variance
- Low (new product): ±50% variance

**Funding Need Calculation:**
```
If cash balance falls below minimum reserve:
  funding_needed = minimum_reserve - lowest_forecast_balance
```

**Components:**
- `ForecastChart.tsx` - revenue, costs, profit, cash
- `RunwayCalculator.tsx` - when will cash run out?
- `FundingNeedCalculator.tsx` - how much to raise?
- `ConfidenceIndicator.tsx` - forecast accuracy level

---

### 3. Competitive Benchmarking

**Component:** `BenchmarkDashboard.tsx`
**Timeline:** Weeks 24-25

**Metrics to Calculate:**
```typescript
interface BenchmarkMetrics {
  ruleOf40: number;           // growth% + profit margin%
  cACPayback: number;         // months
  burnMultiple: number;       // months runway / MRR growth rate
  mRRGrowth: number;          // %
  grossMargin: number;        // %
  netMargin: number;          // %
  netDollarRetention: number; // % (advanced SaaS metric)
  ltv_CAC: number;
}
```

**Rule of 40:**
```
Rule of 40 = revenue growth rate % + profit margin %
Score > 40 = healthy high-growth company
Score 40-50 = excellent
Score 30-40 = good
Score <30 = needs work
```

**Data Source:**
- Pre-loaded SaaS benchmarks (from public data)
- User can optionally compare against named competitors

**Components:**
- `BenchmarkCard.tsx` - show metric vs benchmark with percentile
- `HealthScore.tsx` - overall health rating
- `BenchmarkComparison.tsx` - compare to specific peers

---

### 4. Decision Support Engine

**Component:** `DecisionEngine.tsx`
**Timeline:** Weeks 26-28

**Recommendations Algorithm:**
```
For each metric: check if it's in "action zone"

revenue_growth_low:
  If MRR growth < 20%/month:
    RECOMMEND "Increase marketing spend or review sales process"
    IMPACT "Growth from 15% to 25% would add $X MRR in 6 months"

cac_rising:
  If CAC growth > 10%/month:
    RECOMMEND "Review channel efficiency or improve ad targeting"
    IMPACT "Keeping CAC constant would save $X/month in acquisition"

churn_spike:
  If churn > historical average + 2%:
    RECOMMEND "Investigate product issue or customer support gap"
    IMPACT "Returning churn to 5% would recover $X MRR"

margin_declining:
  If margin < target margin - 10%:
    RECOMMEND "Review pricing strategy or cost structure"
    IMPACT "Returning margin to target would add $X profit/month"

cash_runway_short:
  If runway < 9 months:
    RECOMMEND "Raise funding or improve profitability"
    IMPACT "Reducing burn by 20% would extend runway to X months"
```

**Confidence Scoring:**
- High confidence: based on >6 months data, clear trend
- Medium confidence: based on 3-6 months data, weak signal
- Low confidence: new area, limited data

**Components:**
- `RecommendationCard.tsx` - show recommendation with impact
- `RecommendationQueue.tsx` - prioritized list of actions
- `ImpactSimulation.tsx` - what-if calculator for each recommendation
- `DecisionHistory.tsx` - track past recommendations vs outcomes

---

## Data Model Enhancements Needed

### Extend Transaction Type
```typescript
interface Transaction {
  // existing
  id: string;
  date: string;
  description: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled';
  
  // Phase 1 (needed for breakeven)
  isFixed?: boolean;           // expense is fixed cost
  isRecurring?: boolean;
  recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  nextRecurringDate?: string;
  
  // Phase 2 (unit economics)
  channelSource?: string;      // 'direct-sales' | 'paid-ads' | 'content' | 'organic'
  customerId?: string;
  cogs?: number;               // cost of goods sold (for LTV calculation)
}
```

### Extend Invoice Type
```typescript
interface Invoice {
  // existing
  id: string;
  clientName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  total: number;
  status: 'draft' | 'sent' | 'overdue' | 'paid' | 'cancelled';
  
  // Phase 2 (unit economics)
  customerId: string;          // link to customer
  customerSegment: 'small' | 'mid' | 'enterprise';
  acquisitionChannel: string;
  acquisitionDate: string;
}
```

### New: Customer Type
```typescript
interface Customer {
  id: string;
  name: string;
  segment: 'small' | 'mid' | 'enterprise';
  acquisitionChannel: string;
  acquisitionDate: string;
  acquisitionCost: number;
  monthlyRecurringRevenue: number;
  status: 'active' | 'churned' | 'on-hold';
  churnedDate?: string;
  contactEmail: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

### New: Scenario Type (already defined above)

### Extend BusinessSettings
```typescript
interface BusinessSettings {
  // existing
  businessType: string;
  currency: string;
  minReserve: string;
  targetMargin: string;
  
  // Phase 1 (needed)
  averageCustomerLifespan?: number;  // months, for LTV calculation
  fixedExpenseCategories?: string[];  // for breakeven
  
  // Phase 2 (needed)
  channels: ChannelDef[];
  customerSegments: {
    name: string;
    minARR: number;
    maxARR?: number;
  }[];
  
  // Phase 3 (needed)
  teamSize: number;
  avgSalary: number;
}
```

---

## Storage & Persistence Strategy

### AsyncStorage Keys
```
@FinanceBook/transactions
@FinanceBook/invoices
@FinanceBook/customers          (NEW Phase 2)
@FinanceBook/scenarios          (NEW Phase 2)
@FinanceBook/settings
@FinanceBook/goals
@FinanceBook/assets
@FinanceBook/inventory
@FinanceBook/pin
@FinanceBook/profile
@FinanceBook/language
```

### Sync Strategy
- All data syncs to AsyncStorage on change (write after 2s debounce)
- Optional: Supabase sync for backup (every 24h or on explicit save)
- On app open: load from AsyncStorage (fast), then sync from Supabase if available

### Export/Import
- Export as JSON (include all data)
- Export as CSV (transactions, invoices, customers only)
- Import existing QuickBooks/Wave CSV
- Backup/restore via file

---

## Performance Optimization Requirements

### Calculation Caching
```typescript
// Use useMemo in all calculation-heavy components
const profit = useMemo(
  () => computeFinance(transactions, settings),
  [transactions, settings]
);
```

### Query Optimization
- Filter transactions by date range before passing to calculation functions
- Don't load full 5-year history for monthly dashboard view
- Load history on-demand in reports screen

### Mobile Performance
- Lazy load components below fold
- Debounce input handlers (500ms)
- Use FlatList for long lists instead of ScrollView
- Optimize images and icons

---

## Testing Strategy

### Unit Tests Needed
- `computeProfitWaterfall()` with sample transaction data
- `identifyProfitDrivers()` with trending data
- `computeBreakeven()` with various cost structures
- `simulateScenario()` with predefined scenarios
- `calculateUnitEconomics()` with cohort data
- Date calculations and period grouping

### Integration Tests
- Add transaction → update dashboard
- Add invoice → create income transaction + update reports
- Add customer → populate unit economics
- Change settings → recalculate all metrics

### E2E Tests
- Full workflow: register → add transactions → view dashboard → run scenario
- Cross-platform: iOS, Android, Web

---

## API Integration Strategy (Future)

### Stripe Integration
- Auto-import charges and subscriptions
- Link to FinanceBook customers
- Sync subscription changes to unit economics
- Calculate LTV/CAC from Stripe data

### Notion Integration
- Export reports to Notion database
- Create dashboard cards from FinanceBook metrics
- Sync customer list to Notion

### Slack Integration
- Daily standup alerts (profit status, cash runway)
- Weekly digest (profitability trends)
- Alert on critical metrics (CAC spike, churn jump)

### Spreadsheet Integration
- Link Google Sheets for data import
- Export monthly financials to shared sheet

---

## Rollout Strategy

### Private Beta (Phase 1 Complete)
- 50-100 SaaS founders
- Gather feedback on profitability features
- Iterate on UX/calculations

### Public Launch (Phase 2 Complete)
- Full scenario simulator + unit economics
- Free tier + $19/month paid tier
- Target 500 founders in first month

### Growth (Phase 3 Complete)
- Growth roadmap + forecasting
- Integration partnerships (Stripe, Notion)
- Target 5% of pre-Series A founders

---

## Summary

| Phase | Weeks | Components | Utilities | Types | Status |
|-------|-------|-----------|-----------|-------|--------|
| 1 | 1-8 | ProfitWaterfall, ProfitDrivers, ProfitDimension, Breakeven | 5 functions | 4 new | ✅ Done |
| 2 | 9-18 | ScenarioSimulator, UnitEconomics, CohortAnalysis, ChannelAttribution | 8 functions | 6 new | 🔄 In Progress |
| 3 | 19-28 | GrowthRoadmap, CashFlowForecast, Benchmarking, DecisionEngine | 6 functions | 4 new | ⏳ Planned |
| 4 | 29-40 | Optimizations, Integrations, Education | - | - | ⏳ Planned |

**Total Implementation Time:** ~9 months for full buildout
**Team Size:** 1-2 engineers + 1 designer
**Go-to-Market:** Private beta at week 8, public launch at week 18
