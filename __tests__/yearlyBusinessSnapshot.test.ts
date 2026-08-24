import { computeYearlyBusinessSnapshot } from '../src/utils/trendAnalysis';
import { Transaction, Invoice, Asset } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2025-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Rent',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice>): Invoice => ({
    id: `inv-${Math.random()}`,
    invoiceNumber: 'INV-1',
    clientName: 'Acme',
    clientEmail: 'a@acme.com',
    clientAddress: '',
    issueDate: '2025-01-01',
    dueDate: '2025-01-31',
    lineItems: [],
    notes: '',
    status: 'paid',
    subtotal: 1000,
    taxTotal: 0,
    total: 1000,
    createdAt: '2025-01-01',
    ...overrides,
});

const makeAsset = (overrides: Partial<Asset>): Asset => ({
    id: `a-${Math.random()}`,
    name: 'Oven',
    category: 'equipment',
    purchaseDate: '2025-01-01',
    purchaseCost: 5000,
    usefulLifeYears: 5,
    residualValue: 0,
    status: 'active',
    ...overrides,
} as Asset);

describe('computeYearlyBusinessSnapshot', () => {
    it('counts unique customers from invoices issued that year', () => {
        const invoices = [
            makeInvoice({ issueDate: '2025-02-01', clientName: 'Acme' }),
            makeInvoice({ issueDate: '2025-05-01', clientName: 'Acme' }), // repeat customer
            makeInvoice({ issueDate: '2025-06-01', clientName: 'Beta' }),
            makeInvoice({ issueDate: '2026-01-01', clientName: 'Gamma' }), // different year
        ];
        const result = computeYearlyBusinessSnapshot(['2025', '2026'], [], invoices, []);
        expect(result[0].customers).toBe(2);
        expect(result[1].customers).toBe(1);
    });

    it('finds the top expense category by amount for the year', () => {
        const txs = [
            makeTx({ date: '2025-03-01', category: 'Rent', amount: 2000 }),
            makeTx({ date: '2025-04-01', category: 'Utilities', amount: 500 }),
            makeTx({ date: '2025-05-01', category: 'Utilities', amount: 700 }),
            makeTx({ date: '2025-06-01', type: 'income', category: 'Sales', amount: 999999 }), // income ignored
        ];
        const result = computeYearlyBusinessSnapshot(['2025'], txs, [], []);
        // Rent: 2000, Utilities: 1200 -- Rent wins
        expect(result[0].topExpenseCategory).toBe('Rent');
        expect(result[0].topExpenseCategoryAmount).toBe(2000);
    });

    it('sums receivables outstanding today only for unpaid invoices issued that year', () => {
        const invoices = [
            makeInvoice({ issueDate: '2025-01-01', status: 'paid', total: 1000 }),
            makeInvoice({ issueDate: '2025-02-01', status: 'overdue', total: 500 }),
            makeInvoice({ issueDate: '2025-03-01', status: 'sent', total: 250 }),
        ];
        const result = computeYearlyBusinessSnapshot(['2025'], [], invoices, []);
        expect(result[0].receivablesOutstandingToday).toBe(750);
    });

    it('sums assets purchased that year by purchaseDate, not current depreciated value', () => {
        const assets = [
            makeAsset({ purchaseDate: '2025-01-15', purchaseCost: 5000 }),
            makeAsset({ purchaseDate: '2025-11-01', purchaseCost: 3000 }),
            makeAsset({ purchaseDate: '2026-01-01', purchaseCost: 9000 }),
        ];
        const result = computeYearlyBusinessSnapshot(['2025', '2026'], [], [], assets);
        expect(result[0].assetsPurchased).toBe(8000);
        expect(result[1].assetsPurchased).toBe(9000);
    });

    it('returns nulls/zeros for a year with no matching data, not fabricated values', () => {
        const result = computeYearlyBusinessSnapshot(['2030'], [], [], []);
        expect(result[0].customers).toBe(0);
        expect(result[0].topExpenseCategory).toBeNull();
        expect(result[0].receivablesOutstandingToday).toBe(0);
        expect(result[0].assetsPurchased).toBe(0);
    });
});
