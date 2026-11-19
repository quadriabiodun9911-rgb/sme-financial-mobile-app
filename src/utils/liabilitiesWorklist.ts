/**
 * Liabilities Worklist — every real obligation this business carries, in
 * one itemized list: active loans, accounts payable already in the
 * ledger, vendor bills still waiting for review, and tax collected but
 * not yet remitted. The Balance Sheet (balanceSheetTrend.ts) already
 * totals loans and accounts payable into Current/Non-Current Liabilities
 * -- this is the who/what/when-due detail underneath that total, built
 * entirely from the same sources (loanMath.ts for loans, finance.ts's own
 * AP aging for bills already in the ledger, taxFilingReadiness.ts for
 * tax) rather than a second, independently-tuned total.
 *
 * The "needs-review" bills are the genuinely HIDDEN half of this: a
 * scanned or hand-entered vendor bill real money is owed against, that
 * hasn't yet become a Transaction and so isn't counted in
 * computeWorkingCapitalMetrics's accountsPayable, the AP Aging Report, or
 * the Balance Sheet's Accounts Payable line -- until someone reviews and
 * records it (see billIntelligence.ts / BillsScreen.tsx). Shown here so
 * that real liability isn't invisible in the meantime.
 */

import { Transaction, Loan, Bill, FinanceData } from '../types';
import { computeAgingBuckets } from './finance';
import { outstandingLoanBalance, nextLoanPaymentDueDate, daysUntilLoanPaymentDue } from './loanMath';
import { computeTaxAbilityToPay } from './taxFilingReadiness';
import { formatMoney } from './cashFlowHealth';
import { entityDisplayName } from './entityName';

export type LiabilityKind = 'loan' | 'accountsPayable' | 'billNeedsReview' | 'tax';

export interface LiabilityItem {
    kind: LiabilityKind;
    label: string; // who it's owed to, or what it is
    amount: number;
    dueDate: string | null; // 'YYYY-MM-DD', null when not computable
    daysOverdue: number | null; // positive = overdue by this many days, null when not overdue or unknown
    detail: string;
}

export interface LiabilitiesWorklist {
    items: LiabilityItem[]; // most overdue first, then soonest due, undated last
    totalLoans: number;
    totalAccountsPayable: number;
    totalBillsNeedingReview: number;
    totalTax: number;
    total: number;
    // Portion of `total` NOT reflected in the Balance Sheet's liabilities
    // figure today (bills still awaiting review, tax collected but not
    // remitted) -- the real "hidden obligations" slice.
    hiddenTotal: number;
    narrative: string;
}

export function computeLiabilitiesWorklist(
    loans: Loan[],
    transactions: Transaction[],
    bills: Bill[],
    finance: Pick<FinanceData, 'cashBalance' | 'totalTaxCollected' | 'totalTaxPaid'>,
    currency: string = '₦',
    now: Date = new Date(),
): LiabilitiesWorklist {
    const items: LiabilityItem[] = [];

    // 1. Active loans — one line per loan, not just the portfolio total,
    // using the exact same outstanding-balance and next-due-date math the
    // Loans screen itself shows.
    let totalLoans = 0;
    for (const loan of loans) {
        if (loan.status !== 'active') continue;
        const balance = outstandingLoanBalance(loan);
        if (balance <= 0) continue;
        totalLoans += balance;
        const daysUntilDue = daysUntilLoanPaymentDue(loan, now);
        const dueDate = nextLoanPaymentDueDate(loan).toISOString().slice(0, 10);
        const daysOverdue = daysUntilDue < 0 ? -daysUntilDue : null;
        items.push({
            kind: 'loan',
            label: loan.lenderName || 'Loan',
            amount: balance,
            dueDate,
            daysOverdue,
            detail: `${formatMoney(balance, currency)} outstanding, next payment due ${dueDate}.`,
        });
    }

    // 2. Accounts payable already in the ledger — same source
    // AgingReport.tsx's AP tab and balanceSheetTrend.ts's accountsPayable
    // figure both read, so this list's AP lines always sum to the same
    // total those already show for the same transactions.
    let totalAccountsPayable = 0;
    const apBuckets = computeAgingBuckets(transactions, 'expense');
    for (const bucket of apBuckets) {
        for (const tx of bucket.transactions) {
            const amount = tx.amount ?? 0;
            totalAccountsPayable += amount;
            const dueDate = tx.dueDate ?? null;
            const rawDaysOverdue = dueDate ? Math.round((now.getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000) : null;
            items.push({
                kind: 'accountsPayable',
                label: entityDisplayName(tx.vendorCustomer) || 'Supplier',
                amount,
                dueDate,
                daysOverdue: rawDaysOverdue && rawDaysOverdue > 0 ? rawDaysOverdue : null,
                detail: `${formatMoney(amount, currency)} owed${dueDate ? `, due ${dueDate}` : ''} (${bucket.label}).`,
            });
        }
    }

    // 3. Bills still awaiting review — real money owed, not yet in the
    // ledger (see module doc comment for why this is the hidden half).
    let totalBillsNeedingReview = 0;
    for (const bill of bills) {
        if (bill.status !== 'needs_review') continue;
        totalBillsNeedingReview += bill.total;
        const dueDate = bill.dueDate ?? null;
        const rawDaysOverdue = dueDate ? Math.round((now.getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000) : null;
        items.push({
            kind: 'billNeedsReview',
            label: bill.vendorName || 'Vendor bill',
            amount: bill.total,
            dueDate,
            daysOverdue: rawDaysOverdue && rawDaysOverdue > 0 ? rawDaysOverdue : null,
            detail: `${formatMoney(bill.total, currency)} owed — captured but not yet reviewed, so not yet counted in your Accounts Payable total.`,
        });
    }

    // 4. Tax collected from customers but not yet remitted.
    const tax = computeTaxAbilityToPay(finance);
    const totalTax = tax.estimatedLiability;
    if (totalTax > 0) {
        items.push({
            kind: 'tax',
            label: 'Tax collected, not yet remitted',
            amount: totalTax,
            dueDate: null,
            daysOverdue: null,
            detail: `${formatMoney(totalTax, currency)} in tax collected from customers hasn't been paid to the tax authority yet.`,
        });
    }

    items.sort((a, b) => {
        const aOver = a.daysOverdue ?? -1;
        const bOver = b.daysOverdue ?? -1;
        if (aOver !== bOver) return bOver - aOver; // most overdue first
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate); // soonest due next
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.amount - a.amount; // undated, biggest first
    });

    const total = totalLoans + totalAccountsPayable + totalBillsNeedingReview + totalTax;
    const hiddenTotal = totalBillsNeedingReview + totalTax;

    const narrative = items.length === 0
        ? 'No outstanding liabilities recorded right now.'
        : hiddenTotal > 0
            ? `${formatMoney(total, currency)} in total obligations, including ${formatMoney(hiddenTotal, currency)} not yet reflected in your Accounts Payable or Balance Sheet totals (bills awaiting review and tax collected but not remitted).`
            : `${formatMoney(total, currency)} in total obligations across ${items.length} item${items.length === 1 ? '' : 's'}.`;

    return { items, totalLoans, totalAccountsPayable, totalBillsNeedingReview, totalTax, total, hiddenTotal, narrative };
}
