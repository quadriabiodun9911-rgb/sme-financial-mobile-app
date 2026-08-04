import { buildFiveCsAssessment } from '../src/utils/fiveCsOfCredit';
import { computeRiskScore, computeDSCR } from '../src/utils/finance';
import { computeLeverageRatios } from '../src/utils/debtRatios';
import { FinanceData, Loan, Transaction } from '../src/types';

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

const financeNoAssets: FinanceData = {
    income: 500000, expense: 300000, profit: 200000, margin: 40, cashBalance: 200000,
    totalRevenue: 500000, totalCosts: 300000, assets: 0, liabilities: 0, equity: 0,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 0,
};

const financeWithAssets: FinanceData = {
    ...financeNoAssets, assets: 400000, liabilities: 100000, equity: 300000,
};

describe('buildFiveCsAssessment', () => {
    const transactions: Transaction[] = [
        makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
        makeTx({ type: 'expense', category: 'Rent', amount: 300000, date: daysAgo(20) }),
    ];
    const loans: Loan[] = [];

    it('always includes all 5 C\'s, in the classic order, with a question for each', () => {
        const risk = computeRiskScore(financeNoAssets, loans, transactions, []);
        const dscr = computeDSCR(transactions, loans);
        const leverage = computeLeverageRatios(financeNoAssets, loans);
        const cs = buildFiveCsAssessment(risk, dscr, leverage, 0, 0, '₦');

        expect(cs.map(c => c.name)).toEqual(['Character', 'Capacity', 'Capital', 'Collateral', 'Conditions']);
        cs.forEach(c => expect(c.question.length).toBeGreaterThan(0));
    });

    it('never claims Character or Conditions are evidenced -- no data source exists for either', () => {
        const risk = computeRiskScore(financeWithAssets, loans, transactions, []);
        const dscr = computeDSCR(transactions, loans);
        const leverage = computeLeverageRatios(financeWithAssets, loans);
        const cs = buildFiveCsAssessment(risk, dscr, leverage, 50000, 20000, '₦');

        const character = cs.find(c => c.name === 'Character')!;
        const conditions = cs.find(c => c.name === 'Conditions')!;
        expect(character.evidenced).toBe(false);
        expect(conditions.evidenced).toBe(false);
    });

    it('marks Capacity as evidenced and ties it to Debt/Profitability/Liquidity', () => {
        const risk = computeRiskScore(financeWithAssets, loans, transactions, []);
        const dscr = computeDSCR(transactions, loans);
        const leverage = computeLeverageRatios(financeWithAssets, loans);
        const cs = buildFiveCsAssessment(risk, dscr, leverage, 0, 0, '₦');

        const capacity = cs.find(c => c.name === 'Capacity')!;
        expect(capacity.evidenced).toBe(true);
        expect(capacity.relatedFactors).toEqual(['Debt', 'Profitability', 'Liquidity']);
    });

    it('marks Capital as not evidenced when no assets are recorded, and evidenced once they are', () => {
        const risk1 = computeRiskScore(financeNoAssets, loans, transactions, []);
        const dscr1 = computeDSCR(transactions, loans);
        const leverageNone = computeLeverageRatios(financeNoAssets, loans);
        const csNone = buildFiveCsAssessment(risk1, dscr1, leverageNone, 0, 0, '₦');
        expect(csNone.find(c => c.name === 'Capital')!.evidenced).toBe(false);

        const risk2 = computeRiskScore(financeWithAssets, loans, transactions, []);
        const dscr2 = computeDSCR(transactions, loans);
        const leverageSome = computeLeverageRatios(financeWithAssets, loans);
        const csSome = buildFiveCsAssessment(risk2, dscr2, leverageSome, 0, 0, '₦');
        const capital = csSome.find(c => c.name === 'Capital')!;
        expect(capital.evidenced).toBe(true);
        expect(capital.summary).toContain('300'); // equity = 400000 - 100000 = 300000, formatted as ₦300.0K
    });

    it('marks Collateral as evidenced only when inventory or asset value exists', () => {
        const risk = computeRiskScore(financeNoAssets, loans, transactions, []);
        const dscr = computeDSCR(transactions, loans);
        const leverage = computeLeverageRatios(financeNoAssets, loans);

        const csEmpty = buildFiveCsAssessment(risk, dscr, leverage, 0, 0, '₦');
        expect(csEmpty.find(c => c.name === 'Collateral')!.evidenced).toBe(false);

        const csWithStock = buildFiveCsAssessment(risk, dscr, leverage, 50000, 0, '₦');
        expect(csWithStock.find(c => c.name === 'Collateral')!.evidenced).toBe(true);
    });
});
