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
import { computeAgingBuckets, daysOverdueAsOf } from './finance';
import { outstandingLoanBalance, nextLoanPaymentDueDate, daysUntilLoanPaymentDue } from './loanMath';
import { computeTaxAbilityToPay } from './taxFilingReadiness';
import { formatMoney } from './cashFlowHealth';
import { entityKey, entityDisplayName } from './entityName';
import { localDateStr } from './localDate';

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

    // Local midnight, not the live time-of-day -- daysOverdueAsOf's own
    // contract requires this, and using raw `now` instead would let the
    // overdue-day count creep up by one every afternoon/evening as the
    // fractional day grows, purely from what time it happens to be.
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);

    // 1. Active loans — one line per loan, not just the portfolio total,
    // using the exact same outstanding-balance and next-due-date math the
    // Loans screen itself shows. A loan with a missing/malformed startDate
    // (the same "arrives undefined at runtime despite the type" risk
    // loanMath.ts's own comment documents for interestRate) still lists
    // its balance, just without a due date, rather than throwing out of
    // the whole card -- nextLoanPaymentDueDate(loan).toISOString() would
    // throw a RangeError on an Invalid Date built from a bad startDate.
    let totalLoans = 0;
    for (const loan of loans) {
        if (loan.status !== 'active') continue;
        const balance = outstandingLoanBalance(loan);
        if (balance <= 0) continue;
        totalLoans += balance;

        const hasValidStartDate = typeof loan.startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(loan.startDate);
        let dueDate: string | null = null;
        let daysOverdue: number | null = null;
        if (hasValidStartDate) {
            // localDateStr, not toISOString() -- toISOString() converts a
            // local-midnight Date to UTC first, showing the PREVIOUS
            // calendar day in any positive-UTC-offset timezone (the exact
            // bug localDate.ts's own doc comment warns about), which would
            // disagree with what LoansScreen.tsx shows for the same loan.
            dueDate = localDateStr(nextLoanPaymentDueDate(loan));
            const daysUntilDue = daysUntilLoanPaymentDue(loan, now);
            daysOverdue = daysUntilDue < 0 ? -daysUntilDue : null;
        }

        items.push({
            kind: 'loan',
            label: loan.lenderName || 'Loan',
            amount: balance,
            dueDate,
            daysOverdue,
            detail: dueDate
                ? `${formatMoney(balance, currency)} outstanding, next payment due ${dueDate}.`
                : `${formatMoney(balance, currency)} outstanding.`,
        });
    }

    // 2. Accounts payable already in the ledger — same source
    // AgingReport.tsx's AP tab and balanceSheetTrend.ts's accountsPayable
    // figure both read, so this list's AP lines always sum to the same
    // total those already show for the same transactions. Transactions
    // with no supplier tagged are combined into one line (same grouping
    // computeSupplierConcentration already applies to untagged spend)
    // rather than each showing up as its own row literally labeled
    // "Supplier" -- several untagged payables would otherwise look like
    // several different vendor relationships instead of one data-quality
    // gap to fix.
    let totalAccountsPayable = 0;
    let untaggedTotal = 0;
    let untaggedCount = 0;
    let untaggedEarliestDueDate: string | null = null;
    let untaggedDaysOverdue: number | null = null;
    const apBuckets = computeAgingBuckets(transactions, 'expense');
    for (const bucket of apBuckets) {
        for (const tx of bucket.transactions) {
            const amount = tx.amount ?? 0;
            totalAccountsPayable += amount;
            const dueDate = tx.dueDate ?? null;
            const rawDaysOverdue = dueDate ? daysOverdueAsOf(dueDate, todayMidnight) : null;
            const daysOverdue = rawDaysOverdue !== null && rawDaysOverdue > 0 ? rawDaysOverdue : null;

            if (entityKey(tx.vendorCustomer) === null) {
                untaggedTotal += amount;
                untaggedCount++;
                if (dueDate && (untaggedEarliestDueDate === null || dueDate < untaggedEarliestDueDate)) untaggedEarliestDueDate = dueDate;
                if (daysOverdue !== null) untaggedDaysOverdue = Math.max(untaggedDaysOverdue ?? 0, daysOverdue);
                continue;
            }

            items.push({
                kind: 'accountsPayable',
                label: entityDisplayName(tx.vendorCustomer) || 'Supplier',
                amount,
                dueDate,
                daysOverdue,
                detail: `${formatMoney(amount, currency)} owed${dueDate ? `, due ${dueDate}` : ''} (${bucket.label}).`,
            });
        }
    }
    if (untaggedCount > 0) {
        items.push({
            kind: 'accountsPayable',
            label: `Uncategorized (${untaggedCount} payable${untaggedCount === 1 ? '' : 's'})`,
            amount: untaggedTotal,
            dueDate: untaggedEarliestDueDate,
            daysOverdue: untaggedDaysOverdue,
            detail: `${formatMoney(untaggedTotal, currency)} owed across ${untaggedCount} payable${untaggedCount === 1 ? '' : 's'} with no supplier tagged -- tag these to see them individually.`,
        });
    }

    // 3. Bills still awaiting review — real money owed, not yet in the
    // ledger (see module doc comment for why this is the hidden half).
    let totalBillsNeedingReview = 0;
    for (const bill of bills) {
        if (bill.status !== 'needs_review') continue;
        totalBillsNeedingReview += bill.total;
        const dueDate = bill.dueDate ?? null;
        const rawDaysOverdue = dueDate ? daysOverdueAsOf(dueDate, todayMidnight) : null;
        items.push({
            kind: 'billNeedsReview',
            label: bill.vendorName || 'Vendor bill',
            amount: bill.total,
            dueDate,
            daysOverdue: rawDaysOverdue !== null && rawDaysOverdue > 0 ? rawDaysOverdue : null,
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
