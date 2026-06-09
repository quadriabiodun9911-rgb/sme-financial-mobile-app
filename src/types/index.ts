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
    | 'financial_health';

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
}

export interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    cashBalance: number;
    totalRevenue: number;
    totalCosts: number;
    /** True balance sheet assets (cash + manual opening assets) */
    assets: number;
    /** True balance sheet liabilities (manual opening liabilities) */
    liabilities: number;
    equity: number;
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
}
