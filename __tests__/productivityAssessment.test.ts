import { computeProductivityAssessment } from '../src/utils/productivityAssessment';
import { Transaction, Asset, InventoryItem, StaffMember } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeItem = (overrides: Partial<InventoryItem>): InventoryItem => ({
    id: `i-${Math.random()}`,
    name: 'Item',
    category: 'General',
    quantity: 10,
    unit: 'pcs',
    costPrice: 1000,
    sellingPrice: 1500,
    lowStockThreshold: 5,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

const makeStaff = (overrides: Partial<StaffMember>): StaffMember => ({
    id: 's1', name: 'Staff', role: 'Sales', salary: 50000, salaryType: 'monthly',
    startDate: '2025-01-01', status: 'active', createdAt: '2025-01-01',
    ...overrides,
});

// Two full months (profitable, steadily improving) -- enough history for
// computeQualityOfGrowth to run its month-over-month fallback path.
function twoProfitableMonths(): Transaction[] {
    const txs: Transaction[] = [];
    for (const [m, revenue] of [['2026-01', 200000], ['2026-02', 240000]] as [string, number][]) {
        txs.push(makeTx({ date: `${m}-05`, type: 'income', amount: revenue, category: 'Sales' }));
        txs.push(makeTx({ date: `${m}-10`, type: 'expense', amount: revenue * 0.4, category: 'Stock/Inventory', status: 'paid' })); // COGS
        txs.push(makeTx({ date: `${m}-15`, type: 'expense', amount: revenue * 0.3, category: 'Rent', status: 'paid' })); // SG&A
        txs.push(makeTx({ date: `${m}-20`, type: 'expense', amount: revenue * 0.1, category: 'Salaries', status: 'paid' }));
    }
    return txs;
}

describe('computeProductivityAssessment', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeProductivityAssessment([], [], [], [], []);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no transaction history/i);
    });

    it('scores all five factors when revenue, expense, inventory, staff and trend history all exist', () => {
        const txs = twoProfitableMonths();
        const inventory = [
            makeItem({ id: 'fast', quantity: 2, costPrice: 1000 }), // small qty, won't classify slow
            makeItem({ id: 'slow', quantity: 500, costPrice: 1000 }), // large unsold qty -> slow mover
        ];
        const staff = [makeStaff({})];

        const result = computeProductivityAssessment(txs, [], inventory, staff, []);

        expect(result.available).toBe(true);
        expect(result.factors).toHaveLength(5);
        expect(result.factors.every(f => f.available)).toBe(true);
        // Weights of all-available factors sum to 100 (20+20+15+20+25).
        expect(result.factors.reduce((s, f) => s + f.weight, 0)).toBe(100);
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(['Excellent', 'Strong', 'Moderate', 'Weak', 'Critical']).toContain(result.band);
        expect(result.priorityFactor).not.toBeNull();
        expect(result.narrative).toContain(result.priorityFactor!.label);
    });

    it('excludes Inventory Efficiency (not scored, not penalized) when no inventory is recorded, and reweights over the rest', () => {
        const txs = twoProfitableMonths();
        const result = computeProductivityAssessment(txs, [], [], [], []);

        const inventoryFactor = result.factors.find(f => f.key === 'inventoryEfficiency')!;
        expect(inventoryFactor.available).toBe(false);
        expect(inventoryFactor.weight).toBe(0);
        expect(inventoryFactor.explanation).toMatch(/not applicable/i);

        // Remaining four factors' weights (20+20+20+25) should carry the
        // full blend -- the score should still be computable, not zeroed
        // out just because one factor doesn't apply.
        const scoredFactors = result.factors.filter(f => f.available);
        expect(scoredFactors).toHaveLength(4);
        expect(scoredFactors.reduce((s, f) => s + f.weight, 0)).toBe(85);
        expect(result.score).toBeGreaterThan(0);
    });

    it('reports labor productivity separately, never folded into the score, and omits it with no staff', () => {
        const txs = twoProfitableMonths();
        const withStaff = computeProductivityAssessment(txs, [], [], [makeStaff({})], []);
        expect(withStaff.laborProductivity.available).toBe(true);
        expect(withStaff.laborProductivity.activeStaffCount).toBe(1);
        expect(withStaff.laborProductivity.revenuePerEmployee).toBeGreaterThan(0);
        // No factor in the scored list carries a 'labor' key -- it's purely informational.
        expect(withStaff.factors.some(f => (f.key as string).toLowerCase().includes('labor'))).toBe(false);

        const withoutStaff = computeProductivityAssessment(txs, [], [], [], []);
        expect(withoutStaff.laborProductivity.available).toBe(false);
        // The overall score/band shouldn't change based on staff presence alone,
        // since labor productivity never carries weight either way.
        expect(withoutStaff.score).toBe(withStaff.score);
    });

    it('picks the lowest-scoring available factor as the priority, not just the first one', () => {
        const txs = twoProfitableMonths();
        const result = computeProductivityAssessment(txs, [], [], [], []);
        const worst = result.factors.filter(f => f.available).reduce((w, f) => (f.score < w.score ? f : w));
        expect(result.priorityFactor!.key).toBe(worst.key);
    });
});
