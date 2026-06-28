# Merchant Financing — Complete UI Summary

## Screen Flow & Visual Hierarchy

### 1️⃣ LOANS SCREEN WITH FINANCING TAB

```
┌─────────────────────────────────────────┐
│         QUAD360 — LOAN REGISTER         │
├─────────────────────────────────────────┤
│ [Loan Register] [Merchant Financing]    │ ← TAB NAVIGATION
├─────────────────────────────────────────┤
│                                         │
│  Loan Register Tab Content              │
│  ├─ Summary cards (total debt, etc.)    │
│  ├─ Loan list with progress bars       │
│  └─ + Add Loan FAB                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## MERCHANT FINANCING TAB — USER JOURNEYS

### JOURNEY A: Not Yet Qualified (Days < 90 or Revenue < ₦200k)

```
┌────────────────────────────────────────────────────────────┐
│ MERCHANT FINANCING TAB                                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                      🔐 NOT YET QUALIFIED                  │
│                                                            │
│  Complete these requirements:                             │
│                                                            │
│  ⏳ Track for 90 days                                      │
│  ████████░░░░░░░░░░░░░░░░░░░░  65 / 90 days              │
│                                                            │
│  ⏳ Monthly revenue                                        │
│  ██████░░░░░░░░░░░░░░░░░░░░░░  ₦180k / ₦200k            │
│                                                            │
│  ✅ Financial health score                               │
│  ████████████████████░░░░░░░░░  78 / 100                  │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│  ℹ️ Keep logging transactions daily to build your         │
│     financial profile. You're making progress!             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Components:**
- EmptyStateIcon: "🔐"
- RequirementItem (x3) with progress bars
- InfoBox with supportive message

---

### JOURNEY B: Qualified, Not Applied Yet

```
┌────────────────────────────────────────────────────────────┐
│ MERCHANT FINANCING TAB                                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ✅ PRE-QUALIFIED                                          │
│                                     Readiness Score: 82    │
│  Inventory Financing Available                             │
│                                                            │
│  Financing Range:                                          │
│  ₦2,000,000 – ₦5,000,000                                  │
│  ███████████████████████████████████████████████           │
│                                                            │
│  Readiness: 82/100  │  Status: Excellent                  │
│                                                            │
│  ┌──────────────────────────────────────┐                │
│  │      Start Application               │                │
│  │   ~5 min · Instant approval           │                │
│  └──────────────────────────────────────┘                │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│  ℹ️ We're pre-approving you based on your Quad360        │
│     financial data. No collateral required.               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Components:**
- PreQualificationWidget with score circle
- Financing range with visual bar
- MetricPill tags (Readiness + Status)
- CTA button with subtext

---

### JOURNEY C: Application In Progress

```
┌────────────────────────────────────────────────────────────┐
│ MERCHANT FINANCING TAB                                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ⏳ UNDER REVIEW                        Applied 6/27      │
│                                                            │
│  Requested Amount:   ₦3,000,000                            │
│  Status:             Under Review                          │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│  ℹ️ Your application is being reviewed. You'll receive    │
│     approval or decline within 2 hours.                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Components:**
- ApplicationStatusCard with pending badge
- DetailRow (x2) showing request details
- InfoBox with timeline

---

### JOURNEY D: Approved — Funds In Transit

```
┌────────────────────────────────────────────────────────────┐
│ MERCHANT FINANCING TAB                                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ✅ APPROVED                            Approved 6/27     │
│                                                            │
│  Approved Amount:    ₦3,000,000                            │
│  Monthly Payment:    ₦60,000                               │
│  Interest Rate:      18% p.a.                              │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│  ✨ Funds will be transferred within 24 hours.            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Components:**
- ApplicationStatusCard with approved badge (green bg)
- DetailRow showing approval details
- Green InfoBox with success message

---

### JOURNEY E: Active Loan — Repayment Tracking

```
┌────────────────────────────────────────────────────────────┐
│ MERCHANT FINANCING TAB                                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  💰 MERCHANT FINANCING         ✅ ACTIVE                  │
│  Approved Inventory Loan       ₦1,200,000 left            │
│                                                            │
│  Progress:                                                 │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
│  60% repaid · ₦1,800,000 of ₦3,000,000                    │
│                                                            │
│  Loan Amount    Monthly Payment    Rate     Capacity      │
│  ₦3,000,000     ₦60,000            18%      7.0x ✅       │
│  ─────────────────────────────────────────────────────    │
│                                                            │
│  📊 Repayment Capacity                                     │
│  Monthly profit ÷ Loan payment = Capacity Ratio            │
│  ₦420,000 ÷ ₦60,000 = 7.0x                                │
│                                                            │
│  ██████████████████████████░░░░░░░░░░░░░░░░░░░░░░         │
│  1x    2x    3x    4x                                      │
│                                                            │
│  ✅ Your profit covers this payment 7.0x over.            │
│     This is a safe loan.                                  │
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  Next Payment Due                                          │
│  Jul 27                                                   │
│  ₦60,000                                                   │
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  Loan Details                                              │
│  Approved Date:    6/27/2026                               │
│  Funded Date:      6/28/2026                               │
│  Payoff Date:      12/27/2031                              │
│  Purpose:          Inventory                               │
│  Lender:           Zenith Bank                             │
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  Recent Payments                                           │
│  6/27   Monthly payment    +₦60,000                        │
│  6/15   Monthly payment    +₦60,000                        │
│  6/1    Monthly payment    +₦60,000                        │
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  [+ Record Payment]  [View Details]                        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Components (Collapsible):**
- ActiveMerchantLoanCard (header)
  - Status badge + balance
  - Progress bar
  - Quick metrics row
- **[Expanded]**
  - RepaymentCapacityGauge
  - NextPaymentBox
  - LoanDetailsBox
  - PaymentHistoryBox
  - Action buttons

---

## 3-STEP APPLICATION MODAL

### STEP 1: Select Loan Amount

```
┌───────────────────────────────────────────┐
│ ✕  Apply for Financing     Step 1/3       │
├───────────────────────────────────────────┤
│                                           │
│  How much do you need?                    │
│  Choose between ₦2,000,000 and ₦5,000,000│
│                                           │
│  ┌────────────────────────────────────┐  │
│  │     ₦3,000,000                     │  │
│  └────────────────────────────────────┘  │
│                                           │
│  ═══════●══════════════════════════════   │  Slider
│                                           │
│  Quick amounts:                           │
│  [₦2.0M]  [₦3.5M]  [₦5.0M]               │
│                                           │
│  ────────────────────────────────────────│
│  Monthly Repayment Estimate               │
│  Estimated Payment:    ₦60,000            │
│  Your Monthly Profit:  ₦420,000           │
│  Coverage Ratio:       7.0x ✅            │
│  ────────────────────────────────────────│
│                                           │
│  [Cancel] [Next →]                       │
│                                           │
└───────────────────────────────────────────┘
```

**Components:**
- Amount display (large, primary color)
- Slider with min/max
- QuickAmountBtn (x3)
- PreviewBox showing monthly payment & capacity

---

### STEP 2: Select Purpose

```
┌───────────────────────────────────────────┐
│ ✕  Apply for Financing     Step 2/3       │
├───────────────────────────────────────────┤
│                                           │
│  What will you use this for?              │
│  Tell us the primary purpose              │
│                                           │
│  ┌──────────────┐  ┌──────────────┐      │
│  │      📦      │  │      🔧      │      │
│  │  Inventory   │  │  Equipment   │      │
│  │   Purchase   │  │              │      │
│  └──────────────┘  └──────────────┘      │
│                                           │
│  ┌──────────────┐  ┌──────────────┐      │
│  │     📦🔧     │  │      ❓      │      │
│  │    Both      │  │    Other     │      │
│  │              │  │              │      │
│  └──────────────┘  └──────────────┘      │
│                                           │
│  ────────────────────────────────────────│
│  ℹ️ This helps us track how the loan    │
│     impacts your business performance.   │
│                                           │
│  [← Back] [Next →]                       │
│                                           │
└───────────────────────────────────────────┘
```

**Components:**
- PurposeCard (x4) with tap selection
- Active card has colored border + background

---

### STEP 3: Review & Submit

```
┌───────────────────────────────────────────┐
│ ✕  Apply for Financing     Step 3/3       │
├───────────────────────────────────────────┤
│                                           │
│  Confirm Your Application                 │
│                                           │
│  ────────────────────────────────────────│
│  Loan Amount:        ₦3,000,000           │
│  Purpose:            Inventory            │
│  Estimated Rate:     18% per annum        │
│  Monthly Payment:    ₦60,000              │
│  Loan Term:          60 months (5 years)  │
│  ────────────────────────────────────────│
│                                           │
│  ✨ By submitting this application, you  │
│     authorize Quad360 to share your       │
│     financial data with our lending       │
│     partners for evaluation.              │
│                                           │
│  ────────────────────────────────────────│
│  ☐ I agree to the financing terms and    │
│     privacy policy                        │
│                                           │
│  [← Back] [Submit Application]            │
│                                           │
└───────────────────────────────────────────┘
```

**Components:**
- ReviewBox with ReviewItem (x5)
- Terms checkbox
- Submit button

---

## MERCHANT FINANCING ELIGIBILITY STATES

### State Matrix

| State | Condition | Widget | CTA |
|---|---|---|---|
| **Not Qualified** | Days < 90 OR Revenue < ₦200k | Progress bars | None (show requirements) |
| **Qualified** | All requirements met | PreQualificationWidget | "Start Application" |
| **Pending** | Application submitted | ApplicationStatusCard | "Under Review" |
| **Approved** | Approved by lender | ApplicationStatusCard | "Accept Offer" |
| **Funded** | Money received | ActiveMerchantLoanCard | Show repayment details |
| **Repaying** | In repayment phase | ActiveMerchantLoanCard | "Record Payment" |
| **Rejected** | Application declined | ApplicationStatusCard | "Reapply After 30 Days" |
| **Paid Off** | Loan fully repaid | ActiveMerchantLoanCard | "View Completion" |

---

## COLOR CODING

| Color | Usage | Meaning |
|---|---|---|
| **Colors.primary** (Blue) | Buttons, active states, highlights | Primary action |
| **Colors.income** (Green) | ✅ Approved, Safe capacity, Positive metrics | Success |
| **Colors.warning** (Amber) | ⏳ Pending, Tight capacity | Caution |
| **Colors.expense** (Red) | ❌ Rejected, At-risk capacity | Danger |
| **Colors.textMuted** (Gray) | Secondary text, disabled | De-emphasized |

---

## TYPOGRAPHY HIERARCHY

```
Title Screens:       22pt, bold (blue)
Section Titles:      18pt, bold (dark)
Card Titles:         16pt, bold (dark)
Badges:              11pt, bold (colored)
Labels:              12pt, medium (muted)
Values:              14pt, bold (dark)
Secondary Text:      11pt, regular (muted)
Small Text:          10pt, regular (muted)
```

---

## SPACING & LAYOUT

```
Horizontal Padding:  16pt (standard screen padding)
Vertical Gap:        12pt (between cards)
Card Padding:        14pt (inside cards)
Border Radius:       12pt (cards), 8pt (inputs), 10pt (pills)
Modal Top Radius:    24pt
FAB Size:            54pt
```

---

## Responsive Behavior

- **Mobile (< 600px):** Full-width cards, single-column layout
- **Tablet (≥ 600px):** 2-column grid for purpose selection, wider form fields
- **Web:** Same as tablet, but with max-width container

---

## Accessibility Considerations

✅ All interactive elements have min 44pt touch target
✅ Color is not the only indicator (also uses icons + text)
✅ Forms have clear labels + placeholders
✅ Loading states include spinners
✅ Error messages are prominent
✅ Links have sufficient contrast (WCAG AA)

---

## Animation States

| Action | Animation | Duration |
|---|---|---|
| Tab switch | Fade | 200ms |
| Modal open | Slide up | 300ms |
| Slider change | Real-time value update | N/A |
| Progress bar | Smooth width change | 400ms |
| Payment recorded | Pulse effect | 600ms |

---

## Summary: What Makes This Great UX

1. **Progress Visibility** — Pre-qualification requirements show clear progress
2. **Transparency** — Repayment capacity gauge explains what you can afford
3. **Mobile-First** — Sliders, toggles, and taps work on small screens
4. **Guidance** — Every screen explains what's happening and why
5. **Speed** — 3-step application (amount → purpose → review) in ~5 minutes
6. **Trust** — Green badges, clear terms, no surprises
7. **Continuity** — Once approved, loan integrates seamlessly into Loans register

