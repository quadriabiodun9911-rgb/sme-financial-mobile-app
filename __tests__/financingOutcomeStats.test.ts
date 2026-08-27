import { computeFinancingOutcomeStats, describeFinancingOutcomeStats } from '../src/utils/financingOutcomeStats';
import { MerchantFinancingApplication } from '../src/types';

let seq = 0;
const makeApp = (overrides: Partial<MerchantFinancingApplication> = {}): MerchantFinancingApplication => ({
    id: `app-${seq++}`,
    userId: 'u1',
    status: 'pending',
    requestedAmount: 1000000,
    purpose: 'expansion',
    interestRate: 0,
    termMonths: 0,
    lenderName: 'Awaiting lender match',
    lenderId: '',
    appliedDate: '2026-01-01',
    monthlyProfitAtApproval: 0,
    monthlyProfitCurrent: 0,
    ...overrides,
});

describe('computeFinancingOutcomeStats', () => {
    it('is unavailable with no resolved applications', () => {
        const stats = computeFinancingOutcomeStats([], makeApp({ status: 'pending' }));
        expect(stats.available).toBe(false);
        expect(describeFinancingOutcomeStats(stats)).toBeNull();
    });

    it('never counts a still-pending current application as a resolved outcome', () => {
        const stats = computeFinancingOutcomeStats([], makeApp({ status: 'pending' }));
        expect(stats.totalResolved).toBe(0);
    });

    it('computes a real approval rate across resolved applications', () => {
        const pastApplications = [
            makeApp({ status: 'approved', requestedAmount: 1000000, approvedAmount: 800000 }),
            makeApp({ status: 'rejected', rejectionReason: 'Insufficient trading history' }),
        ];
        const stats = computeFinancingOutcomeStats(pastApplications);
        expect(stats.available).toBe(true);
        expect(stats.totalResolved).toBe(2);
        expect(stats.approvedCount).toBe(1);
        expect(stats.rejectedCount).toBe(1);
        expect(stats.approvalRatePct).toBe(50);
        expect(stats.avgApprovedVsRequestedPct).toBe(80);
        expect(stats.rejectionReasons).toEqual(['Insufficient trading history']);
    });

    it('includes a resolved current application (approved or rejected) alongside past ones', () => {
        const pastApplications = [makeApp({ status: 'rejected', rejectionReason: 'DSCR too low' })];
        const current = makeApp({ status: 'approved', requestedAmount: 500000, approvedAmount: 500000 });
        const stats = computeFinancingOutcomeStats(pastApplications, current);
        expect(stats.totalResolved).toBe(2);
        expect(stats.approvedCount).toBe(1);
        expect(stats.avgApprovedVsRequestedPct).toBe(100);
    });

    it('never fabricates an approved-vs-requested ratio when no approved application recorded an amount', () => {
        const stats = computeFinancingOutcomeStats([makeApp({ status: 'approved', approvedAmount: undefined })]);
        expect(stats.avgApprovedVsRequestedPct).toBeNull();
    });

    it('produces a real, grounded description sentence', () => {
        const stats = computeFinancingOutcomeStats([
            makeApp({ status: 'approved', requestedAmount: 1000000, approvedAmount: 900000 }),
        ]);
        const desc = describeFinancingOutcomeStats(stats);
        expect(desc).toContain('Applied for financing 1 time');
        expect(desc).toContain('1 approved, 0 rejected');
        expect(desc).toContain('90%');
    });
});
