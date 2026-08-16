import { Transaction, Invoice } from '../src/types';
import { detectAlerts, detectCriticalAlerts, getAlertStats, detectFinancialAlerts, DEFAULT_THRESHOLDS } from '../src/utils/alertEngine';

const overdueInvoice: Invoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    clientName: 'Acme Co',
    clientEmail: 'a@acme.com',
    clientAddress: '1 Main St',
    issueDate: '2026-06-01',
    dueDate: '2026-06-15', // well past overdueInvoiceThreshold (7 days) relative to any test "today"
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 50000,
    taxTotal: 0,
    total: 50000,
    createdAt: '2026-06-01T00:00:00.000Z',
};

describe('alertEngine', () => {
    describe('detectAlerts', () => {
        it('flags low cash when below threshold', () => {
            const alerts = detectAlerts(100000, [], [], undefined, undefined, undefined, '₦');
            expect(alerts.some(a => a.type === 'low_cash')).toBe(true);
        });

        it('does not flag low cash when above threshold', () => {
            const alerts = detectAlerts(DEFAULT_THRESHOLDS.lowCashThreshold + 1, [], [], undefined, undefined, undefined, '₦');
            expect(alerts.some(a => a.type === 'low_cash')).toBe(false);
        });

        it('flags overdue invoices past the threshold', () => {
            const alerts = detectAlerts(1000000, [], [overdueInvoice]);
            const overdue = alerts.find(a => a.type === 'overdue_invoice');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe('alert-overdue-inv-1');
        });

        it('never surfaces a paid invoice as overdue', () => {
            const alerts = detectAlerts(1000000, [], [{ ...overdueInvoice, status: 'paid' }]);
            expect(alerts.some(a => a.type === 'overdue_invoice')).toBe(false);
        });

        it('filters out dismissed alert ids', () => {
            const alerts = detectAlerts(100000, [], [], undefined, undefined, ['alert-low-cash'], '₦');
            expect(alerts.some(a => a.type === 'low_cash')).toBe(false);
        });

        // Regression test: detectLowCashAlert/detectNegativeForecastAlert/
        // detectLargeExpenseAlert used to mint a fresh Date.now()-based id on
        // every call, so a dismissal recorded against one computation's id
        // never matched the next computation's id and the alert reappeared
        // immediately -- dismissal was silently a no-op in the running app.
        it('produces a stable id for the same singleton alert across repeated calls', () => {
            const first = detectAlerts(100000, [], [], undefined, undefined, undefined, '₦');
            const second = detectAlerts(100000, [], [], undefined, undefined, undefined, '₦');
            const firstLowCash = first.find(a => a.type === 'low_cash');
            const secondLowCash = second.find(a => a.type === 'low_cash');
            expect(firstLowCash?.id).toBe(secondLowCash?.id);
        });
    });

    describe('detectCriticalAlerts', () => {
        it('only returns high-priority alerts', () => {
            const alerts = detectCriticalAlerts(1000, [], [overdueInvoice], undefined, '₦');
            expect(alerts.every(a => a.priority === 'high')).toBe(true);
        });
    });

    describe('getAlertStats', () => {
        it('tallies alerts by priority', () => {
            const stats = getAlertStats([
                { id: '1', type: 'low_cash', priority: 'high', title: '', description: '', createdAt: '' },
                { id: '2', type: 'low_cash', priority: 'medium', title: '', description: '', createdAt: '' },
                { id: '3', type: 'low_cash', priority: 'low', title: '', description: '', createdAt: '' },
            ]);
            expect(stats).toEqual({ high: 1, medium: 1, low: 1, total: 3 });
        });
    });

    describe('detectFinancialAlerts', () => {
        it('builds a forecast from transactions/invoices and folds it into the alert set', () => {
            const recurringExpense: Transaction = {
                id: 'tx-1',
                date: '2026-01-01',
                description: 'Rent',
                type: 'expense',
                category: 'rent',
                amount: 2000000,
                isRecurring: true,
                recurringFrequency: 'monthly',
            };
            // Cash far below a rent-sized recurring expense should eventually
            // drive the base-case forecast negative.
            const alerts = detectFinancialAlerts(50000, [recurringExpense], [], '₦');
            expect(alerts.length).toBeGreaterThan(0);
        });

        it('is a pure function of its inputs (no hidden state between calls)', () => {
            const a = detectFinancialAlerts(100000, [], [], '₦');
            const b = detectFinancialAlerts(100000, [], [], '₦');
            expect(a.map(x => x.id)).toEqual(b.map(x => x.id));
        });
    });
});
