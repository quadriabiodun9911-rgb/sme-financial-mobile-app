import {
    canViewFinancials, isScreenAllowedForRole,
    canManageTeam, canManagePaymentSettings, canDeleteBusinessData, canPublishToLenders,
} from '../src/utils/rolePermissions';

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
    });

    it('allows staff to reach operational screens', () => {
        expect(isScreenAllowedForRole('dashboard', 'staff')).toBe(true);
        expect(isScreenAllowedForRole('transactions', 'staff')).toBe(true);
        expect(isScreenAllowedForRole('invoices', 'staff')).toBe(true);
        expect(isScreenAllowedForRole('inventory', 'staff')).toBe(true);
    });

    it('blocks staff from financial screens', () => {
        expect(isScreenAllowedForRole('reports', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('business-passport', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('cfo', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('settings', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('loans', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('assets', 'staff')).toBe(false);
        expect(isScreenAllowedForRole('payroll', 'staff')).toBe(false);
    });

    it('allows external_accountant to reach financial reporting screens', () => {
        expect(isScreenAllowedForRole('reports', 'external_accountant')).toBe(true);
        expect(isScreenAllowedForRole('reconciliation', 'external_accountant')).toBe(true);
        expect(isScreenAllowedForRole('business-passport', 'external_accountant')).toBe(true);
        expect(isScreenAllowedForRole('dashboard', 'external_accountant')).toBe(true);
    });

    it('blocks external_accountant from operational and owner/admin-only screens', () => {
        expect(isScreenAllowedForRole('invoices', 'external_accountant')).toBe(false);
        expect(isScreenAllowedForRole('inventory', 'external_accountant')).toBe(false);
        expect(isScreenAllowedForRole('payroll', 'external_accountant')).toBe(false);
        expect(isScreenAllowedForRole('settings', 'external_accountant')).toBe(false);
    });

    it('allows admin everywhere, same as owner', () => {
        expect(isScreenAllowedForRole('settings', 'admin')).toBe(true);
        expect(isScreenAllowedForRole('reports', 'admin')).toBe(true);
    });
});

describe('admin vs owner capability split', () => {
    it('grants admin team/payment/lender-publishing management, same as owner', () => {
        expect(canManageTeam('admin')).toBe(true);
        expect(canManagePaymentSettings('admin')).toBe(true);
        expect(canPublishToLenders('admin')).toBe(true);
    });

    it('reserves business-data deletion for owner only, even from admin', () => {
        expect(canDeleteBusinessData('owner')).toBe(true);
        expect(canDeleteBusinessData('admin')).toBe(false);
        expect(canDeleteBusinessData('accountant')).toBe(false);
    });

    it('denies manager/accountant/external_accountant/staff the owner/admin-only actions', () => {
        for (const role of ['manager', 'accountant', 'external_accountant', 'staff'] as const) {
            expect(canManageTeam(role)).toBe(false);
            expect(canManagePaymentSettings(role)).toBe(false);
            expect(canPublishToLenders(role)).toBe(false);
            expect(canDeleteBusinessData(role)).toBe(false);
        }
    });
});

describe('canViewFinancials for the new roles', () => {
    it('is true for admin and external_accountant', () => {
        expect(canViewFinancials('admin')).toBe(true);
        expect(canViewFinancials('external_accountant')).toBe(true);
    });
});
