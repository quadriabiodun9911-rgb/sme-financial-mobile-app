import { computeRiskRadar } from '../src/utils/riskRadar';
import { Transaction, Loan, MacroAssumption } from '../src/types';

function makeTx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `tx-${Math.random()}`,
        date: '2026-06-01',
        description: 'Test',
        type: 'income',
        category: 'Sales',
        amount: 1000,
        status: 'paid',
        ...overrides,
    };
}

function makeLoan(overrides: Partial<Loan>): Loan {
    return {
        id: 'loan-1',
        lenderName: 'Test Bank',
        purpose: 'Working capital',
        principal: 6000000,
        interestRate: 24,
        termMonths: 12,
        startDate: '2026-01-01',
        status: 'active',
        payments: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('computeRiskRadar — debt coverage', () => {
    it('reports low (not no-data) when there is no active debt service', () => {
        const radar = computeRiskRadar([], []);
        const debt = radar.categories.find(c => c.key === 'debtCoverage');
        expect(debt?.level).toBe('low');
        expect(debt?.summary).toContain('No active loan repayments');
    });

    it('reports high when income cannot cover a large debt service', () => {
        const txs = [makeTx({ date: '2026-06-01', type: 'income', amount: 50000 })];
        const loans = [makeLoan({})];
        const radar = computeRiskRadar(txs, loans, [], new Date('2026-06-15'));
        const debt = radar.categories.find(c => c.key === 'debtCoverage');
        expect(debt?.level).toBe('high');
        expect(debt?.summary).toContain("doesn't cover");
    });

    it('reports low when income comfortably covers a small debt service', () => {
        const txs = [makeTx({ date: '2026-06-01', type: 'income', amount: 5000000 })];
        const loans = [makeLoan({ principal: 100000, interestRate: 10, termMonths: 24 })];
        const radar = computeRiskRadar(txs, loans, [], new Date('2026-06-15'));
        const debt = radar.categories.find(c => c.key === 'debtCoverage');
        expect(debt?.level).toBe('low');
    });
});

describe('computeRiskRadar — customer/supplier concentration', () => {
    it('reports no-data when there are no income transactions', () => {
        const radar = computeRiskRadar([], []);
        expect(radar.categories.find(c => c.key === 'customerConcentration')?.level).toBe('no-data');
        expect(radar.categories.find(c => c.key === 'supplierConcentration')?.level).toBe('no-data');
    });

    it('reports high when a single customer dominates revenue', () => {
        const txs = [
            makeTx({ type: 'income', amount: 90000, vendorCustomer: 'Big Corp' }),
            makeTx({ type: 'income', amount: 10000, vendorCustomer: 'Small Co' }),
        ];
        const radar = computeRiskRadar(txs, []);
        const customer = radar.categories.find(c => c.key === 'customerConcentration');
        expect(customer?.level).toBe('high');
        expect(customer?.summary).toContain('Big Corp');
    });

    it('reports high when a single supplier dominates spend', () => {
        const txs = [
            makeTx({ type: 'expense', amount: 85000, vendorCustomer: 'Main Supplier', category: 'Stock' }),
            makeTx({ type: 'expense', amount: 15000, vendorCustomer: 'Other Supplier', category: 'Stock' }),
        ];
        const radar = computeRiskRadar(txs, []);
        const supplier = radar.categories.find(c => c.key === 'supplierConcentration');
        expect(supplier?.level).toBe('high');
        expect(supplier?.summary).toContain('Main Supplier');
    });
});

describe('computeRiskRadar — lender concentration', () => {
    it('reports low (not no-data) when there are no active loans', () => {
        const radar = computeRiskRadar([], []);
        const lender = radar.categories.find(c => c.key === 'lenderConcentration');
        expect(lender?.level).toBe('low');
        expect(lender?.summary).toContain('No active loans');
    });

    it('reports high when a single lender holds all outstanding debt', () => {
        const loans = [makeLoan({ lenderName: 'Only Bank' })];
        const radar = computeRiskRadar([], loans);
        const lender = radar.categories.find(c => c.key === 'lenderConcentration');
        expect(lender?.level).toBe('high');
        expect(lender?.summary).toContain('Only Bank');
    });

    it('reports low when debt is split evenly across several lenders', () => {
        const loans = [
            makeLoan({ id: 'a', lenderName: 'Bank A', principal: 100000 }),
            makeLoan({ id: 'b', lenderName: 'Bank B', principal: 100000 }),
            makeLoan({ id: 'c', lenderName: 'Bank C', principal: 100000 }),
            makeLoan({ id: 'd', lenderName: 'Bank D', principal: 100000 }),
            makeLoan({ id: 'e', lenderName: 'Bank E', principal: 100000 }),
            makeLoan({ id: 'f', lenderName: 'Bank F', principal: 100000 }),
        ];
        const radar = computeRiskRadar([], loans);
        const lender = radar.categories.find(c => c.key === 'lenderConcentration');
        expect(lender?.level).toBe('low');
    });
});

describe('computeRiskRadar — seasonal', () => {
    it('reports no-data when there is no income history for the upcoming months', () => {
        const radar = computeRiskRadar([], []);
        expect(radar.categories.find(c => c.key === 'seasonal')?.level).toBe('no-data');
    });
});

describe('computeRiskRadar — economic', () => {
    it('reports no-data when there is not enough transaction history for cost exposure', () => {
        const radar = computeRiskRadar([], [], []);
        const economic = radar.categories.find(c => c.key === 'economic');
        expect(economic?.level).toBe('no-data');
    });

    it('reports no-data when history exists but no macro assumptions are configured', () => {
        // 6 months of data across 2+ categories, enough for computeCostExposure's
        // default 3-month window comparison to become "available".
        const txs: Transaction[] = [];
        for (let m = 1; m <= 6; m++) {
            const month = String(m).padStart(2, '0');
            txs.push(makeTx({ date: `2026-${month}-05`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `2026-${month}-10`, type: 'expense', amount: 40000, category: 'Rent' }));
        }
        const radar = computeRiskRadar(txs, [], [], new Date('2026-07-01'));
        const economic = radar.categories.find(c => c.key === 'economic');
        expect(economic?.level).toBe('no-data');
        expect(economic?.summary).toContain('Settings');
    });
});

describe('computeRiskRadar — overall level and topRisks', () => {
    it('is high overall when any category is high, and never surfaces no-data categories in topRisks', () => {
        const txs = [
            makeTx({ type: 'income', amount: 50000, date: '2026-06-01', vendorCustomer: 'Whale Customer' }),
        ];
        const loans = [makeLoan({})];
        const radar = computeRiskRadar(txs, loans, [], new Date('2026-06-15'));
        expect(radar.overallLevel).toBe('high');
        expect(radar.topRisks.length).toBeGreaterThan(0);
        expect(radar.topRisks.every(r => r.level === 'high' || r.level === 'medium')).toBe(true);
        expect(radar.topRisks.length).toBeLessThanOrEqual(3);
    });

    it('is low overall with no data at all (nothing scored counts as risk)', () => {
        const radar = computeRiskRadar([], []);
        expect(radar.overallLevel).toBe('low');
        expect(radar.topRisks).toHaveLength(0);
    });
});
