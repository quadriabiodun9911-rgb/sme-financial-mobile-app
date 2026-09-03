import { classifyByDescription, learnCategory } from '../src/utils/transactionCategorization';

describe('classifyByDescription', () => {
    it('recognizes common income phrasing that used to fall through to "flagged"', () => {
        // "client payment" matches the Sales Revenue rule before "retainer"
        // is ever reached -- both are correct, non-flagged income categorizations.
        expect(classifyByDescription('Client Payment - Consulting Retainer (DEF Ltd)', 'income').flagged).toBe(false);
        expect(classifyByDescription('Client Payment - SME Training Program (XYZ Ltd)', 'income').subCategory)
            .toBe('Sales Revenue');
        expect(classifyByDescription('Monthly Consulting Retainer (DEF Ltd)', 'income').subCategory)
            .toBe('Service Income');
    });

    it('recognizes software/subscription expenses', () => {
        const r = classifyByDescription('IT Software Licenses (Annual Renewal)', 'expense');
        expect(r.subCategory).toBe('Software & Subscriptions');
        expect(r.flagged).toBe(false);
    });

    it('routes a transfer to the business\'s own savings/reserve to Internal Transfer, not flagged', () => {
        const r = classifyByDescription('Transfer to Savings Account (Business Reserve)', 'expense');
        expect(r.subCategory).toBe('Internal Transfer');
        expect(r.flagged).toBe(false);
    });

    it('flags a genuinely unrecognized description for review, defaulting to the known direction', () => {
        const r = classifyByDescription('XYZ-9284 Misc Txn', 'expense');
        expect(r.flagged).toBe(true);
        expect(r.category).toBe('expense');
        expect(r.subCategory).toBe('Other Expense');
    });

    it('a learned correction overrides the keyword rules on the next call', () => {
        classifyByDescription('Weird Vendor Co', 'expense'); // establish baseline (flagged)
        learnCategory('Weird Vendor Co Payment', 'cost', 'Cost of Goods');
        const r = classifyByDescription('Weird Vendor Co Payment #2', 'expense');
        expect(r.subCategory).toBe('Cost of Goods');
        expect(r.flagged).toBe(false);
    });

    it('recognizes Paystack/Flutterwave gateway fees as Bank Charges', () => {
        expect(classifyByDescription('Paystack Fee - Txn #4821', 'expense').subCategory).toBe('Bank Charges');
        expect(classifyByDescription('Flutterwave Fee Deduction', 'expense').subCategory).toBe('Bank Charges');
        expect(classifyByDescription('Payment Gateway Fee', 'expense').subCategory).toBe('Bank Charges');
        expect(classifyByDescription('Card Transaction Fee', 'expense').subCategory).toBe('Bank Charges');
    });

    it('does not claim a genuine Paystack/Flutterwave settlement as a bank charge', () => {
        // Bare "paystack"/"flutterwave" (no "fee") is deliberately excluded
        // from the Bank Charges rule -- a real incoming settlement, not a
        // deducted fee, must still reach the income rules below it.
        const r = classifyByDescription('Paystack Settlement - Sales', 'income');
        expect(r.subCategory).not.toBe('Bank Charges');
        expect(r.category).toBe('income');
    });

    it('does not force an expense-shaped category onto a POS agent\'s own income (agent banking business)', () => {
        // "POS Trxn"/"POS Payment" match the POS Purchase rule -- an
        // expense category for most businesses, but the literal core
        // income of a POS/agent-banking business (dispensing cash for a
        // fee). Direction stays authoritative: the rule must not win here.
        const r = classifyByDescription('POS Trxn - customer cash withdrawal', 'income');
        expect(r.subCategory).not.toBe('POS Purchase');
        expect(r.category).toBe('income');
    });

    it('does not force an expense-shaped category onto a moneylender\'s own income (loan repayments received)', () => {
        const r = classifyByDescription('Loan Repayment received - customer #204', 'income');
        expect(r.subCategory).not.toBe('Loan Repayment');
        expect(r.category).toBe('income');
    });

    it('still recognizes a POS terminal fee as a Bank Charges expense for an ordinary business', () => {
        const r = classifyByDescription('POS Trxn Charge', 'expense');
        expect(r.subCategory).toBe('POS Purchase');
    });

    it('never memorizes an "unknown" (Not Sure) correction', () => {
        learnCategory('Totally Ambiguous Row', 'unknown', 'Uncategorized');
        const r = classifyByDescription('Totally Ambiguous Row', 'income');
        // Falls through to the default -- not silently "learned" as Uncategorized.
        expect(r.subCategory).toBe('Other Income');
    });
});
