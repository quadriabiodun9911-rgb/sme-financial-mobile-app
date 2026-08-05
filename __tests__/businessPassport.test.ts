import { buildBusinessPassport } from '../src/utils/businessPassport';
import { Transaction, BusinessSettings, FinanceData } from '../src/types';

const settings: BusinessSettings = {
    businessName: 'Okafor Foods',
    businessType: 'product',
    industry: 'food-service',
    currency: '₦',
    currencyCode: 'NGN',
    minReserve: '0',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '7.5',
};

const finance: FinanceData = {
    income: 0, expense: 0, profit: 0, margin: 0, cashBalance: 750000,
    totalRevenue: 0, totalCosts: 0, assets: 0, liabilities: 0, equity: 0,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 0,
};

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `t-${Math.random()}`,
    date: daysAgo(10),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('buildBusinessPassport', () => {
    it('assembles a passport with all 8 sections for an empty business', () => {
        const passport = buildBusinessPassport([], [], [], [], [], finance, settings, null);
        expect(passport.businessName).toBe('Okafor Foods');
        expect(passport.identity).toBeDefined();
        expect(passport.financialIdentity).toBeDefined();
        expect(passport.health.categories.length).toBe(7);
        expect(passport.risk).toBeDefined();
        expect(passport.creditReadiness).toBeDefined();
        expect(passport.investmentReadiness).toBeDefined();
        expect(passport.growth).toBeDefined();
        expect(Array.isArray(passport.topActions)).toBe(true);
    });

    it('never invents an investment readiness score - only lists evidence and gaps', () => {
        const passport = buildBusinessPassport([], [], [], [], [], finance, settings, null);
        expect((passport.investmentReadiness as any).score).toBeUndefined();
        expect(passport.investmentReadiness.availableSignals.length).toBeGreaterThan(0);
        expect(passport.investmentReadiness.missingSignals).toEqual(
            expect.arrayContaining(['Customer acquisition & retention', 'Market opportunity', 'Management quality', 'Capital ask & use of funds']),
        );
    });

    it('health score and credit readiness score are the same canonical number', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const passport = buildBusinessPassport(transactions, [], [], [], [], finance, settings, null);
        expect(passport.creditReadiness.score).toBe(passport.health.score);
        expect(passport.creditReadiness.band).toBe(passport.health.band);
    });

    it('reflects a growing months-of-history track record as data accumulates', () => {
        const thin = buildBusinessPassport([makeTx({})], [], [], [], [], finance, settings, null);
        const rich: Transaction[] = Array.from({ length: 6 }, (_, i) => makeTx({ date: daysAgo(30 * i + 1) }));
        const established = buildBusinessPassport(rich, [], [], [], [], finance, settings, null);
        expect(established.trackRecord.monthsOfRecordedHistory).toBeGreaterThan(thin.trackRecord.monthsOfRecordedHistory);
    });

    it('only lists the valuation range as evidenced once there is enough history to estimate it', () => {
        // Too little history (< 3 months) — estimateBusinessValuation can't produce a range,
        // so it must not be claimed as evidenced.
        const thinTransactions: Transaction[] = [
            makeTx({ type: 'income', amount: 50000, date: daysAgo(10) }),
            makeTx({ type: 'income', amount: 50000, date: daysAgo(5) }),
        ];
        const thin = buildBusinessPassport(thinTransactions, [], [], [], [], finance, settings, null);
        expect(thin.investmentReadiness.valuation.hasReliableData).toBe(false);
        expect(thin.investmentReadiness.availableSignals).not.toContain('Illustrative valuation range');
        expect(thin.investmentReadiness.missingSignals).toContain('Illustrative valuation range');

        // Enough history (>= 3 months of revenue) — now it should be evidenced.
        const richTransactions: Transaction[] = Array.from({ length: 6 }, (_, i) =>
            makeTx({ type: 'income', amount: 500000, date: daysAgo(30 * i + 1) }),
        );
        const established = buildBusinessPassport(richTransactions, [], [], [], [], finance, settings, null);
        expect(established.investmentReadiness.valuation.hasReliableData).toBe(true);
        expect(established.investmentReadiness.availableSignals).toContain('Illustrative valuation range');
        expect(established.investmentReadiness.missingSignals).not.toContain('Illustrative valuation range');
    });
});
