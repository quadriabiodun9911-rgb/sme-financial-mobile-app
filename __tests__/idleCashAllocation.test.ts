import { computeIdleCashAllocation } from '../src/utils/idleCashAllocation';
import { Loan } from '../src/types';
import { InventoryDecision } from '../src/utils/inventoryDecisions';

function loan(overrides: Partial<Loan>): Loan {
    return {
        id: Math.random().toString(36), lenderName: 'Bank', principal: 0, interestRate: 0, termMonths: 12,
        startDate: '2026-01-01', status: 'active', ...overrides,
    } as Loan;
}

function reorderDecision(overrides: Partial<InventoryDecision>): InventoryDecision {
    return { itemId: Math.random().toString(36), itemName: 'Item', action: 'reorder', detail: 'Reorder soon', estimatedCost: 0, ...overrides };
}

describe('computeIdleCashAllocation', () => {
    it('returns nothing when there is no deployable cash', () => {
        expect(computeIdleCashAllocation(0, [], [], '₦')).toEqual([]);
        expect(computeIdleCashAllocation(-1000, [], [], '₦')).toEqual([]);
    });

    it('picks the highest-interest active loan for paydown, ignoring paid-off/inactive ones', () => {
        const loans: Loan[] = [
            loan({ id: 'a', lenderName: 'LowRate Bank', principal: 500_000, interestRate: 10 }),
            loan({ id: 'b', lenderName: 'HighRate Bank', principal: 300_000, interestRate: 25 }),
            loan({ id: 'c', lenderName: 'PaidOff Bank', principal: 900_000, interestRate: 40, status: 'paid_off' as any }),
        ];
        const options = computeIdleCashAllocation(1_000_000, loans, [], '₦');
        const debtOption = options.find(o => o.destination === 'debt_paydown')!;
        expect(debtOption.label).toContain('HighRate Bank');
        expect(debtOption.amount).toBe(300_000); // capped at that loan's own principal
        expect(debtOption.benefitLabel).toContain('75,000'); // 300,000 * 25%
    });

    it('caps each option so they never collectively exceed deployable cash, and reports the rest as undeployed', () => {
        const loans: Loan[] = [loan({ id: 'a', principal: 200_000, interestRate: 20 })];
        const reorders = [reorderDecision({ itemId: 'i1', itemName: 'Widgets', estimatedCost: 150_000 })];
        const options = computeIdleCashAllocation(500_000, loans, reorders, '₦');

        const total = options.reduce((s, o) => s + o.amount, 0);
        expect(total).toBe(500_000);
        expect(options.find(o => o.destination === 'debt_paydown')!.amount).toBe(200_000);
        expect(options.find(o => o.destination === 'restock')!.amount).toBe(150_000);
        expect(options.find(o => o.destination === 'undeployed')!.amount).toBe(150_000);
    });

    it('funds restock candidates in the order given, fully first then whatever remains, with nothing left undeployed', () => {
        const reorders = [
            reorderDecision({ itemId: 'i1', itemName: 'A', estimatedCost: 100_000 }),
            reorderDecision({ itemId: 'i2', itemName: 'B', estimatedCost: 200_000 }),
        ];
        const options = computeIdleCashAllocation(150_000, [], reorders, '₦');
        const restocks = options.filter(o => o.destination === 'restock');
        expect(restocks).toHaveLength(2);
        expect(restocks[0].label).toContain('A');
        expect(restocks[0].amount).toBe(100_000);
        expect(restocks[1].label).toContain('B');
        expect(restocks[1].amount).toBe(50_000); // only 50k of the 150k left after A
        expect(options.some(o => o.destination === 'undeployed')).toBe(false);
    });

    it('has nothing undeployed when deployable cash exactly covers every real destination', () => {
        const loans: Loan[] = [loan({ id: 'a', principal: 500_000, interestRate: 15 })];
        const options = computeIdleCashAllocation(500_000, loans, [], '₦');
        expect(options).toHaveLength(1);
        expect(options[0].destination).toBe('debt_paydown');
    });

    it('reports everything as undeployed when there is no debt and nothing to restock', () => {
        const options = computeIdleCashAllocation(500_000, [], [], '₦');
        expect(options).toEqual([
            expect.objectContaining({ destination: 'undeployed', amount: 500_000 }),
        ]);
    });
});
