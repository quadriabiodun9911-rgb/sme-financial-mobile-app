/**
 * Vendor Bill intake intelligence -- the actual "financial intelligence"
 * layer around Bill capture (src/screens/BillsScreen.tsx), separate from the
 * capture mechanics themselves (manual entry / statementScan.ts). Two jobs:
 *
 * 1. detectBillFlags -- is this bill worth a second look before it's
 *    recorded (duplicate, unusually large, an unfamiliar vendor, or missing
 *    basic fields)? Recomputed fresh every time, never stored as a frozen
 *    verdict -- the same "recompute, don't cache a judgment" discipline
 *    computeAgingBuckets/effectiveInvoiceStatus already use, so a flag never
 *    goes stale as more bills come in or the threshold setting changes.
 * 2. computeBillCashImpact -- what does approving this bill actually do to
 *    the business's runway? Reuses computeCashRunway, the same engine
 *    CashFlowScreen's Runway tab uses, rather than a second invented
 *    formula -- "approve this" and "check my runway" answer from one place.
 */

import { Bill, BillFlag, Transaction } from '../types';
import { computeCashRunway, CashRunway } from './cashRunway';
import { INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';

function normVendor(name: string): string {
    return (name ?? '').trim().toLowerCase();
}

/**
 * True if `candidate` and `existing` are almost certainly the same vendor
 * bill entered/captured twice: same vendor, same amount, and -- whichever
 * of the two identifying fields both bills actually have -- the same
 * invoice number or, lacking that, the same invoice date. Two different
 * bills from the same vendor for the same round amount (e.g. a recurring
 * retainer) don't collide here unless their invoice numbers also happen to
 * match, which a genuine duplicate scan/re-entry always will and two
 * distinct invoices almost never will.
 */
function isDuplicateBillPair(a: Bill, b: Bill): boolean {
    if (normVendor(a.vendorName) !== normVendor(b.vendorName)) return false;
    if (Math.round((a.total ?? 0) * 100) !== Math.round((b.total ?? 0) * 100)) return false;

    const aNum = (a.invoiceNumber ?? '').trim().toLowerCase();
    const bNum = (b.invoiceNumber ?? '').trim().toLowerCase();
    if (aNum && bNum) return aNum === bNum;

    // Neither bill has a legible invoice number -- fall back to invoice
    // date as the next-best identifying field rather than skipping the
    // check entirely.
    if (a.invoiceDate && b.invoiceDate) return a.invoiceDate === b.invoiceDate;

    return false;
}

export interface DetectBillFlagsOptions {
    // undefined/null/<=0 means "no threshold set" -- never silently treats
    // a 0 threshold as "flag every bill", the same ambiguous-zero bug this
    // app already fixed once for the AI Advisor's reserve target.
    thresholdAmount?: number | null;
}

/**
 * Flags for a candidate bill against the bills already on file. Pass every
 * other captured bill in `existingBills` (the candidate's own prior version
 * excluded by the caller when re-checking an edit) -- this is a pure
 * function over whatever's passed in, it never reads storage itself.
 */
export function detectBillFlags(
    candidate: Bill,
    existingBills: Bill[],
    options: DetectBillFlagsOptions = {},
): BillFlag[] {
    const flags: BillFlag[] = [];
    const others = existingBills.filter(b => b.id !== candidate.id);

    if (others.some(b => isDuplicateBillPair(candidate, b))) {
        flags.push('duplicate');
    }

    const threshold = options.thresholdAmount;
    if (threshold != null && threshold > 0 && (candidate.total ?? 0) >= threshold) {
        flags.push('above_threshold');
    }

    const vendorSeenBefore = others.some(b => normVendor(b.vendorName) === normVendor(candidate.vendorName));
    if (candidate.vendorName && !vendorSeenBefore) {
        flags.push('new_vendor');
    }

    const missingInfo = !candidate.vendorName?.trim()
        || !candidate.invoiceNumber?.trim()
        || !candidate.dueDate
        || !(candidate.total > 0);
    if (missingInfo) {
        flags.push('missing_info');
    }

    return flags;
}

export interface BillCashImpact {
    before: CashRunway;
    after: CashRunway;
    // How much runway this single bill costs, in days -- before.runwayDays
    // minus after.runwayDays, when both are finite; null when either side
    // has no burn to measure against (Infinity - Infinity is meaningless).
    runwayDaysLost: number | null;
    risk: 'low' | 'medium' | 'high';
}

/**
 * What paying this bill in full, right now, out of current cash would do
 * to the business's runway -- current runway vs. runway with cashBalance
 * reduced by the bill's total, burn rate held constant. An honest
 * "what-if", not a prediction of when it'll actually be paid.
 */
export function computeBillCashImpact(
    bill: Bill,
    transactions: Transaction[],
    cashBalance: number,
    now: Date = new Date(),
): BillCashImpact {
    const before = computeCashRunway(transactions, cashBalance, now);
    const after = computeCashRunway(transactions, cashBalance - (bill.total ?? 0), now);

    const runwayDaysLost = Number.isFinite(before.runwayDays) && Number.isFinite(after.runwayDays)
        ? before.runwayDays - after.runwayDays
        : null;

    const risk: BillCashImpact['risk'] = !Number.isFinite(after.runwayDays)
        ? 'low'
        : after.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysCritical
            ? 'high'
            : after.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysSafe
                ? 'medium'
                : 'low';

    return { before, after, runwayDaysLost, risk };
}
