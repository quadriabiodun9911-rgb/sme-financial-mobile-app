import { computeQualityOfGrowth } from '../src/utils/qualityOfGrowth';
import { Transaction, Asset, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'l1',
    lenderName: 'Bank',
    purpose: 'Working capital',
    principal: 5000,
    interestRate: 10,
    termMonths: 12,
    startDate: '2024-01-01',
    status: 'active',
    payments: [],
    createdAt: '2024-01-01',
    ...overrides,
});

const NO_ASSETS: Asset[] = [];

describe('computeQualityOfGrowth', () => {
    it('is unavailable with no transactions', () => {
        const result = computeQualityOfGrowth([], NO_ASSETS, []);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no transaction history/i);
    });

    it('is unavailable with only one year of data', () => {
        const txs = [
            makeTx({ date: '2025-03-01', type: 'income', amount: 10000 }),
            makeTx({ date: '2025-04-01', type: 'expense', amount: 5000 }),
        ];
        const result = computeQualityOfGrowth(txs, NO_ASSETS, []);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/two full years/i);
    });

    it('scores healthy growth highly with no flags', () => {
        const txs = [
            // 2024: revenue 100k, expense 70k, profit 30k
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            // 2025: revenue 130k (+30%), expense 88k, profit 42k (+40%, ahead of revenue)
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 130000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 88000, status: 'paid' }),
        ];
        const result = computeQualityOfGrowth(txs, NO_ASSETS, []);
        expect(result.available).toBe(true);
        expect(result.periodLabel).toBe('2025 vs 2024');
        expect(result.score).toBeGreaterThanOrEqual(70);
        expect(['Strong', 'Excellent']).toContain(result.band);
        expect(result.flags.length).toBe(0);
        // Profit (+40%) outgrew revenue (+30%) -- full credit, improving.
        expect(result.signals.find(s => s.key === 'profit')?.direction).toBe('improving');
        expect(result.signals.find(s => s.key === 'revenue')?.direction).toBe('improving');
    });

    it('scores fragile growth low and explains why', () => {
        const txs = [
            // 2024: revenue 100k, expense 70k, profit 30k, cash reserves built via paid income
            makeTx({ id: '2024-inc', date: '2024-03-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-03-01', type: 'expense', amount: 70000, status: 'paid' }),
            // 2025: revenue 130k (+30%) but profit falls, driven by unpaid receivables and heavy spend
            makeTx({ id: '2025-inc-paid', date: '2025-03-01', type: 'income', amount: 40000, status: 'paid' }),
            makeTx({ id: '2025-inc-pending', date: '2025-06-01', type: 'income', amount: 90000, status: 'pending' }),
            makeTx({ id: '2025-exp', date: '2025-03-01', type: 'expense', amount: 125000, status: 'paid' }),
        ];
        const loans: Loan[] = [
            makeLoan({ id: 'old-loan', principal: 10000, startDate: '2024-01-01', payments: [] }),
            makeLoan({ id: 'new-loan', principal: 40000, startDate: '2025-02-01', payments: [] }),
        ];
        const result = computeQualityOfGrowth(txs, NO_ASSETS, loans);
        expect(result.available).toBe(true);
        expect(result.score).toBeLessThan(50);
        expect(['Weak', 'Critical']).toContain(result.band);
        expect(result.flags.length).toBeGreaterThan(0);
        // profit fell while revenue grew — should be flagged
        expect(result.flags.some(f => /profit fell/i.test(f))).toBe(true);
        // debt roughly quadrupled while revenue grew 30% — should be flagged
        expect(result.flags.some(f => /debt grew/i.test(f))).toBe(true);
        // Profit fell while revenue grew -- deteriorating, not a naive
        // "profit went down" sign check that a plain pctChange would give
        // the same result for anyway; this asserts it uses the scored
        // branch, not a duplicate threshold.
        expect(result.signals.find(s => s.key === 'profit')?.direction).toBe('deteriorating');
        // Debt roughly quadrupled while revenue grew only 30% -- flagged
        // above as unsustainable leverage growth, so direction must agree.
        expect(result.signals.find(s => s.key === 'debt')?.direction).toBe('deteriorating');
    });

    it('gives receivables and debt a null direction (no baseline), not a fabricated one, when the prior-period value was zero', () => {
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            // Receivable created only in 2025 -- 2024 had none outstanding.
            makeTx({ id: '2025-inc-pending', date: '2025-09-01', type: 'income', amount: 20000, status: 'pending' }),
        ];
        // Loan taken out only in 2025 -- 2024 had no debt at all (not taken
        // out yet, so excluded from that year's balance-sheet snapshot).
        const loans: Loan[] = [makeLoan({ id: 'new-2025', principal: 10000, startDate: '2025-02-01', payments: [] })];
        const result = computeQualityOfGrowth(txs, NO_ASSETS, loans);
        expect(result.available).toBe(true);
        expect(result.signals.find(s => s.key === 'receivables')?.growthPct).toBeNull();
        expect(result.signals.find(s => s.key === 'receivables')?.direction).toBeNull();
        expect(result.signals.find(s => s.key === 'debt')?.growthPct).toBeNull();
        expect(result.signals.find(s => s.key === 'debt')?.direction).toBeNull();
    });

    it('flags the classic earnings-quality red flag: profit holding/growing while operating cash flow falls', () => {
        const txs = [
            // 2024: fully collected — profit and operating cash flow both 30k
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            // 2025: profit grows to 35k on paper, but 60k of that revenue is
            // still uncollected — operating cash flow actually goes negative
            makeTx({ id: '2025-inc-paid', date: '2025-03-01', type: 'income', amount: 50000, status: 'paid' }),
            makeTx({ id: '2025-inc-pending', date: '2025-06-01', type: 'income', amount: 60000, status: 'pending' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 75000, status: 'paid' }),
        ];
        const result = computeQualityOfGrowth(txs, NO_ASSETS, []);
        expect(result.available).toBe(true);
        const ocfSignal = result.signals.find(s => s.key === 'cash');
        expect(ocfSignal?.label).toBe('Operating Cash Flow');
        expect(ocfSignal?.priorValue).toBe(30000);
        expect(ocfSignal?.currentValue).toBe(-25000);
        expect(result.flags.some(f => /profit grew 17%.*operating cash flow fell 183%.*isn't converting into real cash/i.test(f))).toBe(true);
    });

    it("does not apply a current-year asset's depreciation add-back to the prior year's operating cash flow", () => {
        // Regression: computeProperCashFlow's depreciation add-back was
        // computed from the FULL, un-scoped assets array for both years,
        // so an asset bought during the current year still inflated the
        // PRIOR year's operating cash flow (it didn't exist yet). Identical
        // profit both years with no asset would show 0% OCF growth (flat);
        // an unscoped bug instead shows a fabricated swing driven purely by
        // when the asset happens to appear in the array, not by anything
        // that actually happened in the prior year.
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 70000, status: 'paid' }),
        ];
        const assets: Asset[] = [{
            id: 'a1', name: 'New Equipment', category: 'equipment', description: '',
            purchaseDate: '2025-03-01', purchaseCost: 120000, usefulLifeYears: 5, residualValue: 0,
            status: 'active', createdAt: '2025-03-01',
        }];
        const result = computeQualityOfGrowth(txs, assets, []);
        expect(result.available).toBe(true);
        const ocfSignal = result.signals.find(s => s.key === 'cash');
        // Prior year (2024) predates the asset entirely -- its OCF must
        // equal that year's own profit, not profit + a depreciation
        // add-back for an asset that didn't exist yet.
        expect(ocfSignal?.priorValue).toBe(30000);
        // Current year (2025) does own the asset, so its OCF gets the
        // depreciation add-back (30000 profit + 24000 depreciation).
        expect(ocfSignal?.currentValue).toBe(54000);
    });

    it('frames flat/declining revenue as a resilience check, not a growth-quality failure', () => {
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 80000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 65000, status: 'paid' }),
        ];
        const result = computeQualityOfGrowth(txs, NO_ASSETS, []);
        expect(result.available).toBe(true);
        expect(result.verdict).toMatch(/resilience check/i);
    });
});
