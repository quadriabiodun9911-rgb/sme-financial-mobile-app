import { buildBehavioralProfile, BehavioralProfileInput } from '../src/utils/behavioralProfile';
import { Transaction, Invoice, Loan, MerchantFinancingApplication, BusinessSettings, StaffMember } from '../src/types';

const settings: BusinessSettings = {
    businessName: 'Okafor Foods',
    businessType: 'product',
    industry: 'food-service',
    currency: '₦',
    currencyCode: 'NGN',
    minReserve: '0',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '7.5',
};

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `t-${Math.random()}`,
    date: daysAgo(10),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: `inv-${Math.random()}`,
    invoiceNumber: 'INV-0001',
    clientName: 'Client',
    clientEmail: '',
    clientAddress: '',
    issueDate: daysAgo(20),
    dueDate: daysAgo(5),
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 100000,
    taxTotal: 0,
    total: 100000,
    createdAt: daysAgo(20),
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
    id: `loan-${Math.random()}`,
    lenderName: 'Zenith Bank',
    purpose: 'expansion',
    principal: 10000000,
    interestRate: 24,
    termMonths: 12,
    startDate: daysAgo(60),
    status: 'active',
    payments: [],
    createdAt: daysAgo(60),
    ...overrides,
});

const makeApplication = (overrides: Partial<MerchantFinancingApplication> = {}): MerchantFinancingApplication => ({
    id: `app-${Math.random()}`,
    userId: 'u1',
    status: 'pending',
    requestedAmount: 1000000,
    purpose: 'expansion',
    interestRate: 0,
    termMonths: 0,
    lenderName: 'Awaiting lender match',
    lenderId: '',
    appliedDate: daysAgo(30),
    monthlyProfitAtApproval: 0,
    monthlyProfitCurrent: 0,
    ...overrides,
});

const baseInput = (overrides: Partial<BehavioralProfileInput> = {}): BehavioralProfileInput => ({
    transactions: [],
    invoices: [],
    assets: [],
    loans: [],
    inventory: [],
    settings,
    user: null,
    ...overrides,
});

describe('buildBehavioralProfile', () => {
    it('never fabricates a diagnosis/prediction/prescription for a business with no history, but still names a capital fallback', () => {
        const profile = buildBehavioralProfile(baseInput());
        // recommendFinancingTypes always resolves to at least Working
        // Capital (its own documented fallback) -- everything else stays
        // honestly empty since there's no real history behind them.
        expect(profile.whatsHappening).toEqual([]);
        expect(profile.whatsLikely).toEqual([]);
        expect(profile.whatToDo).toEqual([]);
        expect(profile.capitalFit.length).toBeGreaterThan(0);
        expect(profile.available).toBe(true);
        expect(profile.narrative).toContain("Here's the capital that fits");
        expect(profile.narrative).not.toContain("Here's what's happening");
    });

    it('never fabricates seasonality or growth-quality bullets under 12/24 months of data', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const profile = buildBehavioralProfile(baseInput({ transactions }));
        // Neither seasonality (needs 12mo) nor growth quality (needs 2yr)
        // should fabricate a verdict off two months of data.
        expect(profile.whatsHappening.some(h => h.includes('peaks around') || h.includes('dips around'))).toBe(false);
    });

    it('surfaces invoice financing as capital fit when unpaid invoices are large relative to revenue', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 200000, date: daysAgo(20) }),
        ];
        const invoices = [makeInvoice({ status: 'overdue', total: 150000 })];
        const profile = buildBehavioralProfile(baseInput({ transactions, invoices }));
        expect(profile.capitalFit.some(r => r.productType === 'invoice_financing')).toBe(true);
        expect(profile.available).toBe(true);
    });

    it('passes through the caller-provided top action as the prescription stage, never inventing its own', () => {
        const profile = buildBehavioralProfile(baseInput({ topActionSummary: 'Cut rent by negotiating with your landlord.' }));
        expect(profile.whatToDo).toEqual(['Cut rent by negotiating with your landlord.']);
        expect(profile.narrative).toContain("Here's what to do: Cut rent by negotiating with your landlord.");
    });

    it('chains populated stages into one narrative in report -> happening -> likely -> to-do -> capital order', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 200000, date: daysAgo(20) }),
        ];
        const invoices = [makeInvoice({ status: 'overdue', total: 150000 })];
        const profile = buildBehavioralProfile(baseInput({ transactions, invoices, topActionSummary: 'Follow up on overdue invoices.' }));
        const toDoIdx = profile.narrative.indexOf("Here's what to do");
        const capitalIdx = profile.narrative.indexOf("Here's the capital that fits");
        expect(toDoIdx).toBeGreaterThan(-1);
        expect(capitalIdx).toBeGreaterThan(toDoIdx);
    });

    it('never labels a customer\'s payment behavior from fewer than 3 real paid-and-dated invoices', () => {
        const invoices = [
            makeInvoice({ clientName: 'New Client', status: 'paid', dueDate: daysAgo(30), paidDate: daysAgo(5) }),
        ];
        const profile = buildBehavioralProfile(baseInput({ invoices }));
        expect(profile.whatsHappening.some(h => h.includes('New Client'))).toBe(false);
    });

    it('surfaces a real serial-late-payer customer once they have enough dated payment history', () => {
        const invoices = [
            makeInvoice({ clientName: 'Slow Co', status: 'paid', dueDate: '2026-01-15', paidDate: '2026-02-05' }),
            makeInvoice({ clientName: 'Slow Co', status: 'paid', dueDate: '2026-02-15', paidDate: '2026-03-08' }),
            makeInvoice({ clientName: 'Slow Co', status: 'paid', dueDate: '2026-03-15', paidDate: '2026-04-04' }),
        ];
        const profile = buildBehavioralProfile(baseInput({ invoices }));
        expect(profile.whatsHappening.some(h => h.includes('Slow Co') && h.includes('Serial late payer'))).toBe(true);
    });

    it('never checks post-financing outcome for a loan not flagged as marketplace-sourced', () => {
        const loans = [makeLoan({ fromMarketplace: false })];
        const transactions = [makeTx({ type: 'income', amount: 1000, date: daysAgo(10) })];
        const profile = buildBehavioralProfile(baseInput({ transactions, loans }));
        expect(profile.whatsHappening.some(h => h.includes('is flagged'))).toBe(false);
    });

    it('surfaces a real post-financing warning for a marketplace-sourced loan the business can\'t actually service', () => {
        // Tiny income against a huge, high-rate loan -- guarantees DSCR < 1,
        // the same hard signal postFinancingMonitor.ts checks.
        const loans = [makeLoan({ fromMarketplace: true, lenderName: 'Zenith Bank' })];
        const transactions = [makeTx({ type: 'income', amount: 5000, date: daysAgo(10) })];
        const profile = buildBehavioralProfile(baseInput({ transactions, loans }));
        expect(profile.whatsHappening.some(h => h.includes('Zenith Bank') && h.includes("flagged 'at-risk'"))).toBe(true);
        expect(profile.whatToDo.length).toBeGreaterThan(0);
    });

    it('never surfaces financing outcome history while an application is still pending', () => {
        const profile = buildBehavioralProfile(baseInput({ currentFinancingApplication: makeApplication({ status: 'pending' }) }));
        expect(profile.whatsHappening.some(h => h.includes('Applied for financing'))).toBe(false);
    });

    it('surfaces a real financing outcome history once an application has actually resolved', () => {
        const pastFinancingApplications = [
            makeApplication({ status: 'approved', requestedAmount: 1000000, approvedAmount: 700000 }),
            makeApplication({ status: 'rejected', rejectionReason: 'Insufficient trading history' }),
        ];
        const profile = buildBehavioralProfile(baseInput({ pastFinancingApplications }));
        const outcomeBullet = profile.whatsHappening.find(h => h.includes('Applied for financing'));
        expect(outcomeBullet).toBeDefined();
        expect(outcomeBullet).toContain('1 approved, 1 rejected');
        expect(outcomeBullet).toContain('70%');
        expect(outcomeBullet).toContain('Insufficient trading history');
    });

    it('surfaces a real weekday revenue concentration bullet once enough history exists', () => {
        // 2026-01-04 is a Sunday -- 4 weeks with zero revenue on Tuesday and
        // Wednesday, the exact scenario weekdayPattern.ts exists to catch.
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                if (weekday === 2 || weekday === 3) continue;
                const d = new Date('2026-01-04T00:00:00');
                d.setDate(d.getDate() + week * 7 + weekday);
                // Local Y-M-D, not toISOString() -- must match weekdayPattern.ts's
                // own local-date bucketing exactly, or this test only passes by
                // coincidence in a UTC-offset-0 environment.
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                transactions.push(makeTx({ date: dateStr, amount: 10000 }));
            }
        }
        const profile = buildBehavioralProfile(baseInput({ transactions }));
        expect(profile.whatsHappening.some(h => h.includes('Tuesday') && h.includes('Wednesday') && h.includes('almost no revenue'))).toBe(true);
    });

    it('never fabricates a weekday pattern under the minimum days of history', () => {
        const transactions = [makeTx({ date: daysAgo(1), amount: 10000 })];
        const profile = buildBehavioralProfile(baseInput({ transactions }));
        expect(profile.whatsHappening.some(h => h.includes('bring in almost no revenue') || h.includes('Revenue leans on'))).toBe(false);
    });

    it('never surfaces labor productivity with no active staff', () => {
        const transactions = [makeTx({ date: daysAgo(1), amount: 500000 })];
        const profile = buildBehavioralProfile(baseInput({ transactions, staff: [] }));
        expect(profile.whatsHappening.some(h => h.includes('active staff member'))).toBe(false);
    });

    it('surfaces a real labor productivity bullet once active staff and revenue both exist', () => {
        const transactions = [
            makeTx({ date: daysAgo(1), amount: 500000 }),
            makeTx({ date: daysAgo(2), type: 'expense', category: 'Salaries', amount: 100000 }),
        ];
        const staff: StaffMember[] = [{
            id: 's1', name: 'Test Staff', role: 'Sales', salary: 50000, salaryType: 'monthly',
            startDate: daysAgo(90), status: 'active', createdAt: daysAgo(90),
        }];
        const profile = buildBehavioralProfile(baseInput({ transactions, staff }));
        const laborBullet = profile.whatsHappening.find(h => h.includes('active staff member'));
        expect(laborBullet).toBeDefined();
        expect(laborBullet).toContain('₦500,000');
        expect(laborBullet).toContain('20%');
    });
});
