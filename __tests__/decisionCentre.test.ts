import { computeDecisionCentre } from '../src/utils/decisionCentre';
import { performFinancialDiagnosis } from '../src/utils/financialDiagnosisEngine';
import { computeRiskScore } from '../src/utils/finance';
import { computeQualityOfGrowth } from '../src/utils/qualityOfGrowth';
import { computeDirectionVsStatus } from '../src/utils/directionVsStatus';
import { Transaction, Asset } from '../src/types';

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

const now = new Date();
const recent = new Date(now.getFullYear(), now.getMonth() - 3, 15);
const CURRENT_YEAR = recent.getFullYear();
const PRIOR_YEAR = CURRENT_YEAR - 1;
const pad = (n: number) => String(n).padStart(2, '0');
const CURRENT_DATE = `${CURRENT_YEAR}-${pad(recent.getMonth() + 1)}-15`;
const PRIOR_DATE = `${PRIOR_YEAR}-06-15`;

describe('computeDecisionCentre', () => {
    it('sorts a critical DSCR problem into Act Now and a mild one into Watch, both carrying their real trigger/action', () => {
        const txs = [
            makeTx({ id: 'inc', date: CURRENT_DATE, type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: 'exp', date: CURRENT_DATE, type: 'expense', amount: 90000, status: 'paid' }),
        ];
        const diagnosis = performFinancialDiagnosis(txs, [], 5000, 90000, '₦', [
            { id: 'l1', lenderName: 'Bank', purpose: 'wc', principal: 200000, interestRate: 20, termMonths: 12, startDate: CURRENT_DATE, status: 'active', payments: [], createdAt: CURRENT_DATE },
        ]);
        const risk = computeRiskScore({ income: 100000, profit: 10000, cashBalance: 5000 }, [], txs, []);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);
        const dvs = computeDirectionVsStatus(risk, growthQuality);

        const result = computeDecisionCentre(diagnosis, dvs);
        const critical = diagnosis.diagnoses.find(d => d.severity === 'critical');
        expect(critical).toBeDefined();
        expect(result.actNow.some(i => i.title === critical!.problem)).toBe(true);
        expect(result.actNow.every(i => i.bucket === 'act-now')).toBe(true);
        expect(result.watch.every(i => i.bucket === 'watch')).toBe(true);
        // Every Act Now/Watch item carries the recommended action verbatim from the diagnosis.
        for (const item of [...result.actNow, ...result.watch]) {
            expect(item.recommendedAction).toBeTruthy();
        }
    });

    it('never puts the same diagnosis in two buckets', () => {
        const txs = [
            makeTx({ id: 'inc', date: CURRENT_DATE, type: 'income', amount: 50000, status: 'paid' }),
            makeTx({ id: 'exp', date: CURRENT_DATE, type: 'expense', amount: 60000, status: 'paid' }),
        ];
        const diagnosis = performFinancialDiagnosis(txs, [], 1000, 60000, '₦', []);
        const risk = computeRiskScore({ income: 50000, profit: -10000, cashBalance: 1000 }, [], txs, []);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);
        const dvs = computeDirectionVsStatus(risk, growthQuality);

        const result = computeDecisionCentre(diagnosis, dvs);
        const actNowTitles = new Set(result.actNow.map(i => i.title));
        const watchTitles = result.watch.map(i => i.title);
        expect(watchTitles.every(t => !actNowTitles.has(t))).toBe(true);
        expect(result.actNow.length + result.watch.length).toBe(diagnosis.diagnoses.length);
    });

    it('populates Improving only from rows genuinely trending "improving", with real evidence, not a fabricated one', () => {
        const txs = [
            makeTx({ id: 'prior-inc', date: PRIOR_DATE, type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: 'prior-exp', date: PRIOR_DATE, type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: 'current-inc', date: CURRENT_DATE, type: 'income', amount: 130000, status: 'paid' }),
            makeTx({ id: 'current-exp', date: CURRENT_DATE, type: 'expense', amount: 88000, status: 'paid' }),
        ];
        const diagnosis = performFinancialDiagnosis(txs, [], 200000, 88000, '₦', []);
        const risk = computeRiskScore({ income: 130000, profit: 42000, cashBalance: 200000 }, [], txs, []);
        const growthQuality = computeQualityOfGrowth(txs, NO_ASSETS, []);
        const dvs = computeDirectionVsStatus(risk, growthQuality);

        const result = computeDecisionCentre(diagnosis, dvs);
        expect(result.directionAvailable).toBe(true);
        expect(result.improving.length).toBeGreaterThan(0);
        expect(result.improving.every(i => i.bucket === 'improving')).toBe(true);
        expect(result.improving.every(i => i.evidence.length > 0)).toBe(true);
        // Profitability genuinely improved in this fixture (margin grew).
        expect(result.improving.some(i => i.title === 'Profitability')).toBe(true);
    });

    it('reports directionAvailable=false with an honest reason, and an empty Improving bucket, when there is no year-over-year baseline', () => {
        const diagnosis = performFinancialDiagnosis([], [], 0, 0, '₦', []);
        const risk = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);
        const dvs = computeDirectionVsStatus(risk, growthQuality);

        const result = computeDecisionCentre(diagnosis, dvs);
        expect(result.directionAvailable).toBe(false);
        expect(result.directionUnavailableReason).toBeTruthy();
        expect(result.improving).toEqual([]);
    });
});
