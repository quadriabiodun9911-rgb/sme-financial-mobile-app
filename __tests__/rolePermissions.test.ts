import { canViewFinancials, isScreenAllowedForRole } from '../src/utils/rolePermissions';

describe('canViewFinancials', () => {
    it('is true for owner and accountant', () => {
        expect(canViewFinancials('owner')).toBe(true);
        expect(canViewFinancials('accountant')).toBe(true);
    });

    it('is false for staff', () => {
        expect(canViewFinancials('staff')).toBe(false);
    });
});

describe('isScreenAllowedForRole', () => {
    it('allows owner and accountant everywhere', () => {
        expect(isScreenAllowedForRole('reports', 'owner')).toBe(true);
        expect(isScreenAllowedForRole('reports', 'accountant')).toBe(true);
        expect(isScreenAllowedForRole('weekly-dashboard', 'accountant')).toBe(true);
    });

    it('allows staff to reach operational screens', () => {
        expect(isScreenAllowedForRole('dashboard', 'staff')).toBe(true);
        expect(isScreenAllowedForRole('transactions', 'staff')).toBe(true);
        expect(isScreenAllowedForRole('invoices', 'staff')).toBe(true);
        expect(isScreenAllowedForRole('inventory', 'staff')).toBe(true);
    });

    it('blocks staff from financial screens', () => {
        expect(isScreenAllowedForRole('reports', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('weekly-dashboard', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('clarity', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('cfo', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('settings', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('loans', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('assets', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('payroll', 'staff')).toBe(false);
    });
});
