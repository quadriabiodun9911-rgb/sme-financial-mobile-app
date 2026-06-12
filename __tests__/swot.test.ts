import { generateSwot } from '../src/utils/swot';
import { FinanceData, Transaction } from '../src/types';

const settings = {
    businessType: 'both' as const, currency: '$', minReserve: '5000',
    targetMargin: '65', openingAssets: '0', openingLiabilities: '0', openingLoans: '0', openingOtherAssets: '0', defaultTaxRate: '0',
};

const makeFinance = (overrides: Partial<FinanceData> = {}): FinanceData => ({
    income: 100000, expense: 60000, profit: 40000, margin: 40,
    cashBalance: 40000, totalRevenue: 100000, totalCosts: 60000,
    assets: 40000, liabilities: 0, equity: 40000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    ...overrides,
});

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx1', date: '2026-01-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

describe('generateSwot', () => {
    it('returns all four quadrants', () => {
        const swot = generateSwot(makeFinance(), [], settings);
        expect(Array.isArray(swot.strengths)).toBe(true);
        expect(Array.isArray(swot.weaknesses)).toBe(true);
        expect(Array.isArray(swot.opportunities)).toBe(true);
        expect(Array.isArray(swot.threats)).toBe(true);
    });

    it('every quadrant has at least one item', () => {
        const swot = generateSwot(makeFinance(), [], settings);
        expect(swot.strengths.length).toBeGreaterThan(0);
        expect(swot.weaknesses.length).toBeGreaterThan(0);
        expect(swot.opportunities.length).toBeGreaterThan(0);
        expect(swot.threats.length).toBeGreaterThan(0);
    });

    it('includes a strength when margin >= target', () => {
        const swot = generateSwot(makeFinance({ margin: 70 }), [], settings);
        const hasMarginStrength = swot.strengths.some(s => s.text.includes('margin') || s.text.includes('Margin'));
        expect(hasMarginStrength).toBe(true);
    });

    it('includes a weakness when margin < target', () => {
        const swot = generateSwot(makeFinance({ margin: 30 }), [], settings);
        const hasMarginWeakness = swot.weaknesses.some(w => w.text.toLowerCase().includes('margin'));
        expect(hasMarginWeakness).toBe(true);
    });

    it('includes a strength when cash >= reserve', () => {
        const swot = generateSwot(makeFinance({ cashBalance: 20000 }), [], settings);
        const hasCashStrength = swot.strengths.some(s => s.text.toLowerCase().includes('cash'));
        expect(hasCashStrength).toBe(true);
    });

    it('includes a weakness when cash < reserve', () => {
        const swot = generateSwot(makeFinance({ cashBalance: 1000 }), [], settings);
        const hasCashWeakness = swot.weaknesses.some(w => w.text.toLowerCase().includes('cash'));
        expect(hasCashWeakness).toBe(true);
    });

    it('includes a threat when cash is critically low (< 50% of reserve)', () => {
        const swot = generateSwot(makeFinance({ cashBalance: 500 }), [], settings);
        const hasCriticalThreat = swot.threats.some(t => t.text.toLowerCase().includes('cash'));
        expect(hasCriticalThreat).toBe(true);
    });

    it('includes a weakness when there is overdue AR', () => {
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: '2026-01-01', amount: 5000 })];
        const swot = generateSwot(makeFinance(), txs, settings);
        const hasARWeakness = swot.weaknesses.some(w => w.text.toLowerCase().includes('receivable') || w.text.toLowerCase().includes('overdue'));
        expect(hasARWeakness).toBe(true);
    });

    it('includes an opportunity to collect overdue AR', () => {
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: '2026-01-01', amount: 8000 })];
        const swot = generateSwot(makeFinance(), txs, settings);
        const hasAROpportunity = swot.opportunities.some(o => o.text.toLowerCase().includes('receiv') || o.text.toLowerCase().includes('collect'));
        expect(hasAROpportunity).toBe(true);
    });

    it('includes a threat for overdue AP', () => {
        const txs = [makeTx({ type: 'expense', status: 'overdue', dueDate: '2026-01-01', amount: 3000 })];
        const swot = generateSwot(makeFinance(), txs, settings);
        const hasAPThreat = swot.threats.some(t => t.text.toLowerCase().includes('payable') || t.text.toLowerCase().includes('supplier'));
        expect(hasAPThreat).toBe(true);
    });

    it('includes a strength for positive profit', () => {
        const swot = generateSwot(makeFinance({ profit: 20000 }), [], settings);
        const hasProfitStrength = swot.strengths.some(s => s.text.toLowerCase().includes('profit'));
        expect(hasProfitStrength).toBe(true);
    });

    it('includes a threat for net loss', () => {
        const swot = generateSwot(makeFinance({ profit: -5000, margin: -5 }), [], settings);
        const hasLossThreat = swot.threats.some(t => t.text.toLowerCase().includes('loss'));
        expect(hasLossThreat).toBe(true);
    });

    it('includes a strength for diversified income sources', () => {
        const txs = [
            makeTx({ category: 'Software', type: 'income' }),
            makeTx({ id: 'tx2', category: 'Consulting', type: 'income' }),
            makeTx({ id: 'tx3', category: 'Training', type: 'income' }),
        ];
        const swot = generateSwot(makeFinance(), txs, settings);
        const hasDiversityStrength = swot.strengths.some(s => s.text.toLowerCase().includes('categor') || s.text.toLowerCase().includes('diversi') || s.text.toLowerCase().includes('income'));
        expect(hasDiversityStrength).toBe(true);
    });

    it('sets generatedAt to the current time', () => {
        const before = Date.now();
        const swot = generateSwot(makeFinance(), [], settings);
        const after = Date.now();
        const ts = new Date(swot.generatedAt).getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });
});
