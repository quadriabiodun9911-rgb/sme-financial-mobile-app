import { computeDynamicFinancingReadiness } from '../src/utils/dynamicFinancingReadiness';
import { computeRiskScore, computeFinancingReadinessScore } from '../src/utils/finance';
import { computeQualityOfGrowth } from '../src/utils/qualityOfGrowth';
import { computeForwardFinancingReadiness, ForwardFinancingReadiness } from '../src/utils/forwardFinancingReadiness';
import { RootCauseAnalysis } from '../src/utils/financialDiagnosisEngine';
import { Transaction, Asset, Loan, FinanceData } from '../src/types';

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

const NO_ASSETS: Asset[] = [];
const NO_FORWARD: ForwardFinancingReadiness = {
    available: false,
    reason: 'no forecast',
    baseCaseRevenue: 0,
    monthsInPeriod: 0,
    totalAnnualDebtService: 0,
    base: { label: '', operatingCashFlow: 0, annualizedOperatingCashFlow: 0, dscr: 0, dscrStatus: 'danger' },
    downside: { label: '', operatingCashFlow: 0, annualizedOperatingCashFlow: 0, dscr: 0, dscrStatus: 'danger' },
    downsideRevenueDropPct: 20,
    downsideStaysPositive: false,
};

const now = new Date();
const recent = new Date(now.getFullYear(), now.getMonth() - 3, 15);
const CURRENT_YEAR = recent.getFullYear();
const PRIOR_YEAR = CURRENT_YEAR - 1;
const pad = (n: number) => String(n).padStart(2, '0');
const CURRENT_DATE = `${CURRENT_YEAR}-${pad(recent.getMonth() + 1)}-15`;
const PRIOR_DATE = `${PRIOR_YEAR}-06-15`;

describe('computeDynamicFinancingReadiness', () => {
    it('reports direction "not-yet-established" with no fabricated evidence when there is no year-over-year baseline', () => {
        const finance: FinanceData = { income: 0, expense: 0, profit: 0, cashBalance: 0 } as FinanceData;
        const risk = computeRiskScore(finance, [], [], []);
        const financingReadiness = computeFinancingReadinessScore(risk.factors);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);

        const result = computeDynamicFinancingReadiness(financingReadiness, growthQuality, NO_FORWARD, null);
        expect(result.direction).toBe('not-yet-established');
        expect(result.evidenceOfImprovement).toEqual([]);
        expect(result.nextMilestone).toBeNull();
        expect(result.score).toBe(financingReadiness.score);
        expect(result.band).toBe(financingReadiness.band);
    });

    it('reports "improving" and names real evidence for a business genuinely strengthening across the board', () => {
        const txs = [
            makeTx({ id: 'prior-inc', date: PRIOR_DATE, type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: 'prior-exp', date: PRIOR_DATE, type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: 'current-inc', date: CURRENT_DATE, type: 'income', amount: 130000, status: 'paid' }),
            makeTx({ id: 'current-exp', date: CURRENT_DATE, type: 'expense', amount: 88000, status: 'paid' }),
        ];
        const finance: FinanceData = { income: 130000, expense: 88000, profit: 42000, cashBalance: 200000 } as FinanceData;
        const risk = computeRiskScore(finance, [], txs, []);
        const financingReadiness = computeFinancingReadinessScore(risk.factors);
        const growthQuality = computeQualityOfGrowth(txs, NO_ASSETS, []);

        const result = computeDynamicFinancingReadiness(financingReadiness, growthQuality, NO_FORWARD, null);
        expect(result.direction).toBe('improving');
        expect(result.directionSummary).toMatch(/Profitability/);
        expect(result.evidenceOfImprovement.length).toBeGreaterThan(0);
        expect(result.strengths.length).toBeGreaterThan(0);
    });

    it('reports "mixed" and names both sides when one row improves while another deteriorates', () => {
        const txs = [
            makeTx({ id: 'prior-inc', date: PRIOR_DATE, type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: 'prior-exp', date: PRIOR_DATE, type: 'expense', amount: 60000, status: 'paid' }),
            makeTx({ id: 'current-inc', date: CURRENT_DATE, type: 'income', amount: 110000, status: 'paid' }),
            makeTx({ id: 'current-exp', date: CURRENT_DATE, type: 'expense', amount: 65000, status: 'paid' }),
        ];
        const loans: Loan[] = [
            { id: 'old', lenderName: 'Bank', purpose: 'wc', principal: 5000, interestRate: 5, termMonths: 24, startDate: `${PRIOR_YEAR}-01-01`, status: 'active', payments: [], createdAt: `${PRIOR_YEAR}-01-01` },
            { id: 'new', lenderName: 'Bank', purpose: 'wc', principal: 30000, interestRate: 5, termMonths: 60, startDate: `${CURRENT_YEAR}-02-01`, status: 'active', payments: [], createdAt: `${CURRENT_YEAR}-02-01` },
        ];
        const finance: FinanceData = { income: 110000, expense: 65000, profit: 45000, cashBalance: 150000 } as FinanceData;
        const risk = computeRiskScore(finance, loans, txs, []);
        const financingReadiness = computeFinancingReadinessScore(risk.factors);
        const growthQuality = computeQualityOfGrowth(txs, NO_ASSETS, loans);

        const result = computeDynamicFinancingReadiness(financingReadiness, growthQuality, NO_FORWARD, null);
        expect(result.direction).toBe('mixed');
        expect(result.directionSummary).toMatch(/Debt/);
        expect(result.unresolvedIssues.some(u => /leverage is increasing/i.test(u))).toBe(true);
    });

    it('adds forward-looking downside evidence only when the forecast genuinely stays positive under stress', () => {
        const finance: FinanceData = { income: 0, expense: 0, profit: 0, cashBalance: 0 } as FinanceData;
        const risk = computeRiskScore(finance, [], [], []);
        const financingReadiness = computeFinancingReadinessScore(risk.factors);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);

        const positiveForward: ForwardFinancingReadiness = { ...NO_FORWARD, available: true, downsideStaysPositive: true, downsideRevenueDropPct: 20 };
        const result = computeDynamicFinancingReadiness(financingReadiness, growthQuality, positiveForward, null);
        expect(result.evidenceOfImprovement.some(e => /20% revenue downside/i.test(e))).toBe(true);

        const negativeForward: ForwardFinancingReadiness = { ...NO_FORWARD, available: true, downsideStaysPositive: false };
        const result2 = computeDynamicFinancingReadiness(financingReadiness, growthQuality, negativeForward, null);
        expect(result2.evidenceOfImprovement.some(e => /revenue downside/i.test(e))).toBe(false);
    });

    it('pulls nextMilestone from the worst diagnosis\'s own trigger, falling back to its opportunity when no trigger exists', () => {
        const finance: FinanceData = { income: 0, expense: 0, profit: 0, cashBalance: 0 } as FinanceData;
        const risk = computeRiskScore(finance, [], [], []);
        const financingReadiness = computeFinancingReadinessScore(risk.factors);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);

        const withTrigger: RootCauseAnalysis = {
            problem: 'Low profit margin', severity: 'critical', rootCause: 'x', impact: 'y',
            financialImpact: 1000, opportunity: 'Cut costs', dimension: 'profitability',
            trigger: 'Resolves once margin recovers above the 20% target.',
        };
        const result = computeDynamicFinancingReadiness(financingReadiness, growthQuality, NO_FORWARD, withTrigger);
        expect(result.nextMilestone).toMatch(/recovers above the 20% target/);

        const withoutTrigger: RootCauseAnalysis = { ...withTrigger, trigger: undefined };
        const result2 = computeDynamicFinancingReadiness(financingReadiness, growthQuality, NO_FORWARD, withoutTrigger);
        expect(result2.nextMilestone).toBe('Cut costs');
    });
});
