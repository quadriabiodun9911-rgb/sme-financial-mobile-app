/**
 * Supplier Payment Pressure — is the business using supplier credit
 * effectively, or is it simply delaying payments because of cash pressure?
 *
 * Deliberately distinct from three signals that already exist and sound
 * similar:
 *  - Supplier Concentration (riskRadar.ts / computeSupplierConcentration):
 *    DEPENDENCE on one supplier, not payment behavior toward any of them.
 *  - cashFlowHealth.ts's "payables grew rapidly" flag: a raw dollar
 *    growth-rate check, which fires on healthy purchasing growth just as
 *    readily as on genuine strain -- it can't tell the two apart.
 *  - workingCapitalHealth.ts's "paid noticeably faster than before" flag:
 *    the OPPOSITE failure mode (giving up supplier financing by paying too
 *    fast), not this one.
 *
 * This instead asks the sharper question directly: of what's currently
 * owed to suppliers, how much is actually PAST DUE (via computeAgingBuckets,
 * the same aging reconstruction the CFO Questions tab already uses for its
 * own AP view), not just outstanding. A business can carry a high days-
 * payable-outstanding number while paying every bill exactly on schedule --
 * that's healthy use of trade credit, not pressure. Pressure looks like
 * money aging past its due date, especially deep into the 61+ day buckets
 * where supplier relationships and future credit terms start to be at risk.
 */

import { Transaction } from '../types';
import { computeAgingBuckets, computeWorkingCapitalMetrics } from './finance';

export type SupplierPaymentPressureLevel = 'low' | 'moderate' | 'high';

export interface SupplierPaymentPressureFlag {
    severity: 'critical' | 'warning';
    message: string;
}

export interface SupplierPaymentPressureResult {
    available: boolean;
    reason?: string;
    level: SupplierPaymentPressureLevel;
    totalPayables: number;
    // Payables aged past the current 30-day window (computeAgingBuckets'
    // 31-60/61-90/90+ buckets combined) -- not everything in the "Current"
    // bucket is actually overdue (a not-yet-due payable also lands there),
    // so this undercounts true overdue amounts slightly rather than
    // overclaiming them.
    agedPayables: number;
    agedPct: number;
    severelyAgedPayables: number; // 61+ days specifically
    dpo: number;
    headline: string;
    narrative: string;
    riskFlags: SupplierPaymentPressureFlag[];
}

const AGED_PCT_MODERATE = 10;
const AGED_PCT_HIGH = 30;
const SEVERELY_AGED_ESCALATION_PCT = 15; // share of total payables in the 61+ buckets that escalates the level regardless of the overall aged %

const EMPTY_RESULT = (reason: string): SupplierPaymentPressureResult => ({
    available: false,
    reason,
    level: 'low',
    totalPayables: 0,
    agedPayables: 0,
    agedPct: 0,
    severelyAgedPayables: 0,
    dpo: 0,
    headline: '',
    narrative: '',
    riskFlags: [],
});

export function computeSupplierPaymentPressure(
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
): SupplierPaymentPressureResult {
    if (transactions.length === 0) {
        return EMPTY_RESULT('No transaction history yet — record some expenses to assess supplier payment pressure.');
    }

    const wc = computeWorkingCapitalMetrics(transactions);
    if (wc.accountsPayable <= 0) {
        return {
            available: true,
            level: 'low',
            totalPayables: 0,
            agedPayables: 0,
            agedPct: 0,
            severelyAgedPayables: 0,
            dpo: wc.dpo,
            headline: 'No outstanding supplier balance right now.',
            narrative: 'Nothing is currently owed to suppliers, so there is no payment pressure to assess.',
            riskFlags: [],
        };
    }

    const buckets = computeAgingBuckets(transactions, 'expense');
    const agedPayables = buckets[1].total + buckets[2].total + buckets[3].total;
    const severelyAgedPayables = buckets[2].total + buckets[3].total;
    const totalPayables = wc.accountsPayable;
    const agedPct = totalPayables > 0 ? (agedPayables / totalPayables) * 100 : 0;
    const severelyAgedPct = totalPayables > 0 ? (severelyAgedPayables / totalPayables) * 100 : 0;

    let level: SupplierPaymentPressureLevel = agedPct <= AGED_PCT_MODERATE ? 'low' : agedPct <= AGED_PCT_HIGH ? 'moderate' : 'high';
    if (severelyAgedPct > SEVERELY_AGED_ESCALATION_PCT && level !== 'high') level = 'high';

    const riskFlags: SupplierPaymentPressureFlag[] = [];
    if (agedPct > AGED_PCT_HIGH) {
        riskFlags.push({
            severity: 'warning',
            message: `${agedPct.toFixed(0)}% of what's owed to suppliers (${currency}${Math.round(agedPayables).toLocaleString()}) is aged past 30 days -- more a sign of cash pressure than deliberate use of supplier credit terms.`,
        });
    }
    if (severelyAgedPayables > 0) {
        riskFlags.push({
            severity: severelyAgedPct > SEVERELY_AGED_ESCALATION_PCT ? 'critical' : 'warning',
            message: `${currency}${Math.round(severelyAgedPayables).toLocaleString()} owed to suppliers is more than 60 days overdue -- this is where supplier relationships and future credit terms start to be at risk.`,
        });
    }
    if (agedPayables > 0 && cashBalance < agedPayables) {
        riskFlags.push({
            severity: 'critical',
            message: `Cash on hand (${currency}${Math.round(cashBalance).toLocaleString()}) doesn't cover the overdue supplier balance itself (${currency}${Math.round(agedPayables).toLocaleString()}) -- a sign of real cash constraint, not just slow admin.`,
        });
    }

    const headline = level === 'low'
        ? 'Supplier payments look current -- this reads as effective use of supplier credit, not pressure.'
        : level === 'moderate'
            ? 'Some supplier payments are running late -- worth watching before it becomes a pattern.'
            : 'A significant share of supplier payments is overdue -- this looks more like cash pressure than deliberate use of credit terms.';

    const narrative = level === 'low'
        ? `Days payable outstanding is ${Math.round(wc.dpo)} days, with ${agedPct.toFixed(0)}% of the ${currency}${Math.round(totalPayables).toLocaleString()} owed to suppliers aged past 30 days -- bills are being settled close to schedule.`
        : `${agedPct.toFixed(0)}% of the ${currency}${Math.round(totalPayables).toLocaleString()} owed to suppliers (${currency}${Math.round(agedPayables).toLocaleString()}) is aged past 30 days, at an average of ${Math.round(wc.dpo)} days payable outstanding.`;

    return {
        available: true,
        level,
        totalPayables,
        agedPayables,
        agedPct,
        severelyAgedPayables,
        dpo: wc.dpo,
        headline,
        narrative,
        riskFlags,
    };
}
