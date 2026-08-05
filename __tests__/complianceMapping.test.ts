import { computeComplianceObligations } from '../src/utils/complianceMapping';
import { BusinessSettings, StaffMember } from '../src/types';

const baseSettings: BusinessSettings = {
    businessType: 'both',
    currency: '₦',
    currencyCode: 'NGN',
    minReserve: '0',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '0',
};

const makeStaff = (overrides: Partial<StaffMember>): StaffMember => ({
    id: 's1', name: 'Test Staff', role: 'Sales', salary: 1000,
    salaryType: 'monthly', startDate: '2024-01-01', status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
});

describe('computeComplianceObligations — gated on entity type being set', () => {
    it('returns hasEntityType: false with no obligations when unset', () => {
        const result = computeComplianceObligations(baseSettings, []);
        expect(result.hasEntityType).toBe(false);
        expect(result.obligations).toEqual([]);
    });

    it('does not fabricate jurisdiction-specific claims', () => {
        const result = computeComplianceObligations({ ...baseSettings, legalEntityType: 'llc' }, []);
        for (const o of result.obligations) {
            expect(o.detail.toLowerCase()).not.toMatch(/nigeria|united states|united kingdom|\birs\b|\bhmrc\b/);
        }
    });
});

describe('computeComplianceObligations — entity-type-specific obligations', () => {
    it('sole proprietorship: personal liability, no separate corporate filing implied', () => {
        const result = computeComplianceObligations({ ...baseSettings, legalEntityType: 'sole-proprietorship' }, []);
        expect(result.entityLabel).toBe('Sole Proprietorship');
        expect(result.liabilityNote).toContain('No legal separation');
        expect(result.obligations.some(o => o.id === 'personal-return')).toBe(true);
        expect(result.obligations.some(o => o.id === 'corporate-tax')).toBe(false);
    });

    it('LLC: separate entity, annual return + corporate tax obligations', () => {
        const result = computeComplianceObligations({ ...baseSettings, legalEntityType: 'llc' }, []);
        expect(result.liabilityNote).toContain('separate legal entity');
        expect(result.obligations.some(o => o.id === 'annual-return')).toBe(true);
        expect(result.obligations.some(o => o.id === 'corporate-tax')).toBe(true);
    });

    it('nonprofit: exempt-status filing, not corporate tax', () => {
        const result = computeComplianceObligations({ ...baseSettings, legalEntityType: 'nonprofit' }, []);
        expect(result.obligations.some(o => o.id === 'exempt-status-filing')).toBe(true);
        expect(result.obligations.some(o => o.id === 'corporate-tax')).toBe(false);
    });
});

describe('computeComplianceObligations — real-data-driven payroll flag', () => {
    it('adds an employer-payroll obligation only when there is active staff', () => {
        const noStaff = computeComplianceObligations({ ...baseSettings, legalEntityType: 'sole-proprietorship' }, []);
        expect(noStaff.obligations.some(o => o.id === 'employer-payroll')).toBe(false);

        const withStaff = computeComplianceObligations(
            { ...baseSettings, legalEntityType: 'sole-proprietorship' },
            [makeStaff({ id: 's1' }), makeStaff({ id: 's2' })],
        );
        const flag = withStaff.obligations.find(o => o.id === 'employer-payroll');
        expect(flag).toBeDefined();
        expect(flag!.label).toContain('2 active staff members');
    });

    it('ignores inactive staff when counting for the payroll flag', () => {
        const result = computeComplianceObligations(
            { ...baseSettings, legalEntityType: 'sole-proprietorship' },
            [makeStaff({ id: 's1', status: 'inactive' })],
        );
        expect(result.obligations.some(o => o.id === 'employer-payroll')).toBe(false);
    });
});
