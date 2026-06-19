export type Screen =
    | 'login'
    | 'dashboard'
    | 'reports'
    | 'transactions'
    | 'insights'
    | 'settings'
    | 'goals'
    | 'invoices'
    | 'assets'
    | 'loans'
    | 'inventory'
    | 'growth'
    | 'cfo'
    | 'budget'
    | 'analysis'
    | '2fa'
    | 'payment-link'
    | 'connect-bank'
    | 'financial-health';

export interface Budget {
    id: string;
    category: string;
    monthlyAmount: number;
    period: string; // YYYY-MM
}

export type ReportTab =
    | 'balancesheet'
    | 'pnl'
    | 'financial_planning'
    | 'cash_flow_statement'
    | 'cash_management'
    | 'debt_management'
    | 'financial_health'
    | 'aging'
    | 'tax'
    | 'swot';

export type TransactionStatus = 'paid' | 'pending' | 'overdue';
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type GoalType =
    | 'revenue_growth'
    | 'margin_improvement'
    | 'cost_reduction'
    | 'cash_reserve'
    | 'reduce_overdue_ar'
    | 'custom';

export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'achieved';

export interface FinancialGoal {
    id: string;
    type: GoalType;
    title: string;
    description: string;
    targetValue: number;       // e.g. 20 (for 20% revenue growth)
    unit: string;              // e.g. '%', currency symbol, 'days'
    baselineValue: number;     // value at time of goal creation
    currentValue: number;      // latest computed value
    deadline: string;          // ISO date
    createdAt: string;         // ISO date
    status: GoalStatus;
    progress: number;          // 0–100 %
    percentTarget?: number;
}

export interface GoalStrategy {
    goalId: string;
    actions: StrategyAction[];
    generatedAt: string;
}

export interface StrategyAction {
    priority: 'high' | 'medium' | 'low';
    title: string;
    detail: string;
    metric?: string;           // e.g. "Current margin: 42%" — live metric shown alongside
}

export interface SwotItem {
    text: string;
    metric?: string;           // live data point supporting this item
}

export interface SwotAnalysis {
    strengths: SwotItem[];
    weaknesses: SwotItem[];
    opportunities: SwotItem[];
    threats: SwotItem[];
    generatedAt: string;
}

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
    taxRate?: number;
    taxAmount?: number;
    status?: TransactionStatus;
    dueDate?: string;
    isRecurring?: boolean;
    recurringFrequency?: RecurringFrequency;
    nextRecurringDate?: string;
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
    totalTaxCollected: number;
    totalTaxPaid: number;
    netTaxPosition: number;
    annualDepreciation: number;   // total depreciation charge for the year
    depreciationAdjustedProfit: number; // profit after depreciation
}

export interface User {
    email: string;
    businessName: string;
    role: string;
    phone?: string;
}

export interface BusinessSettings {
    businessType: 'product' | 'service' | 'both';
    currency: string;
    minReserve: string;
    targetMargin: string;
    openingAssets: string;
    openingLiabilities: string;
    openingLoans: string;
    openingOtherAssets: string;
    defaultTaxRate: string;
}

export interface NavParams {
    reportSection?: 'statements' | 'operations' | 'planning' | 'analysis';
    reportTab?: string;
    goalType?: GoalType;
}

export type UserRole = 'owner' | 'accountant' | 'staff';
export type Language = 'en' | 'zh';

export type AssetCategory = 'equipment' | 'vehicle' | 'furniture' | 'property' | 'intangible' | 'other';
export type AssetStatus = 'active' | 'disposed';

export interface Asset {
    id: string;
    name: string;
    category: AssetCategory;
    description: string;
    purchaseDate: string;       // ISO date
    purchaseCost: number;
    usefulLifeYears: number;
    residualValue: number;
    status: AssetStatus;
    disposalDate?: string;
    disposalValue?: number;
    createdAt: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    category: string;
    quantity: number;
    unit: string; // 'pcs', 'kg', 'litres', etc.
    costPrice: number;     // what you paid per unit
    sellingPrice: number;  // what you sell for per unit
    lowStockThreshold: number;
    createdAt: string;
    updatedAt: string;
}

export interface TeamMember {
    id: string;
    ownerUserId: string;
    memberEmail: string;
    memberUserId: string | null;
    role: 'accountant' | 'staff';
    status: 'pending' | 'active';
    inviteCode: string;
    invitedAt: string;
}

export interface AgingBucket {
    label: string;
    transactions: Transaction[];
    total: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceLineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
}

export interface Invoice {
    id: string;
    invoiceNumber: string;
    clientName: string;
    clientEmail: string;
    clientAddress: string;
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    notes: string;
    status: InvoiceStatus;
    subtotal: number;
    taxTotal: number;
    total: number;
    createdAt: string;
}

export type LoanStatus = 'active' | 'paid_off' | 'defaulted';

export interface LoanPayment {
    id: string;
    date: string;
    amount: number;
    note?: string;
}

export interface Loan {
    id: string;
    lenderName: string;
    purpose: string;
    principal: number;
    interestRate: number;   // annual % e.g. 15 for 15%
    termMonths: number;
    startDate: string;      // ISO date
    status: LoanStatus;
    payments: LoanPayment[];
    createdAt: string;
}

export interface CashPocket {
    id: string;
    name: string;
    amount: number;
    updatedAt: string; // ISO date
}
