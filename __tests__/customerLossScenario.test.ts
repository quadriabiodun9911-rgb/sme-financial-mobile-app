import { computeCustomerLossScenario } from '../src/utils/customerLossScenario';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

// Three months of revenue (BigCo at a fixed share each month, the
// remainder split across TWO other customers so neither individually
// competes with BigCo for "largest") plus a matching flat monthly
// expense -- the same "trailing 3 months" shape revenueStressTest.ts's
// own baseline expects.
function threeMonthsOfRevenue(bigCoAmount: number, othersTotal: number, otherExpense: number): Transaction[] {
    const months = ['2026-01', '2026-02', '2026-03'];
    const txs: Transaction[] = [];
    for (const m of months) {
        txs.push(makeTx({ vendorCustomer: 'BigCo', amount: bigCoAmount, date: `${m}-10`, type: 'income' }));
        txs.push(makeTx({ vendorCustomer: 'SmallCoA', amount: othersTotal / 2, date: `${m}-15`, type: 'income' }));
        txs.push(makeTx({ vendorCustomer: 'SmallCoB', amount: othersTotal / 2, date: `${m}-16`, type: 'income' }));
        txs.push(makeTx({ category: 'Rent', amount: otherExpense, date: `${m}-20`, type: 'expense' }));
    }
    return txs;
}

describe('computeCustomerLossScenario', () => {
    it('is unavailable with no revenue history', () => {
        const result = computeCustomerLossScenario([], 100000);
        expect(result.available).toBe(false);
    });

    it('models losing a concentrated top customer against the real cash balance', () => {
        // BigCo = 410,000 of 1,000,000 total/month = 41% -- same
        // product-vision concentration example the alert's own test uses.
        const txs = threeMonthsOfRevenue(410000, 590000, 300000);
        const cashBalance = 500000;
        const result = computeCustomerLossScenario(txs, cashBalance, '₦', 6);

        expect(result.available).toBe(true);
        expect(result.customerName).toBe('BigCo');
        expect(result.customerSharePct).toBeCloseTo(41, 0);
        expect(result.scenario).not.toBeNull();
        // Revenue after losing BigCo: 1,000,000 * (1 - 0.41) = 590,000;
        // expense stays flat at 300,000 -- still comfortably cash-generative.
        expect(result.scenario!.monthlyRevenue).toBeCloseTo(590000, -2);
        expect(result.scenario!.risk).toBe('safe');
        expect(result.narrative).toMatch(/BigCo/);
        expect(result.narrative).toMatch(/41%/);
    });

    it('shows a tight or critical runway when the top customer is the majority of revenue and expenses stay flat', () => {
        // BigCo = 800,000 of 1,000,000/month = 80%; expenses of 600,000/mo
        // mean losing BigCo flips the business from profitable to burning
        // hard against a thin cash balance.
        const txs = threeMonthsOfRevenue(800000, 200000, 600000);
        const cashBalance = 400000;
        const result = computeCustomerLossScenario(txs, cashBalance, '₦', 6);

        expect(result.available).toBe(true);
        expect(result.customerSharePct).toBeCloseTo(80, 0);
        // Revenue after loss: 200,000; expense: 600,000 -> burning 400,000/mo
        // against 400,000 cash = 1 month runway -- warning or critical.
        expect(['warning', 'critical']).toContain(result.scenario!.risk);
        expect(result.narrative).toMatch(/80%/);
    });

    it('names the customer as null (and omits the name from the narrative) when income has no vendorCustomer tagged', () => {
        const months = ['2026-01', '2026-02', '2026-03'];
        const txs: Transaction[] = [];
        for (const m of months) {
            txs.push(makeTx({ amount: 1000000, date: `${m}-10`, type: 'income' })); // no vendorCustomer
            txs.push(makeTx({ category: 'Rent', amount: 300000, date: `${m}-20`, type: 'expense' }));
        }
        const result = computeCustomerLossScenario(txs, 500000, '₦', 6);
        expect(result.available).toBe(true);
        expect(result.customerName).toBeNull();
        expect(result.narrative).not.toMatch(/Unknown/);
        expect(result.narrative).toMatch(/top customer/i);
    });
});
