import { Screen, NavParams } from '../types';

export interface FeatureEntry {
    id: string;
    label: string;
    description: string;
    icon: string;
    keywords: string[]; // extra search terms beyond label/description
    screen: Screen;
    navParams?: NavParams;
}

/**
 * A static index of every screen/report a user might look for, searchable by
 * name — not just transaction/invoice/asset data. Card-grid navigation is
 * fragile (a fixed-width grid silently hides a card if one more is added
 * without flexWrap — this happened once already with Weekly Dashboard); a
 * feature that's in this list stays reachable even if its nav card is buried,
 * removed, or overflows off-screen.
 */
export const FEATURE_INDEX: FeatureEntry[] = [
    {
        id: 'weekly-dashboard', label: 'Weekly Dashboard', icon: '🗓️',
        description: 'Wins, problems, revenue/cost, cash position & top priorities for this week',
        keywords: ['week', 'summary', 'priorities', 'wins', 'growth levers'],
        screen: 'weekly-dashboard',
    },
    {
        id: 'pricing-optimizer', label: 'Pricing Optimization', icon: '💰',
        description: 'Model price increases, cost cuts and their effect on profit',
        keywords: ['price', 'margin', 'profit per customer', 'scenario'],
        screen: 'reports', navParams: { reportSection: 'growth', reportTab: 'pricing' },
    },
    {
        id: 'break-even', label: 'Break-Even Calculator (Plan a Price or Product)', icon: '⚖️',
        description: 'What-if: units and revenue needed to cover a hypothetical cost/price, and your margin of safety',
        keywords: ['breakeven', 'break even', 'margin of safety', 'unit economics'],
        screen: 'cfo', navParams: { tab: 'finance' },
    },
    {
        id: 'breakeven-analysis', label: 'Breakeven Analysis (Your Actual Business)', icon: '⚖️',
        description: 'Whether your actual revenue this period is above or below breakeven, and paths to close the gap',
        keywords: ['breakeven', 'break even', 'profit cushion', 'shortfall'],
        screen: 'growth', navParams: { tab: 'breakeven' },
    },
    {
        id: 'balance-sheet', label: 'What I Own & Owe (Balance Sheet)', icon: '🏦',
        description: 'Assets, liabilities and net worth, with a month-by-month trend',
        keywords: ['balance sheet', 'assets', 'liabilities', 'net worth', 'equity'],
        screen: 'reports', navParams: { reportSection: 'statements', reportTab: 'balancesheet' },
    },
    {
        id: 'pnl', label: 'Profit & Loss', icon: '📊',
        description: 'Revenue, costs, and profit for any period, with monthly/quarterly/yearly comparison',
        keywords: ['pnl', 'p&l', 'profit and loss', 'income statement', 'revenue', 'expenses'],
        screen: 'reports', navParams: { reportSection: 'statements', reportTab: 'pnl' },
    },
    {
        id: 'cash-flow-statement', label: 'Cash Flow', icon: '💵',
        description: 'Cash in vs cash out as an actual flow, not a running balance',
        keywords: ['cashflow', 'cash in', 'cash out'],
        screen: 'reports', navParams: { reportSection: 'statements', reportTab: 'accrual' },
    },
    {
        id: 'stock-report', label: 'Stock Report', icon: '📦',
        description: 'Inventory value and stock sales performance',
        keywords: ['inventory', 'stock', 'goods'],
        screen: 'reports', navParams: { reportSection: 'statements', reportTab: 'inventory' },
    },
    {
        id: 'loans-debt', label: 'Loans & Debt', icon: '🏛️',
        description: 'Debt ratios, solvency, and a borrowing-cost-vs-ROI calculator',
        keywords: ['loan', 'debt', 'interest', 'solvency', 'leverage', 'dscr'],
        screen: 'reports', navParams: { reportSection: 'planning', reportTab: 'debt' },
    },
    {
        id: 'cash-timeline', label: 'Cash Timeline (Forecast)', icon: '📈',
        description: 'Forward-looking cash forecast and runway',
        keywords: ['forecast', 'runway', 'projection'],
        screen: 'reports', navParams: { reportSection: 'planning', reportTab: 'cashflow' },
    },
    {
        id: 'growth-scenarios', label: 'Growth Scenarios', icon: '🚀',
        description: 'Model different growth paths and their impact on the business',
        keywords: ['budget', 'scenario', 'growth plan'],
        screen: 'reports', navParams: { reportSection: 'planning', reportTab: 'budget' },
    },
    {
        id: 'best-customers', label: 'Best Customers (Customer Profitability)', icon: '⭐',
        description: 'Which customers are most profitable, by revenue, profit and margin',
        keywords: ['customer profitability', 'top customers'],
        screen: 'reports', navParams: { reportSection: 'growth', reportTab: 'customers' },
    },
    {
        id: 'who-owes-me', label: 'Who Owes Me (Aging)', icon: '⏳',
        description: 'Overdue and upcoming invoices, grouped by how late they are',
        keywords: ['aging', 'overdue', 'receivables', 'ar'],
        screen: 'reports', navParams: { reportSection: 'customers', reportTab: 'aging' },
    },
    {
        id: 'tax-summary', label: 'Tax Summary', icon: '🧾',
        description: 'Tax charged to customers vs tax paid, and net position',
        keywords: ['tax', 'vat'],
        screen: 'reports', navParams: { reportSection: 'tax', reportTab: 'tax' },
    },
    {
        id: 'tax-filing-readiness', label: 'Tax Filing Readiness', icon: '🧾',
        description: 'Whether your records are clean enough to hand to an accountant — does not file returns itself',
        keywords: ['tax filing', 'file taxes', 'tax return', 'accountant', 'ready'],
        screen: 'tax-filing-readiness',
    },
    {
        id: 'clarity', label: 'Financial Clarity', icon: '🧭',
        description: 'Where the business stands and what to do next, in plain terms',
        keywords: ['position', 'strategy', 'biggest lever', 'action plan'],
        screen: 'clarity',
    },
    {
        id: 'financial-assessment', label: 'Financial Assessment', icon: '🔍',
        description: 'Diagnose the business\'s current financial issues',
        keywords: ['diagnose', 'health check'],
        screen: 'financial-assessment',
    },
    {
        id: 'action-tracker', label: 'Action Tracker', icon: '⚡',
        description: 'Prioritized tactics to improve the business',
        keywords: ['tactics', 'tasks', 'todo'],
        screen: 'action-tracker',
    },
    {
        id: 'goal-bridge', label: 'Goal Bridge', icon: '🌉',
        description: 'Connect today\'s numbers to your financial goals',
        keywords: ['goals', 'targets'],
        screen: 'goal-bridge',
    },
    {
        id: 'import-bank-statement', label: 'Import Bank Statement', icon: '🏦',
        description: 'Upload a bank statement to auto-import transactions',
        keywords: ['import', 'bank statement', 'csv', 'upload'],
        screen: 'clarity',
    },
    {
        id: 'invoices', label: 'Invoices', icon: '📄',
        description: 'Create, send and track customer invoices',
        keywords: ['invoice', 'billing'],
        screen: 'invoices',
    },
    {
        id: 'assets', label: 'Assets', icon: '🏗️',
        description: 'Equipment and property register, with depreciation',
        keywords: ['equipment', 'depreciation', 'property'],
        screen: 'assets',
    },
    {
        id: 'payroll', label: 'Payroll', icon: '👥',
        description: 'Staff, pay runs, payroll costs, and payroll provider status',
        keywords: ['staff', 'salary', 'wages', 'gusto', 'deel', 'provider'],
        screen: 'payroll',
    },
    {
        id: 'reconciliation', label: 'Reconciliation', icon: '✅',
        description: 'Match transactions against your bank statement',
        keywords: ['reconcile', 'bank match'],
        screen: 'reconciliation',
    },
    {
        id: 'tax-planning', label: 'Tax Planning', icon: '🧮',
        description: 'Plan ahead for upcoming tax obligations',
        keywords: ['tax plan'],
        screen: 'tax-planning',
    },
    {
        id: 'goals', label: 'Goals', icon: '🎯',
        description: 'Set and track financial goals',
        keywords: ['target', 'objective'],
        screen: 'goals',
    },
    {
        id: 'settings', label: 'Settings', icon: '⚙️',
        description: 'Business details, currency, and preferences',
        keywords: ['preferences', 'profile', 'currency'],
        screen: 'settings',
    },
];

function matches(entry: FeatureEntry, q: string): boolean {
    if (entry.label.toLowerCase().includes(q)) return true;
    if (entry.description.toLowerCase().includes(q)) return true;
    return entry.keywords.some(k => k.toLowerCase().includes(q));
}

export function searchFeatures(query: string, limit: number = 6): FeatureEntry[] {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    return FEATURE_INDEX.filter(entry => matches(entry, q)).slice(0, limit);
}
