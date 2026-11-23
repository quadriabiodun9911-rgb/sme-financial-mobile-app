/**
 * Bad Debt Shock — the AR-side mirror of the Customer Loss Scenario
 * (customerLossScenario.ts): not "what if my biggest customer stops
 * buying" (a future-revenue question), but "what if the money I'm
 * already owed by my single biggest outstanding customer never actually
 * comes in."
 *
 * Reuses computeTopOutstandingCustomers (finance.ts) -- the same
 * per-customer AR ranking the "Who Owes Me" view already shows -- for the
 * concentration read, then hands the amount at risk straight to
 * computeFundingGapDiagnosis (fundingGapDiagnosis.ts), the same root-cause
 * engine upcomingLoanPaymentRisk.ts already reuses for exactly this kind
 * of "can current cash absorb this, and if not why not" question, rather
 * than inventing a second gap-diagnosis formula.
 *
 * Deliberately NOT modeled as a cash-balance drop the way Customer Loss /
 * Supplier Terms Shock are: an unpaid invoice was never counted as cash
 * in the first place (AR isn't cash), so writing it off doesn't subtract
 * anything from today's real cash balance -- it removes a collection the
 * business may have been counting on. The honest question is whether
 * current cash alone -- without that collection -- is still enough, which
 * is exactly what computeFundingGapDiagnosis already answers; when it
 * says there's no gap, that's a genuinely different (safer) answer than
 * "cash would drop," not a weaker version of it.
 */

import { Transaction, Invoice, InventoryItem, ReceivableWriteOff } from '../types';
import { computeTopOutstandingCustomers, CustomerOutstandingSummary } from './finance';
import { computeFundingGapDiagnosis, FundingGapDiagnosis } from './fundingGapDiagnosis';

export interface BadDebtShockResult {
    available: boolean;
    reason?: string;
    customer: CustomerOutstandingSummary | null;
    cashBalance: number;
    // null when current cash alone already absorbs the loss -- there is no
    // gap to diagnose, not merely one computeFundingGapDiagnosis didn't fill in.
    diagnosis: FundingGapDiagnosis | null;
    narrative: string;
}

const EMPTY = (reason: string): BadDebtShockResult => ({
    available: false, reason, customer: null, cashBalance: 0, diagnosis: null, narrative: '',
});

export function computeBadDebtShock(
    transactions: Transaction[],
    invoices: Invoice[],
    inventory: InventoryItem[],
    cashBalance: number,
    writeOffs: ReceivableWriteOff[] = [],
    currency: string = '₦',
    now: Date = new Date(),
): BadDebtShockResult {
    const ranked = computeTopOutstandingCustomers(transactions, invoices, writeOffs);
    const topCustomer = ranked[0] ?? null;
    if (!topCustomer || topCustomer.totalOutstanding <= 0) {
        return EMPTY('No outstanding receivables yet to model a bad-debt scenario from.');
    }

    const diagnosis = computeFundingGapDiagnosis(transactions, invoices, inventory, cashBalance, topCustomer.totalOutstanding, 0, currency, now);

    const name = topCustomer.customer && topCustomer.customer !== 'Unknown' ? topCustomer.customer : 'Your largest outstanding customer';
    const pctLabel = `${topCustomer.percentageOfTotal.toFixed(0)}%`;
    const amountLabel = `${currency}${Math.round(topCustomer.totalOutstanding).toLocaleString()}`;

    const narrative = !diagnosis.available
        ? `${name} owes ${amountLabel} (${pctLabel} of everything currently outstanding). If that invoice were never collected, current cash on hand would still absorb the loss without opening a funding gap.`
        : `${name} owes ${amountLabel} (${pctLabel} of everything currently outstanding). If that invoice were never collected, current cash alone would fall ${currency}${Math.round(diagnosis.gapAmount).toLocaleString()} short of replacing it${diagnosis.primaryCause ? ` — most likely compounded by ${diagnosis.primaryCause.label.toLowerCase()}` : ''}.`;

    return { available: true, customer: topCustomer, cashBalance, diagnosis: diagnosis.available ? diagnosis : null, narrative };
}
