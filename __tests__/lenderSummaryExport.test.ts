import { buildLenderSummaryExport } from '../src/utils/lenderSummaryExport';

const baseInput = {
    businessName: 'Okafor Advisory Ltd',
    currency: '£',
    overallCreditScore: 72.4,
    creditRatingLabel: 'Good',
    factors: [
        { name: 'Payment History', score: 90, weight: 0.3, description: 'On-time payments', status: 'Excellent' },
        { name: 'Cash Flow Health', score: 55, weight: 0.15, description: 'Liquidity and runway', status: 'Adequate' },
    ],
    checkpoints: [
        { label: 'Credit Score', met: true, description: '70+ score increases approval odds' },
        { label: 'Cash Flow', met: false, description: '3+ months runway' },
    ],
    runwayDays: 120,
    avgMonthlyRevenue: 250000,
    daysActive: 400,
    generatedAt: new Date('2026-07-22T10:00:00Z'),
};

describe('buildLenderSummaryExport', () => {
    it('includes the business name and score in the title and summary', () => {
        const r = buildLenderSummaryExport(baseInput);
        expect(r.title).toContain('Okafor Advisory Ltd');
        expect(r.summary?.[0].value).toBe('72 / 100 (Good)');
    });

    it('formats currency figures using the given currency symbol', () => {
        const r = buildLenderSummaryExport(baseInput);
        expect(r.summary?.[1].value).toBe('£250,000');
    });

    it('maps every credit factor into the breakdown section', () => {
        const r = buildLenderSummaryExport(baseInput);
        const breakdown = r.sections.find(s => s.name === 'Credit Score Breakdown');
        expect(breakdown?.data).toHaveLength(2);
        expect(breakdown?.data[0].label).toContain('Payment History');
        expect(breakdown?.data[0].value).toBe('90 / 100');
    });

    it('maps checkpoint status to Met / Not yet met', () => {
        const r = buildLenderSummaryExport(baseInput);
        const checklist = r.sections.find(s => s.name === 'Lender Checklist');
        expect(checklist?.data[0].value).toBe('Met');
        expect(checklist?.data[1].value).toBe('Not yet met');
    });

    it('renders the generated date in long form', () => {
        const r = buildLenderSummaryExport(baseInput);
        expect(r.date).toBe('22 July 2026');
    });
});
