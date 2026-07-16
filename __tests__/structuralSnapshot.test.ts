import { buildStructuralSnapshot } from '../src/utils/structuralSnapshot';
import { Budget, Loan, Asset, Invoice, InventoryItem, StaffMember, FinancialGoal } from '../src/types';

describe('buildStructuralSnapshot', () => {
    it('reports hasData=false when nothing is recorded', () => {
        const snap = buildStructuralSnapshot([], [], [], [], [], [], []);
        expect(snap.hasData).toBe(false);
        expect(snap.committedMonthlyCosts).toBe(0);
        expect(snap.estimatedMonthlyRevenue).toBeNull();
    });

    it('sums budgeted monthly spend', () => {
        const budgets: Budget[] = [
            { id: 'b1', category: 'Rent', monthlyAmount: 5000, period: '2026-01' },
            { id: 'b2', category: 'Marketing', monthlyAmount: 2000, period: '2026-01' },
        ];
        const snap = buildStructuralSnapshot(budgets, [], [], [], [], [], []);
        expect(snap.hasData).toBe(true);
        expect(snap.budgetedMonthlySpend).toBe(7000);
        expect(snap.committedMonthlyCosts).toBe(7000);
    });

    it('includes active staff payroll cost, converting weekly/daily to monthly', () => {
        const staff: StaffMember[] = [
            { id: 's1', name: 'A', role: 'Sales', salary: 1000, salaryType: 'monthly', startDate: '2026-01-01', status: 'active', createdAt: '2026-01-01' },
            { id: 's2', name: 'B', role: 'Cleaner', salary: 100, salaryType: 'weekly', startDate: '2026-01-01', status: 'active', createdAt: '2026-01-01' },
            { id: 's3', name: 'C', role: 'Inactive', salary: 500, salaryType: 'monthly', startDate: '2026-01-01', status: 'inactive', createdAt: '2026-01-01' },
        ];
        const snap = buildStructuralSnapshot([], [], [], [], [], staff, []);
        expect(snap.payrollCost).toBeCloseTo(1000 + 100 * 4.33, 1);
        expect(snap.committedMonthlyCosts).toBeCloseTo(snap.payrollCost, 1);
    });

    it('includes loan burden via totalMonthlyLoanBurden', () => {
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', purpose: 'Equipment', principal: 120000, interestRate: 0, termMonths: 12,
            startDate: '2026-01-01', status: 'active', payments: [], createdAt: '2026-01-01',
        }];
        const snap = buildStructuralSnapshot([], loans, [], [], [], [], []);
        expect(snap.loanBurden).toBeCloseTo(10000, 0); // 120000 / 12 months, 0% interest
    });

    it('sums outstanding (unpaid) invoices as receivables, excluding paid ones', () => {
        const invoices: Invoice[] = [
            { id: 'i1', invoiceNumber: '1', clientName: 'A', clientEmail: '', clientAddress: '', issueDate: '2026-01-01', dueDate: '2026-02-01', lineItems: [], notes: '', status: 'sent', subtotal: 1000, taxTotal: 0, total: 1000, createdAt: '2026-01-01' },
            { id: 'i2', invoiceNumber: '2', clientName: 'B', clientEmail: '', clientAddress: '', issueDate: '2026-01-01', dueDate: '2026-02-01', lineItems: [], notes: '', status: 'paid', subtotal: 500, taxTotal: 0, total: 500, createdAt: '2026-01-01' },
        ];
        const snap = buildStructuralSnapshot([], [], [], invoices, [], [], []);
        expect(snap.outstandingReceivables).toBe(1000);
    });

    it('computes inventory stock value (cost) and potential revenue (selling price) separately', () => {
        const inventory: InventoryItem[] = [
            { id: 'inv1', name: 'Widget', category: 'General', quantity: 10, unit: 'pcs', costPrice: 100, sellingPrice: 150, lowStockThreshold: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        ];
        const snap = buildStructuralSnapshot([], [], [], [], inventory, [], []);
        expect(snap.inventoryStockValue).toBe(1000);
        expect(snap.inventoryPotentialRevenue).toBe(1500);
    });

    it('estimates monthly revenue and profit from a revenue_growth goal target', () => {
        const goals: FinancialGoal[] = [{
            id: 'g1', type: 'revenue_growth', title: 'Grow', description: '', targetValue: 50000,
            unit: '$', baselineValue: 40000, currentValue: 40000, deadline: '2027-01-01',
            createdAt: '2026-01-01', status: 'on_track', progress: 0,
        }];
        const budgets: Budget[] = [{ id: 'b1', category: 'Rent', monthlyAmount: 10000, period: '2026-01' }];
        const snap = buildStructuralSnapshot(budgets, [], [], [], [], [], goals);
        expect(snap.estimatedMonthlyRevenue).toBe(50000);
        expect(snap.estimatedMonthlyProfit).toBe(50000 - 10000);
    });

    it('leaves the revenue/profit estimate null when there is no revenue_growth goal', () => {
        const goals: FinancialGoal[] = [{
            id: 'g1', type: 'cost_reduction', title: 'Cut costs', description: '', targetValue: 5000,
            unit: '$', baselineValue: 8000, currentValue: 8000, deadline: '2027-01-01',
            createdAt: '2026-01-01', status: 'on_track', progress: 0,
        }];
        const snap = buildStructuralSnapshot([], [], [], [], [], [], goals);
        expect(snap.estimatedMonthlyRevenue).toBeNull();
        expect(snap.estimatedMonthlyProfit).toBeNull();
    });
});
