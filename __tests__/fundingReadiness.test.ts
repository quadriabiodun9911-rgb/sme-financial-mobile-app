import { buildFundingReadinessPack } from '../src/utils/fundingReadiness';
import { Transaction, Invoice, Loan, InventoryItem, Asset, FinanceData, BusinessSettings } from '../src/types';

const settings: BusinessSettings = {
    businessType: 'both',
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
    income: 0, expense: 0, profit: 0, margin: 0, cashBalance: 500000,
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

describe('buildFundingReadinessPack', () => {
    it('computes gross profit and net profit from trailing-12-month transactions only', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 100000, date: daysAgo(30) }),
            makeTx({ type: 'expense', category: 'Supplier stock', amount: 40000, date: daysAgo(30) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 10000, date: daysAgo(30) }),
            // Outside the trailing-12-month window — excluded from the profile
            makeTx({ type: 'income', amount: 999999, date: daysAgo(400) }),
        ];
        const pack = buildFundingReadinessPack(transactions, [], [], [], [], finance, settings, 'Test Co');
        expect(pack.profile.revenue).toBe(100000);
        expect(pack.profile.grossProfit).toBe(60000); // 100000 - 40000 cogs
        expect(pack.profile.netProfit).toBe(50000); // 60000 - 10000 sga
    });

    it('sums active loan outstanding principal as debt', () => {
        const loans: Loan[] = [
            {
                id: 'l1', lenderName: 'Bank', purpose: 'wc', principal: 500000, interestRate: 10, termMonths: 12,
                startDate: daysAgo(90), status: 'active',
                payments: [{ id: 'p1', date: daysAgo(30), amount: 100000 }],
                createdAt: daysAgo(90),
            },
            {
                id: 'l2', lenderName: 'Old Bank', purpose: 'wc', principal: 200000, interestRate: 10, termMonths: 12,
                startDate: daysAgo(400), status: 'paid_off', payments: [], createdAt: daysAgo(400),
            },
        ];
        const pack = buildFundingReadinessPack([], [], loans, [], [], finance, settings, 'Test Co');
        expect(pack.profile.debt).toBe(400000); // 500000 - 100000 paid; paid_off loan excluded
    });

    it('splits active debt into current (due within 1yr) and non-current portions', () => {
        // A 24-month loan, half paid off already -- roughly half the
        // remaining balance amortizes in the next 12 months.
        const loans: Loan[] = [
            {
                id: 'l1', lenderName: 'Bank', purpose: 'wc', principal: 1200000, interestRate: 12, termMonths: 24,
                startDate: daysAgo(30), status: 'active', payments: [], createdAt: daysAgo(30),
            },
        ];
        const pack = buildFundingReadinessPack([], [], loans, [], [], finance, settings, 'Test Co');
        expect(pack.profile.debtCurrentPortion).toBeGreaterThan(0);
        expect(pack.profile.debtNonCurrentPortion).toBeGreaterThan(0);
        expect(pack.profile.debtCurrentPortion + pack.profile.debtNonCurrentPortion).toBeCloseTo(pack.profile.debt, 6);
    });

    it('produces an 8-factor risk profile matching computeRiskScore', () => {
        const pack = buildFundingReadinessPack([], [], [], [], [], finance, settings, 'Test Co');
        expect(pack.riskProfile.length).toBe(8);
        expect(pack.riskProfile.map(f => f.name)).toEqual(
            expect.arrayContaining(['Profitability', 'Liquidity', 'Working Capital', 'Debt', 'Efficiency', 'Inventory', 'Concentration', 'Operating Cash Flow']),
        );
    });

    describe('document readiness', () => {
        it('marks everything not-ready with no data', () => {
            const pack = buildFundingReadinessPack([], [], [], [], [], finance, settings, 'Test Co');
            expect(pack.documents.every(d => !d.ready)).toBe(true);
        });

        it('marks invoice history ready only for non-draft invoices', () => {
            const invoices: Invoice[] = [
                { id: 'i1', invoiceNumber: '1', clientName: 'A', clientEmail: '', clientAddress: '', issueDate: daysAgo(10), dueDate: daysAgo(-20), lineItems: [], notes: '', status: 'draft', subtotal: 1000, taxTotal: 0, total: 1000, createdAt: daysAgo(10) },
            ];
            const draftOnly = buildFundingReadinessPack([], invoices, [], [], [], finance, settings, 'Test Co');
            expect(draftOnly.documents.find(d => d.id === 'invoices')!.ready).toBe(false);

            invoices.push({ id: 'i2', invoiceNumber: '2', clientName: 'B', clientEmail: '', clientAddress: '', issueDate: daysAgo(10), dueDate: daysAgo(-20), lineItems: [], notes: '', status: 'sent', subtotal: 1000, taxTotal: 0, total: 1000, createdAt: daysAgo(10) });
            const withSent = buildFundingReadinessPack([], invoices, [], [], [], finance, settings, 'Test Co');
            expect(withSent.documents.find(d => d.id === 'invoices')!.ready).toBe(true);
        });

        it('marks P&L ready once there are at least 5 transactions with revenue', () => {
            const fewTx = [makeTx({}), makeTx({})];
            const few = buildFundingReadinessPack(fewTx, [], [], [], [], finance, settings, 'Test Co');
            expect(few.documents.find(d => d.id === 'pnl')!.ready).toBe(false);

            const enoughTx = [makeTx({}), makeTx({}), makeTx({}), makeTx({}), makeTx({})];
            const enough = buildFundingReadinessPack(enoughTx, [], [], [], [], finance, settings, 'Test Co');
            expect(enough.documents.find(d => d.id === 'pnl')!.ready).toBe(true);
        });
    });

    it('projects an "after improvement" financing readiness score for a business with real issues', () => {
        const transactions: Transaction[] = Array.from({ length: 8 }, (_, i) => [
            makeTx({ type: 'income', amount: 100000, description: 'Big Customer', category: 'Sales', date: daysAgo(30 * i + 5) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 95000, date: daysAgo(30 * i + 5) }),
        ]).flat();
        const thinCashFinance: FinanceData = { ...finance, cashBalance: 5000 };
        const pack = buildFundingReadinessPack(transactions, [], [], [], [], thinCashFinance, settings, 'Test Co');

        expect(Array.isArray(pack.topActions)).toBe(true);
        expect(pack.topActions.length).toBeGreaterThan(0);
        expect(pack.improvementProjection).not.toBeNull();
        if (pack.improvementProjection) {
            expect(pack.improvementProjection.currentScore).toBe(pack.score);
            expect(pack.improvementProjection.projectedScore).toBeGreaterThanOrEqual(pack.improvementProjection.currentScore);
        }
    });

    it('has no improvement projection when there is not enough history for a diagnosis', () => {
        const pack = buildFundingReadinessPack([makeTx({})], [], [], [], [], finance, settings, 'Test Co');
        expect(pack.improvementProjection).toBeNull();
        expect(pack.topActions).toEqual([]);
    });

    it('takes at most the last 12 months with data for the trend', () => {
        const transactions: Transaction[] = Array.from({ length: 15 }, (_, i) =>
            makeTx({ date: daysAgo(30 * i + 1), amount: 1000 * (i + 1) }));
        const pack = buildFundingReadinessPack(transactions, [], [], [], [], finance, settings, 'Test Co');
        expect(pack.trend.length).toBeLessThanOrEqual(12);
    });
});
