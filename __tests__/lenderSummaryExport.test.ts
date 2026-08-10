import { buildLenderSummaryExport, buildPostFinancingShareExport } from '../src/utils/lenderSummaryExport';
import { Loan } from '../src/types';
import { PostFinancingMonitor } from '../src/utils/postFinancingMonitor';

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

describe('buildPostFinancingShareExport', () => {
    const loan: Loan = {
        id: 'l1', lenderName: 'Sample Microfinance Bank', purpose: 'Working capital',
        principal: 500_000, interestRate: 20, termMonths: 12, startDate: '2026-05-01',
        status: 'active', payments: [], createdAt: '2026-05-01', fromMarketplace: true,
    };

    const monitor: PostFinancingMonitor = {
        status: 'at-risk',
        signals: [
            { label: 'Debt-service coverage', tripped: true, detail: 'Current income doesn\'t fully cover total debt service (0.76x) — exact figures that must never leave this device.' },
            { label: 'Revenue trend since funding', tripped: false, detail: 'No sustained revenue decline.' },
            { label: 'Repayment pace', tripped: true, detail: '25% of the term has elapsed but only ¥12,345 of principal is repaid.' },
        ],
        readinessSinceFunding: { trend: 'declining', scoreDelta: -10, fromScore: 70, toScore: 60, periodLabel: '3 months', improvedFactors: [], worsenedFactors: [] },
        tactics: ['Review every active loan\'s payment schedule together.'],
    };

    it('surfaces only status, trend and flagged/clear per signal — never the numeric detail', () => {
        const r = buildPostFinancingShareExport(loan, monitor, 'Shenzhen BrightTech Manufacturing');
        const asString = JSON.stringify(r);
        expect(asString).not.toContain('0.76x');
        expect(asString).not.toContain('12,345');
        expect(asString).not.toContain('25%');
    });

    it('maps each signal to Flagged or Clear by label only', () => {
        const r = buildPostFinancingShareExport(loan, monitor, 'Shenzhen BrightTech Manufacturing');
        const signals = r.sections.find(s => s.name === 'Signals Reviewed');
        expect(signals?.data).toEqual([
            { label: 'Debt-service coverage', value: 'Flagged' },
            { label: 'Revenue trend since funding', value: 'Clear' },
            { label: 'Repayment pace', value: 'Flagged' },
        ]);
    });

    it('includes the business name, lender name and status/trend in the summary', () => {
        const r = buildPostFinancingShareExport(loan, monitor, 'Shenzhen BrightTech Manufacturing');
        expect(r.title).toContain('Shenzhen BrightTech Manufacturing');
        expect(r.title).toContain('Sample Microfinance Bank');
        expect(r.summary?.[0]).toEqual({ label: 'Status', value: 'At Risk' });
        expect(r.summary?.[1]).toEqual({ label: 'Trend since funding', value: 'Declining' });
    });

    it('states plainly that this is not a credit reference', () => {
        const r = buildPostFinancingShareExport(loan, monitor, 'Shenzhen BrightTech Manufacturing');
        const whatThisIs = r.sections.find(s => s.name === 'What This Is');
        expect(whatThisIs?.data.some(d => d.label === 'Not a credit reference')).toBe(true);
    });

    it('falls back to "not enough history yet" when there is no readiness delta since funding', () => {
        const r = buildPostFinancingShareExport(loan, { ...monitor, readinessSinceFunding: null }, 'Shenzhen BrightTech Manufacturing');
        expect(r.summary?.[1].value).toBe('Not enough history yet');
    });
});
