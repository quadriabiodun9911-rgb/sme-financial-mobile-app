# Merchant Financing Integration Guide

## Overview

This guide explains how to integrate the merchant financing feature into Quad360. The implementation is split into two main components:

1. **MerchantFinancingSection.tsx** — Standalone component for all financing UI/logic
2. **LoansScreenWithFinancing.tsx** — Updated Loans screen with tab navigation

---

## File Structure

```
src/
├── screens/
│   ├── LoansScreen.tsx (original — can be archived)
│   ├── LoansScreenWithFinancing.tsx (NEW — replace LoansScreen)
│   └── MerchantFinancingSection.tsx (NEW — financing tab content)
├── contexts/
│   └── AppContext.ts (MODIFY — add merchant financing data/methods)
├── types/
│   └── index.ts (MODIFY — extend types for financing)
└── components/
    └── (no changes needed)
```

---

## Step 1: Extend Types

Add to `src/types/index.ts`:

```typescript
// Merchant Financing Application
interface MerchantFinancingApplication {
    id: string;
    userId: string;
    status: 'pending' | 'approved' | 'rejected' | 'funded' | 'repaying';
    requestedAmount: number;
    approvedAmount?: number;
    approvalDate?: string;
    fundingDate?: string;
    payoffDate?: string;
    purpose: 'inventory' | 'equipment' | 'both' | 'other';
    monthlyPayment?: number;
    interestRate: number; // e.g., 18
    termMonths: number; // e.g., 60
    lenderName: string; // e.g., "Zenith Bank"
    lenderId: string; // API reference
    appliedDate: string;
    rejectionReason?: string;
    nextPaymentDue?: string;
    monthlyProfitAtApproval: number;
    monthlyProfitCurrent: number;
    totalRepaid?: number;
    payments?: Array<{
        id: string;
        date: string;
        amount: number;
        note?: string;
    }>;
}

// User Financial Metrics (add to User interface)
interface User {
    // ... existing fields
    daysActive?: number; // Days since signup
    avgMonthlyRevenue?: number; // Calculated from transactions
    avgMonthlyProfit?: number; // After expenses
    financialHealthScore?: number; // Pngme score (0-100)
}

// Financing Context Data
interface FinancingData {
    isQualified: boolean;
    qualification?: {
        daysActiveOk: boolean;
        revenueOk: boolean;
        healthScoreOk: boolean;
    };
    minQualifiedAmount?: number;
    maxQualifiedAmount?: number;
    application?: MerchantFinancingApplication;
    activeLoan?: MerchantFinancingApplication & { status: 'approved' | 'funded' | 'repaying' };
    pastApplications?: MerchantFinancingApplication[];
    applicationStatus?: 'pending' | 'approved' | 'rejected' | null;
}
```

---

## Step 2: Extend AppContext

Add to `src/contexts/AppContext.ts`:

```typescript
interface AppContextType {
    // ... existing context
    
    // Merchant Financing
    financing?: FinancingData;
    checkMerchantFinancingEligibility: () => void;
    applyForMerchantFinancing: (amount: number, purpose: string) => Promise<void>;
    updateMerchantFinancingStatus: (applicationId: string, status: string, details?: any) => void;
    recordMerchantLoanPayment: (loanId: string, amount: number, date: string) => void;
}

// In the provider:
export function AppProvider({ children }: { children: ReactNode }) {
    // ... existing state
    
    const [financing, setFinancing] = useState<FinancingData>({
        isQualified: false,
        applicationStatus: null,
    });

    // Calculate eligibility on mount and when user metrics change
    useEffect(() => {
        checkMerchantFinancingEligibility();
    }, [user?.daysActive, user?.avgMonthlyRevenue, user?.financialHealthScore]);

    const checkMerchantFinancingEligibility = () => {
        const daysActiveOk = (user?.daysActive || 0) >= 90;
        const revenueOk = (user?.avgMonthlyRevenue || 0) >= 200000;
        const healthScoreOk = (user?.financialHealthScore || 0) >= 50;
        
        setFinancing(prev => ({
            ...prev,
            isQualified: daysActiveOk && revenueOk && healthScoreOk,
            qualification: { daysActiveOk, revenueOk, healthScoreOk },
            minQualifiedAmount: 2000000,
            maxQualifiedAmount: Math.min(5000000, (user?.avgMonthlyProfit || 0) * 12),
        }));
    };

    const applyForMerchantFinancing = async (amount: number, purpose: string) => {
        try {
            // Call Zenith Bank API (or your lender integration)
            const response = await api.post('/financing/apply', {
                userId: user?.id,
                amount,
                purpose,
                financialData: {
                    monthlyRevenue: user?.avgMonthlyRevenue,
                    monthlyProfit: user?.avgMonthlyProfit,
                    healthScore: user?.financialHealthScore,
                },
            });

            const application: MerchantFinancingApplication = {
                id: response.applicationId,
                userId: user?.id || '',
                status: 'pending',
                requestedAmount: amount,
                purpose: purpose as any,
                interestRate: 18,
                termMonths: 60,
                lenderName: response.lenderName || 'Zenith Bank',
                lenderId: response.lenderId,
                appliedDate: new Date().toISOString().split('T')[0],
                monthlyProfitAtApproval: user?.avgMonthlyProfit || 0,
                monthlyProfitCurrent: user?.avgMonthlyProfit || 0,
            };

            setFinancing(prev => ({
                ...prev,
                application,
                applicationStatus: 'pending',
            }));

            // TODO: Setup webhook listener for approval updates
        } catch (error) {
            Alert.alert('Error', 'Failed to submit application');
            throw error;
        }
    };

    const updateMerchantFinancingStatus = (applicationId: string, status: string, details?: any) => {
        setFinancing(prev => {
            if (!prev.application) return prev;
            
            const updatedApp: MerchantFinancingApplication = {
                ...prev.application,
                status: status as any,
                approvalDate: status === 'approved' ? details?.approvalDate : prev.application.approvalDate,
                approvedAmount: status === 'approved' ? details?.approvedAmount : prev.application.approvedAmount,
                fundingDate: status === 'funded' ? details?.fundingDate : prev.application.fundingDate,
                monthlyPayment: details?.monthlyPayment || prev.application.monthlyPayment,
                nextPaymentDue: details?.nextPaymentDue,
            };

            // If approved/funded, move to activeLoan
            if (status === 'approved' || status === 'funded' || status === 'repaying') {
                return {
                    ...prev,
                    application: undefined,
                    activeLoan: updatedApp as any,
                    applicationStatus: null,
                };
            }

            return {
                ...prev,
                application: updatedApp,
                applicationStatus: status as any,
            };
        });

        // TODO: If approved, automatically create a Loan entry via addLoan()
    };

    const recordMerchantLoanPayment = (loanId: string, amount: number, date: string) => {
        setFinancing(prev => {
            if (!prev.activeLoan) return prev;
            
            return {
                ...prev,
                activeLoan: {
                    ...prev.activeLoan,
                    totalRepaid: (prev.activeLoan.totalRepaid || 0) + amount,
                    payments: [
                        ...(prev.activeLoan.payments || []),
                        {
                            id: `payment_${Date.now()}`,
                            date,
                            amount,
                            note: 'Payment',
                        },
                    ],
                },
            };
        });

        // TODO: Also record in Loans register via addLoan()
    };

    return (
        <AppContext.Provider
            value={{
                // ... existing context
                financing,
                checkMerchantFinancingEligibility,
                applyForMerchantFinancing,
                updateMerchantFinancingStatus,
                recordMerchantLoanPayment,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}
```

---

## Step 3: Update Navigation

Replace the Loans screen in your navigation:

```typescript
// In NavigationStack or wherever you define screens
import LoansScreenWithFinancing from '../screens/LoansScreenWithFinancing';

export function MainStack() {
    return (
        <Stack.Navigator>
            {/* ... other screens */}
            <Stack.Screen
                name="Loans"
                component={LoansScreenWithFinancing}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    );
}
```

---

## Step 4: Add Lender Webhook Listener (Optional but Recommended)

In your app initialization (e.g., `App.tsx`), setup a listener for lender status updates:

```typescript
// Listen for merchant financing updates from lender (via push/webhook)
useEffect(() => {
    const unsubscribe = onFinancingStatusUpdate((notification) => {
        if (notification.type === 'financing_approved') {
            updateMerchantFinancingStatus(
                notification.applicationId,
                'approved',
                {
                    approvalDate: notification.approvalDate,
                    approvedAmount: notification.approvedAmount,
                    monthlyPayment: notification.monthlyPayment,
                }
            );
            Alert.alert(
                'Approved!',
                `Your ₦${notification.approvedAmount.toLocaleString()} financing has been approved!`
            );
        } else if (notification.type === 'financing_rejected') {
            updateMerchantFinancingStatus(
                notification.applicationId,
                'rejected',
                { rejectionReason: notification.reason }
            );
        } else if (notification.type === 'financing_funded') {
            updateMerchantFinancingStatus(
                notification.applicationId,
                'funded',
                { fundingDate: notification.fundingDate }
            );
            Alert.alert(
                'Funds Received!',
                `₦${notification.approvedAmount.toLocaleString()} has been transferred to your account.`
            );
        }
    });

    return () => unsubscribe();
}, []);
```

---

## Step 5: Calculate User Metrics (Daily)

Add a background job to calculate `avgMonthlyRevenue`, `avgMonthlyProfit`, and `daysActive`:

```typescript
// In AppContext or a separate hook
const recalculateUserMetrics = () => {
    // Days since signup
    const daysActive = Math.floor(
        (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Average monthly revenue (from transactions)
    const last30Days = transactions.filter(t => {
        const age = Date.now() - new Date(t.date).getTime();
        return age < 30 * 24 * 60 * 60 * 1000;
    });
    const monthlyRevenue = last30Days
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    // Average monthly profit
    const monthlyExpenses = last30Days
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    const monthlyProfit = monthlyRevenue - monthlyExpenses;

    setUser(prev => ({
        ...prev,
        daysActive,
        avgMonthlyRevenue: monthlyRevenue,
        avgMonthlyProfit: monthlyProfit,
    }));
};

// Call on app resume or periodically
useEffect(() => {
    recalculateUserMetrics();
    const interval = setInterval(recalculateUserMetrics, 60 * 60 * 1000); // Every hour
    return () => clearInterval(interval);
}, [transactions]);
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ MERCHANT FINANCING DATA FLOW                                │
└─────────────────────────────────────────────────────────────┘

[SME Opens App]
    ↓
[AppContext calculates eligibility]
    ├─ Days active ≥ 90?
    ├─ Monthly revenue ≥ ₦200k?
    └─ Health score ≥ 50?
    ↓
[If eligible]
    ├─ Show PreQualificationWidget
    └─ Dashboard widget: "Pre-qualified for ₦X-Y"
    ↓
[SME Clicks "Apply"]
    ├─ Opens ApplyForFinancingModal
    ├─ SME selects amount + purpose
    └─ Submits applyForMerchantFinancing()
    ↓
[API Call to Lender]
    ├─ Zenith Bank receives pre-filled data
    ├─ Automated decisioning (< 2 hours)
    └─ Sends approval/rejection via webhook
    ↓
[updateMerchantFinancingStatus() triggered]
    ├─ Updates financing context
    ├─ Shows in-app notification
    └─ Creates Loan record if approved
    ↓
[Repayment Tracking]
    ├─ Shows in ActiveMerchantLoanCard
    └─ recordMerchantLoanPayment() on each payment
```

---

## API Integration Checklist

Before launching, integrate with your lender:

- [ ] **Zenith Bank API Endpoint** — `/financing/pre-qualify` (check eligibility)
- [ ] **Zenith Bank API Endpoint** — `/financing/apply` (submit application)
- [ ] **Zenith Bank Webhook** — `/webhooks/financing/status` (listen for updates)
- [ ] **Zenith Bank Data Format** — Monthly revenue, profit, expense breakdown
- [ ] **Zenith Bank Approval Rules** — SLA (< 2 hours), interest rate (18% APR), term (60 months)

Example Zenith API request:

```json
POST /financing/apply
{
    "userId": "user_123",
    "requestedAmount": 3000000,
    "purpose": "inventory",
    "monthlyRevenue": 650000,
    "monthlyProfit": 420000,
    "financialHealthScore": 82,
    "arAgingDays": 12,
    "businessName": "Mama's Supermarket",
    "industry": "Retail",
    "email": "owner@business.com",
    "phone": "+234801234567"
}
```

---

## Testing Checklist

- [ ] Pre-qualification widget shows correctly (90+ days, ₦200k+ revenue)
- [ ] Application form calculates repayment capacity
- [ ] Loan calculator shows correct monthly payment
- [ ] Application submission succeeds
- [ ] Webhook listener updates financing status
- [ ] Approval notification displays
- [ ] Active loan card shows repayment progress
- [ ] Payment history updates correctly
- [ ] Repayment capacity indicator is accurate

---

## UI/UX Notes

1. **Empty States Matter** — Users who don't qualify need clear guidance (progress bars, next steps)
2. **Transparency is Key** — Always show interest rate, term, monthly payment upfront
3. **Mobile-First** — Test on small screens; ensure Slider and forms are touch-friendly
4. **Accessibility** — Contrast ratios, touch targets (min 44x44), readable fonts

---

## Performance Optimization

1. **Memoize eligibility calculation** — Only recalc when user metrics change
2. **Debounce slider updates** — Don't recalculate loan payment on every slider tick
3. **Lazy load past applications** — Only fetch if user expands history
4. **Offline-safe** — Cache financing state in AsyncStorage

---

## Future Enhancements

1. **Multi-lender comparison** — Show offers from Renmoney, Branch, others
2. **Auto-repayment** — Debit loan payment automatically on due date
3. **Early payoff** — Allow extra payments to reduce interest
4. **Loan upgrade** — After 6 on-time payments, offer higher limit
5. **Supply chain financing** — Leverage invoice data for supplier financing
6. **Embedded lending** — Show pre-approved offers in-app based on revenue spikes

---

## Files Modified Summary

| File | Change | Status |
|---|---|---|
| `src/types/index.ts` | Add MerchantFinancingApplication, FinancingData | Required |
| `src/contexts/AppContext.ts` | Add financing methods + state | Required |
| `src/screens/LoansScreen.tsx` | Replace with LoansScreenWithFinancing.tsx | Required |
| `src/screens/LoansScreenWithFinancing.tsx` | New file — includes tab nav | New |
| `src/screens/MerchantFinancingSection.tsx` | New file — financing UI | New |
| Navigation config | Point to LoansScreenWithFinancing | Required |

---

## Questions?

Refer to the component code comments or the Quad360 strategic documents for business context.
