import { parseLoanQuickAddText } from '../src/utils/loanQuickAddParser';

describe('parseLoanQuickAddText', () => {
    it('extracts lender, principal, rate, and term from the canonical phrasing', () => {
        const result = parseLoanQuickAddText('Borrowed 500000 from GTBank at 20% for 12 months');
        expect(result.principal).toBe(500000);
        expect(result.lenderName).toBe('GTBank');
        expect(result.interestRate).toBe(20);
        expect(result.termMonths).toBe(12);
    });

    it('converts a years term into months', () => {
        const result = parseLoanQuickAddText('500000 from First Bank at 15% for 2 years');
        expect(result.principal).toBe(500000);
        expect(result.lenderName).toBe('First Bank');
        expect(result.interestRate).toBe(15);
        expect(result.termMonths).toBe(24);
    });

    it('treats "interest free" as a 0% rate', () => {
        const result = parseLoanQuickAddText('Borrowed 100000 from Mama Ngozi interest free for 6 months');
        expect(result.principal).toBe(100000);
        expect(result.lenderName).toBe('Mama Ngozi');
        expect(result.interestRate).toBe(0);
        expect(result.termMonths).toBe(6);
    });

    it('does not mistake the rate or term for the principal', () => {
        const result = parseLoanQuickAddText('Borrowed 750000 from Access Bank at 18% for 36 months');
        expect(result.principal).toBe(750000);
    });

    it('returns nulls for rate/term and empty lender when absent', () => {
        const result = parseLoanQuickAddText('Borrowed 200000');
        expect(result.principal).toBe(200000);
        expect(result.lenderName).toBe('');
        expect(result.interestRate).toBeNull();
        expect(result.termMonths).toBeNull();
    });
});
