import { detectPersonalSpending } from '../src/utils/personalSpendingDetector';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2024-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Other',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('detectPersonalSpending', () => {
    it('returns an empty report when nothing looks personal', () => {
        const txs = [makeTx({ id: 'a', description: 'Office rent payment' }), makeTx({ id: 'b', description: 'Staff salary' })];
        const report = detectPersonalSpending(txs);
        expect(report.flaggedCount).toBe(0);
        expect(report.estimatedPersonalAmount).toBe(0);
        expect(report.summary).toBe('No transactions look like personal spending.');
    });

    it('flags a school fees payment', () => {
        const txs = [makeTx({ id: 'a', description: 'School fees for the kids', amount: 150000 })];
        const report = detectPersonalSpending(txs);
        expect(report.flaggedCount).toBe(1);
        expect(report.flagged[0].reason).toContain('school-fees');
    });

    it('flags a personal streaming subscription', () => {
        const txs = [makeTx({ id: 'a', description: 'Netflix subscription', amount: 5000 })];
        const report = detectPersonalSpending(txs);
        expect(report.flaggedCount).toBe(1);
    });

    it('does not flag generic business rent', () => {
        const txs = [makeTx({ id: 'a', description: 'Shop rent for August', amount: 100000 })];
        const report = detectPersonalSpending(txs);
        expect(report.flaggedCount).toBe(0);
    });

    it('flags home rent specifically, distinct from business rent', () => {
        const txs = [makeTx({ id: 'a', description: 'Home rent payment', amount: 300000 })];
        const report = detectPersonalSpending(txs);
        expect(report.flaggedCount).toBe(1);
        expect(report.flagged[0].reason).toContain('home) rent');
    });

    it('ignores income transactions entirely', () => {
        const txs = [makeTx({ id: 'a', type: 'income', description: 'School fees refund', amount: 50000 })];
        const report = detectPersonalSpending(txs);
        expect(report.flaggedCount).toBe(0);
    });

    it('sums the estimated personal amount across all flagged transactions', () => {
        const txs = [
            makeTx({ id: 'a', description: 'School fees', amount: 150000 }),
            makeTx({ id: 'b', description: 'Salon visit', amount: 20000 }),
        ];
        const report = detectPersonalSpending(txs, '₦');
        expect(report.estimatedPersonalAmount).toBe(170000);
        expect(report.summary).toContain('₦170,000');
        expect(report.summary).toContain('2 transactions');
    });

    it('excludes a transaction the owner already confirmed as business', () => {
        const txs = [makeTx({ id: 'a', description: 'School fees', amount: 150000 })];
        const report = detectPersonalSpending(txs, '₦', ['a']);
        expect(report.flaggedCount).toBe(0);
    });

    it('flags nightlife-sounding spending by default (no industry given)', () => {
        const txs = [makeTx({ id: 'a', description: 'Paid at Loft Nightclub', amount: 40000 })];
        const report = detectPersonalSpending(txs, '₦', [], undefined);
        expect(report.flaggedCount).toBe(1);
    });

    it('flags nightlife-sounding spending for a non-food-service industry', () => {
        const txs = [makeTx({ id: 'a', description: 'New lounge furniture', amount: 200000 })];
        const report = detectPersonalSpending(txs, '₦', [], 'retail');
        expect(report.flaggedCount).toBe(1);
    });

    it('does not flag a food-service business\'s own lounge/nightclub/bar operating expenses', () => {
        const txs = [
            makeTx({ id: 'a', description: 'Lounge furniture restock', amount: 200000 }),
            makeTx({ id: 'b', description: 'Nightclub sound equipment repair', amount: 80000 }),
            makeTx({ id: 'c', description: 'Bar tab reconciliation software', amount: 15000 }),
        ];
        const report = detectPersonalSpending(txs, '₦', [], 'food-service');
        expect(report.flaggedCount).toBe(0);
    });

    it('still flags genuinely unrelated personal spending for a food-service business', () => {
        const txs = [makeTx({ id: 'a', description: 'School fees for the kids', amount: 150000 })];
        const report = detectPersonalSpending(txs, '₦', [], 'food-service');
        expect(report.flaggedCount).toBe(1);
    });

    it('flags celebration-sounding spending by default (no industry given)', () => {
        const txs = [makeTx({ id: 'a', description: 'Owambe outfit for the weekend', amount: 60000 })];
        const report = detectPersonalSpending(txs, '₦', [], undefined);
        expect(report.flaggedCount).toBe(1);
    });

    it('flags celebration-sounding spending for manufacturing, where it has no legitimate business reading', () => {
        const txs = [makeTx({ id: 'a', description: 'Aso ebi fabric for my sister\'s wedding', amount: 45000 })];
        const report = detectPersonalSpending(txs, '₦', [], 'manufacturing');
        expect(report.flaggedCount).toBe(1);
    });

    it('does not flag an events & entertainment business\'s own owambe/aso-ebi/party-booking revenue-generating work, across the industries it could plausibly register under', () => {
        const txs = [
            makeTx({ id: 'a', description: 'Owambe event equipment rental', amount: 300000 }),
            makeTx({ id: 'b', description: 'Aso ebi fabric supply for client', amount: 220000 }),
            makeTx({ id: 'c', description: 'Birthday party decor booking', amount: 95000 }),
        ];
        for (const industry of ['retail', 'food-service', 'professional-services']) {
            const report = detectPersonalSpending(txs, '₦', [], industry);
            expect(report.flaggedCount).toBe(0);
        }
    });

    it('still flags genuinely unrelated personal spending for an events-plausible industry', () => {
        const txs = [makeTx({ id: 'a', description: 'Netflix subscription', amount: 5000 })];
        const report = detectPersonalSpending(txs, '₦', [], 'professional-services');
        expect(report.flaggedCount).toBe(1);
    });

    it('flags grooming-sounding spending by default (no industry given)', () => {
        const txs = [makeTx({ id: 'a', description: 'Salon visit', amount: 20000 })];
        const report = detectPersonalSpending(txs, '₦', [], undefined);
        expect(report.flaggedCount).toBe(1);
    });

    it('flags grooming-sounding spending for food-service and manufacturing, where it has no legitimate business reading', () => {
        for (const industry of ['food-service', 'manufacturing']) {
            const txs = [makeTx({ id: 'a', description: 'Barber shop visit', amount: 8000 })];
            const report = detectPersonalSpending(txs, '₦', [], industry);
            expect(report.flaggedCount).toBe(1);
        }
    });

    it('does not flag a salon & beauty business\'s own grooming-supply/equipment operating expenses, across the industries it could plausibly register under', () => {
        const txs = [
            makeTx({ id: 'a', description: 'Salon chair repair', amount: 45000 }),
            makeTx({ id: 'b', description: 'Barbing clippers restock', amount: 30000 }),
            makeTx({ id: 'c', description: 'Spa towels and product supplies', amount: 60000 }),
            makeTx({ id: 'd', description: 'Hairdresser training course', amount: 25000 }),
            makeTx({ id: 'e', description: 'Manicure and pedicure supplies restock', amount: 15000 }),
        ];
        for (const industry of ['retail', 'professional-services']) {
            const report = detectPersonalSpending(txs, '₦', [], industry);
            expect(report.flaggedCount).toBe(0);
        }
    });

    it('still flags genuinely unrelated personal spending for a salon-plausible industry', () => {
        const txs = [makeTx({ id: 'a', description: 'School fees for the kids', amount: 150000 })];
        const report = detectPersonalSpending(txs, '₦', [], 'retail');
        expect(report.flaggedCount).toBe(1);
    });
});
