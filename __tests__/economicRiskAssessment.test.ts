import { computeEconomicRiskAssessment, bandForRiskScore } from '../src/utils/economicRiskAssessment';
import { computeDSCR } from '../src/utils/finance';
import { computeCashRunway } from '../src/utils/cashRunway';
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

const recentDateStr = (daysAgo: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
};

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
        it('reproduces the 30% -> 23% operating-margin example under a standardized 10% cost shock, labeled distinctly from Gross Margin', () => {
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
            expect(cost.exposure.detail).toContain('operating margin of 30%');
            expect(cost.sensitivity.detail).toContain('to about 23% (down 7.0 percentage points)');
            expect(cost.impact.detail).toContain('₦7,000');
            // Must never be labeled bare "margin" -- that's ambiguous with
            // the real COGS-based Gross Margin shown on the Reports screen.
            expect(cost.exposure.detail).toContain('Gross Margin');
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

    describe('liquidity & cash-flow vulnerability category', () => {
        it('scores a tight cash position as high exposure and a comfortable one as low, using the same runway tiers businessExposure.ts uses', () => {
            const txs: Transaction[] = [];
            for (let m = 4; m <= 6; m++) {
                txs.push(makeTx({ type: 'income', amount: 100000, date: `2026-0${m}-10` }));
                txs.push(makeTx({ type: 'expense', category: 'Rent', amount: 98000, date: `2026-0${m}-15` }));
            }
            const tightResult = computeEconomicRiskAssessment(txs, [], [], [], [], { cashBalance: 20000 }, [], '₦');
            const tightLiquidity = tightResult.categories.find(c => c.key === 'liquidity')!;
            expect(tightLiquidity.available).toBe(true);
            expect(tightLiquidity.exposure.value).toBeGreaterThanOrEqual(70);

            const comfortableResult = computeEconomicRiskAssessment(txs, [], [], [], [], { cashBalance: 20000000 }, [], '₦');
            const comfortableLiquidity = comfortableResult.categories.find(c => c.key === 'liquidity')!;
            expect(comfortableLiquidity.exposure.value).toBeLessThanOrEqual(15);
        });

        it('shares businessExposure.ts\'s exact 30/60-day runway tiers for the same computeCashRunway value', () => {
            const txs: Transaction[] = [];
            for (let m = 1; m <= 6; m++) {
                txs.push(makeTx({ type: 'income', amount: 100000, date: `2026-0${m}-10` }));
                txs.push(makeTx({ type: 'expense', category: 'Rent', amount: 90000, date: `2026-0${m}-15` }));
            }
            const cashBalance = 50000;
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], { cashBalance }, [], '₦');
            const liquidity = result.categories.find(c => c.key === 'liquidity')!;
            const runway = computeCashRunway(txs, cashBalance, new Date('2026-06-15'));
            const expectedScore = !Number.isFinite(runway.runwayDays)
                ? (cashBalance > 0 ? 15 : 100)
                : (runway.runwayDays < 30 ? 100 : runway.runwayDays < 60 ? 55 : 15);
            expect(liquidity.exposure.value).toBe(expectedScore);
        });
    });

    describe('negative (overdrawn) cash balance -- demand and liquidity impact', () => {
        it('scores maximal cash-flow impact instead of 0, and shows the balance as negative rather than silently positive', () => {
            const txs: Transaction[] = [];
            for (const m of ['2026-04', '2026-05', '2026-06']) {
                txs.push(makeTx({ date: `${m}-10`, type: 'income', amount: 100000 }));
                txs.push(makeTx({ date: `${m}-15`, type: 'expense', category: 'Rent', amount: 90000 }));
            }
            const overdrawnFinance = { cashBalance: -200000 };
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], overdrawnFinance, [], '₦');

            const demand = result.categories.find(c => c.key === 'demand')!;
            expect(demand.impact.value).toBe(100);
            expect(demand.impact.detail).toContain('-₦200,000 (overdrawn)');

            const liquidity = result.categories.find(c => c.key === 'liquidity')!;
            expect(liquidity.impact.value).toBe(100);
        });
    });

    describe('debt vulnerability category', () => {
        it('scores exactly 0 (not an arbitrary placeholder) with no active debt service, and is still included in the overall average', () => {
            const result = computeEconomicRiskAssessment([], [], [], [], [], finance, [], '₦');
            const debt = result.categories.find(c => c.key === 'debt')!;
            expect(debt.available).toBe(true);
            expect(debt.score).toBe(0);
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

        it('shares businessExposure.ts\'s exact DSCR-status tiers for the same computeDSCR value', () => {
            const loans: Loan[] = [{
                id: 'l1', lenderName: 'Bank', principal: 5000000, interestRate: 20, termMonths: 12,
                startDate: '2026-01-01', status: 'active', purpose: 'Working capital',
                payments: [], createdAt: '2026-01-01',
            } as Loan];
            const txs: Transaction[] = [];
            for (let m = 1; m <= 6; m++) {
                txs.push(makeTx({ date: `2026-0${m}-10`, type: 'income', amount: 600000 }));
                txs.push(makeTx({ date: `2026-0${m}-15`, type: 'expense', category: 'Operating', amount: 50000 }));
            }
            const result = computeEconomicRiskAssessment(txs, loans, [], [], [], finance, [], '₦');
            const debt = result.categories.find(c => c.key === 'debt')!;
            const baseline = computeDSCR(txs, loans, 0);
            const expectedScore = baseline.status === 'danger' ? 100 : baseline.status === 'warning' ? 55 : 15;
            expect(debt.exposure.value).toBe(expectedScore);
        });

        it('does not score an already-worsening negative DSCR as "Low" sensitivity', () => {
            // Income well below expense and an active loan -- net operating
            // income (and therefore DSCR) is already negative before any
            // shock. A revenue-drop shock only makes it worse.
            const loans: Loan[] = [{
                id: 'l1', lenderName: 'Bank', principal: 5000000, interestRate: 20, termMonths: 12,
                startDate: '2026-01-01', status: 'active', purpose: 'Working capital',
                payments: [], createdAt: '2026-01-01',
            } as Loan];
            const txs: Transaction[] = [];
            for (let m = 1; m <= 6; m++) {
                txs.push(makeTx({ date: `2026-0${m}-10`, type: 'income', amount: 100000 }));
                txs.push(makeTx({ date: `2026-0${m}-15`, type: 'expense', category: 'Operating', amount: 200000 }));
            }
            const result = computeEconomicRiskAssessment(txs, loans, [], [], [], finance, [], '₦');
            const debt = result.categories.find(c => c.key === 'debt')!;
            const baseline = computeDSCR(txs, loans, 0);
            expect(baseline.dscr).toBeLessThan(0);
            // Before the fix this was pinned at exactly 10 ("Low") for ANY
            // negative baseline, no matter how much worse the shock made
            // it -- a real worsening must score strictly above that floor.
            expect(debt.sensitivity.value).not.toBeNull();
            expect(debt.sensitivity.value as number).toBeGreaterThan(10);
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

        it('does not attribute a minor supplier\'s price-pressure flag to the dominant (top-concentration) supplier', () => {
            const txs: Transaction[] = [
                makeTx({ type: 'expense', category: 'Purchases', vendorCustomer: 'Main Supplier', amount: 800000 }),
                makeTx({ type: 'expense', category: 'Purchases', vendorCustomer: 'Backup Supplier', amount: 200000 }),
            ];
            // Only Backup Supplier (the minor one) has a recorded cost/price gap.
            const inventory: InventoryItem[] = [{
                id: 'i1', name: 'Widget', category: 'General', quantity: 10, unit: 'pcs',
                costPrice: 1500, sellingPrice: 2000, supplier: 'Backup Supplier',
                batches: [
                    { id: 'b1', quantity: 10, remainingQuantity: 10, costPrice: 1000, supplier: 'Backup Supplier', purchaseDate: '2026-01-01', createdAt: '2026-01-01' },
                    { id: 'b2', quantity: 10, remainingQuantity: 10, costPrice: 1500, supplier: 'Backup Supplier', purchaseDate: '2026-06-01', createdAt: '2026-06-01' },
                ],
                createdAt: '2026-01-01', updatedAt: '2026-06-01',
            } as InventoryItem];
            const result = computeEconomicRiskAssessment(txs, [], inventory, [], [], finance, [], '₦');
            const supplier = result.categories.find(c => c.key === 'supplier')!;
            expect(supplier.exposure.detail).toContain('Main Supplier'); // still the top-concentration supplier
            // The price-pressure gap belongs to Backup Supplier, not Main
            // Supplier -- must not be surfaced under Main Supplier's name.
            expect(supplier.sensitivity.value).toBeNull();
            expect(supplier.sensitivity.detail).toContain('Main Supplier');
        });

        it('does attribute a price-pressure flag to the same supplier it actually belongs to', () => {
            const txs: Transaction[] = [
                makeTx({ type: 'expense', category: 'Purchases', vendorCustomer: 'Main Supplier', amount: 800000 }),
                makeTx({ type: 'expense', category: 'Purchases', vendorCustomer: 'Backup Supplier', amount: 200000 }),
            ];
            const inventory: InventoryItem[] = [{
                id: 'i1', name: 'Widget', category: 'General', quantity: 10, unit: 'pcs',
                costPrice: 1500, sellingPrice: 2000, supplier: 'Main Supplier',
                batches: [
                    { id: 'b1', quantity: 10, remainingQuantity: 10, costPrice: 1000, supplier: 'Main Supplier', purchaseDate: '2026-01-01', createdAt: '2026-01-01' },
                    { id: 'b2', quantity: 10, remainingQuantity: 10, costPrice: 1500, supplier: 'Main Supplier', purchaseDate: '2026-06-01', createdAt: '2026-06-01' },
                ],
                createdAt: '2026-01-01', updatedAt: '2026-06-01',
            } as InventoryItem];
            const result = computeEconomicRiskAssessment(txs, [], inventory, [], [], finance, [], '₦');
            const supplier = result.categories.find(c => c.key === 'supplier')!;
            expect(supplier.sensitivity.value).not.toBeNull();
        });
    });

    describe('customer credit risk category', () => {
        it('measures receivables-to-sales and DSO from real recent paid + pending transactions', () => {
            const txs: Transaction[] = [
                makeTx({ date: recentDateStr(30), type: 'income', amount: 90000, status: 'paid' }),
                makeTx({ date: recentDateStr(5), type: 'income', amount: 10000, status: 'pending' }),
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

        it('is unavailable (not a self-contradictory 100%-outstanding-but-0-days-to-pay reading) when the only paid sale is outside the trailing 90-day window', () => {
            const txs: Transaction[] = [
                makeTx({ date: recentDateStr(400), type: 'income', amount: 90000, status: 'paid' }),
                makeTx({ date: recentDateStr(10), type: 'income', amount: 15000, status: 'pending' }),
            ];
            const result = computeEconomicRiskAssessment(txs, [], [], [], [], finance, [], '₦');
            const credit = result.categories.find(c => c.key === 'credit')!;
            expect(credit.available).toBe(false);
        });

        it('is unavailable when the only paid transaction is an expense, not income, even with a pending receivable', () => {
            const txs: Transaction[] = [
                makeTx({ date: recentDateStr(10), type: 'expense', category: 'Rent', amount: 50000, status: 'paid' }),
                makeTx({ date: recentDateStr(5), type: 'income', amount: 10000, status: 'pending' }),
            ];
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

    it('does not mask a genuinely Elevated-or-worse category behind a diluted overall average', () => {
        // Tight 10% margin makes costPressure score ~61 ("Elevated") on its
        // own. With no debt (a real, included 0) and ample cash elsewhere,
        // the plain average alone would land well under 30 ("Low") -- the
        // recommendedAction must still surface costPressure rather than
        // falsely reassuring that nothing is elevated.
        const txs: Transaction[] = [];
        for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000, status: 'paid' }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Purchases', amount: 90000 }));
        }
        const result = computeEconomicRiskAssessment(txs, [], [], [], [], { cashBalance: 5000000 }, [], '₦');
        const cost = result.categories.find(c => c.key === 'costPressure')!;
        expect(cost.score).not.toBeNull();
        expect(cost.score as number).toBeGreaterThanOrEqual(50);
        expect(result.overallScore as number).toBeLessThan(50); // the average really is diluted
        // The averaged headline is diluted below Elevated, but at least one
        // real category (costPressure) is Elevated-or-worse, so the
        // recommendation must not fall back to the falsely reassuring
        // "nothing is elevated" message.
        expect(result.recommendedAction).not.toMatch(/No elevated economic risk identified/);
    });
});
