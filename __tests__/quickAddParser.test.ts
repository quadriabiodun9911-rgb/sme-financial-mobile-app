import { parseQuickAddText } from '../src/utils/quickAddParser';

describe('parseQuickAddText', () => {
    it('extracts a plain amount and expense direction', () => {
        const result = parseQuickAddText('Paid transport 2000');
        expect(result.amount).toBe(2000);
        expect(result.type).toBe('expense');
        expect(result.confidentType).toBe(true);
        expect(result.description.toLowerCase()).toContain('transport');
    });

    it('picks the largest number as the amount, not an earlier quantity', () => {
        const result = parseQuickAddText('Sold 3 bags of rice for 15000');
        expect(result.amount).toBe(15000);
        expect(result.type).toBe('income');
        expect(result.confidentType).toBe(true);
    });

    it('expands a k suffix into thousands', () => {
        const result = parseQuickAddText('Sold 2 phones for 45k');
        expect(result.amount).toBe(45000);
        expect(result.type).toBe('income');
    });

    it('handles a currency-prefixed, comma-grouped amount', () => {
        const result = parseQuickAddText('Paid rent ₦120,000');
        expect(result.amount).toBe(120000);
        expect(result.type).toBe('expense');
    });

    it('flags direction as unconfident when no direction word is present', () => {
        const result = parseQuickAddText('Chidinma 5000');
        expect(result.confidentType).toBe(false);
    });

    it('flags direction as unconfident when income and expense words tie', () => {
        const result = parseQuickAddText('paid received 5000');
        expect(result.confidentType).toBe(false);
    });

    it('returns null amount when no number is present', () => {
        const result = parseQuickAddText('Client payment');
        expect(result.amount).toBeNull();
    });

    it('strips the amount out of the description', () => {
        const result = parseQuickAddText('Sold rice for 15000');
        expect(result.description.toLowerCase()).not.toContain('15000');
        expect(result.description.toLowerCase()).toContain('rice');
    });
});
