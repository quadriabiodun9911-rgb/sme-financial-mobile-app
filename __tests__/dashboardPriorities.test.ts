import { Invoice, InventoryItem, Loan } from '../src/types';
import { ForecastAlert } from '../src/types/forecast';
import { FinancingRecommendation } from '../src/utils/financingRecommendation';
import { buildDashboardPriorities, OverspentBudget } from '../src/utils/dashboardPriorities';

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    clientName: 'Acme',
    clientEmail: 'a@acme.com',
    clientAddress: '1 Main St',
    issueDate: '2026-06-01',
    dueDate: '2026-06-15',
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 100000,
    taxTotal: 0,
    total: 100000,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
});

const loan = (overrides: Partial<Loan> = {}): Loan => ({
    id: 'loan-1',
    lenderName: 'First Bank',
    purpose: 'Working capital',
    principal: 500000,
    interestRate: 15,
    termMonths: 12,
    startDate: '2026-01-01',
    status: 'active',
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const alert = (overrides: Partial<ForecastAlert> = {}): ForecastAlert => ({
    id: 'alert-x',
    type: 'low_cash',
    priority: 'high',
    title: '⚠️ Low Cash Balance',
    description: 'desc',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
});

describe('buildDashboardPriorities', () => {
    it('returns an empty list when nothing is flagged', () => {
        const result = buildDashboardPriorities({
            alerts: [], overdueInvoices: [], lowStockItems: [], overspentBudgets: [],
            financingOpportunity: null, currency: '₦',
        });
        expect(result).toEqual([]);
    });

    it('excludes overdue_invoice alerts to avoid double-counting the aggregated card', () => {
        const result = buildDashboardPriorities({
            alerts: [alert({ id: 'alert-overdue-inv-1', type: 'overdue_invoice', title: 'Overdue' })],
            overdueInvoices: [invoice()],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        // Only the aggregated overdue-invoices item, not a second copy from the alert.
        expect(result.filter(p => p.kind === 'overdue_invoices' || p.title.includes('Overdue')).length).toBe(1);
    });

    it('sorts high-priority alerts into the attention tier and medium into watch', () => {
        const result = buildDashboardPriorities({
            alerts: [
                alert({ id: 'a1', type: 'low_cash', priority: 'high' }),
                alert({ id: 'a2', type: 'large_expense_coming', priority: 'medium' }),
            ],
            overdueInvoices: [], lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        expect(result.find(p => p.id === 'a1')?.tier).toBe('attention');
        expect(result.find(p => p.id === 'a2')?.tier).toBe('watch');
    });

    it('places overdue invoices in the attention tier with the total as impact', () => {
        const result = buildDashboardPriorities({
            alerts: [], overdueInvoices: [invoice({ total: 250000 }), invoice({ id: 'inv-2', total: 100000 })],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        const item = result.find(p => p.kind === 'overdue_invoices');
        expect(item?.tier).toBe('attention');
        expect(item?.impactAmount).toBe(350000);
        expect(item?.title).toBe('2 Customers Overdue');
    });

    it('sorts within a tier by impact amount, descending', () => {
        const smallOverdue = invoice({ total: 10000 });
        const bigLowCash = alert({ id: 'low-cash', type: 'low_cash', priority: 'high', amount: 900000 });
        const result = buildDashboardPriorities({
            alerts: [bigLowCash], overdueInvoices: [smallOverdue],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        expect(result[0].id).toBe('low-cash');
        expect(result[1].kind).toBe('overdue_invoices');
    });

    it('always ranks attention above watch above opportunity, regardless of impact size', () => {
        const overspent: OverspentBudget = { id: 'b1', category: 'Marketing', monthlyAmount: 50000, period: '2026-08', spent: 900000, overage: 850000 };
        const result = buildDashboardPriorities({
            alerts: [alert({ id: 'small-attention', type: 'low_cash', priority: 'high', amount: 1 })],
            overdueInvoices: [], lowStockItems: [], overspentBudgets: [overspent],
            financingOpportunity: null, currency: '₦',
        });
        expect(result[0].tier).toBe('attention');
        expect(result[1].tier).toBe('watch');
    });

    it('never fabricates a dollar impact for low stock', () => {
        const item: InventoryItem = {
            id: 'i1', name: 'Widget', category: 'General', quantity: 1, unit: 'pcs',
            costPrice: 100, sellingPrice: 150, lowStockThreshold: 5,
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        };
        const result = buildDashboardPriorities({
            alerts: [], overdueInvoices: [], lowStockItems: [item], overspentBudgets: [],
            financingOpportunity: null, currency: '₦',
        });
        expect(result[0].impactAmount).toBe(0);
        expect(result[0].tier).toBe('watch');
    });

    it('breaks ties within a tier toward the stated primaryGoal, even against a smaller impact', () => {
        const overspent: OverspentBudget = { id: 'b1', category: 'Rent', monthlyAmount: 50000, period: '2026-08', spent: 60000, overage: 10000 };
        const result = buildDashboardPriorities({
            // Both watch-tier: the overspent budget has a small overage, the
            // large-expense alert a big one.
            alerts: [alert({ id: 'big-watch', type: 'large_expense_coming', priority: 'medium', amount: 900000 })],
            overdueInvoices: [], lowStockItems: [], overspentBudgets: [overspent],
            financingOpportunity: null, currency: '₦',
            primaryGoal: 'costs',
        });
        // Without a goal the ₦900k expense alert would sort first on impact
        // alone. With primaryGoal 'costs', the smaller overspent-budget item
        // -- the kind that actually maps to "costs" -- sorts first instead,
        // within the same watch tier.
        expect(result[0].kind).toBe('overspent_budget');
        expect(result[1].kind).toBe('large_expense_coming');
    });

    it('never lets a preferred kind jump above a higher tier', () => {
        const overspent: OverspentBudget = { id: 'b1', category: 'Rent', monthlyAmount: 50000, period: '2026-08', spent: 60000, overage: 10000 };
        const result = buildDashboardPriorities({
            alerts: [alert({ id: 'attention-item', type: 'low_cash', priority: 'high' })],
            overdueInvoices: [], lowStockItems: [], overspentBudgets: [overspent],
            financingOpportunity: null, currency: '₦',
            primaryGoal: 'costs', // matches overspent_budget (watch), not low_cash (attention)
        });
        expect(result[0].tier).toBe('attention');
        expect(result[0].kind).toBe('low_cash');
    });

    it('leaves ordering exactly as before when no primaryGoal is set', () => {
        const bigLowCash = alert({ id: 'low-cash', type: 'low_cash', priority: 'high', amount: 900000 });
        const result = buildDashboardPriorities({
            alerts: [bigLowCash], overdueInvoices: [invoice({ total: 10000 })],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        expect(result[0].id).toBe('low-cash');
        expect(result[1].kind).toBe('overdue_invoices');
    });

    it('surfaces a financing opportunity in the opportunity tier', () => {
        const financingOpportunity: FinancingRecommendation = {
            productType: 'invoice_financing', label: 'Invoice Financing', confidence: 'strong', reasons: ['Strong receivables'],
        };
        const result = buildDashboardPriorities({
            alerts: [], overdueInvoices: [], lowStockItems: [], overspentBudgets: [],
            financingOpportunity,
            currency: '₦',
        });
        expect(result[0].tier).toBe('opportunity');
        expect(result[0].title).toContain('Invoice Financing');
    });

    it('aggregates overdue loan payments into a single attention-tier card', () => {
        const result = buildDashboardPriorities({
            alerts: [], overdueInvoices: [],
            overdueLoans: [loan({ id: 'loan-1', principal: 500000, interestRate: 15, termMonths: 12 })],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        const item = result.find(p => p.kind === 'overdue_loan_payments');
        expect(item).toBeDefined();
        expect(item?.tier).toBe('attention');
        expect(item?.subtitle).toContain('First Bank');
        expect(item?.impactAmount).toBeGreaterThan(0);
    });

    it('names the single lender when only one loan is overdue, and generalizes for multiple', () => {
        const single = buildDashboardPriorities({
            alerts: [], overdueInvoices: [], overdueLoans: [loan({ id: 'loan-1', lenderName: 'First Bank' })],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        expect(single.find(p => p.kind === 'overdue_loan_payments')?.subtitle).toContain('First Bank');

        const multiple = buildDashboardPriorities({
            alerts: [], overdueInvoices: [],
            overdueLoans: [loan({ id: 'loan-1', lenderName: 'First Bank' }), loan({ id: 'loan-2', lenderName: 'Coop Bank' })],
            lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        expect(multiple.find(p => p.kind === 'overdue_loan_payments')?.subtitle).toContain('your lenders');
    });

    it('defaults to no overdue-loan card when overdueLoans is omitted', () => {
        const result = buildDashboardPriorities({
            alerts: [], overdueInvoices: [], lowStockItems: [], overspentBudgets: [], financingOpportunity: null, currency: '₦',
        });
        expect(result.some(p => p.kind === 'overdue_loan_payments')).toBe(false);
    });

});
