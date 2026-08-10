import { FinancingProduct } from '../src/types';

// A single mutable response the mocked `from()` chain resolves to --
// set per test before calling the function under test.
let mockResponse: { data: any; error: any } = { data: null, error: null };

jest.mock('../src/utils/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: () => ({
                eq: () => ({ order: () => Promise.resolve(mockResponse) }),
                order: () => Promise.resolve(mockResponse),
            }),
            upsert: () => Promise.resolve(mockResponse),
            delete: () => ({ eq: () => Promise.resolve(mockResponse) }),
        })),
    },
}));

import {
    isFinancingAdmin, loadActiveFinancingProducts, loadAllFinancingProductsForAdmin,
    saveFinancingProduct, deleteFinancingProduct,
} from '../src/utils/financingAdmin';

describe('isFinancingAdmin', () => {
    it('recognizes the admin email', () => {
        expect(isFinancingAdmin('quadriabiodun9911@gmail.com')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(isFinancingAdmin('Quadriabiodun9911@Gmail.com')).toBe(true);
    });

    it('rejects any other email', () => {
        expect(isFinancingAdmin('someone-else@example.com')).toBe(false);
    });

    it('rejects undefined/null/empty', () => {
        expect(isFinancingAdmin(undefined)).toBe(false);
        expect(isFinancingAdmin(null)).toBe(false);
        expect(isFinancingAdmin('')).toBe(false);
    });
});

const sampleRow = {
    id: 'p1',
    lender_name: 'Test Bank',
    lender_type: 'bank',
    product_type: 'term_loan',
    product_name: 'Test Loan',
    description: 'A test product',
    min_amount: 100000,
    max_amount: 1000000,
    min_term_months: 6,
    max_term_months: 24,
    interest_rate_min_pct: 10,
    interest_rate_max_pct: 20,
    eligibility: { minMonthlyRevenue: 50000 },
    status: 'active',
    owner_user_id: null,
    created_by: 'quadriabiodun9911@gmail.com',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
};

describe('loadActiveFinancingProducts / loadAllFinancingProductsForAdmin', () => {
    it('maps snake_case rows to FinancingProduct on success', async () => {
        mockResponse = { data: [sampleRow], error: null };
        const result = await loadActiveFinancingProducts();
        expect(result).toHaveLength(1);
        expect(result![0]).toMatchObject({
            id: 'p1',
            lenderName: 'Test Bank',
            lenderType: 'bank',
            productType: 'term_loan',
            minAmount: 100000,
            eligibility: { minMonthlyRevenue: 50000 },
            status: 'active',
        });
    });

    it('returns null (not an empty array or throw) on a query error, so callers can fall back to the sample list', async () => {
        mockResponse = { data: null, error: { message: 'relation "financing_products" does not exist' } };
        expect(await loadActiveFinancingProducts()).toBeNull();
        expect(await loadAllFinancingProductsForAdmin()).toBeNull();
    });
});

describe('saveFinancingProduct / deleteFinancingProduct', () => {
    const product: FinancingProduct = {
        id: 'p1',
        lenderName: 'Test Bank',
        lenderType: 'bank',
        productType: 'term_loan',
        productName: 'Test Loan',
        description: '',
        minAmount: 100000,
        maxAmount: 1000000,
        minTermMonths: 6,
        maxTermMonths: 24,
        interestRateMinPct: 10,
        interestRateMaxPct: 20,
        eligibility: {},
    };

    it('returns no error on a successful save', async () => {
        mockResponse = { data: null, error: null };
        const result = await saveFinancingProduct(product, 'quadriabiodun9911@gmail.com');
        expect(result.error).toBeUndefined();
    });

    it('surfaces the Supabase error message on a failed save (e.g. blocked by RLS)', async () => {
        mockResponse = { data: null, error: { message: 'new row violates row-level security policy' } };
        const result = await saveFinancingProduct(product, 'not-an-admin@example.com');
        expect(result.error).toBe('new row violates row-level security policy');
    });

    it('returns no error on a successful delete', async () => {
        mockResponse = { data: null, error: null };
        expect((await deleteFinancingProduct('p1')).error).toBeUndefined();
    });

    it('surfaces the Supabase error message on a failed delete', async () => {
        mockResponse = { data: null, error: { message: 'permission denied' } };
        expect((await deleteFinancingProduct('p1')).error).toBe('permission denied');
    });
});
