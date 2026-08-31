import { computeBusinessExposure, computeBusinessResilience, describeHealthResilienceGap, BusinessExposure } from '../src/utils/businessExposure';
import { Transaction, Loan, InventoryItem } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-06-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const finance = { cashBalance: 500000, totalTaxCollected: 0, totalTaxPaid: 0 };

describe('computeBusinessExposure', () => {
    it('marks FX exposure as unknown with no macro assumptions entered', () => {
        const result = computeBusinessExposure([], [], [], [], finance, undefined);
        const fx = result.factors.find(f => f.key === 'fx')!;
        expect(fx.level).toBe('unknown');
    });

    it('flags high customer concentration when one customer dominates revenue', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Big Corp', amount: 900000 }),
            makeTx({ vendorCustomer: 'Small Co', amount: 100000 }),
        ];
        const result = computeBusinessExposure(txs, [], [], [], finance, undefined);
        const cc = result.factors.find(f => f.key === 'customerConcentration')!;
        expect(cc.level).toBe('high');
        expect(cc.detail).toContain('Big Corp');
    });

    it('flags low debt exposure when there is no debt service', () => {
        const result = computeBusinessExposure([], [], [], [], finance, undefined);
        const debt = result.factors.find(f => f.key === 'debt')!;
        expect(debt.level).toBe('low');
    });

    it('flags high debt exposure when DSCR is in danger territory', () => {
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', principal: 5000000, interestRate: 20, termMonths: 12,
            startDate: '2024-01-01', status: 'active', purpose: 'Working capital',
        } as Loan];
        const txs = [makeTx({ type: 'income', amount: 10000, date: '2024-06-01' })];
        const result = computeBusinessExposure(txs, loans, [], [], finance, undefined);
        const debt = result.factors.find(f => f.key === 'debt')!;
        expect(['medium', 'high']).toContain(debt.level);
    });

    it('flags high inventory exposure when most stock value is slow-moving', () => {
        const inventory: InventoryItem[] = [{
            id: 'i1', name: 'Old Stock', category: 'General', quantity: 100, unit: 'pcs',
            costPrice: 1000, sellingPrice: 1500, lowStockThreshold: 5,
            createdAt: '2023-01-01', updatedAt: '2023-01-01',
        } as InventoryItem];
        // A single small sale within the last 30 days is enough real
        // history for computeStockVelocity to classify this as 'slow'
        // (huge days-of-stock-left) rather than 'no-data' (no sales at all).
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 5);
        const txs = [makeTx({
            type: 'income', category: 'Sales', transactionCategory: 'sale',
            inventoryItemId: 'i1', unitsSold: 1, amount: 1500,
            date: recentDate.toISOString().split('T')[0],
        })];
        const result = computeBusinessExposure(txs, [], inventory, [], finance, undefined);
        const inv = result.factors.find(f => f.key === 'inventory')!;
        expect(inv.level).toBe('high');
    });

    it('flags high regulatory exposure when the tax deadline is overdue', () => {
        const result = computeBusinessExposure([], [], [], [], finance, '2020-01-01');
        const reg = result.factors.find(f => f.key === 'regulatory')!;
        expect(reg.level).toBe('high');
        expect(reg.detail).toContain('overdue');
    });

    it('flags high regulatory exposure when tax liability exceeds cash on hand', () => {
        const shortfallFinance = { cashBalance: 1000, totalTaxCollected: 500000, totalTaxPaid: 0 };
        const result = computeBusinessExposure([], [], [], [], shortfallFinance, undefined);
        const reg = result.factors.find(f => f.key === 'regulatory')!;
        expect(reg.level).toBe('high');
    });

    it('rolls up overall level to high when 2+ factors are high', () => {
        const inventory: InventoryItem[] = [{
            id: 'i1', name: 'Old Stock', category: 'General', quantity: 100, unit: 'pcs',
            costPrice: 1000, sellingPrice: 1500, lowStockThreshold: 5,
            createdAt: '2023-01-01', updatedAt: '2023-01-01',
        } as InventoryItem];
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 5);
        const txs = [makeTx({
            type: 'income', category: 'Sales', transactionCategory: 'sale',
            inventoryItemId: 'i1', unitsSold: 1, amount: 1500,
            date: recentDate.toISOString().split('T')[0],
        })];
        const result = computeBusinessExposure(txs, [], inventory, [], finance, '2020-01-01');
        expect(result.highCount).toBeGreaterThanOrEqual(2);
        expect(result.overallLevel).toBe('high');
    });

    it('rolls up overall level to low when nothing is flagged', () => {
        const result = computeBusinessExposure([], [], [], [], finance, undefined);
        expect(result.overallLevel).toBe('low');
    });

    it('does not call zero cash on hand "low" cash-flow exposure just because there is no burn history to measure', () => {
        // No transactions -> dailyBurn is 0 -> computeCashRunway returns
        // Infinity, which used to be treated as automatically low-risk
        // regardless of whether there was any actual cash. ₦0 cash and no
        // history is the same account the Dashboard's alert bell flags as
        // a critical low-cash warning -- this factor shouldn't call it low.
        const noCashFinance = { cashBalance: 0, totalTaxCollected: 0, totalTaxPaid: 0 };
        const result = computeBusinessExposure([], [], [], [], noCashFinance, undefined);
        const cashFlow = result.factors.find(f => f.key === 'cashFlow')!;
        expect(cashFlow.level).toBe('high');
    });

    it('still calls real cash on hand with no current burn "low" cash-flow exposure', () => {
        const result = computeBusinessExposure([], [], [], [], finance, undefined); // finance.cashBalance = 500000
        const cashFlow = result.factors.find(f => f.key === 'cashFlow')!;
        expect(cashFlow.level).toBe('low');
    });

    it('flags high expense-flexibility exposure when most costs are fixed (rent/salary/admin)', () => {
        const txs = [
            makeTx({ type: 'expense', category: 'Rent', amount: 400000 }),
            makeTx({ type: 'expense', category: 'Salaries', amount: 400000 }),
            makeTx({ type: 'expense', category: 'Inventory', amount: 200000 }),
        ];
        const result = computeBusinessExposure(txs, [], [], [], finance, undefined);
        const flex = result.factors.find(f => f.key === 'expenseFlexibility')!;
        expect(flex.level).toBe('high');
        expect(flex.detail).toMatch(/80% of your cost base is fixed/);
    });

    it('flags low expense-flexibility exposure when most costs are variable', () => {
        const txs = [
            makeTx({ type: 'expense', category: 'Inventory', amount: 800000 }),
            makeTx({ type: 'expense', category: 'Logistics', amount: 100000 }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000 }),
        ];
        const result = computeBusinessExposure(txs, [], [], [], finance, undefined);
        const flex = result.factors.find(f => f.key === 'expenseFlexibility')!;
        expect(flex.level).toBe('low');
    });

    it('marks expense-flexibility exposure unknown with no expense history', () => {
        const result = computeBusinessExposure([], [], [], [], finance, undefined);
        const flex = result.factors.find(f => f.key === 'expenseFlexibility')!;
        expect(flex.level).toBe('unknown');
    });

    it('flags high stress-test exposure when a small revenue drop tips the business into vulnerability', () => {
        // 3 months of revenue barely above expenses, with very little cash --
        // even a small revenue decline should breach the safety buffer fast.
        const txs: Transaction[] = [];
        for (let m = 4; m <= 6; m++) {
            txs.push(makeTx({ type: 'income', amount: 100000, date: `2024-0${m}-10` }));
            txs.push(makeTx({ type: 'expense', category: 'Rent', amount: 98000, date: `2024-0${m}-15` }));
        }
        const tightFinance = { cashBalance: 20000, totalTaxCollected: 0, totalTaxPaid: 0 };
        const result = computeBusinessExposure(txs, [], [], [], tightFinance, undefined);
        const stress = result.factors.find(f => f.key === 'stressTest')!;
        expect(stress.level).toBe('high');
    });

    it('flags low stress-test exposure when the business can absorb a severe revenue drop', () => {
        const txs: Transaction[] = [];
        for (let m = 4; m <= 6; m++) {
            txs.push(makeTx({ type: 'income', amount: 1000000, date: `2024-0${m}-10` }));
            txs.push(makeTx({ type: 'expense', category: 'Rent', amount: 200000, date: `2024-0${m}-15` }));
        }
        const richFinance = { cashBalance: 20000000, totalTaxCollected: 0, totalTaxPaid: 0 };
        const result = computeBusinessExposure(txs, [], [], [], richFinance, undefined);
        const stress = result.factors.find(f => f.key === 'stressTest')!;
        expect(stress.level).toBe('low');
    });

    it('marks stress-test exposure unknown with no revenue history', () => {
        const result = computeBusinessExposure([], [], [], [], finance, undefined);
        const stress = result.factors.find(f => f.key === 'stressTest')!;
        expect(stress.level).toBe('unknown');
    });
});

const makeExposure = (levels: Partial<Record<string, 'low' | 'medium' | 'high' | 'unknown'>>): BusinessExposure => {
    const keys = ['fx', 'interestRate', 'customerConcentration', 'supplierConcentration', 'inventory', 'debt', 'cashFlow', 'regulatory'];
    const factors = keys.map(key => ({ key, label: `${key} Exposure`, level: levels[key] ?? 'unknown' as const, detail: '' }));
    const highCount = factors.filter(f => f.level === 'high').length;
    const mediumCount = factors.filter(f => f.level === 'medium').length;
    return { factors, highCount, mediumCount, overallLevel: highCount >= 2 ? 'high' : 'low' };
};

describe('computeBusinessResilience', () => {
    it('scores Strong when every known factor is low', () => {
        const exposure = makeExposure({ fx: 'low', debt: 'low', cashFlow: 'low' });
        const resilience = computeBusinessResilience(exposure);
        expect(resilience.band).toBe('Strong');
        expect(resilience.score).toBe(100);
    });

    it('scores Weak when multiple factors are high', () => {
        const exposure = makeExposure({ fx: 'high', debt: 'high', customerConcentration: 'high' });
        const resilience = computeBusinessResilience(exposure);
        expect(resilience.band).toBe('Weak');
    });

    it('ranks topConcerns with high before medium', () => {
        const exposure = makeExposure({ fx: 'medium', debt: 'high' });
        const resilience = computeBusinessResilience(exposure);
        expect(resilience.topConcerns[0].key).toBe('debt');
    });

    it('returns a neutral score of 50 when nothing is known at all', () => {
        const exposure = makeExposure({});
        const resilience = computeBusinessResilience(exposure);
        expect(resilience.score).toBe(50);
    });
});

describe('describeHealthResilienceGap', () => {
    it('flags "profitable but fragile" when health is strong and resilience is weak', () => {
        const exposure = makeExposure({ fx: 'high', customerConcentration: 'high' });
        const resilience = computeBusinessResilience(exposure);
        const gap = describeHealthResilienceGap(75, resilience);
        expect(gap).toContain('profitable today but relatively vulnerable');
    });

    it('flags "struggling but resilient" when health is weak and resilience is strong', () => {
        const exposure = makeExposure({ fx: 'low', debt: 'low', cashFlow: 'low' });
        const resilience = computeBusinessResilience(exposure);
        const gap = describeHealthResilienceGap(40, resilience);
        expect(gap).toContain('well-diversified against external shocks');
    });

    it('returns null when health and resilience roughly agree', () => {
        const exposure = makeExposure({ fx: 'medium', debt: 'medium' });
        const resilience = computeBusinessResilience(exposure);
        const gap = describeHealthResilienceGap(60, resilience);
        expect(gap).toBeNull();
    });
});
