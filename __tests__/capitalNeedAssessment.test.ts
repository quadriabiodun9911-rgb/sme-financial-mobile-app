import { assessCapitalNeed, CAPITAL_PURPOSE_PRODUCT_TYPES, CAPITAL_PURPOSE_LABELS } from '../src/utils/capitalNeedAssessment';

describe('assessCapitalNeed', () => {
    it('reports not enough history when affordable capacity is zero', () => {
        const r = assessCapitalNeed(5000000, 0, 0);
        expect(r.withinCapacity).toBeNull();
        expect(r.message).toContain('Not enough transaction history');
    });

    it('shows a sustainable range when no amount has been requested yet', () => {
        const r = assessCapitalNeed(undefined, 1000000, 3000000, '₦');
        expect(r.withinCapacity).toBeNull();
        expect(r.suggestedAmount).toBeNull();
        expect(r.message).toContain('₦1,000,000');
        expect(r.message).toContain('₦3,000,000');
    });

    it('confirms a request that fits within capacity', () => {
        const r = assessCapitalNeed(2000000, 1000000, 3000000, '₦');
        expect(r.withinCapacity).toBe(true);
        expect(r.suggestedAmount).toBeNull();
        expect(r.message).toContain('within what your current cash flow');
    });

    it('suggests the affordable max when the request exceeds capacity', () => {
        const r = assessCapitalNeed(10000000, 1000000, 5000000, '₦');
        expect(r.withinCapacity).toBe(false);
        expect(r.suggestedAmount).toBe(5000000);
        expect(r.message).toContain('₦5,000,000 appears more sustainable than ₦10,000,000');
    });

    it('treats a request exactly at the affordable max as within capacity', () => {
        const r = assessCapitalNeed(5000000, 1000000, 5000000);
        expect(r.withinCapacity).toBe(true);
    });
});

describe('CAPITAL_PURPOSE_PRODUCT_TYPES', () => {
    it('has a mapping for every declared purpose', () => {
        const purposes = Object.keys(CAPITAL_PURPOSE_LABELS);
        for (const p of purposes) {
            expect(CAPITAL_PURPOSE_PRODUCT_TYPES[p as keyof typeof CAPITAL_PURPOSE_PRODUCT_TYPES].length).toBeGreaterThan(0);
        }
    });
});
