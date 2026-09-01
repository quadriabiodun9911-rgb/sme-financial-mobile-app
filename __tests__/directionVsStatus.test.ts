import { computeDirectionVsStatus } from '../src/utils/directionVsStatus';
import { computeRiskScore } from '../src/utils/finance';
import { computeQualityOfGrowth } from '../src/utils/qualityOfGrowth';
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

// computeDSCR (finance.ts) windows to the trailing 12 months from the REAL
// system clock, while computeQualityOfGrowth needs two full CALENDAR
// years -- a fixture hardcoded to specific years breaks the moment the
// suite runs in a different year, or (worse) the DSCR window silently
// excludes "current year" transactions dated too early in the year
// relative to today (the same real-clock class of flake fixed earlier in
// __tests__/alertEngine.test.ts). Anchoring off `now` keeps both
// requirements true regardless of when the suite actually runs.
const now = new Date();
const recent = new Date(now.getFullYear(), now.getMonth() - 3, 15); // safely within DSCR's trailing-12mo window
const CURRENT_YEAR = recent.getFullYear();
const PRIOR_YEAR = CURRENT_YEAR - 1;
const pad = (n: number) => String(n).padStart(2, '0');
const CURRENT_DATE = `${CURRENT_YEAR}-${pad(recent.getMonth() + 1)}-15`;
const PRIOR_DATE = `${PRIOR_YEAR}-06-15`;

describe('computeDirectionVsStatus', () => {
    it('always returns all four rows with a status, even with zero history', () => {
        const finance: FinanceData = { income: 0, expense: 0, profit: 0, cashBalance: 0 } as FinanceData;
        const risk = computeRiskScore(finance, [], [], []);
        const growthQuality = computeQualityOfGrowth([], NO_ASSETS, []);

        const result = computeDirectionVsStatus(risk, growthQuality);
        expect(result.rows.map(r => r.key)).toEqual(['profitability', 'liquidity', 'debt', 'receivables']);
        for (const row of result.rows) {
            expect(row.statusLevel).toBeDefined();
            expect(row.statusExplanation.length).toBeGreaterThan(0);
        }
        // No year-over-year baseline at all -- direction must be null, not guessed.
        expect(result.directionAvailable).toBe(false);
        expect(result.directionUnavailableReason).toMatch(/no transaction history/i);
        for (const row of result.rows) {
            expect(row.direction).toBeNull();
            expect(row.directionEvidence).toBeNull();
        }
    });

    it('pairs a healthy status with an improving direction for a genuinely strong business', () => {
        const txs = [
            makeTx({ id: 'prior-inc', date: PRIOR_DATE, type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: 'prior-exp', date: PRIOR_DATE, type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: 'current-inc', date: CURRENT_DATE, type: 'income', amount: 130000, status: 'paid' }),
            makeTx({ id: 'current-exp', date: CURRENT_DATE, type: 'expense', amount: 88000, status: 'paid' }),
        ];
        const finance: FinanceData = { income: 130000, expense: 88000, profit: 42000, cashBalance: 200000 } as FinanceData;
        const risk = computeRiskScore(finance, [], txs, []);
        const growthQuality = computeQualityOfGrowth(txs, NO_ASSETS, []);

        const result = computeDirectionVsStatus(risk, growthQuality);
        expect(result.directionAvailable).toBe(true);
        expect(result.periodLabel).toBe(`${CURRENT_YEAR} vs ${PRIOR_YEAR}`);

        const profitability = result.rows.find(r => r.key === 'profitability')!;
        expect(profitability.statusLevel).toBe('good');
        expect(profitability.direction).toBe('improving');
        expect(profitability.directionEvidence).toMatch(/\+40% year over year/);
    });

    it('pairs a currently-healthy debt status with a deteriorating direction when leverage is growing ahead of revenue', () => {
        // Debt service is comfortably covered TODAY (status: good), but the
        // balance itself is growing much faster than revenue -- exactly the
        // "stable now, worsening underneath" case this feature exists to
        // surface, so status and direction must be allowed to disagree.
        const txs = [
            makeTx({ id: 'prior-inc', date: PRIOR_DATE, type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: 'prior-exp', date: PRIOR_DATE, type: 'expense', amount: 60000, status: 'paid' }),
            makeTx({ id: 'current-inc', date: CURRENT_DATE, type: 'income', amount: 110000, status: 'paid' }),
            makeTx({ id: 'current-exp', date: CURRENT_DATE, type: 'expense', amount: 65000, status: 'paid' }),
        ];
        // Small loan already outstanding in the prior year, dwarfed by a
        // much larger one taken out this year -- debt outstanding grows far
        // faster than revenue's 10%, while this year's scheduled payments on
        // both stay small next to a 45k NOI, so DSCR itself stays healthy.
        const loans: Loan[] = [
            makeLoan({ id: 'old', principal: 5000, interestRate: 5, termMonths: 24, startDate: `${PRIOR_YEAR}-01-01`, payments: [] }),
            makeLoan({ id: 'new', principal: 30000, interestRate: 5, termMonths: 60, startDate: `${CURRENT_YEAR}-02-01`, payments: [] }),
        ];
        const finance: FinanceData = { income: 110000, expense: 65000, profit: 45000, cashBalance: 150000 } as FinanceData;
        const risk = computeRiskScore(finance, loans, txs, []);
        const growthQuality = computeQualityOfGrowth(txs, NO_ASSETS, loans);

        const result = computeDirectionVsStatus(risk, growthQuality);
        const debt = result.rows.find(r => r.key === 'debt')!;
        expect(debt.statusLevel).not.toBe('danger'); // comfortably covered today
        expect(debt.direction).toBe('deteriorating');
        expect(debt.directionFlag).toMatch(/leverage is increasing/i);
    });
});
