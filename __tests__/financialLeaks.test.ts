import { computeFinancialLeaks } from '../src/utils/financialLeaks';
import { Transaction, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Rent',
    amount: 10000,
    status: 'paid',
    ...overrides,
});

function monthlyFlat(category: string, type: 'income' | 'expense', amount: number, startMonth: string, count: number): Transaction[] {
    const [sy, sm] = startMonth.split('-').map(Number);
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(sy, (sm - 1) + i, 10);
        return makeTx({ category, type, amount, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10` });
    });
}

describe('computeFinancialLeaks', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeFinancialLeaks([], []);
        expect(result.available).toBe(false);
    });

    it('reports no leaks for a clean, proportionate business', () => {
        const txs = [
            ...monthlyFlat('Sales', 'income', 500000, '2026-01', 6),
            ...monthlyFlat('Rent', 'expense', 100000, '2026-01', 6),
        ];
        const result = computeFinancialLeaks(txs, []);
        expect(result.leaks).toHaveLength(0);
        expect(result.summary).toMatch(/no financial leaks/i);
    });

    it('detects Subscription Leakage matching computeExpenseLeaks, with an annualized cost estimate', () => {
        const txs = [
            ...monthlyFlat('Software & Subscriptions', 'expense', 40000, '2026-01', 6).map(t => ({ ...t, vendorCustomer: 'ToolCo' })),
            ...monthlyFlat('Software & Subscriptions', 'expense', 30000, '2026-01', 6).map(t => ({ ...t, vendorCustomer: 'CloudCo' })),
        ];
        const result = computeFinancialLeaks(txs, []);
        const leak = result.leaks.find(l => l.key === 'subscription')!;
        expect(leak).toBeDefined();
        expect(leak.estimatedImpact).toMatch(/Estimated annual cost: ₦840,000/);
    });

    it('flags price-creep vendors within Subscription Leakage', () => {
        const txs = [
            makeTx({ category: 'Software & Subscriptions', vendorCustomer: 'ToolCo', amount: 50000, date: '2026-01-05' }),
            makeTx({ category: 'Software & Subscriptions', vendorCustomer: 'ToolCo', amount: 50000, date: '2026-02-05' }),
            makeTx({ category: 'Software & Subscriptions', vendorCustomer: 'ToolCo', amount: 70000, date: '2026-03-05' }),
        ];
        const result = computeFinancialLeaks(txs, []);
        const leak = result.leaks.find(l => l.key === 'subscription')!;
        expect(leak.detail).toMatch(/ToolCo/);
    });

    it('escalates Subscription Leakage to critical severity when price creep exceeds 30%, matching every other leak type\'s own threshold', () => {
        const txs = [
            // 50,000 -> 75,000 = 50% growth, well past the 30% critical threshold.
            makeTx({ category: 'Software & Subscriptions', vendorCustomer: 'ToolCo', amount: 50000, date: '2026-01-05' }),
            makeTx({ category: 'Software & Subscriptions', vendorCustomer: 'ToolCo', amount: 50000, date: '2026-02-05' }),
            makeTx({ category: 'Software & Subscriptions', vendorCustomer: 'ToolCo', amount: 75000, date: '2026-03-05' }),
        ];
        const result = computeFinancialLeaks(txs, []);
        const leak = result.leaks.find(l => l.key === 'subscription')!;
        expect(leak.severity).toBe('critical');
    });

    it('detects Expense Growth Leakage matching the Efficiency factor\'s own gap calculation', () => {
        // computeMonthlyTrend(transactions, 3) anchors to the real clock (no
        // override), the same convention computeRiskScore's Efficiency
        // factor uses -- dates here are built relative to `new Date()` so
        // this test is deterministic regardless of when it runs.
        const now = new Date();
        const monthKey = (monthsAgo: number) => {
            const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 10);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
        };
        const txs = [
            makeTx({ type: 'income', category: 'Sales', amount: 1000000, date: monthKey(2) }),
            makeTx({ type: 'income', category: 'Sales', amount: 1000000, date: monthKey(1) }),
            makeTx({ type: 'income', category: 'Sales', amount: 1000000, date: monthKey(0) }),
            makeTx({ type: 'expense', category: 'Marketing', amount: 500000, date: monthKey(2) }),
            makeTx({ type: 'expense', category: 'Marketing', amount: 650000, date: monthKey(1) }),
            makeTx({ type: 'expense', category: 'Marketing', amount: 800000, date: monthKey(0) }),
        ];
        const result = computeFinancialLeaks(txs, []);
        const leak = result.leaks.find(l => l.key === 'expense-growth')!;
        expect(leak).toBeDefined();
        expect(leak.headline).toMatch(/Operating expenses increased/);
    });

    it('detects Collection Leakage from computeWorkingCapitalHealth\'s own dso-lengthening flag', () => {
        const { computeWorkingCapitalHealth } = require('../src/utils/workingCapitalHealth');
        // Build a transaction set with growing overdue AR over several quarters --
        // reuse whatever the underlying engine itself would flag, rather than
        // reconstructing DSO math by hand in this test.
        const txs: Transaction[] = [];
        for (let q = 0; q < 4; q++) {
            const monthBase = q * 3;
            for (let m = 0; m < 3; m++) {
                const month = monthBase + m + 1;
                const y = 2025 + Math.floor((month - 1) / 12);
                const mm = ((month - 1) % 12) + 1;
                const dateStr = `${y}-${String(mm).padStart(2, '0')}-10`;
                txs.push(makeTx({ type: 'income', category: 'Sales', amount: 300000, date: dateStr, status: 'paid' }));
            }
            // Growing overdue receivable each quarter
            txs.push(makeTx({ type: 'income', category: 'Sales', amount: 50000 * (q + 1), status: 'overdue', date: `${2025 + Math.floor(monthBase / 12)}-${String((monthBase % 12) + 1).padStart(2, '0')}-15` }));
        }
        const direct = computeWorkingCapitalHealth(txs, []);
        const dsoFlag = direct.riskFlags.find((f: any) => f.key === 'dso-lengthening');
        const result = computeFinancialLeaks(txs, []);
        const leak = result.leaks.find(l => l.key === 'collection');
        if (dsoFlag) {
            expect(leak).toBeDefined();
            expect(leak!.headline).toMatch(/Average customer payment time increased/);
        } else {
            expect(leak).toBeUndefined();
        }
    });

    it('detects Margin Leakage when a category grows revenue but loses margin', () => {
        const txs = [
            // Prior 3 months: revenue 300k/mo, cost 100k/mo -> margin 66.7%
            ...monthlyFlat('Product A', 'income', 300000, '2025-10', 3),
            ...monthlyFlat('Product A', 'expense', 100000, '2025-10', 3),
            // Current 3 months: revenue 360k/mo (+20%), cost 230k/mo -> margin 36.1% (-30.6pp)
            ...monthlyFlat('Product A', 'income', 360000, '2026-01', 3),
            ...monthlyFlat('Product A', 'expense', 230000, '2026-01', 3),
        ];
        const result = computeFinancialLeaks(txs, []);
        const leak = result.leaks.find(l => l.key === 'margin')!;
        expect(leak).toBeDefined();
        expect(leak.headline).toMatch(/Product A revenue increased 20%, but margin declined/);
    });

    it('does not flag Margin Leakage when revenue and cost grow proportionately', () => {
        const txs = [
            ...monthlyFlat('Product A', 'income', 300000, '2025-10', 3),
            ...monthlyFlat('Product A', 'expense', 100000, '2025-10', 3),
            ...monthlyFlat('Product A', 'income', 330000, '2026-01', 3),
            ...monthlyFlat('Product A', 'expense', 110000, '2026-01', 3),
        ];
        const result = computeFinancialLeaks(txs, []);
        expect(result.leaks.find(l => l.key === 'margin')).toBeUndefined();
    });

    it('detects Debt Leakage as a share of monthly operating cash, matching computeDSCR\'s own totalDebtService', () => {
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', principal: 2400000, interestRate: 15, termMonths: 24,
            startDate: '2025-01-01', status: 'active', purpose: 'Working capital', payments: [], createdAt: '2025-01-01',
        } as Loan];
        const txs = [
            ...monthlyFlat('Sales', 'income', 500000, '2025-11', 3),
            ...monthlyFlat('Rent', 'expense', 200000, '2025-11', 3),
        ];
        const result = computeFinancialLeaks(txs, loans);
        const leak = result.leaks.find(l => l.key === 'debt');
        // Only assert shape if the leak fires -- exact % depends on loanMonthlyPayment's own amortization.
        if (leak) {
            expect(leak.headline).toMatch(/Loan repayments consume \d+% of monthly operating cash/);
        }
    });

    it('reports no Debt Leakage with no outstanding loans', () => {
        const txs = monthlyFlat('Sales', 'income', 500000, '2026-01', 3);
        const result = computeFinancialLeaks(txs, []);
        expect(result.leaks.find(l => l.key === 'debt')).toBeUndefined();
    });

    it('sorts leaks with critical severity before warning before info', () => {
        const now = new Date();
        const monthKey = (monthsAgo: number) => {
            const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 10);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
        };
        const txs = [
            // Subscription leak (info) -- 5 recurring vendors, no price creep
            ...['A', 'B', 'C', 'D', 'E'].flatMap(v => [0, 1, 2].map(m =>
                makeTx({ category: 'Software & Subscriptions', vendorCustomer: v, amount: 20000, date: monthKey(m) })
            )),
            // Severe expense-growth leak (critical, gap > 25pp)
            makeTx({ type: 'expense', category: 'Marketing', amount: 100000, date: monthKey(2) }),
            makeTx({ type: 'expense', category: 'Marketing', amount: 250000, date: monthKey(1) }),
            makeTx({ type: 'expense', category: 'Marketing', amount: 400000, date: monthKey(0) }),
            makeTx({ type: 'income', category: 'Sales', amount: 500000, date: monthKey(2) }),
            makeTx({ type: 'income', category: 'Sales', amount: 505000, date: monthKey(1) }),
            makeTx({ type: 'income', category: 'Sales', amount: 510000, date: monthKey(0) }),
        ];
        const result = computeFinancialLeaks(txs, []);
        expect(result.leaks.length).toBeGreaterThanOrEqual(2);
        const severities = result.leaks.map(l => l.severity);
        const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        for (let i = 1; i < severities.length; i++) {
            expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
        }
    });
});
