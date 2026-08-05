import { computeSeasonalRisk } from '../src/utils/finance';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx', date: '2024-01-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

// Regression: computeSeasonalRisk used to average revenue across all 12
// calendar months regardless of how many actually had any transactions,
// treating a month with zero recorded income the same as a month with
// genuinely low revenue. A business with only a couple months of real
// history — the common case for any new user — saw the other ~10 months
// confidently reported as "historically a low-revenue month... prepare
// cash reserves", a specific, actionable-sounding claim built on zero
// actual data for those months.
describe('computeSeasonalRisk — months with no data are not fabricated as low-revenue', () => {
    it('marks a month with no transactions as unknown, not high risk', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-07-01', amount: 100000 }),
            makeTx({ id: 't2', date: '2024-08-01', amount: 100000 }),
        ];
        const risk = computeSeasonalRisk(txs);
        const jan = risk.find(r => r.month === 'Jan')!;
        expect(jan.hasData).toBe(false);
        expect(jan.riskLevel).toBe('unknown');
        expect(jan.warning).not.toContain('low-revenue');
    });

    it('does not dilute the average with zero-data months, so real months with similar revenue both read as normal', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-07-01', amount: 100000 }),
            makeTx({ id: 't2', date: '2024-08-01', amount: 100000 }),
        ];
        const risk = computeSeasonalRisk(txs);
        const jul = risk.find(r => r.month === 'Jul')!;
        const aug = risk.find(r => r.month === 'Aug')!;
        expect(jul.hasData).toBe(true);
        expect(aug.hasData).toBe(true);
        expect(jul.riskLevel).toBe('low');
        expect(aug.riskLevel).toBe('low');
    });

    it('still flags a real low-revenue month as high risk relative to other months with data', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-06-01', amount: 100000 }),
            makeTx({ id: 't2', date: '2024-07-01', amount: 100000 }),
            makeTx({ id: 't3', date: '2024-08-01', amount: 10000 }), // well below average
        ];
        const risk = computeSeasonalRisk(txs);
        const aug = risk.find(r => r.month === 'Aug')!;
        expect(aug.hasData).toBe(true);
        expect(aug.riskLevel).toBe('high');
        expect(aug.warning).toContain('low-revenue');
    });
});
