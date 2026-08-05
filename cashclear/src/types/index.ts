export type Screen =
    | 'onboarding'
    | 'login'
    | 'dashboard'
    | 'transactions'
    | 'creditScore'
    | 'lenderPortal'
    | 'projectAccounts';

export type TransactionType = 'income' | 'expense';

export type TransactionCategory =
    | 'Sales Revenue'
    | 'Supplier Payment'
    | 'Rent'
    | 'Payroll'
    | 'Utilities'
    | 'Loan Repayment'
    | 'Personal Withdrawal'
    | 'Personal Expense'
    | 'Transfer'
    | 'Uncategorized';

export type FundingSource = 'Mobile Money' | 'Bank Account' | 'POS Terminal';

export interface Transaction {
    id: string;
    date: string; // ISO date
    description: string;
    amount: number; // positive = money in, negative = money out
    type: TransactionType;
    source: FundingSource;
    projectId: string | null;
    category: TransactionCategory;
    isPersonal: boolean;
    isCommingled: boolean; // personal-looking activity on a business wallet, or vice versa
}

export interface Invoice {
    id: string;
    client: string;
    amount: number;
    issuedDate: string;
    dueDate: string;
    paid: boolean;
}

export interface Project {
    id: string;
    name: string;
    walletBalance: number;
    createdAt: string;
}

export interface PillarScore {
    key: PillarKey;
    label: string;
    score: number; // 0-100
    weight: number; // fraction, sums to 1 across pillars
    issues: string[];
    recommendations: string[];
}

export type PillarKey =
    | 'recordIntegrity'
    | 'cashFlowConsistency'
    | 'debtServiceHistory'
    | 'businessPersonalSeparation'
    | 'documentCompleteness';

export interface CreditReadinessResult {
    overallScore: number; // 0-100
    band: 'Not Bankable' | 'Needs Work' | 'Fair' | 'Good' | 'Excellent';
    pillars: PillarScore[];
    computedAt: string;
}

export interface CashFlowProjectionPoint {
    daysAhead: 30 | 60 | 90;
    projectedBalance: number;
    shortfall: boolean;
}

export interface CashFlowAlert {
    id: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
}

export interface DebtRecord {
    id: string;
    lender: string;
    principal: number;
    onTimePayments: number;
    missedPayments: number;
    active: boolean;
}

export interface User {
    name: string;
    businessName: string;
    email: string;
}
