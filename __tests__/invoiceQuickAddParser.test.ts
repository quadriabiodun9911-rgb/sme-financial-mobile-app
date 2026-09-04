import { parseInvoiceQuickAddText } from '../src/utils/invoiceQuickAddParser';

describe('parseInvoiceQuickAddText', () => {
    it('extracts client, amount, description, and a relative due date', () => {
        const result = parseInvoiceQuickAddText('Invoice Chidinma 45000 for rice due in 7 days');
        expect(result.clientName).toBe('Chidinma');
        expect(result.amount).toBe(45000);
        expect(result.description).toBe('rice');
        expect(result.dueInDays).toBe(7);
    });

    it('converts a due-in-weeks phrase into days', () => {
        const result = parseInvoiceQuickAddText('Bill Acme Corp 200000 for consulting due in 2 weeks');
        expect(result.clientName).toBe('Acme Corp');
        expect(result.amount).toBe(200000);
        expect(result.description).toBe('consulting');
        expect(result.dueInDays).toBe(14);
    });

    it('handles a client and amount with no description or due date', () => {
        const result = parseInvoiceQuickAddText('Invoice Chidinma 20000');
        expect(result.clientName).toBe('Chidinma');
        expect(result.amount).toBe(20000);
        expect(result.description).toBe('');
        expect(result.dueInDays).toBeNull();
    });

    it('works without a leading verb', () => {
        const result = parseInvoiceQuickAddText('Mama Ngozi 15000 for fabric due in 3 days');
        expect(result.clientName).toBe('Mama Ngozi');
        expect(result.amount).toBe(15000);
        expect(result.description).toBe('fabric');
        expect(result.dueInDays).toBe(3);
    });
});
