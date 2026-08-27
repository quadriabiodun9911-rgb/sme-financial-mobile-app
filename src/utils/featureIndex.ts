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
        screen: 'dashboard', navParams: { openWeeklyReport: true },
    },
    {
        id: 'monthly-review', label: 'Monthly Review', icon: '📊',
        description: 'Income, expenses and profit vs last month, top expense categories, unpaid invoices, goal progress, and one recommendation',
        keywords: ['month', 'recap', 'summary', 'review', 'income vs expenses', 'profit trend'],
        screen: 'dashboard', navParams: { openMonthlyReview: true },
    },
    {
        id: 'daily-report', label: 'Daily Report', icon: '📆',
        description: "Today's revenue, expenses and profit vs your goal-derived daily targets, a verdict on how the day went, and tomorrow's action plan",
        keywords: ['day', 'today', 'end of day', 'eod', 'recap', 'daily targets', 'verdict'],
        screen: 'dashboard', navParams: { openDailyReport: true },
    },
    {
        id: 'quality-of-growth', label: 'Quality of Growth', icon: '🌱',
        description: 'Is revenue growth healthy? Compares revenue growth against profit, cash, receivables and debt growth year over year',
        keywords: ['growth quality', 'healthy growth', 'fragile growth', 'revenue growth', 'year over year', 'yoy'],
        screen: 'reports', navParams: { reportSection: 'growth', reportTab: 'quality' },
    },
    {
        id: 'cost-exposure', label: 'Cost Exposure', icon: '⚠️',
        description: 'Which expense category is taking a bigger share of revenue, and a multi-month forward projection of the profit impact if it keeps rising',
        keywords: ['cost concentration', 'energy risk', 'rising costs', 'expense category', 'margin erosion', 'early warning', 'forecast', 'trajectory'],
        screen: 'transactions', navParams: { tab: 'exposure' },
    },
    {
        id: 'macro-assumptions', label: 'Macro Assumptions', icon: '🌍',
        description: 'Tell Quad360 what\'s happening with energy prices, FX, interest rates, inflation or other external factors, linked to the expense categories they affect',
        keywords: ['macro', 'external', 'energy prices', 'fx', 'interest rates', 'inflation', 'commodity', 'regulation', 'supply chain', 'diesel', 'fuel price'],
        screen: 'macro-assumptions',
    },
    {
        id: 'future-events', label: 'Known Future Events', icon: '📅',
        description: 'Add planned expansions, hires, contracts or equipment purchases so the forecast places them in the right month',
        keywords: ['future events', 'known future events', 'planned expansion', 'new hire', 'new branch', 'equipment purchase', 'signed contract', 'upcoming plans'],
        screen: 'future-events',
    },
    {
        id: 'pricing-optimizer', label: 'Pricing Optimization', icon: '💰',
        description: 'Set prices per product against real inventory and sales data, hit a revenue target, or protect your margin after a cost rise',
        keywords: ['price', 'margin', 'scenario', 'cost increase', 'price adjustment', 'inflation', 'revenue target', 'inventory', 'goods'],
        screen: 'inventory', navParams: { tab: 'pricing' },
    },
    {
        id: 'break-even', label: 'Break-Even Calculator (Plan a Price or Product)', icon: '⚖️',
        description: 'What-if: units and revenue needed to cover a hypothetical cost/price, and your margin of safety',
        keywords: ['breakeven', 'break even', 'margin of safety', 'unit economics'],
        screen: 'cfo', navParams: { tab: 'finance' },
    },
    {
        id: 'breakeven-analysis', label: 'Breakeven Analysis (Your Actual Business)', icon: '⚖️',
        description: 'Whether your actual revenue this period is above or below breakeven, paths to close the gap, and how a discount would affect it',
        keywords: ['breakeven', 'break even', 'profit cushion', 'shortfall', 'discount'],
        screen: 'cashflow', navParams: { tab: 'breakeven' },
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
        description: 'Debt ratios, solvency, a borrowing-cost-vs-ROI calculator, buy-vs-finance equipment comparison, a growth affordability check, and a should-I-take-this-loan checker',
        keywords: ['loan', 'debt', 'interest', 'solvency', 'leverage', 'dscr', 'equipment', 'buy vs finance', 'runway', 'growth', 'hiring', 'expansion', 'afford', 'should i borrow', 'repayment', 'safe', 'high risk'],
        screen: 'reports', navParams: { reportSection: 'planning', reportTab: 'debt' },
    },
    {
        id: 'cash-timeline', label: 'Cash Timeline (Forecast)', icon: '📈',
        description: 'Forward-looking cash forecast and runway',
        keywords: ['forecast', 'runway', 'projection'],
        // Cash Flow Outlook and Cash Safety were merged into one
        // "Cash Flow & Safety" tab -- both search entries now land there.
        // 'cashflow' (the Statement of Cash Flows, in the statements
        // section) remains the separate historical statement.
        screen: 'reports', navParams: { reportSection: 'planning', reportTab: 'cashsafety' },
    },
    {
        id: 'cash-safety', label: 'Cash Safety', icon: '🛡️',
        description: 'Reserve coverage, AR/AP aging, and a cash flow stress test (with scenario comparison) for cost spikes or payment delays',
        keywords: ['reserve', 'aging', 'receivables', 'payables', 'stress test', 'shock', 'fuel', 'delay', 'shipping', 'scenario', 'compare'],
        screen: 'reports', navParams: { reportSection: 'planning', reportTab: 'cashsafety' },
    },
    {
        id: 'growth-scenarios', label: 'Growth Trends & Scenarios', icon: '🚀',
        description: 'Your actual revenue growth history, plus modeled growth paths and their impact on the business',
        keywords: ['budget', 'scenario', 'growth plan', 'growth trend', 'revenue growth', 'growth rate'],
        screen: 'reports', navParams: { reportSection: 'growth', reportTab: 'growth' },
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
        screen: 'reports', navParams: { reportSection: 'tax', reportTab: 'tax-filing' },
    },
    {
        id: 'business-passport', label: 'Business Passport', icon: '🛂',
        description: 'The continuously-updating financial identity of the business — identity, health, risk, credit readiness, investment readiness, growth, and what to do next',
        keywords: ['position', 'strategy', 'biggest lever', 'action plan', 'passport', 'identity', 'clarity'],
        screen: 'business-passport',
    },
    {
        id: 'credit-worthiness', label: 'Credit-Worthiness', icon: '💳',
        description: 'Payment history, credit utilization, cash flow health, Estimated Lending Capacity, and a Lender-Ready Summary export',
        keywords: ['credit score', 'creditworthiness', 'lender', 'bank', 'loan readiness', 'visibility score'],
        screen: 'credit-worthiness',
    },
    {
        id: 'financing-marketplace', label: 'Financing Marketplace', icon: '🤝',
        description: 'Sample financing products matched against your business — fit score, why, and what to improve for each',
        keywords: ['financing', 'lenders', 'loan marketplace', 'asset financing', 'working capital', 'invoice financing', 'trade finance', 'fit score'],
        screen: 'financing-marketplace',
    },
    {
        id: 'financial-health', label: 'Financial Health (Mobile Money)', icon: '📱',
        description: 'Pulls income and account signals from mobile money data via phone number — requires the backend integration to be deployed',
        keywords: ['mobile money', 'pngme', 'phone', 'income verification'],
        screen: 'financial-health',
    },
    {
        id: 'mission-vision', label: 'Mission, Vision & Values', icon: '🧭',
        description: 'Set your destination, how you get there daily, and how your team behaves — shown alongside your weekly priorities',
        keywords: ['mission', 'vision', 'values', 'purpose', 'guideline', 'north star', 'culture'],
        screen: 'settings',
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
        description: 'Connect today\'s numbers to your financial goals — open a goal\'s "View Plan" on the Goals screen',
        keywords: ['goals', 'targets'],
        screen: 'goals',
    },
    {
        id: 'import-bank-statement', label: 'Import Bank Statement', icon: '🏦',
        description: 'Upload a bank statement to auto-import transactions',
        keywords: ['import', 'bank statement', 'csv', 'upload'],
        screen: 'import-transactions',
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
        screen: 'reports', navParams: { reportSection: 'tax', reportTab: 'tax-planning' },
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
