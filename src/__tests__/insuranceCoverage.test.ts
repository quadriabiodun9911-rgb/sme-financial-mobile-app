import { computeInsuranceCoverageAssessment } from '../utils/insuranceCoverage';
import { Asset, InsurancePolicy, InventoryItem } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function policy(overrides: Partial<InsurancePolicy> = {}): InsurancePolicy {
    return {
        id: `p-${Math.random()}`, insurer: 'Sample Insurer', policyType: 'inventory-stock',
        coverageAmount: 100000, premium: 5000, renewalDate: '2027-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'i1', name: 'Item', category: 'General', quantity: 10, unit: 'pcs',
        costPrice: 500, sellingPrice: 800, lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function asset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 'a1', name: 'Equipment', category: 'equipment', description: '',
        purchaseDate: '2024-01-01', purchaseCost: 200000, usefulLifeYears: 5,
        residualValue: 0, status: 'active', createdAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('computeInsuranceCoverageAssessment', () => {
    it('sums insurable value from inventory (cost basis) and active assets, excluding disposed ones', () => {
        const inventory = [item({ quantity: 10, costPrice: 500 })]; // 5000
        const assets = [
            asset({ id: 'a1', status: 'active', purchaseCost: 200000, residualValue: 200000 }), // fully "depreciated" to residual = 200000
            asset({ id: 'a2', status: 'disposed', disposalValue: 999999 }), // must be excluded
        ];
        const result = computeInsuranceCoverageAssessment([], inventory, assets, NOW);
        expect(result.totalInsurableValue).toBe(5000 + 200000);
    });

    it('counts an in-force policy toward active coverage and flags it when its renewal is within 30 days', () => {
        const nearRenewal = policy({ renewalDate: '2026-09-20', coverageAmount: 300000 }); // 5 days out
        const result = computeInsuranceCoverageAssessment([nearRenewal], [item({ quantity: 10, costPrice: 500 })], [], NOW);
        expect(result.totalActiveCoverage).toBe(300000);
        expect(result.expiringPolicies).toHaveLength(1);
        expect(result.expiringPolicies[0].daysUntilRenewal).toBe(5);
        expect(result.expiredPolicies).toHaveLength(0);
    });

    it('excludes a lapsed policy from active coverage entirely and flags it as expired, not merely low', () => {
        const lapsed = policy({ renewalDate: '2026-09-01', coverageAmount: 500000 }); // 14 days ago
        const inventory = [item({ quantity: 10, costPrice: 500 })]; // insurable value 5000
        const result = computeInsuranceCoverageAssessment([lapsed], inventory, [], NOW);
        expect(result.totalActiveCoverage).toBe(0); // the 500000 does NOT count -- it's lapsed
        expect(result.expiredPolicies).toHaveLength(1);
        expect(result.expiredPolicies[0].daysOverdue).toBe(14);
        expect(result.underinsured).toBe(true); // 0 active coverage against real insurable value
        expect(result.warning).toMatch(/lapsed/);
    });

    it('flags underinsurance when active coverage falls below 80% of insurable value, even with no lapsed or expiring policies', () => {
        const farOutPolicy = policy({ renewalDate: '2027-06-01', coverageAmount: 50000 });
        const inventory = [item({ quantity: 20, costPrice: 1000 })]; // insurable value 20000
        const assets = [asset({ purchaseCost: 100000, residualValue: 100000 })]; // 100000, never depreciates below residual
        // totalInsurableValue = 120000, coverage = 50000 => ratio ~0.42
        const result = computeInsuranceCoverageAssessment([farOutPolicy], inventory, assets, NOW);
        expect(result.coverageRatio).toBeCloseTo(50000 / 120000, 5);
        expect(result.underinsured).toBe(true);
        expect(result.uninsuredGap).toBe(120000 - 50000);
        expect(result.warning).toMatch(/only/);
    });

    it('reports no warning when coverage is adequate, in force, and not close to renewal', () => {
        const goodPolicy = policy({ renewalDate: '2027-06-01', coverageAmount: 100000 });
        const inventory = [item({ quantity: 10, costPrice: 500 })]; // 5000
        const result = computeInsuranceCoverageAssessment([goodPolicy], inventory, [], NOW);
        expect(result.underinsured).toBe(false);
        expect(result.expiringPolicies).toHaveLength(0);
        expect(result.expiredPolicies).toHaveLength(0);
        expect(result.warning).toBeNull();
    });

    it('treats zero insurable value as not underinsured (coverageRatio null) rather than flagging a gap that cannot exist', () => {
        const result = computeInsuranceCoverageAssessment([], [], [], NOW);
        expect(result.totalInsurableValue).toBe(0);
        expect(result.coverageRatio).toBeNull();
        expect(result.underinsured).toBe(false);
        expect(result.uninsuredGap).toBe(0);
    });
});
