import { Transaction, Invoice, Loan, StaffMember, PayrollRun, FinancialGoal, Budget, Asset, InventoryItem } from '../src/types';
import { detectAlerts, detectCriticalAlerts, getAlertStats, detectFinancialAlerts, DEFAULT_THRESHOLDS } from '../src/utils/alertEngine';

// startDate expressed relative to the real current date (matching how
// overdueInvoice above is "well past" threshold relative to "any test
// today") since detectAlerts has no injectable `now` -- it always compares
// against the real clock.
function isoMonthsAgo(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
}
function isoDaysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevPeriod(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
    return {
        id: 'staff-1',
        name: 'Amaka Obi',
        role: 'Sales Assistant',
        salary: 80000,
        salaryType: 'monthly',
        startDate: isoMonthsAgo(6),
        status: 'active',
        createdAt: isoMonthsAgo(6) + 'T00:00:00.000Z',
        ...overrides,
    };
}

function makeRun(period: string): PayrollRun {
    return {
        id: `run-${period}`,
        period,
        runDate: `${period}-05`,
        items: [],
        totalGross: 80000,
        totalDeductions: 4000,
        totalNet: 76000,
        status: 'paid',
        createdAt: `${period}-05T00:00:00.000Z`,
    };
}

function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        date: isoDaysAgo(20),
        description: 'Cash sale — bulk order',
        type: 'income',
        category: 'Sales',
        amount: 45000,
        ...overrides,
    };
}

function makeLoan(overrides: Partial<Loan>): Loan {
    return {
        id: 'loan-1',
        lenderName: 'First Bank',
        purpose: 'Working capital',
        principal: 500000,
        interestRate: 15,
        termMonths: 12,
        startDate: isoMonthsAgo(3),
        status: 'active',
        payments: [],
        createdAt: isoMonthsAgo(3) + 'T00:00:00.000Z',
        ...overrides,
    };
}

function makeGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
    return {
        id: 'goal-1',
        type: 'revenue_growth',
        title: 'Increase Revenue by 20%',
        description: 'Grow total income by at least 20%.',
        targetValue: 1200000,
        unit: '₦',
        baselineValue: 1000000,
        currentValue: 1000000,
        deadline: isoDaysFromNow(30),
        createdAt: isoMonthsAgo(3),
        status: 'on_track',
        progress: 0,
        ...overrides,
    };
}

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

    describe('loan payment alerts', () => {
        it('flags an active loan whose implied schedule has passed with no payment logged', () => {
            const loan = makeLoan({ startDate: isoMonthsAgo(3) }); // due 2 months ago, 0 payments
            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            const overdue = alerts.find(a => a.type === 'loan_payment_overdue');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe('alert-loan-overdue-loan-1');
            expect(overdue?.priority).toBe('high'); // ~60 days overdue
        });

        it('warns when a payment is coming due soon but not yet overdue', () => {
            const dueIn2Days = new Date();
            dueIn2Days.setDate(dueIn2Days.getDate() + 2);
            const start = new Date(dueIn2Days);
            start.setMonth(start.getMonth() - 1);
            const loan = makeLoan({ startDate: start.toISOString().split('T')[0] });

            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            expect(alerts.some(a => a.type === 'loan_payment_overdue')).toBe(false);
            const dueSoon = alerts.find(a => a.type === 'loan_payment_due_soon');
            expect(dueSoon).toBeDefined();
            expect(dueSoon?.id).toBe('alert-loan-due-soon-loan-1');
        });

        it('never flags a loan that is not active, even if its schedule would say overdue', () => {
            const loan = makeLoan({ startDate: isoMonthsAgo(3), status: 'paid_off' });
            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            expect(alerts.some(a => a.type.startsWith('loan_payment'))).toBe(false);
        });

        it('a logged payment advances the schedule and clears the overdue alert', () => {
            // 1 month elapsed, but one payment already logged -- next due
            // date is 2 months out from start, i.e. still in the future.
            const loan = makeLoan({
                startDate: isoMonthsAgo(1),
                payments: [{ id: 'p1', date: isoMonthsAgo(1), amount: 40000 }],
            });
            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            expect(alerts.some(a => a.type.startsWith('loan_payment'))).toBe(false);
        });

        it('defaults to no loan alerts when no loans are passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type.startsWith('loan_payment'))).toBe(false);
        });
    });

    describe('overdue transaction alerts', () => {
        it('flags an overdue income transaction not linked to any invoice', () => {
            const tx = makeTx({ status: 'overdue' });
            const alerts = detectAlerts(1000000, [tx], []);
            const found = alerts.find(a => a.type === 'overdue_transaction');
            expect(found).toBeDefined();
            expect(found?.id).toBe('alert-overdue-tx-tx-1');
        });

        it('flags a pending transaction whose dueDate has passed', () => {
            const tx = makeTx({ status: 'pending', dueDate: isoDaysAgo(10) });
            const alerts = detectAlerts(1000000, [tx], []);
            expect(alerts.some(a => a.type === 'overdue_transaction')).toBe(true);
        });

        it('never flags an expense transaction', () => {
            const tx = makeTx({ type: 'expense', status: 'overdue' });
            const alerts = detectAlerts(1000000, [tx], []);
            expect(alerts.some(a => a.type === 'overdue_transaction')).toBe(false);
        });

        it('excludes a transaction linked to an already-alerted overdue invoice', () => {
            const linkedTx = makeTx({ status: 'overdue', reference: overdueInvoice.invoiceNumber });
            const alerts = detectAlerts(1000000, [linkedTx], [overdueInvoice]);
            // Should see the invoice's own alert, but not a second alert for the linked transaction.
            expect(alerts.some(a => a.type === 'overdue_invoice')).toBe(true);
            expect(alerts.some(a => a.type === 'overdue_transaction')).toBe(false);
        });

        it('still flags an unlinked overdue transaction alongside a genuinely separate overdue invoice', () => {
            const unlinkedTx = makeTx({ id: 'tx-2', status: 'overdue', reference: undefined });
            const alerts = detectAlerts(1000000, [unlinkedTx], [overdueInvoice]);
            expect(alerts.some(a => a.type === 'overdue_invoice')).toBe(true);
            expect(alerts.some(a => a.type === 'overdue_transaction')).toBe(true);
        });
    });

    describe('payroll alerts', () => {
        it('flags overdue when the previous month was never run', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [],
                [makeStaff()], []
            );
            const overdue = alerts.find(a => a.type === 'payroll_overdue');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe(`alert-payroll-overdue-${prevPeriod()}`);
            expect(overdue?.priority).toBe('high');
        });

        it('flags due_soon when the current month is late and previous month is covered', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, { payrollDueSoonDay: 1 }, undefined, '₦', [],
                [makeStaff()], [makeRun(prevPeriod())]
            );
            expect(alerts.some(a => a.type === 'payroll_overdue')).toBe(false);
            const dueSoon = alerts.find(a => a.type === 'payroll_due_soon');
            expect(dueSoon).toBeDefined();
            expect(dueSoon?.id).toBe(`alert-payroll-due-soon-${currentPeriod()}`);
            expect(dueSoon?.priority).toBe('medium');
        });

        it('produces no payroll alert once both months are covered', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, { payrollDueSoonDay: 1 }, undefined, '₦', [],
                [makeStaff()], [makeRun(prevPeriod()), makeRun(currentPeriod())]
            );
            expect(alerts.some(a => a.type.startsWith('payroll'))).toBe(false);
        });

        it('never flags payroll when there is no active staff', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [],
                [makeStaff({ status: 'inactive' })], []
            );
            expect(alerts.some(a => a.type.startsWith('payroll'))).toBe(false);
        });

        it('defaults to no payroll alerts when no staff/payrollRuns are passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type.startsWith('payroll'))).toBe(false);
        });
    });

    describe('tax deadline alerts', () => {
        it('flags overdue for a deadline in the past', () => {
            const deadline = isoDaysFromNow(-3);
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], deadline
            );
            const overdue = alerts.find(a => a.type === 'tax_deadline_overdue');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe(`alert-tax-deadline-overdue-${deadline}`);
            expect(overdue?.priority).toBe('high');
        });

        it('flags due_soon (high priority) for a deadline within 3 days', () => {
            const deadline = isoDaysFromNow(2);
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], deadline
            );
            const dueSoon = alerts.find(a => a.type === 'tax_deadline_due_soon');
            expect(dueSoon).toBeDefined();
            expect(dueSoon?.id).toBe(`alert-tax-deadline-due-soon-${deadline}`);
            expect(dueSoon?.priority).toBe('high');
        });

        it('flags due_soon (medium priority) for a deadline further out but still within the window', () => {
            const deadline = isoDaysFromNow(10);
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], deadline
            );
            const dueSoon = alerts.find(a => a.type === 'tax_deadline_due_soon');
            expect(dueSoon?.priority).toBe('medium');
        });

        it('produces no tax deadline alert when the deadline is comfortably far out', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], isoDaysFromNow(60)
            );
            expect(alerts.some(a => a.type.startsWith('tax_deadline'))).toBe(false);
        });

        it('produces no tax deadline alert when no deadline is set', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type.startsWith('tax_deadline'))).toBe(false);
        });
    });

    describe('goal alerts', () => {
        it('flags a goal whose deadline has passed and is not achieved', () => {
            const goal = makeGoal({ deadline: isoDaysAgo(5), status: 'off_track', progress: 40 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [goal]
            );
            const missed = alerts.find(a => a.type === 'goal_deadline_passed');
            expect(missed).toBeDefined();
            expect(missed?.id).toBe(`alert-goal-missed-${goal.id}`);
            expect(missed?.priority).toBe('medium');
        });

        it('flags an off-track goal whose deadline is still ahead', () => {
            const goal = makeGoal({ deadline: isoDaysFromNow(20), status: 'off_track', progress: 10 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [goal]
            );
            const offTrack = alerts.find(a => a.type === 'goal_off_track');
            expect(offTrack).toBeDefined();
            expect(offTrack?.id).toBe(`alert-goal-off-track-${goal.id}`);
            expect(offTrack?.priority).toBe('low');
        });

        it('never flags an achieved goal, even past its deadline', () => {
            const goal = makeGoal({ deadline: isoDaysAgo(5), status: 'achieved', progress: 100 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [goal]
            );
            expect(alerts.some(a => a.type.startsWith('goal_'))).toBe(false);
        });

        it('produces no alert for an on-track goal ahead of its deadline', () => {
            const goal = makeGoal({ deadline: isoDaysFromNow(20), status: 'on_track', progress: 60 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [goal]
            );
            expect(alerts.some(a => a.type.startsWith('goal_'))).toBe(false);
        });

        it('produces no alert for an at-risk (not off-track) goal ahead of its deadline', () => {
            const goal = makeGoal({ deadline: isoDaysFromNow(20), status: 'at_risk', progress: 45 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [goal]
            );
            expect(alerts.some(a => a.type.startsWith('goal_'))).toBe(false);
        });

        it('defaults to no goal alerts when no goals are passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type.startsWith('goal_'))).toBe(false);
        });
    });

    describe('recurring transaction alerts', () => {
        it('flags a recurring expense whose next occurrence has passed', () => {
            const tx = makeTx({ id: 'rent-1', type: 'expense', isRecurring: true, recurringFrequency: 'monthly', date: isoMonthsAgo(2) });
            const alerts = detectAlerts(1000000, [tx], []);
            const overdue = alerts.find(a => a.type === 'recurring_transaction_overdue');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe('alert-recurring-overdue-rent-1');
        });

        it('flags a recurring income whose next occurrence is coming up soon', () => {
            const tx = makeTx({ id: 'retainer-1', type: 'income', isRecurring: true, recurringFrequency: 'monthly', date: isoDaysAgo(28) });
            const alerts = detectAlerts(1000000, [tx], []);
            const dueSoon = alerts.find(a => a.type === 'recurring_transaction_due_soon');
            expect(dueSoon).toBeDefined();
            expect(dueSoon?.id).toBe('alert-recurring-due-soon-retainer-1');
        });

        it('never flags a non-recurring transaction', () => {
            const tx = makeTx({ isRecurring: false, date: isoMonthsAgo(2) });
            const alerts = detectAlerts(1000000, [tx], []);
            expect(alerts.some(a => a.type.startsWith('recurring_transaction'))).toBe(false);
        });

        it('never flags a recurring transaction missing its frequency', () => {
            const tx = makeTx({ isRecurring: true, recurringFrequency: undefined, date: isoMonthsAgo(2) });
            const alerts = detectAlerts(1000000, [tx], []);
            expect(alerts.some(a => a.type.startsWith('recurring_transaction'))).toBe(false);
        });

        it('produces no recurring alert for one whose next occurrence is comfortably far out', () => {
            const tx = makeTx({ isRecurring: true, recurringFrequency: 'monthly', date: isoDaysAgo(2) });
            const alerts = detectAlerts(1000000, [tx], []);
            expect(alerts.some(a => a.type.startsWith('recurring_transaction'))).toBe(false);
        });
    });

    describe('budget period lapsed alerts', () => {
        function makeBudget(overrides: Partial<Budget> = {}): Budget {
            return { id: 'b1', category: 'Marketing', monthlyAmount: 50000, period: prevPeriod(), ...overrides };
        }

        it('flags when budgets exist but none are active for the current period', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [makeBudget()]
            );
            const lapsed = alerts.find(a => a.type === 'budget_period_lapsed');
            expect(lapsed).toBeDefined();
            expect(lapsed?.id).toBe(`alert-budget-period-lapsed-${currentPeriod()}`);
            expect(lapsed?.priority).toBe('low');
        });

        it('never flags when a budget is active for the current period', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [makeBudget({ period: currentPeriod() })]
            );
            expect(alerts.some(a => a.type === 'budget_period_lapsed')).toBe(false);
        });

        it('never flags when there are no budgets at all', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type === 'budget_period_lapsed')).toBe(false);
        });
    });

    describe('asset replacement alerts', () => {
        function makeAsset(overrides: Partial<Asset> = {}): Asset {
            return {
                id: 'asset-1',
                name: 'Delivery Van',
                category: 'vehicle',
                description: '',
                purchaseDate: isoMonthsAgo(12),
                purchaseCost: 1000000,
                usefulLifeYears: 5,
                residualValue: 0,
                status: 'active',
                createdAt: isoMonthsAgo(12) + 'T00:00:00.000Z',
                ...overrides,
            };
        }

        it('flags a fully depreciated asset at medium priority', () => {
            const asset = makeAsset({ usefulLifeYears: 5, purchaseDate: isoMonthsAgo(72) }); // 6 years elapsed, 5-year life
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [asset]
            );
            const found = alerts.find(a => a.type === 'asset_nearing_replacement');
            expect(found).toBeDefined();
            expect(found?.id).toBe('alert-asset-replacement-asset-1');
            expect(found?.priority).toBe('medium');
        });

        it('flags an asset within the 20% threshold but above 5% at low priority', () => {
            const asset = makeAsset({ usefulLifeYears: 10, purchaseDate: isoMonthsAgo(102) }); // ~8.5 years of a 10-year life -- ~15% remaining
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [asset]
            );
            const found = alerts.find(a => a.type === 'asset_nearing_replacement');
            expect(found).toBeDefined();
            expect(found?.priority).toBe('low');
        });

        it('never flags an asset with plenty of remaining value', () => {
            const asset = makeAsset({ usefulLifeYears: 10, purchaseDate: isoMonthsAgo(12) }); // 1 of 10 years elapsed
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [asset]
            );
            expect(alerts.some(a => a.type === 'asset_nearing_replacement')).toBe(false);
        });

        it('never flags a disposed asset', () => {
            const asset = makeAsset({ status: 'disposed', purchaseDate: isoMonthsAgo(72) });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [asset]
            );
            expect(alerts.some(a => a.type === 'asset_nearing_replacement')).toBe(false);
        });

        it('defaults to no asset alerts when no assets are passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type === 'asset_nearing_replacement')).toBe(false);
        });
    });

    describe('inventory stockout risk alerts', () => {
        function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
            return {
                id: 'item-1',
                name: 'Ankara Fabric',
                category: 'Fabric',
                quantity: 20,
                unit: 'yards',
                costPrice: 500,
                sellingPrice: 1000,
                lowStockThreshold: 5,
                createdAt: isoDaysAgo(60),
                updatedAt: isoDaysAgo(60),
                ...overrides,
            };
        }
        function makeSaleTx(itemName: string, amount: number, daysAgo: number): Transaction {
            return {
                id: `sale-${itemName}-${daysAgo}`,
                date: isoDaysAgo(daysAgo),
                description: `Sale: ${itemName}`,
                type: 'income',
                category: 'Sales',
                transactionCategory: 'sale',
                amount,
            };
        }

        it('flags a fast-selling item projected to run out within a week at low-priority boundary', () => {
            const item = makeItem({ id: 'item-1', quantity: 20 });
            const sale = makeSaleTx('Ankara Fabric', 50000, 5); // 50 units of 1000 sellingPrice sold in the last 30-day window
            const alerts = detectAlerts(
                1000000, [sale], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            const found = alerts.find(a => a.type === 'inventory_stockout_risk');
            expect(found).toBeDefined();
            expect(found?.id).toBe('alert-stockout-risk-item-1');
            expect(found?.priority).toBe('low'); // ~12 days of stock left
        });

        it('flags a very fast-selling item at medium priority', () => {
            const item = makeItem({ id: 'item-2', quantity: 10 });
            const sale = makeSaleTx('Ankara Fabric', 50000, 5);
            const alerts = detectAlerts(
                1000000, [sale], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            const found = alerts.find(a => a.type === 'inventory_stockout_risk');
            expect(found?.priority).toBe('medium'); // ~6 days of stock left
        });

        it('never flags an item with plenty of stock relative to its sales pace', () => {
            const item = makeItem({ id: 'item-3', quantity: 5000 });
            const sale = makeSaleTx('Ankara Fabric', 50000, 5);
            const alerts = detectAlerts(
                1000000, [sale], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            expect(alerts.some(a => a.type === 'inventory_stockout_risk')).toBe(false);
        });

        it('never flags an item with no recorded sales through the Sell flow', () => {
            const item = makeItem({ id: 'item-4', quantity: 5 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            expect(alerts.some(a => a.type === 'inventory_stockout_risk')).toBe(false);
        });

        it('defaults to no stockout alerts when no inventory is passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type === 'inventory_stockout_risk')).toBe(false);
        });
    });

    describe('slow-moving inventory alerts', () => {
        function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
            return {
                id: 'item-1',
                name: 'Ankara Fabric',
                category: 'Fabric',
                quantity: 20,
                unit: 'yards',
                costPrice: 500,
                sellingPrice: 1000,
                lowStockThreshold: 5,
                createdAt: isoDaysAgo(60),
                updatedAt: isoDaysAgo(60),
                ...overrides,
            };
        }
        function makeSaleTx(itemName: string, amount: number, daysAgo: number): Transaction {
            return {
                id: `sale-${itemName}-${daysAgo}`,
                date: isoDaysAgo(daysAgo),
                description: `Sale: ${itemName}`,
                type: 'income',
                category: 'Sales',
                transactionCategory: 'sale',
                amount,
            };
        }

        it('flags a dead-slow item with well over 60 days of stock left', () => {
            const item = makeItem({ id: 'item-5', quantity: 5000 });
            const sale = makeSaleTx('Ankara Fabric', 50000, 5); // ~1.67 units/day -> ~3000 days of stock left
            const alerts = detectAlerts(
                1000000, [sale], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            const found = alerts.find(a => a.type === 'inventory_slow_moving');
            expect(found).toBeDefined();
            expect(found?.id).toBe('alert-slow-moving-item-5');
            expect(found?.priority).toBe('low');
            expect(found?.description).toContain('Slow mover');
        });

        it('never flags an item moving at a merely moderate pace', () => {
            const item = makeItem({ id: 'item-6', quantity: 50 });
            const sale = makeSaleTx('Ankara Fabric', 50000, 5); // ~30 days of stock left -> 'moderate', not 'slow'
            const alerts = detectAlerts(
                1000000, [sale], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            expect(alerts.some(a => a.type === 'inventory_slow_moving')).toBe(false);
        });

        it('never flags an item with no recorded sales through the Sell flow', () => {
            const item = makeItem({ id: 'item-7', quantity: 5000 });
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [item]
            );
            expect(alerts.some(a => a.type === 'inventory_slow_moving')).toBe(false);
        });

        it('defaults to no slow-moving alerts when no inventory is passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type === 'inventory_slow_moving')).toBe(false);
        });
    });

    describe('tax ability-to-pay alerts', () => {
        it('flags a shortfall when cash on hand is below tax collected but not remitted', () => {
            const alerts = detectAlerts(
                100000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [], 300000, 50000
            ); // liability = 300000 - 50000 = 250000, cash = 100000 -> short by 150000
            const found = alerts.find(a => a.type === 'tax_ability_to_pay_shortfall');
            expect(found).toBeDefined();
            expect(found?.id).toBe('alert-tax-ability-to-pay');
            expect(found?.priority).toBe('high');
            expect(found?.amount).toBe(150000);
        });

        it('never flags it when cash on hand covers the estimated liability', () => {
            const alerts = detectAlerts(
                500000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [], 300000, 50000
            ); // liability = 250000, cash = 500000 -> covered
            expect(alerts.some(a => a.type === 'tax_ability_to_pay_shortfall')).toBe(false);
        });

        it('never flags it when there is no outstanding tax liability tracked', () => {
            const alerts = detectAlerts(
                1000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [], 50000, 50000
            ); // liability = 0
            expect(alerts.some(a => a.type === 'tax_ability_to_pay_shortfall')).toBe(false);
        });

        it('defaults to no alert when tax totals are omitted', () => {
            const alerts = detectAlerts(1000, [], []);
            expect(alerts.some(a => a.type === 'tax_ability_to_pay_shortfall')).toBe(false);
        });
    });

    describe('low cash alert with a custom reserve target', () => {
        it('uses the configured minReserve instead of the default threshold once set', () => {
            // Above the default ₦500K threshold, but below a ₦2M reserve target.
            const alerts = detectAlerts(
                600000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [], undefined, undefined, '2000000'
            );
            const found = alerts.find(a => a.type === 'low_cash');
            expect(found).toBeDefined();
            expect(found?.description).toContain('reserve target');
        });

        it('never flags it once cash clears the configured reserve target', () => {
            const alerts = detectAlerts(
                2500000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [], undefined, undefined, '2000000'
            );
            expect(alerts.some(a => a.type === 'low_cash')).toBe(false);
        });

        it('falls back to the default threshold when no reserve target is configured', () => {
            // Below the default ₦500K threshold; an unset ('0') reserve target
            // must not suppress the default -- it should still fire.
            const alerts = detectAlerts(
                100000, [], [], undefined, undefined, undefined, '₦', [], [], [], undefined, [], [], [], [], undefined, undefined, '0'
            );
            const found = alerts.find(a => a.type === 'low_cash');
            expect(found).toBeDefined();
            expect(found?.description).toContain('threshold');
            expect(found?.description).not.toContain('reserve target');
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
