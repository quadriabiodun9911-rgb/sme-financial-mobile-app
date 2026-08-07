import { computeExternalRiskInsights } from '../src/utils/externalRiskInsights';
import { Transaction, MacroAssumption } from '../src/types';

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

const makeAssumption = (overrides: Partial<MacroAssumption>): MacroAssumption => ({
    id: `ma-${Math.random()}`,
    driver: 'energy',
    label: 'Diesel price',
    changePct: 20,
    periodMonths: 3,
    linkedCategories: ['Utilities'],
    updatedAt: '2026-06-01',
    ...overrides,
});

// Utilities: 10% of revenue prior window -> 25% current window. Rent is flat,
// so it never rises and never matches an assumption linked to it.
function txsWithRisingUtilities(): Transaction[] {
    const txs: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
    }
    for (const m of ['2026-04', '2026-05', '2026-06']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 25000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
    }
    return txs;
}

describe('computeExternalRiskInsights', () => {
    it('is unavailable with insufficient transaction history, regardless of assumptions', () => {
        const result = computeExternalRiskInsights(
            [makeTx({ date: '2026-06-01', type: 'income', amount: 1000 })],
            [makeAssumption({})]
        );
        expect(result.available).toBe(false);
        expect(result.insights).toEqual([]);
    });

    it('is available with no insights when the owner has entered no macro assumptions', () => {
        const result = computeExternalRiskInsights(txsWithRisingUtilities(), []);
        expect(result.available).toBe(true);
        expect(result.hasAssumptions).toBe(false);
        expect(result.insights).toEqual([]);
    });

    it('produces no insight when the linked category is not actually rising internally', () => {
        const result = computeExternalRiskInsights(
            txsWithRisingUtilities(),
            [makeAssumption({ linkedCategories: ['Rent'] })] // Rent is flat in the fixture
        );
        expect(result.available).toBe(true);
        expect(result.hasAssumptions).toBe(true);
        expect(result.insights).toEqual([]);
    });

    it('produces a matched insight with projected impact when the linked category is Cost Exposure\'s top rising category', () => {
        const result = computeExternalRiskInsights(
            txsWithRisingUtilities(),
            [makeAssumption({ driver: 'energy', label: 'Diesel price', linkedCategories: ['Utilities'] })]
        );
        expect(result.insights.length).toBe(1);
        const insight = result.insights[0];
        expect(insight.driver).toBe('energy');
        expect(insight.category).toBe('Utilities');
        expect(insight.title).toMatch(/Energy Risk Increasing/);
        expect(insight.whatChanged).toMatch(/Utilities/);
        expect(insight.whatChanged).toMatch(/Diesel price/);
        expect(insight.projectedImpact).not.toBeNull();
        expect(insight.projectedImpact?.category).toBe('Utilities');
        expect(insight.recommendedActions.length).toBeGreaterThan(0);
        expect(insight.creditReadinessImpact).toMatch(/Utilities/);
        expect(insight.growthImpact).toMatch(/Quality of Growth/);
    });

    it('falls back to qualitative risk framing when the category is rising but not the projected top category', () => {
        const txs: Transaction[] = [];
        // Two rising categories: Utilities rises more (becomes top/projected), Transport rises less.
        for (const m of ['2026-01', '2026-02', '2026-03']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Transport', amount: 10000 }));
        }
        for (const m of ['2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 25000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Transport', amount: 13000 }));
        }
        const result = computeExternalRiskInsights(txs, [makeAssumption({ driver: 'fx', linkedCategories: ['Transport'] })]);
        expect(result.insights.length).toBe(1);
        const insight = result.insights[0];
        expect(insight.category).toBe('Transport');
        expect(insight.projectedImpact).toBeNull();
        expect(insight.riskCreated).toMatch(/Transport/);
    });

    it('produces one insight per matched assumption, skipping unmatched ones', () => {
        const result = computeExternalRiskInsights(txsWithRisingUtilities(), [
            makeAssumption({ id: 'a1', driver: 'energy', linkedCategories: ['Utilities'] }),
            makeAssumption({ id: 'a2', driver: 'fx', linkedCategories: ['Nonexistent Category'] }),
        ]);
        expect(result.insights.length).toBe(1);
        expect(result.insights[0].driver).toBe('energy');
    });
});
