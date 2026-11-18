import { computeEconomicRiskAssessment, bandForRiskScore } from '../src/utils/economicRiskAssessment';
import { Transaction, Loan, InventoryItem, Invoice } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-06-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const finance = { cashBalance: 500000 };

describe('bandForRiskScore', () => {
    it('maps the documented 0-29/30-49/50-69/70-100 cutoffs', () => {
        expect(bandForRiskScore(0)).toBe('Low');
        expect(bandForRiskScore(29)).toBe('Low');
        expect(bandForRiskScore(30)).toBe('Moderate');
        expect(bandForRiskScore(49)).toBe('Moderate');
        expect(bandForRiskScore(50)).toBe('Elevated');
        expect(bandForRiskScore(69)).toBe('Elevated');
        expect(bandForRiskScore(70)).toBe('High');
        expect(bandForRiskScore(100)).toBe('High');
    });
});

describe('computeEconomicRiskAssessment', () => {
    it('returns available: false overall with no data at all', () => {
        const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/economic risk categories/i);
        expect(result.overallScore).toBeNull();
    });

    it('always flags energy/logistics risk as unavailable (no data path exists)', () => {
        const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
        const energy = result.categories.find(c => c.key === 'energy')!;
        expect(energy.available).toBe(false);
        expect(energy.score).toBeNull();
    });

    it('flags FX risk as unavailable with no macro assumption entered', () => {
        const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
        const fx = result.categories.find(c => c.key === 'fx')!;
        expect(fx.available).toBe(false);
    });

    describe('cost pressure category', () => {
        it('reproduces the 30% -> 23% margin example under a standardized 10% cost shock', () => {
            // 6 flat months: ₦100,000 revenue, ₦70,000 cost -> 30% margin,
            // identical in both the prior and current 3-month windows so
            // costExposure.ts finds no real creep of its own -- this test
            // is only about the standardized-shock math layered on top.
            const txs: Transaction[] = [];
            for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
                txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
                txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Purchases', amount: 70000 }));
            }
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
            const cost = result.categories.find(c => c.key === 'costPressure')!;
            expect(cost.available).toBe(true);
            // currentMarginPct 30 -> shockedMarginPct 23, monthlyImpact = 7,000
            expect(cost.sensitivity.detail).toMatch(/23%/);
            expect(cost.sensitivity.detail).toMatch(/7\.0 percentage points|7 percentage points/);
            expect(cost.impact.detail).toMatch(/₦7,000/);
        });

        it('is unavailable with no revenue history', () => {
            const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
            const cost = result.categories.find(c => c.key === 'costPressure')!;
            expect(cost.available).toBe(false);
        });
    });

    describe('demand & sales vulnerability category', () => {
        it('flags high exposure when one customer dominates revenue', () => {
            const txs: Transaction[] = [];
            for (const m of ['2026-04', '2026-05', '2026-06']) {
                txs.push(makeTx({ date: `${m}-10`, vendorCustomer: 'Big Corp', amount: 90000 }));
                txs.push(makeTx({ date: `${m}-10`, vendorCustomer: 'Small Co', amount: 10000 }));
                txs.push(makeTx({ date: `${m}-15`, type: 'expense', category: 'Rent', amount: 50000 }));
            }
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
            const demand = result.categories.find(c => c.key === 'demand')!;
            expect(demand.available).toBe(true);
            expect(demand.exposure.value).toBeGreaterThanOrEqual(85);
            expect(demand.exposure.detail).toContain('Big Corp');
        });
    });

    describe('debt vulnerability category', () => {
        it('scores Low with no active debt service', () => {
            const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
            const debt = result.categories.find(c => c.key === 'debt')!;
            expect(debt.available).toBe(true);
            expect(debt.band).toBe('Low');
        });

        it('degrades DSCR under the standardized revenue shock and shows a shortfall when coverage is tight', () => {
            const loans: Loan[] = [{
                id: 'l1', lenderName: 'Bank', principal: 5000000, interestRate: 20, termMonths: 12,
                startDate: '2026-01-01', status: 'active', purpose: 'Working capital',
                payments: [], createdAt: '2026-01-01',
            } as Loan];
            const txs: Transaction[] = [];
            for (let m = 1; m <= 6; m++) {
                txs.push(makeTx({ date: `2026-0${m}-10`, type: 'income', amount: 500000 }));
                txs.push(makeTx({ date: `2026-0${m}-15`, type: 'expense', category: 'Operating', amount: 50000 }));
            }
            const result = computeEconomicRiskAssessment(txs, loans, [], [], [], finance, [], '₦');
            const debt = result.categories.find(c => c.key === 'debt')!;
            expect(debt.available).toBe(true);
            expect(debt.sensitivity.value).not.toBeNull();
            expect(debt.sensitivity.detail).toMatch(/revenue decline would bring coverage/);
        });
    });

    describe('supplier & supply-chain exposure category', () => {
        it('flags high exposure when one supplier dominates purchases and prices a standardized shock', () => {
            const txs: Transaction[] = [
                makeTx({ type: 'expense', category: 'Purchases', vendorCustomer: 'Main Supplier', amount: 800000 }),
                makeTx({ type: 'expense', category: 'Purchases', vendorCustomer: 'Backup Supplier', amount: 200000 }),
            ];
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
            const supplier = result.categories.find(c => c.key === 'supplier')!;
            expect(supplier.available).toBe(true);
            expect(supplier.exposure.value).toBeCloseTo(80, 0);
            expect(supplier.impact.detail).toContain('Main Supplier');
            expect(supplier.impact.detail).toMatch(/₦80,000/); // 10% of 800,000
        });

        it('is unavailable with no supplier-tagged spend', () => {
            const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
            const supplier = result.categories.find(c => c.key === 'supplier')!;
            expect(supplier.available).toBe(false);
        });
    });

    describe('customer credit risk category', () => {
        it('measures receivables-to-sales and DSO from real paid + pending transactions', () => {
            const txs: Transaction[] = [
                makeTx({ date: '2026-05-01', type: 'income', amount: 90000, status: 'paid' }),
                makeTx({ date: '2026-06-01', type: 'income', amount: 10000, status: 'pending' }),
            ];
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
            const credit = result.categories.find(c => c.key === 'credit')!;
            expect(credit.available).toBe(true);
            expect(credit.exposure.detail).toMatch(/₦10,000/);
        });

        it('is unavailable with no paid transaction history', () => {
            const txs = [makeTx({ type: 'income', amount: 10000, status: 'pending' })];
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
            const credit = result.categories.find(c => c.key === 'credit')!;
            expect(credit.available).toBe(false);
        });
    });

    describe('inventory exposure category', () => {
        it('is unavailable with no inventory recorded', () => {
            const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
            const inv = result.categories.find(c => c.key === 'inventory')!;
            expect(inv.available).toBe(false);
        });

        it('weighs exposure and impact only, with sensitivity explicitly not modeled', () => {
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
            const result = computeEconomicRiskAssessment(txs, [], inventory, [], [], finance, [], '₦');
            const inv = result.categories.find(c => c.key === 'inventory')!;
            expect(inv.available).toBe(true);
            expect(inv.sensitivity.value).toBeNull();
            expect(inv.exposure.value).not.toBeNull();
            expect(inv.impact.value).not.toBeNull();
        });
    });

    it('computes an overall score and a recommended action once enough categories are available', () => {
        const txs: Transaction[] = [];
        for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000, vendorCustomer: 'Big Corp', status: 'paid' }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Purchases', amount: 90000, vendorCustomer: 'Main Supplier' }));
        }
        const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
        expect(result.available).toBe(true);
        expect(result.overallScore).not.toBeNull();
        expect(result.overallBand).not.toBe('Unknown');
        expect(result.headline).toMatch(/Economic risk score is \d+\/100/);
        expect(result.recommendedAction.length).toBeGreaterThan(0);
    });
});
