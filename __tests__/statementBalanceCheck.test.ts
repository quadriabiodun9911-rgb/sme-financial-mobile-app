import { checkStatementBalance } from '../src/utils/statementBalanceCheck';

describe('checkStatementBalance', () => {
    it('is unavailable when either balance is missing', () => {
        expect(checkStatementBalance(undefined, 1000, [])).toMatchObject({ available: false, hasDiscrepancy: false });
        expect(checkStatementBalance(1000, undefined, [])).toMatchObject({ available: false, hasDiscrepancy: false });
        expect(checkStatementBalance(undefined, undefined, [])).toMatchObject({ available: false, hasDiscrepancy: false });
    });

    it('finds no discrepancy when opening + net exactly matches closing', () => {
        const rows = [
            { amount: 150000, type: 'income' as const },
            { amount: 45000, type: 'expense' as const },
        ];
        const result = checkStatementBalance(100000, 205000, rows);
        expect(result.available).toBe(true);
        expect(result.expectedClosing).toBe(205000);
        expect(result.discrepancy).toBe(0);
        expect(result.hasDiscrepancy).toBe(false);
    });

    it('tolerates a small rounding difference within the relative tolerance', () => {
        const rows = [{ amount: 100000, type: 'income' as const }];
        // expected closing = 200000, actual = 200500 -> 0.25% off, under the 0.5% tolerance
        const result = checkStatementBalance(100000, 200500, rows);
        expect(result.hasDiscrepancy).toBe(false);
    });

    it('flags a real discrepancy beyond tolerance', () => {
        const rows = [
            { amount: 150000, type: 'income' as const },
            { amount: 45000, type: 'expense' as const },
        ];
        // Bank says closing is 250000, but rows only get us to 205000 -- a 45000 gap.
        const result = checkStatementBalance(100000, 250000, rows);
        expect(result.available).toBe(true);
        expect(result.hasDiscrepancy).toBe(true);
        expect(result.discrepancy).toBe(45000);
    });

    it('applies the minimum absolute tolerance for a near-zero closing balance', () => {
        // Closing balance ~0 means a percentage-based tolerance alone would
        // collapse to ~0, which would flag every trivial rounding cent.
        const rows = [{ amount: 100000, type: 'income' as const }];
        const result = checkStatementBalance(-100000, 0.5, rows);
        expect(result.hasDiscrepancy).toBe(false);
    });
});
