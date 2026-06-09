export type Screen =
    | 'login'
    | 'dashboard'
    | 'reports'
    | 'transactions'
    | 'insights'
    | 'settings';

export type ReportTab =
    | 'balancesheet'
    | 'pnl'
    | 'financial_planning'
    | 'cash_flow_statement'
    | 'cash_management'
    | 'debt_management'
    | 'financial_health'
    | 'aging'
    | 'tax';

export type TransactionStatus = 'paid' | 'pending' | 'overdue';
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly';

export interface Transaction {
    id: string;
    date: string;
    description: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
    transactionCategory?: 'purchase' | 'sale' | 'expense' | 'cost' | 'other';
    reference?: string;
    vendorCustomer?: string;

    // Tax fields
    taxRate?: number;       // percentage e.g. 10 for 10%
    taxAmount?: number;     // computed: amount * taxRate / 100

    // AR/AP tracking
    status?: TransactionStatus;
    dueDate?: string;       // ISO date string

    // Recurring
    isRecurring?: boolean;
    recurringFrequency?: RecurringFrequency;
    nextRecurringDate?: string;  // ISO date of next auto-entry
}

export interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    cashBalance: number;
    totalRevenue: number;
    totalCosts: number;
    assets: number;
    liabilities: number;
    equity: number;
    totalTaxCollected: number;   // tax on income transactions
    totalTaxPaid: number;        // tax on expense transactions
    netTaxPosition: number;      // collected - paid
}

export interface User {
    email: string;
    businessName: string;
    role: string;
}

export interface BusinessSettings {
    businessType: 'product' | 'service' | 'both';
    currency: string;
    minReserve: string;
    targetMargin: string;
    openingAssets: string;
    openingLiabilities: string;
    defaultTaxRate: string;   // default tax rate % for new transactions
}

export interface AgingBucket {
    label: string;
    transactions: Transaction[];
    total: number;
}
