import { Loan, LoanPurpose, MerchantFinancingApplication } from '../types';

// Loan.purpose is a free-text string, but a MerchantFinancingApplication's
// purpose is the fixed LoanPurpose enum -- this turns the enum into the
// readable label the Loans screen actually displays, so a synced
// merchant-financing loan reads the same as a hand-entered one instead of
// showing a raw id like "emergency_working_capital".
export const MERCHANT_FINANCING_PURPOSE_LABEL: Record<LoanPurpose, string> = {
    inventory: 'Inventory Purchase',
    equipment: 'Equipment',
    both: 'Inventory & Equipment',
    supplier_payment: 'Supplier Payment',
    invoice_financing: 'Invoice Financing',
    expansion: 'Expansion',
    emergency_working_capital: 'Emergency Working Capital',
    other: 'Other',
};

// Turns a funded MerchantFinancingApplication into a real Loan record.
// Before this existed, an approved application had no path to 'funded' at
// all -- the UI just asserted "Funds will be transferred within 24 hours"
// with nothing anywhere that could confirm it happened, and even a
// manually-added matching Loan lived in a completely separate place from
// the application record. This is the one place that conversion happens,
// so every field mapping (falling back to requestedAmount when a lender
// somehow approved without recording an amount, falling back to an
// honest "Awaiting lender match" rather than a fabricated bank name) is
// defined once and testable on its own, independent of the React context
// plumbing that calls it.
export function buildLoanFromMerchantFinancing(
    app: MerchantFinancingApplication,
    fundingDate: string,
): Omit<Loan, 'id' | 'createdAt' | 'payments'> {
    return {
        lenderName: app.lenderName || 'Awaiting lender match',
        purpose: MERCHANT_FINANCING_PURPOSE_LABEL[app.purpose] ?? 'Merchant Financing',
        principal: app.approvedAmount ?? app.requestedAmount,
        interestRate: app.interestRate,
        termMonths: app.termMonths,
        startDate: fundingDate,
        status: 'active',
        merchantFinancingApplicationId: app.id,
    };
}
