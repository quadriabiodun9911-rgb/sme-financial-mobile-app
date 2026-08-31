import { computeExpenseIntelligence } from '../src/utils/expenseIntelligence';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Software & Subscriptions',
    amount: 10000,
    status: 'paid',
    ...overrides,
});

// Builds `count` months of a flat amount for a category, starting `count`
// months before 2026-07 (the "current" anchor month used across these
// tests), so `computeExpenseIntelligence`'s 6-vs-6-month windows land
// cleanly.
function monthlyCategorySpend(category: string, amounts: number[], startMonth: string): Transaction[] {
    const [sy, sm] = startMonth.split('-').map(Number);
    return amounts.map((amount, i) => {
        const d = new Date(sy, (sm - 1) + i, 10);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return makeTx({ category, amount, date: `${key}-10` });
    });
}

describe('computeExpenseIntelligence', () => {
    it('is unavailable with fewer than 2x the window of months', () => {
        const txs = monthlyCategorySpend('Rent', [50000, 50000], '2026-01');
        const result = computeExpenseIntelligence(txs, '₦', 6);
        expect(result.available).toBe(false);
    });

    it('matches the product-vision example: a category growing faster than revenue', () => {
        // Prior 6 months: Software 100,000/mo total 600,000; revenue 1,000,000/mo total 6,000,000
        // Current 6 months: Software 137,000/mo total ~822,000 (+37%); revenue 1,080,000/mo (+8%)
        const priorSoftware = monthlyCategorySpend('Software & Subscriptions', Array(6).fill(100000), '2025-07');
        const currentSoftware = monthlyCategorySpend('Software & Subscriptions', Array(6).fill(137000), '2026-01');
        const priorRevenue = monthlyCategorySpend('Sales', Array(6).fill(1000000), '2025-07').map(t => ({ ...t, type: 'income' as const }));
        const currentRevenue = monthlyCategorySpend('Sales', Array(6).fill(1080000), '2026-01').map(t => ({ ...t, type: 'income' as const }));
        const txs = [...priorSoftware, ...currentSoftware, ...priorRevenue, ...currentRevenue];

        const result = computeExpenseIntelligence(txs, '₦', 6);
        expect(result.available).toBe(true);
        expect(result.revenueGrowthPct).toBeCloseTo(8, 0);
        const software = result.categories.find(c => c.category === 'Software & Subscriptions')!;
        expect(software.spendGrowthPct).toBeCloseTo(37, 0);
        expect(software.narrative).toMatch(/software & subscriptions increased 37% over 6 months while revenue increased 8%/i);
        expect(software.concern).toBe(true);
    });

    it('does not flag a category as a concern when its growth roughly tracks revenue growth', () => {
        const priorRent = monthlyCategorySpend('Rent', Array(6).fill(100000), '2025-07');
        const currentRent = monthlyCategorySpend('Rent', Array(6).fill(105000), '2026-01'); // +5%
        const priorRevenue = monthlyCategorySpend('Sales', Array(6).fill(1000000), '2025-07').map(t => ({ ...t, type: 'income' as const }));
        const currentRevenue = monthlyCategorySpend('Sales', Array(6).fill(1040000), '2026-01').map(t => ({ ...t, type: 'income' as const })); // +4%
        const txs = [...priorRent, ...currentRent, ...priorRevenue, ...currentRevenue];

        const result = computeExpenseIntelligence(txs, '₦', 6);
        const rent = result.categories.find(c => c.category === 'Rent')!;
        expect(rent.concern).toBe(false);
    });

    it('reports the monthly rate as current-window spend divided by the window length', () => {
        const current = monthlyCategorySpend('Payroll', Array(6).fill(800000), '2026-01');
        const prior = monthlyCategorySpend('Payroll', Array(6).fill(800000), '2025-07');
        const txs = [...current, ...prior];
        const result = computeExpenseIntelligence(txs, '₦', 6);
        const payroll = result.categories.find(c => c.category === 'Payroll')!;
        expect(payroll.monthlyRate).toBeCloseTo(800000, 0);
    });

    it('sorts categories by monthly rate descending', () => {
        const txs = [
            ...monthlyCategorySpend('Small', Array(6).fill(10000), '2025-07'),
            ...monthlyCategorySpend('Small', Array(6).fill(10000), '2026-01'),
            ...monthlyCategorySpend('Big', Array(6).fill(500000), '2025-07'),
            ...monthlyCategorySpend('Big', Array(6).fill(500000), '2026-01'),
        ];
        const result = computeExpenseIntelligence(txs, '₦', 6);
        expect(result.categories[0].category).toBe('Big');
    });

    it('describes a brand-new category distinctly from a growth percentage', () => {
        const txs = [
            ...monthlyCategorySpend('Rent', Array(6).fill(100000), '2025-07'),
            ...monthlyCategorySpend('Rent', Array(6).fill(100000), '2026-01'),
            ...monthlyCategorySpend('Legal Fees', Array(6).fill(50000), '2026-01'), // only in the current window
        ];
        const result = computeExpenseIntelligence(txs, '₦', 6);
        const legal = result.categories.find(c => c.category === 'Legal Fees')!;
        expect(legal.spendGrowthPct).toBeNull();
        expect(legal.narrative).toMatch(/new or newly-active expense category/i);
    });

    describe('expense tier classification', () => {
        // Same vendor key per category (vendorCustomer), distinct across
        // categories, so computeExpenseLeaks' vendor grouping never
        // collides two test categories into one recurring group.
        function categoryTx(category: string, vendor: string, amount: number, date: string, type: 'expense' | 'income' = 'expense'): Transaction {
            return makeTx({ category, vendorCustomer: vendor, amount, date, type });
        }

        it('classifies a category growing meaningfully faster than revenue as Review', () => {
            const priorSoftware = monthlyCategorySpend('Software & Subscriptions', Array(6).fill(100000), '2025-07');
            const currentSoftware = monthlyCategorySpend('Software & Subscriptions', Array(6).fill(137000), '2026-01');
            const priorRevenue = monthlyCategorySpend('Sales', Array(6).fill(1000000), '2025-07').map(t => ({ ...t, type: 'income' as const }));
            const currentRevenue = monthlyCategorySpend('Sales', Array(6).fill(1080000), '2026-01').map(t => ({ ...t, type: 'income' as const }));
            const txs = [...priorSoftware, ...currentSoftware, ...priorRevenue, ...currentRevenue];

            const result = computeExpenseIntelligence(txs, '₦', 6);
            const software = result.categories.find(c => c.category === 'Software & Subscriptions')!;
            expect(software.tier).toBe('review');
        });

        it('classifies a recurring vendor whose per-charge price has crept up as Reduce, when the category overall does not look concerning', () => {
            const priorAmounts = [90000, 100000, 100000, 100000, 100000, 100000];
            const currentAmounts = [100000, 100000, 100000, 100000, 100000, 115000];
            const hosting: Transaction[] = [];
            [...priorAmounts.map((a, i) => ({ a, m: `2025-${String(7 + i).padStart(2, '0')}` })),
             ...currentAmounts.map((a, i) => ({ a, m: `2026-${String(1 + i).padStart(2, '0')}` }))]
                .forEach(({ a, m }) => hosting.push(categoryTx('Hosting & Infrastructure', 'HostingCo', a, `${m}-10`)));
            const revenue = [
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2025-${String(7 + i).padStart(2, '0')}-05`, 'income')),
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2026-${String(1 + i).padStart(2, '0')}-05`, 'income')),
            ];
            const result = computeExpenseIntelligence([...hosting, ...revenue], '₦', 6);
            const hostingInsight = result.categories.find(c => c.category === 'Hosting & Infrastructure')!;
            expect(hostingInsight.concern).toBe(false);
            expect(hostingInsight.tier).toBe('reduce');
        });

        it('classifies a category growing alongside (not ahead of) revenue growth as Invest', () => {
            const priorAmounts = Array(6).fill(100000);
            const currentAmounts = Array(6).fill(110000); // +10%
            const marketing: Transaction[] = [
                ...priorAmounts.map((a, i) => categoryTx('Marketing', `Vendor${i}`, a, `2025-${String(7 + i).padStart(2, '0')}-10`)),
                ...currentAmounts.map((a, i) => categoryTx('Marketing', `Vendor${i}`, a, `2026-${String(1 + i).padStart(2, '0')}-10`)),
            ];
            const revenue = [
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2025-${String(7 + i).padStart(2, '0')}-05`, 'income')),
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1200000, `2026-${String(1 + i).padStart(2, '0')}-05`, 'income')), // +20%
            ];
            const result = computeExpenseIntelligence([...marketing, ...revenue], '₦', 6);
            const marketingInsight = result.categories.find(c => c.category === 'Marketing')!;
            expect(marketingInsight.concern).toBe(false);
            expect(marketingInsight.tier).toBe('invest');
        });

        it('classifies a flat, ongoing recurring category as Protect', () => {
            const rent = [
                ...Array(6).fill(0).map((_, i) => categoryTx('Rent', 'Landlord', 100000, `2025-${String(7 + i).padStart(2, '0')}-01`)),
                ...Array(6).fill(0).map((_, i) => categoryTx('Rent', 'Landlord', 100000, `2026-${String(1 + i).padStart(2, '0')}-01`)),
            ];
            const revenue = [
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2025-${String(7 + i).padStart(2, '0')}-05`, 'income')),
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2026-${String(1 + i).padStart(2, '0')}-05`, 'income')),
            ];
            const result = computeExpenseIntelligence([...rent, ...revenue], '₦', 6);
            const rentInsight = result.categories.find(c => c.category === 'Rent')!;
            expect(rentInsight.tier).toBe('protect');
        });

        it('falls back to Optimize for a flat, non-recurring (different vendor each month) category', () => {
            const misc = [
                ...Array(6).fill(0).map((_, i) => categoryTx('Miscellaneous', `Vendor${i}`, 20000, `2025-${String(7 + i).padStart(2, '0')}-15`)),
                ...Array(6).fill(0).map((_, i) => categoryTx('Miscellaneous', `Vendor${6 + i}`, 20000, `2026-${String(1 + i).padStart(2, '0')}-15`)),
            ];
            const revenue = [
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2025-${String(7 + i).padStart(2, '0')}-05`, 'income')),
                ...Array(6).fill(0).map((_, i) => categoryTx('Sales', 'Customer', 1000000, `2026-${String(1 + i).padStart(2, '0')}-05`, 'income')),
            ];
            const result = computeExpenseIntelligence([...misc, ...revenue], '₦', 6);
            const miscInsight = result.categories.find(c => c.category === 'Miscellaneous')!;
            expect(miscInsight.tier).toBe('optimize');
        });
    });
});
