import { estimateOutstandingByCurrency, LoanMonitoringShareRow } from '../src/utils/loanMonitoringShare';

const makeRow = (overrides: Partial<LoanMonitoringShareRow> = {}): LoanMonitoringShareRow => ({
    id: 'r1',
    loanId: 'l1',
    businessName: 'Biz',
    status: 'healthy',
    readinessTrend: null,
    dscrFlag: false,
    revenueDeclineFlag: false,
    repaymentPaceFlag: false,
    principalBand: '2M–10M',
    currency: '₦',
    fundedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    expiresAt: '2026-04-01',
    ...overrides,
});

describe('estimateOutstandingByCurrency', () => {
    it('sums band midpoints within a currency', () => {
        const rows = [
            makeRow({ principalBand: '2M–10M' }),   // 6,000,000
            makeRow({ principalBand: '500K–2M' }),   // 1,250,000
        ];
        const result = estimateOutstandingByCurrency(rows);
        expect(result).toEqual([{ currency: '₦', total: 7_250_000, businessCount: 2 }]);
    });

    it('keeps different currencies in separate groups instead of summing them together', () => {
        const rows = [
            makeRow({ currency: '₦', principalBand: '10M–50M' }), // 30,000,000
            makeRow({ currency: '$', principalBand: 'Under 500K' }), // 250,000
        ];
        const result = estimateOutstandingByCurrency(rows);
        expect(result).toHaveLength(2);
        expect(result.find(r => r.currency === '₦')).toEqual({ currency: '₦', total: 30_000_000, businessCount: 1 });
        expect(result.find(r => r.currency === '$')).toEqual({ currency: '$', total: 250_000, businessCount: 1 });
    });

    it('excludes rows with no currency recorded (pre-migration-012 rows) instead of guessing', () => {
        const rows = [
            makeRow({ currency: undefined, principalBand: '10M–50M' }),
            makeRow({ currency: '₦', principalBand: '2M–10M' }),
        ];
        const result = estimateOutstandingByCurrency(rows);
        expect(result).toEqual([{ currency: '₦', total: 6_000_000, businessCount: 1 }]);
    });

    it('excludes rows with no principal band', () => {
        const rows = [makeRow({ principalBand: undefined })];
        expect(estimateOutstandingByCurrency(rows)).toEqual([]);
    });

    it('sorts groups by total descending', () => {
        const rows = [
            makeRow({ currency: '$', principalBand: 'Under 500K' }), // 250,000
            makeRow({ currency: '₦', principalBand: '50M+' }),       // 50,000,000
        ];
        const result = estimateOutstandingByCurrency(rows);
        expect(result.map(r => r.currency)).toEqual(['₦', '$']);
    });

    it('returns an empty array for no shares', () => {
        expect(estimateOutstandingByCurrency([])).toEqual([]);
    });
});
