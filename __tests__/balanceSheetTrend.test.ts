import { computeBalanceSheetTrend } from '../src/utils/balanceSheetTrend';
import { Transaction, Asset, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeAsset = (overrides: Partial<Asset>): Asset => ({
    id: 'a1',
    name: 'Laptop',
    category: 'equipment',
    description: '',
    purchaseDate: '2024-01-01',
    purchaseCost: 1200,
    usefulLifeYears: 3,
    residualValue: 0,
    status: 'active',
    createdAt: '2024-01-01',
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

describe('computeBalanceSheetTrend', () => {
    it('returns an empty array when there are no months of data', () => {
        expect(computeBalanceSheetTrend('monthly', [], [], [], [])).toEqual([]);
    });

    it('computes a growing cumulative cash balance month over month', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: '2024-01-10' }),
            makeTx({ type: 'expense', amount: 200, date: '2024-01-20' }),
            makeTx({ type: 'income', amount: 500, date: '2024-02-05' }),
        ];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-02'], txs, [], []);
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ key: '2024-01', cashOnHand: 800 });
        expect(points[1]).toMatchObject({ key: '2024-02', cashOnHand: 1300 }); // cumulative, not per-month
    });

    it('ignores unpaid transactions when computing cash on hand', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: '2024-01-10', status: 'paid' }),
            makeTx({ type: 'income', amount: 5000, date: '2024-01-15', status: 'pending' }),
        ];
        const points = computeBalanceSheetTrend('monthly', ['2024-01'], txs, [], []);
        expect(points[0].cashOnHand).toBe(1000);
    });

    it('excludes an asset from periods before it was purchased', () => {
        const assets = [makeAsset({ purchaseDate: '2024-02-15', purchaseCost: 1200, usefulLifeYears: 3, residualValue: 0 })];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-02'], [], assets, []);
        expect(points[0].equipmentValue).toBe(0); // not yet purchased
        expect(points[1].equipmentValue).toBeGreaterThan(0); // purchased partway through Feb
    });

    it('excludes a disposed asset from periods after disposal', () => {
        const assets = [makeAsset({ purchaseDate: '2024-01-01', disposalDate: '2024-03-01' })];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-02', '2024-03'], [], assets, []);
        expect(points[0].equipmentValue).toBeGreaterThan(0);
        expect(points[1].equipmentValue).toBeGreaterThan(0);
        expect(points[2].equipmentValue).toBe(0); // disposed by then
    });

    it('reduces loan balance as payments are made over time, never going negative', () => {
        const loans = [makeLoan({
            principal: 3000,
            startDate: '2024-01-01',
            payments: [
                { id: 'p1', date: '2024-01-15', amount: 1000 },
                { id: 'p2', date: '2024-02-15', amount: 1000 },
            ],
        })];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-02', '2024-03'], [], [], loans);
        expect(points[0].loansOutstanding).toBe(2000);
        expect(points[1].loansOutstanding).toBe(1000);
        expect(points[2].loansOutstanding).toBe(1000); // no further payments, doesn't go negative
    });

    it('excludes a loan from periods before it started', () => {
        const loans = [makeLoan({ startDate: '2024-03-01', principal: 2000 })];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-03'], [], [], loans);
        expect(points[0].loansOutstanding).toBe(0);
        expect(points[1].loansOutstanding).toBe(2000);
    });

    it('rolls monthly points up into quarters using the quarter-end date', () => {
        const loans = [makeLoan({ startDate: '2024-02-01', principal: 1000 })];
        const points = computeBalanceSheetTrend('quarterly', ['2024-01', '2024-02', '2024-03'], [], [], loans);
        expect(points).toHaveLength(1);
        expect(points[0]).toMatchObject({ key: '2024-Q1', loansOutstanding: 1000 });
    });

    it('rolls monthly points up into years using the year-end date', () => {
        const txs = [makeTx({ type: 'income', amount: 100, date: '2024-06-01' })];
        const points = computeBalanceSheetTrend('yearly', ['2024-06', '2025-01'], txs, [], []);
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ key: '2024', cashOnHand: 100 });
        expect(points[1]).toMatchObject({ key: '2025', cashOnHand: 100 });
    });

    it('computes net worth as total assets minus total liabilities', () => {
        const txs = [makeTx({ type: 'income', amount: 5000, date: '2024-01-05' })];
        const assets = [makeAsset({ purchaseDate: '2024-01-01', purchaseCost: 1000, residualValue: 1000, usefulLifeYears: 3 })]; // no depreciation yet at purchase instant
        const loans = [makeLoan({ startDate: '2024-01-01', principal: 2000 })];
        const points = computeBalanceSheetTrend('monthly', ['2024-01'], txs, assets, loans);
        const p = points[0];
        expect(p.shortTermAssets).toBe(p.cashOnHand + p.accountsReceivable);
        expect(p.totalAssets).toBe(p.shortTermAssets + p.equipmentValue + p.otherAssets);
        expect(p.totalLiabilities).toBe(p.accountsPayable + p.loansOutstanding + p.otherLiabilities);
        expect(p.netWorth).toBeCloseTo(p.totalAssets - p.totalLiabilities, 5);
    });

    it('applies manually-entered other assets/liabilities as a flat value in every column', () => {
        const txs = [makeTx({ type: 'income', amount: 1000, date: '2024-01-05' })];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-02'], txs, [], [], { otherAssets: 500, otherLiabilities: 200 });
        expect(points[0]).toMatchObject({ otherAssets: 500, otherLiabilities: 200 });
        expect(points[1]).toMatchObject({ otherAssets: 500, otherLiabilities: 200 });
    });

    it('counts a currently-unpaid income transaction as accounts receivable from the period it was dated', () => {
        const txs = [
            makeTx({ type: 'income', amount: 800, date: '2024-01-10', status: 'pending' }),
            makeTx({ type: 'income', amount: 300, date: '2024-02-01', status: 'overdue' }),
        ];
        const points = computeBalanceSheetTrend('monthly', ['2024-01', '2024-02'], txs, [], []);
        expect(points[0].accountsReceivable).toBe(800); // the Feb invoice hadn't happened yet
        expect(points[1].accountsReceivable).toBe(1100); // both dated by end of Feb
    });

    it('counts a currently-unpaid expense transaction as accounts payable, and excludes paid ones', () => {
        const txs = [
            makeTx({ type: 'expense', amount: 400, date: '2024-01-10', status: 'overdue' }),
            makeTx({ type: 'expense', amount: 900, date: '2024-01-15', status: 'paid' }),
        ];
        const points = computeBalanceSheetTrend('monthly', ['2024-01'], txs, [], []);
        expect(points[0].accountsPayable).toBe(400);
    });
});
