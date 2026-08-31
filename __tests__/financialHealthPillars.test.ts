import { computeFinancialHealthPillars, diagnoseFinancialHealth } from '../src/utils/financialHealthPillars';
import { computeRiskScore } from '../src/utils/finance';
import { computeBusinessResilience, BusinessExposure } from '../src/utils/businessExposure';
import { FinancialResilience } from '../src/utils/cashReservePlanning';
import { QualityOfGrowthResult } from '../src/utils/qualityOfGrowth';
import { Transaction, FinanceData, InventoryItem } from '../src/types';

const UNAVAILABLE_RESILIENCE: FinancialResilience = {
    available: false, essentialMonthlyExpenses: 0, currentReserve: 0, reserveCoverageMonths: Infinity,
    recommendedMonths: 2, volatility: 'stable', status: 'warning', headline: 'Not enough expense history yet', assessment: '',
};

const AVAILABLE_RESILIENCE: FinancialResilience = {
    available: true, essentialMonthlyExpenses: 500000, currentReserve: 850000, reserveCoverageMonths: 1.7,
    recommendedMonths: 3.5, volatility: 'variable', status: 'warning', headline: 'Below recommended resilience level',
    assessment: 'Your business currently has approximately 1.7 months of essential operating expenses available in cash.',
};

const UNAVAILABLE_GROWTH_QUALITY: QualityOfGrowthResult = {
    available: false, reason: 'not enough history', periodLabel: '', score: 0, band: 'Critical', signals: [], flags: [], verdict: '',
};

const finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'> = { income: 0, profit: 0, cashBalance: 500000 };

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: daysAgo(10),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 100000,
    status: 'paid',
    ...overrides,
});

const EMPTY_EXPOSURE: BusinessExposure = { factors: [], highCount: 0, mediumCount: 0, overallLevel: 'unknown' };

describe('computeFinancialHealthPillars', () => {
    it('always returns exactly 8 pillars', () => {
        const risk = computeRiskScore(finance, [], [], []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, [], resilience);
        expect(result.pillars).toHaveLength(8);
        expect(result.pillars.map(p => p.key).sort()).toEqual(
            ['cash', 'debt', 'expense', 'profitability', 'readiness', 'resilience', 'revenue', 'workingCapital'].sort()
        );
    });

    it('never disagrees with computeRiskScore\'s own headline score and band', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 200000, date: daysAgo(20) }),
        ];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        expect(result.score).toBe(risk.score);
        expect(result.band).toBe(risk.band);
    });

    it('blends Liquidity and Operating Cash Flow into Cash Health using their own weights', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const risk = computeRiskScore(finance, [], transactions, []);
        const liquidity = risk.factors.find(f => f.name === 'Liquidity')!;
        const ocf = risk.factors.find(f => f.name === 'Operating Cash Flow')!;
        const expectedScore = Math.round((liquidity.score * liquidity.weight + ocf.score * ocf.weight) / (liquidity.weight + ocf.weight));
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        const cash = result.pillars.find(p => p.key === 'cash')!;
        expect(cash.score).toBe(expectedScore);
    });

    it('blends Working Capital and Inventory factors into the Working Capital pillar', () => {
        const inventory: InventoryItem[] = [
            { id: 'i1', name: 'Widget', category: 'General', quantity: 100, unit: 'pcs', costPrice: 1000, sellingPrice: 1500, lowStockThreshold: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        ];
        const transactions = [makeTx({ type: 'income', amount: 500000, date: daysAgo(20) })];
        const risk = computeRiskScore(finance, [], transactions, inventory);
        const wc = risk.factors.find(f => f.name === 'Working Capital')!;
        const inv = risk.factors.find(f => f.name === 'Inventory')!;
        const expectedScore = Math.round((wc.score * wc.weight + inv.score * inv.weight) / (wc.weight + inv.weight));
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        const workingCapital = result.pillars.find(p => p.key === 'workingCapital')!;
        expect(workingCapital.score).toBe(expectedScore);
    });

    it('scores Profitability and Debt pillars identically to their source RiskScore factors', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        const profitability = risk.factors.find(f => f.name === 'Profitability')!;
        const debtFactor = risk.factors.find(f => f.name === 'Debt')!;
        expect(result.pillars.find(p => p.key === 'profitability')!.score).toBe(profitability.score);
        expect(result.pillars.find(p => p.key === 'debt')!.score).toBe(debtFactor.score);
    });

    it('scores Revenue Health from customer-only concentration, not the worse-of customer/supplier factor', () => {
        // One dominant customer (60% of revenue) but NO expense/supplier
        // history at all -- the existing Concentration factor would read
        // this the same as a dominant supplier; Revenue Health must
        // isolate the customer side specifically.
        const transactions = [
            makeTx({ type: 'income', amount: 600000, vendorCustomer: 'BigCo', date: daysAgo(20) }),
            makeTx({ type: 'income', amount: 400000, vendorCustomer: 'SmallCo', date: daysAgo(15) }),
        ];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        const revenue = result.pillars.find(p => p.key === 'revenue')!;
        expect(revenue.status).toBe('danger'); // 60% > 40% threshold
        expect(revenue.explanation).toMatch(/60% of revenue/);
    });

    it('reuses computeBusinessResilience\'s score/band verbatim for the Resilience pillar', () => {
        const transactions = [makeTx({ type: 'income', amount: 500000, date: daysAgo(20) })];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        expect(result.pillars.find(p => p.key === 'resilience')!.score).toBe(resilience.score);
    });

    it('reuses the reweighted Financing Readiness score for the Financial Readiness pillar', () => {
        const { computeFinancingReadinessScore } = require('../src/utils/finance');
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const result = computeFinancialHealthPillars(risk, transactions, resilience);
        const expected = computeFinancingReadinessScore(risk.factors);
        expect(result.pillars.find(p => p.key === 'readiness')!.score).toBe(expected.score);
    });

    it('enriches the Expense Health explanation with leak/unusual-spending counts when supplied, without changing its score', () => {
        const transactions = [makeTx({ type: 'income', amount: 500000, date: daysAgo(20) })];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const plain = computeFinancialHealthPillars(risk, transactions, resilience);
        const enriched = computeFinancialHealthPillars(risk, transactions, resilience, { expenseLeakCount: 3, unusualSpendingCount: 1 });
        const plainExpense = plain.pillars.find(p => p.key === 'expense')!;
        const enrichedExpense = enriched.pillars.find(p => p.key === 'expense')!;
        expect(enrichedExpense.score).toBe(plainExpense.score);
        expect(enrichedExpense.explanation).toMatch(/3 recurring vendor charges/);
        expect(enrichedExpense.explanation).toMatch(/1 category shows unusual spending/);
    });
});

describe('diagnoseFinancialHealth', () => {
    it('picks the highest- and lowest-scoring pillar as strongest/weakest', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const pillars = computeFinancialHealthPillars(risk, transactions, resilience);
        const diagnosis = diagnoseFinancialHealth(pillars, UNAVAILABLE_RESILIENCE);

        const sorted = [...pillars.pillars].sort((a, b) => b.score - a.score);
        expect(diagnosis.strongestPillar.key).toBe(sorted[0].key);
        expect(diagnosis.weakestPillar.key).toBe(sorted[sorted.length - 1].key);
    });

    it('adds a reserve-coverage note only when the resilience read is available', () => {
        const transactions = [makeTx({ type: 'income', amount: 500000, date: daysAgo(20) })];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const pillars = computeFinancialHealthPillars(risk, transactions, resilience);

        const withReserve = diagnoseFinancialHealth(pillars, AVAILABLE_RESILIENCE);
        expect(withReserve.notes.some(n => n.includes('1.7') && n.includes('essential expenses'))).toBe(true);

        const withoutReserve = diagnoseFinancialHealth(pillars, UNAVAILABLE_RESILIENCE);
        expect(withoutReserve.notes.some(n => n.includes('essential expenses'))).toBe(false);
    });

    it('reuses computeQualityOfGrowth\'s own receivables and cash-conversion flags verbatim, only when available', () => {
        const transactions = [makeTx({ type: 'income', amount: 500000, date: daysAgo(20) })];
        const risk = computeRiskScore(finance, [], transactions, []);
        const resilience = computeBusinessResilience(EMPTY_EXPOSURE);
        const pillars = computeFinancialHealthPillars(risk, transactions, resilience);

        const growthQuality: QualityOfGrowthResult = {
            available: true, periodLabel: '2026 vs 2025', score: 45, band: 'Weak',
            signals: [],
            flags: [
                'Receivables grew 40% — 2.0x faster than revenue\'s 20% — more sales are sitting uncollected.',
                'Operating cash flow fell 12% even as revenue grew 20% — growth is draining cash reserves.',
            ],
            verdict: 'Revenue grew 20%, but the business is paying for that growth in margin, cash or debt — this is fragile growth, not healthy growth.',
        };
        const diagnosis = diagnoseFinancialHealth(pillars, UNAVAILABLE_RESILIENCE, growthQuality);
        expect(diagnosis.notes).toContain(growthQuality.flags[0]);
        expect(diagnosis.notes).toContain(growthQuality.flags[1]);

        const withoutGrowthQuality = diagnoseFinancialHealth(pillars, UNAVAILABLE_RESILIENCE, UNAVAILABLE_GROWTH_QUALITY);
        expect(withoutGrowthQuality.notes.some(n => n.includes('Receivables grew'))).toBe(false);

        const withNoGrowthQualityArg = diagnoseFinancialHealth(pillars, UNAVAILABLE_RESILIENCE);
        expect(withNoGrowthQualityArg.notes).toEqual([]);
    });
});
