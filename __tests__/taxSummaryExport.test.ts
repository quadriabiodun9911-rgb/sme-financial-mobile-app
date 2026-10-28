import { buildTaxSummaryExport, TAX_SUMMARY_DISCLAIMER } from '../src/utils/taxSummaryExport';
import { Transaction } from '../src/types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36), type: 'income', amount: 0, category: 'Sales',
        date: '2026-08-01', status: 'paid', description: 'Sale', ...overrides,
    } as Transaction;
}

describe('buildTaxSummaryExport', () => {
    const totals = { totalTaxCollected: 75000, totalTaxPaid: 22500, netTaxPosition: 52500, exemptSalesTotal: 0, zeroRatedSalesTotal: 0 };
    const taxByCategory = [{ label: 'Sales (income)', amount: 75000 }, { label: 'Supplies (expense)', amount: 22500 }];
    const periodTransactions = [
        tx({ id: 't1', date: '2026-08-05', description: 'Client invoice', type: 'income', amount: 1000000, taxRate: 7.5, taxAmount: 75000 }),
        tx({ id: 't2', date: '2026-08-10', description: 'Office supplies', type: 'expense', category: 'Supplies', amount: 300000, taxRate: 7.5, taxAmount: 22500 }),
        tx({ id: 't3', date: '2026-08-12', description: 'Cash sale, no tax recorded', type: 'income', amount: 50000 }),
    ];

    it('includes the period label in the title and the totals in the summary', () => {
        const r = buildTaxSummaryExport('For the period 1 August 2026 – 31 August 2026', totals, taxByCategory, periodTransactions, '₦');
        expect(r.title).toBe('Tax Summary — For the period 1 August 2026 – 31 August 2026');
        expect(r.summary?.find(s => s.label === 'Tax Collected (on income)')?.value).toBe('₦75,000');
        expect(r.summary?.find(s => s.label === 'Tax Paid (on expenses)')?.value).toBe('₦22,500');
        expect(r.summary?.find(s => s.label === 'Net Tax Position')?.value).toBe('+₦52,500');
    });

    it('computes the effective tax rate from taxable income, not all income', () => {
        const r = buildTaxSummaryExport('period', totals, taxByCategory, periodTransactions, '₦');
        // Only the 1,000,000 taxed income transaction counts as taxable income,
        // not the untaxed 50,000 cash sale -- 75,000 / 1,000,000 = 7.5%.
        expect(r.summary?.find(s => s.label === 'Effective Tax Rate on Revenue')?.value).toBe('7.50%');
    });

    it('maps taxByCategory into its own section', () => {
        const r = buildTaxSummaryExport('period', totals, taxByCategory, periodTransactions, '₦');
        const section = r.sections.find(s => s.name === 'Tax by Category');
        expect(section?.data).toHaveLength(2);
        expect(section?.data[0]).toEqual({ label: 'Sales (income)', value: '₦75,000' });
    });

    it('lists only transactions with a recorded tax amount, sorted by date, as the line-level backup', () => {
        const r = buildTaxSummaryExport('period', totals, taxByCategory, periodTransactions, '₦');
        const section = r.sections.find(s => s.name === 'Taxed Transactions');
        expect(section?.data).toHaveLength(2); // t3 has no taxAmount -- excluded
        expect(section?.data[0].label).toContain('2026-08-05');
        expect(section?.data[0].label).toContain('Client invoice');
        expect(section?.data[0].value).toBe('₦75,000');
    });

    it('shows a plain "no taxed transactions" line instead of an empty section when nothing is taxed', () => {
        const r = buildTaxSummaryExport('period', { totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0, exemptSalesTotal: 0, zeroRatedSalesTotal: 0 }, [], [tx({ taxAmount: undefined })], '₦');
        const section = r.sections.find(s => s.name === 'Taxed Transactions');
        expect(section?.data).toHaveLength(1);
        expect(section?.data[0].label).toContain('No transactions');
    });

    it('always includes the disclaimer as its own section', () => {
        const r = buildTaxSummaryExport('period', totals, taxByCategory, periodTransactions, '₦');
        const note = r.sections.find(s => s.name === 'Note');
        expect(note?.data[0].value).toBe(TAX_SUMMARY_DISCLAIMER);
    });
});
