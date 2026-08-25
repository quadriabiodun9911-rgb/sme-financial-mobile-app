import { appendStockCount, describeStockCount } from '../src/utils/stockCount';

describe('appendStockCount', () => {
    it('captures the current recorded quantity as expectedQuantity', () => {
        const entry = appendStockCount({ quantity: 120 }, 145, '2025-01-01');
        expect(entry.expectedQuantity).toBe(120);
        expect(entry.actualQuantity).toBe(145);
        expect(entry.differenceUnits).toBe(25);
    });

    it('produces a negative difference when the count is short', () => {
        const entry = appendStockCount({ quantity: 100 }, 82, '2025-01-01');
        expect(entry.differenceUnits).toBe(-18);
    });

    it('carries an optional note through', () => {
        const entry = appendStockCount({ quantity: 10 }, 10, '2025-01-01', 'Counted at close');
        expect(entry.note).toBe('Counted at close');
    });
});

describe('describeStockCount', () => {
    it('reports an exact match plainly', () => {
        const entry = appendStockCount({ quantity: 50 }, 50, '2025-01-01');
        expect(describeStockCount(entry, 'yards')).toContain('matches your records exactly');
    });

    it('reports a shortfall in the exact spec format', () => {
        const entry = appendStockCount({ quantity: 120 }, 95, '2025-01-01');
        const desc = describeStockCount(entry, 'units');
        expect(desc).toContain('should have 120 units remaining');
        expect(desc).toContain('shows 95 units');
        expect(desc).toContain('Difference: 25 units fewer than expected');
    });

    it('reports a surplus distinctly from a shortfall', () => {
        const entry = appendStockCount({ quantity: 120 }, 145, '2025-01-01');
        expect(describeStockCount(entry, 'units')).toContain('Difference: 25 units more than expected');
    });
});
