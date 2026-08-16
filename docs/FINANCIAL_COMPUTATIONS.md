# Quad360 Financial Computations — Reference for Review

This document exists so an accountant, CPA, or auditor reviewing Quad360's
financial statements and scoring can check the underlying formulas and
assumptions directly, without reverse-engineering TypeScript. Every formula
below is transcribed from the actual source (file and function named), not
paraphrased from memory — if this document and the code ever disagree, the
code is the source of truth and this document has drifted and needs
updating.

Every number Quad360 shows a user is computed from the same functions
documented here — there is no separate, independently-tuned "display"
figure anywhere. Where a computation has a real limitation (data it can't
see, an estimate rather than a fact), that limitation is stated plainly
rather than smoothed over.

**What Quad360 is not**: an accounting system that replaces double-entry
bookkeeping, a tax preparer, or a source of legal/financial advice. It is a
single-entry transaction ledger (each row is `{date, type: income|expense,
category, amount, status}`) with derived reports built on top. Several of
the "known limitations" below follow directly from that: no chart of
accounts, no general ledger, no multi-currency, no partial payments.

---

## 1. Profit & Loss — `computeEnhancedPnL()` (`src/utils/finance.ts`)

Multi-step income statement: Revenue → COGS → Gross Profit → Operating
Expenses → EBITDA → Depreciation → EBIT → Interest → Net Profit.

| Line | Formula |
|---|---|
| Revenue | Sum of all `type: 'income'` transaction amounts (all statuses — accrual basis, see §7) |
| COGS | Sum of expense amounts whose `category` matches a cost-of-goods keyword (`cost`, `cogs`, `material`, `labour`/`labor`, `production`, `manufacturing`, `inventory`, `purchase`, `supplier`, `raw`, `freight`, `delivery`), case-insensitive substring match |
| Gross Profit | Revenue − COGS |
| SG&A (Operating Expenses) | Sum of expense amounts that are neither COGS nor `category === 'Loan Repayment'` |
| EBITDA | Gross Profit − SG&A |
| Depreciation | Sum of `computeAssetAnnualDepreciation()` (straight-line: `(cost − residual) / usefulLifeYears`) across active assets, **prorated** by the fraction of a year the transaction data actually spans (capped at 1) — see §8 |
| EBIT | EBITDA − Depreciation |
| Interest Expense | Sum of the amount of `Loan Repayment` transactions **excluding** `principalPortion` — see §6 |
| Profit Before Tax | EBIT − Interest Expense |
| **Net Profit** | = Profit Before Tax. **No income tax provision is modeled** — see §9. This is a pre-tax figure, not true after-tax Net Income, and every UI surface using this function says so. |

Every expense transaction is reduced by its own `principalPortion` before
being classified into COGS or SG&A — a loan repayment's principal component
never reaches either bucket (§6).

---

## 2. Statement of Cash Flows — `computeProperCashFlow()` (indirect method) (`src/utils/finance.ts`)

Three-section indirect-method statement: Operating → Investing → Financing.

**Starting point (net profit for reconciliation):**
```
netProfit = totalRevenue − totalExpense
```
where `totalRevenue`/`totalExpense` are **accrual-basis** (all transactions
regardless of paid status, `principalPortion` excluded from `totalExpense`).
This is deliberate, not an oversight: the AR/AP reconciliation lines below
convert this accrual figure to a cash figure. Using a cash-basis starting
point here would double-count the AR/AP adjustment — this exact bug existed
earlier in this codebase and was fixed; a regression test
(`__tests__/properCashFlow.test.ts`) locks in the fix.

| Section | Line | Formula |
|---|---|---|
| Operating | Net Profit | accrual-basis, above |
| Operating | + Depreciation | non-cash, added back |
| Operating | + Δ AR | `−uncollectedAR` (increase in receivables is a cash outflow-equivalent) |
| Operating | + Δ AP | `+unpaidAP` (increase in payables is a cash inflow-equivalent) |
| Operating | **= Operating CF** | sum of the above |
| Investing | − Asset Purchases | full purchase cost of every recorded asset (not just this period's — see §10) |
| Investing | + Asset Disposals | disposal value of assets with `status: 'disposed'` |
| Investing | **= Investing CF** | sum |
| Financing | − Principal Repayments | sum of `principalPortion` across paid expense transactions |
| Financing | **= Financing CF** | (currently only principal repayments — no loan draws or owner capital contributions are tracked; UI states this) |
| | **Net Cash Change** | Operating CF + Investing CF + Financing CF |

`collectedRevenue`/`paidExpenses` (cash-basis figures, paid-status-filtered)
are also returned for the app's simple cash-basis views, but are **not**
used to derive `netProfit` above.

---

## 3. Balance Sheet — `computeBalanceSheetTrend()` (`src/utils/balanceSheetTrend.ts`) and the current-only Balance Sheet screen

A balance sheet is a snapshot; this app stores transactions (dated facts),
not historical account-balance snapshots. What can be **honestly
reconstructed** for any past date, and what can't, is the central design
constraint of this module:

**Reconstructable from dated transaction/asset/loan records:**
- **Cash on hand as of date D** — running sum of paid transactions dated ≤ D (`+income`, `−expense`)
- **Accounts Receivable as of D** — income transactions dated ≤ D still `pending`/`overdue` **today**. Caveat: "still unpaid today" is a floor, not the true AR as of D — an invoice outstanding in March and paid since won't appear. Older periods systematically undercount for this reason. Flagged in the UI.
- **Accounts Payable as of D** — same construction/caveat, expense side
- **Equipment value as of D** — per-asset straight-line depreciation as of D: `max(residual, cost − yearsOwned × (cost−residual)/usefulLifeYears)`
- **Loan balances as of D**, split current/non-current — see §11

**NOT reconstructable, shown as today's flat total repeated in every column** (explicitly caveated in the UI, never presented as a trend): stock/inventory value, manually-entered equipment, other assets, other liabilities. This app has no dated history of inventory movements or manual balance edits.

**Totals:**
```
Total Current Assets    = Cash + AR + Inventory(flat)
Total Assets             = Current Assets + Equipment + Manual Equipment(flat) + Other Assets(flat)
Total Current Liabilities = AP + Loans(current portion) + Other Liabilities(flat)
Total Liabilities        = AP + Loans(total) + Other Liabilities(flat)
Owners' Equity (Net Worth) = Total Assets − Total Liabilities
Working Capital           = Cash on Hand − Accounts Payable
```
`Total Assets = Total Liabilities + Owners' Equity` holds by construction
(equity is the plug), and has been verified to hold live in the formal
Balance Sheet statement view.

---

## 4. Leverage Ratios — `computeLeverageRatios()` (`src/utils/debtRatios.ts`)

```
liabilities = finance.liabilities + live loan balances + accountsPayable
assets      = finance.assets + accountsReceivable + inventoryValue
equity      = assets − liabilities   (recomputed here, not read from finance.equity — see code comment on why: using the pre-loan-inclusive finance.equity broke the balance-sheet identity)

debtToAssets   = liabilities / assets × 100         (0 if no assets recorded — hasAssetData flags this)
debtToEquity   = liabilities / equity                (Infinity if equity ≤ 0 and liabilities > 0; 0 if no liabilities)
equityRatio    = equity / assets × 100
returnOnAssets = profit / assets × 100
returnOnEquity = profit / equity × 100
```
`hasAssetData` (true only when `assets > 0`) must be checked before
displaying `debtToAssets`/`equityRatio` as a real figure — with no assets
recorded there's nothing to compute a ratio against, and a raw `0%` would
misleadingly read as "strong."

---

## 5. DSCR (Debt Service Coverage Ratio) — `computeDSCR()` (`src/utils/finance.ts`)

```
Net Operating Income = trailing-12-month income − trailing-12-month expense (excluding Loan Repayment category entirely, principal AND interest)
```
If less than a full year of history exists (≥30 and <365 days of dated
data), NOI is **annualized**: `NOI × (365 / spanDays)`, so a 2-month-old
business isn't judged on 2 months of income as if that were its full annual
capacity. Below 30 days of span, no annualization is applied (too little
data to extrapolate from).

```
Total Debt Service = Σ (monthly payment × 12) across active loans
monthly payment    = standard amortization formula: P × (r(1+r)^n) / ((1+r)^n − 1), r = monthly rate, n = termMonths
DSCR               = NOI / Total Debt Service   (999 sentinel if no debt service)
status             = healthy (≥1.25) | warning (≥1.0) | danger (<1.0)
```

---

## 6. GAAP/IFRS Decision: Loan Principal Is Never a P&L Expense

Applied consistently across every profit/expense calculation in the app
(`computeEnhancedPnL`, `computeFinance`, `computeProperCashFlow`,
`computeDSCR`, `getTopCategories`, the Tax Planning quarterly summary):
```
recognized expense = transaction.amount − transaction.principalPortion
```
`principalPortion` is set only on loan-repayment expense transactions
(`OptimizedContexts.addLoanPayment`) and marks the portion of the payment
that reduced the loan liability rather than being a real cost. `amount`
itself is left at the full cash paid, so cash balance and bank
reconciliation are unaffected — only P&L/profitability figures exclude the
principal portion. This exact omission (forgetting to exclude
`principalPortion` in one specific calculation) has recurred twice in this
codebase's history in different files; both were caught and fixed, and it's
the single most important line item for a reviewer to spot-check if adding
any new profit-related calculation.

---

## 7. Accrual vs. Cash Basis — Which Figures Are Which

| Figure | Basis |
|---|---|
| `computeEnhancedPnL` revenue/COGS/profit | **Accrual** — all transactions regardless of `status` |
| `computeFinance().income/expense/profit/margin` | **Accrual** |
| `computeFinance().cashBalance` | **Cash** — `status === 'paid'` only (transactions with no status set are treated as paid, matching the default status used at entry) |
| `computeProperCashFlow` netProfit (starting line) | **Accrual** — see §2 for why |
| `computeProperCashFlow` collectedRevenue/paidExpenses | **Cash** (`status === 'paid'` only) — kept alongside the accrual figures for the app's simple cash-basis views, not used in the indirect-method reconciliation itself |
| `AccrualCashFlow.tsx`'s "Accrual Revenue"/"Accrual Expenses" cards | Cash-collected + still-unpaid, shown side by side with the pure-cash figure for comparison — a presentation layer over the same underlying transactions, not a third computation |

---

## 8. Depreciation Proration

`computeAssetAnnualDepreciation()` (straight-line, `(cost − residual) /
usefulLifeYears`) returns a full **annual** figure. Wherever this is
charged against a period shorter than a year (e.g. `computeEnhancedPnL`
called on a trailing-3-month slice), it's prorated by
`transactionSpanYears()`: the fraction of a year actually covered by dated
transactions in that slice, capped at 1. Without this, a full year's
depreciation charged against one month of data would overstate the expense
by roughly 12×.

---

## 9. What's Deliberately Not Modeled (and why the app says so)

- **Income tax provision.** Quad360 tracks transaction-level sales/VAT tax
  (`taxAmount`/`taxRate` per transaction, summed in `computeTaxTotals()`)
  but does not compute or model income tax on profit. "Net Profit" is
  labeled and treated as pre-tax throughout. `ProfitAndLossStatement.tsx`
  states this explicitly in a note under Net Income.
- **Multi-currency.** `BusinessSettings.currency`/`currencyCode` is a
  single global display setting. No compute function in `finance.ts`,
  `balanceSheetTrend.ts`, or any related module reads currency at all —
  every number is a raw, currency-agnostic amount, and currency symbols are
  applied only at render time. A business that changes its currency
  setting does not get any historical conversion; every past transaction's
  raw number is simply redisplayed under the new symbol. This is a
  single-currency-business assumption baked into the data model, not a
  computation bug.
- **Partial payments.** A transaction's `status` is `paid | pending |
  overdue` — there's no partially-paid amount tracked separately from the
  full transaction amount. A partial payment has to be represented by the
  business as two separate transactions (or corrected manually) — nothing
  in the schema models "60% collected."
- **Refunds.** No dedicated refund transaction type or category exists.
  The two representations a user has available today — a negative-amount
  income transaction, or a positive-amount expense categorized e.g.
  "Refund" — are both covered by regression tests
  (`__tests__/financialEdgeCases.test.ts`): a negative-amount income
  transaction correctly reduces revenue with no NaN/crash, and an expense
  categorized "Refund" is correctly excluded from COGS by the keyword
  matcher in §1 (falls into SG&A instead).

---

## 10. Known Approximations Worth Flagging to a Reviewer

- **Investing CF asset purchases** (`computeProperCashFlow`) sums the full
  purchase cost of **every** recorded asset, not just ones purchased within
  whatever period is being displayed — `computeProperCashFlow` runs over
  full transaction history, framed in the UI as "since records began," not
  a period-scoped cash flow statement.
- **AR/AP in a past balance sheet period** (§3) is a floor, not the true
  historical figure, because "paid" is a live flag with no date of its own.
- **Loan current/non-current split** (§11) is a projection from the loan's
  own stated rate/term, not a lender-confirmed amortization schedule —
  every screen showing it says so.
- **DSCR annualization** (§5) extrapolates from partial-year data when
  under a year of history exists — a genuine estimate, not a fact.

---

## 11. Financial Health / Risk Score — `computeRiskScore()` (`src/utils/finance.ts`)

The single canonical score — every other screen showing a health score
(Financial Health, Business Passport, Funding Readiness Pack,
Credit-Worthiness) reads from this same function, not an independently
tuned duplicate. Seven weighted factors, 0–100 each:

| Factor | Weight | Basis | Scoring |
|---|---|---|---|
| Profitability | 20 | Profit margin (`profit / income × 100`) | 100 if ≥20%, 70 if ≥10%, 40 if ≥0%, 0 if negative |
| Liquidity | 20 | Cash runway in months (`cashBalance / trailing-30-day-burn × 30`) | 100 if ≥6mo, 70 if ≥3mo, 40 if ≥1mo, 10 otherwise |
| Working Capital | 10 | Cash Conversion Cycle (DSO − DPO, days) | 100 if ≤15d, 70 if ≤30d, 40 if ≤60d, 10 otherwise |
| Debt | 15 | DSCR (§5) | 100 if ≥1.25, 60 if ≥1.0, 20 otherwise |
| Efficiency | 10 | Expense growth rate − Revenue growth rate, trailing 3 months | 100 if expenses not outgrowing revenue, 70 if gap ≤10pp, 40 if ≤25pp, 10 otherwise |
| Inventory | 10 | % of stock value in "slow-moving" tier (`computeStockVelocity`) | 100 if ≤15%, 60 if ≤35%, 25 otherwise; **100 (neutral) if no inventory recorded** |
| Concentration | 15 | Worse of top-customer % or top-supplier % of total | 100 if ≤20%, 60 if ≤40%, 20 otherwise |

```
score = round(Σ (factor.score × factor.weight) / 100)
grade = A (≥85) | B (≥70) | C (≥55) | D (≥40) | F (<40)
band  = Excellent (≥90) | Strong (≥75) | Moderate (≥55) | Weak (≥35) | Critical (<35)
```

### Five C's of Credit mapping — `buildFiveCsAssessment()` (`src/utils/fiveCsOfCredit.ts`)

This module's own header comment is the clearest statement of its intent
and is worth quoting directly: it exists specifically to say plainly that
the 7-factor score above does **not** cover all Five C's, rather than let
the score imply it does.

| C | Evidenced by Quad360? | Source |
|---|---|---|
| Character | **No** — not visible in transaction data at all | — |
| Capacity | **Yes** | Debt (DSCR), Profitability, Liquidity factors |
| Capital | Yes, if assets are recorded | Net worth / leverage ratios (§4) — shown but not part of the weighted score |
| Collateral | Yes, if inventory/assets recorded | Inventory value + asset book value |
| Conditions | **No** (macro/industry sense) — Concentration factor is the closest proxy, but measures the business's own customer/supplier exposure, not the external environment | Concentration factor (partial, relabeled honestly) |

---

## 12. Funding Readiness Pack — `buildFundingReadinessPack()` (`src/utils/fundingReadiness.ts`)

Assembles trailing-12-month P&L (§1), working capital (§4-adjacent), the
risk score (§11), and a document-readiness checklist — **all from the same
functions above**, not a separately tuned figure. The checklist's "ready"
flags mean "Quad360 has enough real recorded data to generate this," never
"a file is on hand" — there is no document upload feature, and the pack's
own copy says so:

| Document | "Ready" when |
|---|---|
| Bank statements | Data quality confidence is `strong` or `partial` (`computeDataQuality`) |
| P&L statement | ≥5 transactions recorded AND revenue > 0 |
| Cash-flow report | ≥3 months of transaction history |
| Invoice history | ≥1 non-draft invoice |
| Tax documentation | `computeTaxFilingReadiness()` overall-ready |

---

## 13. Regression Tests Covering This Document

- `__tests__/properCashFlow.test.ts` — the accrual-vs-cash double-counting fix (§2)
- `__tests__/loanPrincipalAccounting.test.ts` / `trendAnalysisLoanPrincipal.test.ts` — §6
- `__tests__/leverageBalanceSheetReconciliation.test.ts` / `financialRatiosSentinel.test.ts` — §4 balance-sheet identity
- `__tests__/gaapPresentationCompliance.test.ts` — statement presentation/classification
- `__tests__/financialEdgeCases.test.ts` — refund representations, aging-bucket boundaries, large-dataset correctness and performance, loan-math edge cases (0% interest, 0-month term, paid-off loans)
- `__tests__/certPinningTransforms.test.ts` — unrelated to financial computation; covers the certificate-pinning config plugin (see `SECURITY_ADVANCED.md`)
