# Merchant Financing — Quick Reference Card

## Files Created (Ready to Use)

| File | Purpose | Lines | Status |
|---|---|---|---|
| `src/screens/MerchantFinancingSection.tsx` | Main financing UI component | 1,200+ | ✅ Complete |
| `src/screens/LoansScreenWithFinancing.tsx` | Updated Loans screen w/ tabs | 750+ | ✅ Complete |
| `MERCHANT_FINANCING_INTEGRATION_GUIDE.md` | Setup instructions | N/A | ✅ Complete |
| `MERCHANT_FINANCING_UI_SUMMARY.md` | Visual mockups & flows | N/A | ✅ Complete |

---

## Key Features Implemented

### Pre-Qualification Widget ✅
- Shows loan range (₦2M-₦5M)
- Readiness score (0-100)
- Status badge (Excellent/Good/Fair)
- One-tap apply button

### Application Modal (3 Steps) ✅
1. **Amount Selection**
   - Slider (₦2M-₦5M)
   - Quick amount buttons
   - Real-time repayment preview

2. **Purpose Selection**
   - 4 options: Inventory / Equipment / Both / Other
   - Visual card interface
   - Explanatory info box

3. **Review & Submit**
   - Loan summary
   - Terms acceptance
   - Submit button

### Active Loan Card (Expandable) ✅
- Collapsible header showing loan status & balance
- Progress bar (% repaid)
- Quick metrics row (amount, payment, rate, capacity)
- **Expanded view:**
  - Repayment capacity gauge (visual 1x-4x scale)
  - Next payment due date & amount
  - Loan details (approved, funded, payoff dates)
  - Payment history (last 3 payments)
  - Action buttons (Record Payment, View Details)

### Application Status Card ✅
- Shows pending/approved/rejected status
- Applied date
- Requested amount
- Rejection reason (if rejected)
- Info box with next steps

### Qualification Progress Widget ✅
- Days active progress (0/90)
- Monthly revenue progress (0/₦200k)
- Health score progress (0/100)
- Each requirement shows % complete
- Supportive messaging

### Empty States (4 Total) ✅
1. **Not Qualified Yet** — Shows 3 requirements with progress bars
2. **Qualified, Ready to Apply** — Shows financing range + CTA
3. **Application Pending** — Shows "Under Review" status
4. **Qualified with No Applications** — Invites first application

---

## Component Hierarchy

```
MerchantFinancingSection (Main)
├── PreQualificationWidget
│   ├── MetricPill (x2)
│   └── InfoBox
├── ActiveMerchantLoanCard
│   ├── LoanCard Header
│   ├── Progress Bar
│   ├── Metrics Row
│   └── [Expanded]
│       ├── RepaymentCapacityGauge
│       ├── NextPaymentBox
│       ├── LoanDetailsBox
│       ├── PaymentHistoryBox
│       └── Action Buttons
├── ApplicationStatusCard
│   ├── Status Badge
│   ├── DetailRows
│   └── InfoBox
├── PastApplicationCard (repeating)
├── NotQualifiedState (empty)
├── QualifiedEmptyState (empty)
└── ApplyForFinancingModal
    ├── Step 1: Amount Slider
    ├── Step 2: Purpose Grid
    ├── Step 3: Review
    └── Navigation Buttons
```

---

## Integration Steps (TL;DR)

1. **Copy files to project:**
   ```bash
   cp MerchantFinancingSection.tsx src/screens/
   cp LoansScreenWithFinancing.tsx src/screens/
   ```

2. **Update AppContext** (see INTEGRATION_GUIDE.md):
   - Add financing state
   - Add methods: `applyForMerchantFinancing()`, `updateMerchantFinancingStatus()`
   - Add webhook listener

3. **Update types** (src/types/index.ts):
   - Add `MerchantFinancingApplication` interface
   - Add `FinancingData` interface
   - Extend `User` with metrics

4. **Update navigation:**
   - Point Loans screen to `LoansScreenWithFinancing`

5. **Add lender API:**
   - Integrate Zenith Bank endpoint
   - Setup webhook for status updates

---

## UI Flows at a Glance

### User Journey Flowchart

```
[Download App]
    ↓
[Day 1-89: Not Qualified]
    ├─ NotQualifiedState (shows progress)
    └─ Daily logging → builds financial profile
    ↓
[Day 90: Milestone Reached]
    └─ PreQualificationWidget appears
    ↓
[Day 91: Ready to Apply]
    ├─ SME sees "Pre-qualified for ₦2-5M"
    ├─ Taps "Start Application"
    └─ ApplyForFinancingModal opens
    ↓
[Step 1: Amount]
    ├─ Selects ₦3M (via slider or quick button)
    ├─ Sees repayment preview (₦60k/month)
    └─ Taps "Next"
    ↓
[Step 2: Purpose]
    ├─ Selects "Inventory"
    └─ Taps "Next"
    ↓
[Step 3: Review]
    ├─ Confirms details
    ├─ Accepts terms
    └─ Taps "Submit"
    ↓
[API: Send to Lender]
    ├─ Request to Zenith Bank
    └─ Automated decisioning (<2 hours)
    ↓
[Webhook: Approval Received]
    ├─ App notified
    ├─ ApplicationStatusCard → "Approved"
    └─ User sees success notification
    ↓
[Funds Arrive (24h)]
    ├─ Webhook: Funding confirmed
    └─ ActiveMerchantLoanCard appears
       ├─ Shows loan details
       ├─ Repayment schedule
       └─ "Record Payment" button
    ↓
[Monthly Repayment]
    ├─ Payment due: ₦60k
    ├─ SME sees in app (next payment due date)
    ├─ SME records payment
    ├─ Progress bar updates (% repaid)
    └─ Capacity gauge remains green (7.0x coverage)
    ↓
[60 Months Later: Paid Off]
    └─ Status updates to "Paid Off"
```

---

## Styling Palette

```typescript
Colors used in component:
├─ Colors.primary       → Blue (CTAs, active states)
├─ Colors.surface       → Light gray (card backgrounds)
├─ Colors.bg            → Lighter gray (section backgrounds)
├─ Colors.income        → Green (✅ approved, safe)
├─ Colors.warning       → Amber (⏳ pending, caution)
├─ Colors.expense       → Red (❌ rejected, at-risk)
├─ Colors.textPrimary   → Dark gray (main text)
├─ Colors.textSecondary → Medium gray (secondary text)
├─ Colors.textMuted     → Light gray (disabled/hints)
├─ Colors.border        → Border gray
└─ Colors.muted         → Input placeholders
```

---

## State Management Map

```typescript
AppContext.financing = {
    isQualified: boolean,              // Calculated from user metrics
    qualification: {                   // Breakdown of eligibility
        daysActiveOk: boolean,
        revenueOk: boolean,
        healthScoreOk: boolean,
    },
    minQualifiedAmount: number,        // ₦2,000,000
    maxQualifiedAmount: number,        // Varies (max ₦5,000,000)
    application: {                     // Current or latest application
        id: string,
        status: string,                // pending/approved/rejected/funded
        requestedAmount: number,
        approvedAmount?: number,
        appliedDate: string,
        // ... (see MerchantFinancingApplication)
    },
    activeLoan?: {                     // Approved & funded loan
        // All application fields +
        monthlyPayment: number,
        nextPaymentDue: string,
        totalRepaid: number,
        payments: Array<{id, date, amount, note}>,
    },
    pastApplications?: Array<...>,     // History
    applicationStatus: string | null,  // pending/approved/rejected
}
```

---

## Performance Metrics to Track

Once deployed, monitor:

- **Qualification Conversion** — % users eligible after 90 days
- **Application Completion Rate** — % who finish the 3-step form
- **Lender Approval Rate** — % approved by Zenith
- **Time to Approval** — Average time from submit to approval (target: <2h)
- **Repayment Rate** — % of approved SMEs making on-time payments
- **Cross-sell Rate** — % of loan users applying for second loan after 6 payments

---

## Testing Checklist

- [ ] Mock Zenith API responses (approved/rejected/pending)
- [ ] Test all 4 empty states (not qualified → qualified → pending → approved → active)
- [ ] Test repayment capacity scenarios (safe/tight/at-risk)
- [ ] Test modal on small screens (iPhone SE, Android phone)
- [ ] Test slider edge cases (min/max, rapid taps)
- [ ] Test offline (app cache financing state)
- [ ] Test webhook updates (notification delivery)
- [ ] Test accessibility (screen reader, large text)
- [ ] Stress test: 100+ applications/day
- [ ] Security: Validate API tokens, encrypted local storage

---

## Next Steps

1. **Today:** Review component code & UI mockups
2. **Tomorrow:** Implement types & AppContext methods
3. **This week:** Integrate Zenith API endpoints
4. **Next week:** Setup webhook listener & notifications
5. **Soft launch:** Beta with 100 users
6. **Monitor:** Track metrics above
7. **Scale:** Roll out to all users if >50% approval rate

---

## Questions to Answer Before Launch

1. **Interest Rate**: Fixed 18% APR or variable?
2. **Loan Term**: Fixed 60 months or options (36/48/60)?
3. **Repayment Schedule**: Monthly, bi-weekly, or flexible?
4. **Max Loan Amount**: Hard cap at ₦5M or scale with business size?
5. **Approval SLA**: "~2 hours" or "within 24 hours"?
6. **Default Handling**: What triggers escalation?
7. **Early Payoff**: Can SME pay off early without penalty?
8. **Refinancing**: Can SME refinance to lower rate?

---

## Success Criteria

✅ 90% of eligible SMEs can complete application in <5 minutes
✅ Lender approval rate >80% (real data quality proves SME viability)
✅ Payment default rate <10% (repayment capacity gauge works)
✅ NPS score >70 (financing feature loved by users)
✅ Repeat loan rate >40% (after 6 on-time payments, they come back)
✅ Cross-sell rate >20% (existing customers upgrade to equipment financing)

---

## Worth Noting

⚠️ **Merchant financing is a sticky feature** — once an SME gets their first loan through Quad360 and proves repayment, they become 10x more engaged. This is your most powerful retention lever.

🎯 **Data is your moat** — Zenith can't replicate Quad360's daily transaction visibility. Each loan you fund generates 60 months of repayment data that improves your decisioning.

💡 **Think ecosystem** — After inventory loans, think about: equipment financing, supply chain financing (invoice-backed), peer-to-peer lending, equity financing. Each unlocks new use cases.

---

Done! The merchant financing pipeline is fully designed and ready to build. 🚀
