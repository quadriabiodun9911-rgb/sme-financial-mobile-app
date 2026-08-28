import { buildLoanFromMerchantFinancing, MERCHANT_FINANCING_PURPOSE_LABEL } from '../src/utils/merchantFinancingConversion';
import { MerchantFinancingApplication } from '../src/types';

const baseApp: MerchantFinancingApplication = {
    id: 'app-1',
    userId: 'u1',
    status: 'approved',
    requestedAmount: 500000,
    approvedAmount: 450000,
    approvalDate: '2026-08-20',
    purpose: 'inventory',
    interestRate: 18,
    termMonths: 12,
    lenderName: 'Test Lender',
    lenderId: '',
    appliedDate: '2026-08-10',
    monthlyProfitAtApproval: 200000,
    monthlyProfitCurrent: 200000,
};

describe('buildLoanFromMerchantFinancing', () => {
    it('maps the approved amount, rate, term, lender, and links back to the application', () => {
        const loan = buildLoanFromMerchantFinancing(baseApp, '2026-08-25');
        expect(loan.principal).toBe(450000);
        expect(loan.interestRate).toBe(18);
        expect(loan.termMonths).toBe(12);
        expect(loan.lenderName).toBe('Test Lender');
        expect(loan.startDate).toBe('2026-08-25');
        expect(loan.status).toBe('active');
        expect(loan.merchantFinancingApplicationId).toBe('app-1');
    });

    it('falls back to requestedAmount when no approvedAmount was recorded', () => {
        const loan = buildLoanFromMerchantFinancing({ ...baseApp, approvedAmount: undefined }, '2026-08-25');
        expect(loan.principal).toBe(500000);
    });

    it('never fabricates a lender name when none was reported', () => {
        const loan = buildLoanFromMerchantFinancing({ ...baseApp, lenderName: '' }, '2026-08-25');
        expect(loan.lenderName).toBe('Awaiting lender match');
    });

    it('translates every LoanPurpose enum value to a readable label', () => {
        for (const purpose of Object.keys(MERCHANT_FINANCING_PURPOSE_LABEL) as (keyof typeof MERCHANT_FINANCING_PURPOSE_LABEL)[]) {
            const loan = buildLoanFromMerchantFinancing({ ...baseApp, purpose }, '2026-08-25');
            expect(loan.purpose).toBe(MERCHANT_FINANCING_PURPOSE_LABEL[purpose]);
            expect(loan.purpose).not.toBe(purpose); // never the raw enum id
        }
    });
});
