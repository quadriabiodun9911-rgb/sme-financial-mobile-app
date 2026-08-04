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

export interface Transaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    source: 'Mobile Money' | 'Bank Account' | 'POS Terminal';
    projectId: string;
    category: TransactionCategory;
    isPersonal: boolean;
    isCommingled: boolean;
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
    businessId: string;
    name: string;
    walletBalance: number;
    createdAt: string;
}

export interface DebtRecord {
    id: string;
    lender: string;
    principal: number;
    onTimePayments: number;
    missedPayments: number;
    active: boolean;
}

export type PillarKey =
    | 'recordIntegrity'
    | 'cashFlowConsistency'
    | 'debtServiceHistory'
    | 'businessPersonalSeparation'
    | 'documentCompleteness';

export interface PillarScore {
    key: PillarKey;
    label: string;
    score: number;
    weight: number;
    issues: string[];
    recommendations: string[];
}

export interface CreditReadinessResult {
    businessId: string;
    overallScore: number;
    band: 'Not Bankable' | 'Needs Work' | 'Fair' | 'Good' | 'Excellent';
    pillars: PillarScore[];
    computedAt: string;
}

export interface DocumentChecklist {
    hasTaxFilings: boolean;
    hasBankStatements: boolean;
    hasBusinessRegistration: boolean;
    hasFinancialStatements: boolean;
}
