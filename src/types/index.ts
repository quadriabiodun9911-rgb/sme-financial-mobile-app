export type Screen =
    | 'landing'
    | 'login'
    | 'dashboard'
    | 'reports'
    | 'transactions'
    | 'insights'
    | 'settings'
    | 'goals'
    | 'invoices'
    | 'assets'
    | 'loans'
    | 'inventory'
    | 'growth'
    | 'cfo'
    | 'budget'
    | 'analysis'
    | 'future-statements'
    | '2fa'
    | 'two-factor-verify'
    | 'payment-link'
    | 'import-transactions'
    | 'cashflow'
    | 'payroll'
    | 'reconciliation'
    | 'credit-worthiness'
    | 'onboarding-choice'
    | 'action-tracker'
    | 'financial-assessment'
    | 'financial-health'
    | 'business-passport'
    | 'scoreboard'
    | 'risk-management'
    | 'macro-assumptions'
    | 'future-events'
    | 'financing-marketplace'
    | 'financing-admin'
    | 'contact'
    | 'blog'
    | 'blog-post'
    | 'privacy-policy'
    | 'data-integrity'
    | 'audit-log'
    | 'security-center'
    | 'business-timeline'
    | 'data-permission-centre';

export interface Budget {
    id: string;
    category: string;
    monthlyAmount: number;
    period: string; // YYYY-MM
}

// ─── Payroll ──────────────────────────────────────────────────────────────────
export interface StaffMember {
    id: string;
    name: string;
    role: string;
    salary: number;          // gross monthly salary
    salaryType: 'monthly' | 'weekly' | 'daily';
    startDate: string;       // ISO date
    status: 'active' | 'inactive';
    email?: string;
    phone?: string;
    bankName?: string;
    accountNumber?: string;
    createdAt: string;
}

export interface PayrollItem {
    staffId: string;
    staffName: string;
    grossSalary: number;
    deductions: number;
    netSalary: number;
}

export interface PayrollRun {
    id: string;
    period: string;          // YYYY-MM
    runDate: string;         // ISO date
    items: PayrollItem[];
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    status: 'draft' | 'paid';
    transactionId?: string;  // linked expense transaction id
    createdAt: string;
}

export type ReportTab =
    | 'balancesheet'
    | 'pnl'
    | 'financial_planning'
    | 'cash_flow_statement'
    | 'cash_management'
    | 'debt_management'
    | 'financial_health'
    | 'aging'
    | 'tax'
    | 'swot';

export type TransactionStatus = 'paid' | 'pending' | 'overdue';
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type GoalType =
    | 'revenue_growth'
    | 'margin_improvement'
    | 'cost_reduction'
    | 'cash_reserve'
    | 'reduce_overdue_ar'
    | 'custom';

export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'achieved';

export interface FinancialGoal {
    id: string;
    type: GoalType;
    title: string;
    description: string;
    targetValue: number;       // e.g. 20 (for 20% revenue growth)
    unit: string;              // e.g. '%', currency symbol, 'days'
    baselineValue: number;     // value at time of goal creation
    currentValue: number;      // latest computed value
    deadline: string;          // ISO date
    createdAt: string;         // ISO date
    status: GoalStatus;
    progress: number;          // 0–100 %
    percentTarget?: number;
}

export interface GoalStrategy {
    goalId: string;
    actions: StrategyAction[];
    generatedAt: string;
}

export interface StrategyAction {
    priority: 'high' | 'medium' | 'low';
    title: string;
    detail: string;
    metric?: string;           // e.g. "Current margin: 42%" — live metric shown alongside
}

export interface SwotItem {
    text: string;
    metric?: string;           // live data point supporting this item
}

export interface SwotAnalysis {
    strengths: SwotItem[];
    weaknesses: SwotItem[];
    opportunities: SwotItem[];
    threats: SwotItem[];
    generatedAt: string;
}

export interface Transaction {
    id: string;
    date: string;
    description: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
    transactionCategory?: 'purchase' | 'sale' | 'expense' | 'cost' | 'other';
    // How the money moved -- set only when the owner records it explicitly
    // (undefined for imported/legacy transactions, which mostly come from a
    // bank statement anyway). Lets a cash-heavy business separate "Cash
    // Sales" from "Bank Sales" in its revenue breakdown instead of the
    // bank statement silently standing in for the whole business.
    paymentMethod?: 'cash' | 'bank' | 'pos' | 'transfer' | 'other';
    reference?: string;
    vendorCustomer?: string;
    taxRate?: number;
    taxAmount?: number;
    status?: TransactionStatus;
    dueDate?: string;
    isRecurring?: boolean;
    recurringFrequency?: RecurringFrequency;
    nextRecurringDate?: string;
    // Set only on loan-repayment expense transactions: the portion of
    // `amount` that repaid principal, not interest. GAAP/IFRS only ever
    // expense the interest portion of a debt payment — principal reduces
    // the loan liability on the balance sheet, it never touches the income
    // statement. `amount` stays the full cash paid (so cash balance and
    // bank reconciliation are unaffected); every P&L/profitability
    // calculation subtracts `principalPortion` from `amount` before
    // treating it as a real expense.
    principalPortion?: number;
    // Set only on an income transaction created by Inventory's "Sell"
    // button (see InventoryScreen.confirmSell): quantity sold × the item's
    // costPrice at the moment of sale -- the real cost basis of that
    // specific sale, not a value derived later from a possibly-changed
    // current costPrice. Undefined on every other transaction, including
    // stock sales recorded before this field existed -- there's no honest
    // way to reconstruct their cost basis after the fact, so they're
    // treated as unknown (0), not silently assumed to have zero cost.
    costOfGoodsSold?: number;
    // Set on transactions created by Inventory's Sell and Stock In actions --
    // the precise link stockVelocity.ts and any future per-item purchase/
    // sale history need. Transactions written before this field existed (or
    // logged manually outside Inventory) don't have it; consumers fall back
    // to the older `description === "Sale: {item.name}"` string match for
    // those, same as before this field was introduced.
    inventoryItemId?: string;
    // Set on an Inventory "Sell" transaction: the exact units sold, as
    // entered -- not something later code should reconstruct from amount /
    // item.sellingPrice, because a discounted sale's `amount` is lower than
    // qty * sellingPrice for the same quantity, which would silently
    // undercount units in anything (e.g. stockVelocity.ts) that divides
    // revenue back out to estimate quantity. Undefined on transactions
    // recorded before this field existed; those still fall back to the
    // revenue/sellingPrice estimate, same as before.
    unitsSold?: number;
    // Set on an Inventory "Sell" transaction when a discount was applied:
    // the ₦ amount taken off qty * item.sellingPrice for this specific
    // sale. `amount` is always the actual, discounted revenue (what the
    // customer paid) -- never the standard price -- so gross (undiscounted)
    // revenue for a sale is always recoverable as `amount + discountAmount`.
    // Never rewritten after the sale: a later price or discount policy
    // change must not alter what a completed sale is recorded as having
    // earned.
    discountAmount?: number;
}

export interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    cashBalance: number;
    totalRevenue: number;
    totalCosts: number;
    assets: number;
    liabilities: number;
    equity: number;
    totalTaxCollected: number;
    totalTaxPaid: number;
    netTaxPosition: number;
    annualDepreciation: number;   // total depreciation charge for the year
    depreciationAdjustedProfit: number; // profit after depreciation
    runway?: number; // days of cash runway at current burn rate
    revenue?: number; // alias for income for backward compatibility
    expenses?: number; // alias for expense for backward compatibility
}

export interface User {
    email: string;
    businessName: string;
    role: string;
    phone?: string;
    daysActive?: number;
    avgMonthlyRevenue?: number;
    avgMonthlyProfit?: number;
    totalRecordedRevenue?: number;
    financialHealthScore?: number;
    createdAt?: string;
}

// Drives which industry-specific features show up (e.g. Recipe/Menu Item
// Costing only makes sense for food service — showing it to a retailer or
// consultant would just be clutter). 'general' is the default for anyone
// who doesn't fit retail or food service, or hasn't set this yet.
export type Industry = 'general' | 'retail' | 'food-service' | 'manufacturing' | 'professional-services';

// What kind of external, outside-the-business factor this assumption tracks —
// drives which icon/framing the resulting insight uses (e.g. "Energy Risk"
// vs "FX Risk") and lets the UI group assumptions sensibly. 'demand' is the
// one non-cost driver -- a belief about market demand strengthening or
// weakening, not a cost pressure, so it reads as a tailwind/headwind on
// revenue rather than a risk on an expense category.
export type MacroDriver = 'energy' | 'fx' | 'interestRate' | 'inflation' | 'commodity' | 'regulation' | 'supplyChain' | 'demand';

// An owner-entered belief about an external factor (e.g. "diesel prices are
// up 20% this quarter"), manually maintained since this app has no live
// external data feed. Linking it to specific expense categories is what lets
// the business-intelligence layer turn "diesel is up nationally" into
// "your diesel spend is up and here's what that means for you" instead of
// showing every business owner the same generic headline regardless of
// whether it actually touches their cost structure. For driver: 'demand',
// linkedCategories is not required -- a demand belief isn't corroborated
// against a specific expense category the way a cost driver is.
export interface MacroAssumption {
    id: string;
    driver: MacroDriver;
    label: string;              // e.g. "Diesel price" or a user-defined label
    changePct: number;          // % change the owner has observed/expects over periodMonths -- for 'demand', positive means demand is strengthening
    periodMonths: number;       // the window the changePct applies to, e.g. 3
    linkedCategories: string[]; // transaction categories this driver affects, e.g. ["Fuel","Utilities"]; unused for 'demand'
    note?: string;
    updatedAt: string;          // ISO date, so a stale assumption can be flagged
    source?: string;            // where this figure came from, e.g. "NNPC pump price bulletin" or "Heard from supplier" -- owner-entered, never inferred
    confidence?: MacroAssumptionConfidence; // how sure the owner is of this figure -- optional so existing assumptions from before this field existed don't need backfilling
}

export type MacroAssumptionConfidence = 'low' | 'medium' | 'high';

// A category label for a Known Future Event -- drives the icon/framing
// used when listing it, purely cosmetic (the forecast math only cares
// about direction/recurring/amount/date).
export type FutureEventCategory = 'expansion' | 'hiring' | 'contract' | 'equipment' | 'marketing' | 'other';

// Something the owner already knows is coming that historical transactions
// can't predict -- a new branch, a new hire, a major contract, an
// equipment purchase. Unlike a What If? adjustment (exploratory, screen-
// local, never saved), a Known Future Event is a real plan the owner is
// telling Quad360 about, so it persists like Macro Assumptions and is
// always factored into the forecast rather than toggled on and off.
export interface FutureEvent {
    id: string;
    label: string;                  // e.g. "New branch", "New employee — cashier", "Contract — Acme Corp"
    category: FutureEventCategory;
    amount: number;                 // magnitude in currency, always positive
    direction: 'inflow' | 'outflow'; // whether this adds to cash/revenue or costs money
    recurring: boolean;              // false = a one-time event (equipment purchase, a single contract payment); true = ongoing every month from `date` onward (a new hire's salary, a recurring contract)
    date: string;                   // ISO date (YYYY-MM-DD) -- the month this is expected to start
    note?: string;
    createdAt: string;
}

export interface BusinessSettings {
    businessName?: string;
    businessType: 'product' | 'service' | 'both';
    industry?: Industry;
    currency: string;
    currencyCode: string;  // ISO code e.g. 'NGN', 'USD'
    minReserve: string;
    targetMargin: string;
    openingAssets: string;
    openingLiabilities: string;
    openingLoans: string;
    openingOtherAssets: string;
    defaultTaxRate: string;
    paystackPublicKey?: string;
    korapayPublicKey?: string;
    payrollProviderId?: string; // 'manual' (default) | 'gusto' | 'deel' — see src/utils/payrollProvider.ts
    missionStatement?: string; // why the business exists, and what you do daily to get there — shown alongside priorities/strategy screens as a decision check, not just stored
    visionStatement?: string;  // the long-term destination
    coreValues?: string;       // the moral compass — how the team behaves getting there (e.g. "Integrity, reliability, community focus")
    nextTaxDeadline?: string;  // ISO date — next VAT/Corporation Tax (or local equivalent) filing deadline, used by Tax Filing Readiness
    legalEntityType?: LegalEntityType; // drives the generic compliance-obligations checklist on Tax Filing Readiness
    macroAssumptions?: MacroAssumption[]; // owner-entered external-factor beliefs, see MacroAssumption
    futureEvents?: FutureEvent[]; // owner-entered known future plans, see FutureEvent
    // Asked once at onboarding (editable later in Settings) — the one thing
    // the owner said matters most right now. Only the values the app can
    // genuinely act on today are offered (see OnboardingChoiceScreen):
    // real signals get re-ranked toward what was chosen, nothing is
    // fabricated to fit an answer the app has no data behind.
    primaryGoal?: PrimaryGoal;
}

export type PrimaryGoal = 'cashflow' | 'costs' | 'financing';

export interface NavParams {
    reportSection?: 'statements' | 'customers' | 'tax' | 'planning' | 'growth';
    reportTab?: string;
    tab?: string;              // sub-tab within a screen that manages its own tab state (e.g. CFOScreen, GrowthIntelligenceScreen)
    goalType?: GoalType;
    goalId?: string;           // pass a saved goal into Goal Bridge
    openWeeklyReport?: boolean; // open the Weekly Dashboard modal on the Dashboard screen
    // Payment link pre-fill from invoice
    amount?: number;
    description?: string;
    customerName?: string;
    customerEmail?: string;
    invoiceId?: string;
}

export type UserRole = 'owner' | 'admin' | 'accountant' | 'manager' | 'staff' | 'external_accountant' | 'viewer';
export type Language = 'en' | 'zh';

// Generic legal-structure categories, not tied to any one country's exact
// registration terms — used to surface the broad compliance obligations
// that structure implies (see src/utils/complianceMapping.ts), not to give
// jurisdiction-specific legal advice.
export type LegalEntityType = 'sole-proprietorship' | 'partnership' | 'llc' | 'corporation' | 'nonprofit';

export type AssetCategory = 'equipment' | 'vehicle' | 'furniture' | 'property' | 'intangible' | 'other';
export type AssetStatus = 'active' | 'disposed';

export interface Asset {
    id: string;
    name: string;
    category: AssetCategory;
    description: string;
    purchaseDate: string;       // ISO date
    purchaseCost: number;
    usefulLifeYears: number;
    residualValue: number;
    status: AssetStatus;
    disposalDate?: string;
    disposalValue?: number;
    createdAt: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    sku?: string;
    category: string;
    quantity: number;
    unit: string; // 'pcs', 'kg', 'litres', etc.
    // Weighted-average cost per unit across everything currently in stock --
    // not simply "what the last purchase cost". Stock In (see
    // inventoryCosting.applyStockIn) blends this with each new purchase's
    // cost, proportionally to quantity, so it stays a true average cost
    // rather than snapping to whatever was bought most recently.
    costPrice: number;
    sellingPrice: number;  // what you sell for per unit
    // Reorder point -- kept as the pre-existing field name (renaming would
    // touch every screen/engine that already reads it) but shown to the
    // user as "Reorder Level".
    lowStockThreshold: number;
    supplier?: string; // most recent supplier this item was bought from
    createdAt: string;
    updatedAt: string;
    // Every deliberate selling-price change (via Inventory's "Change Price"
    // action, not a plain Edit), oldest first. costPrice on each entry is
    // the cost AT THAT TIME -- price changes never touch cost, so this is
    // what makes each entry's margin honest even after costPrice has since
    // moved on via later Stock In purchases. The item's original price is
    // backfilled as the first entry the first time a price change is made,
    // so the table shows "where pricing started" too, not just changes
    // made after this feature shipped.
    priceHistory?: PriceHistoryEntry[];
    // Every physical stock count the owner has actually performed, oldest
    // first -- see stockCount.ts. This is the one place a genuine per-item
    // "expected vs actual" comparison is honest: expectedQuantity is what
    // the system's own records (sales through Sell + Stock In) already
    // implied, actualQuantity is a real count the owner just took, so
    // neither side is guessed.
    stockCountHistory?: StockCountEntry[];
}

export interface PriceHistoryEntry {
    date: string;        // ISO date, effective from
    sellingPrice: number;
    costPrice: number;    // cost at the time of this price change
    reason?: string;
}

export interface StockCountEntry {
    date: string;             // ISO date the count was taken
    expectedQuantity: number; // item.quantity immediately before this count -- what recorded sales/restocks implied
    actualQuantity: number;   // what the owner physically counted
    differenceUnits: number;  // actualQuantity - expectedQuantity, signed (negative = fewer on the shelf than records suggest)
    note?: string;
}

export interface TeamMember {
    id: string;
    ownerUserId: string;
    memberEmail: string;
    memberUserId: string | null;
    role: 'accountant' | 'manager' | 'staff' | 'admin' | 'external_accountant' | 'viewer';
    status: 'pending' | 'active';
    inviteCode: string;
    invitedAt: string;
}

export interface AgingBucket {
    label: string;
    transactions: Transaction[];
    total: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceLineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
}

export interface Invoice {
    id: string;
    invoiceNumber: string;
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
    clientAddress: string;
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    notes: string;
    status: InvoiceStatus;
    subtotal: number;
    taxTotal: number;
    total: number;
    createdAt: string;
}

export type LoanStatus = 'active' | 'paid_off' | 'defaulted';

export interface LoanPayment {
    id: string;
    date: string;
    // The principal portion of this installment — every consumer of
    // Loan.payments (outstanding balance, payoff %, balance sheet) sums
    // `amount` to find out how much of the original principal remains, so
    // it must represent principal paid down, not the total cash handed to
    // the lender. See `interestPortion` for the rest of what was paid.
    amount: number;
    interestPortion?: number;
    note?: string;
}

export interface Loan {
    id: string;
    lenderName: string;
    purpose: string;
    principal: number;
    interestRate: number;   // annual % e.g. 15 for 15%
    termMonths: number;
    startDate: string;      // ISO date
    status: LoanStatus;
    payments: LoanPayment[];
    createdAt: string;
    // Post-Financing Intelligence: self-reported, since Quad360 has no way
    // to independently confirm a marketplace match became a real loan.
    // Enables "This Loan's Impact" monitoring once set.
    fromMarketplace?: boolean;
    // Phase 2a: explicit, separate consent to share the coarse status from
    // "This Loan's Impact" with the lender who funded it -- default off,
    // revocable at any time. Deliberately a second flag, not folded into
    // fromMarketplace, since "monitor this for me" and "share this with my
    // lender" are two different decisions with different stakes.
    shareWithLenderConsent?: boolean;
    shareConsentUpdatedAt?: string;
    // Phase 2b: the specific lender_organizations.id this loan is linked
    // to, set only when the business picks their lender from Quad360's own
    // registered directory (see lenderDirectory.ts) -- never inferred from
    // the free-text lenderName above, which can't be trusted to identify a
    // real account. Required before shareWithLenderConsent can do anything:
    // without a real linked org there's no lender dashboard to publish to.
    lenderOrgId?: string;
}

// ─── Financing Marketplace ──────────────────────────────────────────────────
// The lender-facing half of the financing-matching idea: a lender "lists"
// what it's willing to finance (amount/term/rate range + eligibility
// criteria) and Quad360 scores each business against it using the same
// figures already computed for Credit-Worthiness/Funding Readiness — never a
// second, independently-tuned assessment. Quad360 has no live lender
// integrations yet, so every FinancingProduct in this app is a labeled
// illustrative sample (see financingProducts.ts) demonstrating the matching
// engine, not a real, currently-applyable offer — the same "wide, clearly-
// labeled ranges rather than fabricated bank-specific figures" discipline
// lendingCapacity.ts already follows.
export type FinancingProductType =
    | 'asset_financing'
    | 'working_capital'
    | 'invoice_financing'
    | 'trade_finance'
    | 'term_loan'
    | 'overdraft';

export type LenderType = 'bank' | 'fintech' | 'dfi' | 'microfinance';

export interface FinancingEligibility {
    minMonthlyRevenue?: number;
    minBusinessAgeMonths?: number;
    minDSCR?: number;
    eligibleIndustries?: Industry[]; // undefined/empty = open to all industries
    minEquityContributionPct?: number; // asset financing: the business's own contribution toward the asset price -- Quad360 doesn't track this, always surfaces as "unknown" rather than assumed pass/fail
    maxDebtToRevenueRatio?: number; // existing debt ÷ trailing annual revenue, a simple leverage cap
    minTransactionHistoryMonths?: number;
}

export type FinancingProductStatus = 'active' | 'inactive';

export interface FinancingProduct {
    id: string;
    lenderName: string;
    lenderType: LenderType;
    productType: FinancingProductType;
    productName: string;
    description: string;
    minAmount: number;
    maxAmount: number;
    minTermMonths: number;
    maxTermMonths: number;
    interestRateMinPct: number; // annual %
    interestRateMaxPct: number;
    eligibility: FinancingEligibility;
    // Set only on real, admin-managed listings (financing_products table) --
    // the hardcoded SAMPLE_FINANCING_PRODUCTS never populate these.
    status?: FinancingProductStatus;
    ownerUserId?: string;    // null/undefined = admin-managed; populated once lender self-service accounts exist
    // null/undefined = Quad360-staff-entered (financingAdmin.ts). Set when a
    // signed-in lender org member created this listing themselves via the
    // "My Listings" tab (LenderPipelineScreen.tsx) -- see migration 011,
    // whose RLS lets any active member of this org manage rows scoped to it.
    lenderOrgId?: string;
    createdBy?: string;      // admin email, or the lender member's own email, that created/last edited this listing
    createdAt?: string;
    updatedAt?: string;
}

// The SME-published (opt-in) side of the lender pipeline -- see
// supabase/migrations/008_lender_pipeline_phase0.sql and
// src/utils/financingPipeline.ts. Deliberately narrow: every field here is
// an aggregate/derived output (a score, a band, a bucketed range), never a
// raw transaction or an exact revenue figure -- the non-negotiable
// constraint from the Lender Auth & Visibility Scope document.
export type PipelineListingStatus = 'active' | 'inactive' | 'matched';

export interface PipelineListing {
    id: string;
    financingType: FinancingProductType;
    grade: string;   // computeRiskScore() output, e.g. 'A'
    band: string;     // computeRiskScore() output, e.g. 'Strong'
    score: number;
    dscr: number;
    dscrStatus: 'healthy' | 'warning' | 'danger';
    sector?: string;
    revenueBand?: string;  // bucketed, e.g. "₦10M-50M" -- never the exact figure
    requestedAmount?: number;
    purpose?: string;
    status: PipelineListingStatus;
    optedInAt: string;
    expiresAt?: string;
}

// The lender side of the pipeline -- see
// supabase/migrations/008_lender_pipeline_phase0.sql and
// src/utils/lenderAuth.ts. Phase 2: admin-invited only (mirrors
// financing_products' current admin-managed model); self-serve signup is
// a later phase per the scope document.
export type LenderOrgType = 'bank' | 'fintech' | 'dfi' | 'microfinance';
export type LenderOrgStatus = 'pending' | 'active' | 'suspended';

export interface LenderOrganization {
    id: string;
    name: string;
    orgType: LenderOrgType;
    verifiedAt: string | null;
    status: LenderOrgStatus;
    createdAt: string;
}

export type LenderMemberRole = 'admin' | 'analyst';
export type LenderMemberStatus = 'pending' | 'active';

export interface LenderMember {
    id: string;
    lenderOrgId: string;
    memberEmail: string;
    memberUserId: string | null;
    role: LenderMemberRole;
    status: LenderMemberStatus;
    inviteCode: string | null;
    invitedAt: string;
}

export interface CashPocket {
    id: string;
    name: string;
    amount: number;
    updatedAt: string; // ISO date
}

// ─── Capital Commitments ───────────────────────────────────────────────────
// "Is each investment delivering what we approved it for?" — a tracked
// approval with a few KPIs and a target, checked against an actual figure
// the owner updates themselves. Quad360 has no way to auto-detect whether
// a piece of equipment or a marketing spend is "delivering" — this is a
// deliberate record, not an inferred one.
export interface CommitmentKPI {
    id: string;
    name: string;
    target: number;
    actual: number;
}

export type CommitmentStatus = 'on-track' | 'at-risk' | 'off-track' | 'not-started';

export interface CapitalCommitment {
    id: string;
    name: string;
    amountApproved: number;
    purpose: string;
    approvedDate: string; // ISO date
    kpis: CommitmentKPI[];
    status: CommitmentStatus;
    createdAt: string;
    updatedAt: string;
}

// ─── Readiness History ─────────────────────────────────────────────────────
// A periodic snapshot of computeRiskScore's output -- every other score in
// the app is computed fresh from current state with no memory of where it
// was last month. This is the one place that memory is kept, so "are you
// becoming more financeable over time" can be answered with an actual trend
// instead of a single point-in-time number.
export interface ReadinessFactorSnapshot {
    name: string;
    score: number;
    status: 'good' | 'warning' | 'danger';
}

export interface ReadinessSnapshot {
    id: string;
    date: string; // ISO date (YYYY-MM-DD)
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    band: 'Excellent' | 'Strong' | 'Moderate' | 'Weak' | 'Critical';
    factors: ReadinessFactorSnapshot[];
}

// A dated point-in-time reading of dataConfidenceHistory.ts's blended
// coverage/classification % -- the "cold start" trend: a fresh account
// starts low simply because it has little history yet, and this is what
// lets the app show that honestly growing over time instead of a static
// snapshot that never explains why it's low.
export interface DataConfidenceSnapshot {
    id: string;
    date: string; // ISO date (YYYY-MM-DD)
    confidencePct: number;
}

// ─── Merchant Financing ────────────────────────────────────────────────────────
export type MerchantFinancingStatus = 'pending' | 'approved' | 'rejected' | 'funded' | 'repaying' | 'paid_off';
export type LoanPurpose =
    | 'inventory'
    | 'equipment'
    | 'both'
    | 'supplier_payment'
    | 'invoice_financing'
    | 'expansion'
    | 'emergency_working_capital'
    | 'other';

export interface MerchantFinancingPayment {
    id: string;
    date: string;
    amount: number;
    note?: string;
}

export interface MerchantFinancingApplication {
    id: string;
    userId: string;
    status: MerchantFinancingStatus;
    requestedAmount: number;
    approvedAmount?: number;
    approvalDate?: string;
    fundingDate?: string;
    payoffDate?: string;
    purpose: LoanPurpose;
    monthlyPayment?: number;
    interestRate: number;
    termMonths: number;
    lenderName: string;
    lenderId: string;
    appliedDate: string;
    rejectionReason?: string;
    nextPaymentDue?: string;
    monthlyProfitAtApproval: number;
    monthlyProfitCurrent: number;
    totalRepaid?: number;
    payments?: MerchantFinancingPayment[];
}

export interface FinancingQualification {
    daysActiveOk: boolean;
    revenueOk: boolean;
    healthScoreOk: boolean;
}

export interface FinancingContextData {
    isQualified: boolean;
    qualification?: FinancingQualification;
    minQualifiedAmount?: number;
    maxQualifiedAmount?: number;
    application?: MerchantFinancingApplication;
    activeLoan?: MerchantFinancingApplication;
    pastApplications?: MerchantFinancingApplication[];
    applicationStatus?: MerchantFinancingStatus | null;
}
