import { DebtRecord, DocumentChecklist, Invoice, Project, Transaction } from '../types';

// In-memory store standing in for the managed Postgres + data lake described
// in ARCHITECTURE.md. Swap this module for a real repository layer without
// touching route handlers, which only ever import from here.

export const BUSINESS_ID = 'biz-obi-fresh-foods';

export const projects: Project[] = [
    { id: 'proj-main', businessId: BUSINESS_ID, name: 'Main Business', walletBalance: 1850000, createdAt: '2025-01-10' },
    { id: 'proj-catering', businessId: BUSINESS_ID, name: 'Catering Line', walletBalance: 420000, createdAt: '2025-03-02' },
    { id: 'proj-expansion', businessId: BUSINESS_ID, name: 'Lekki Branch Expansion', walletBalance: 175000, createdAt: '2026-02-15' },
];

export const transactions: Transaction[] = [
    { id: 't1', date: '2026-07-29', description: 'POS settlement - retail sales', amount: 340000, type: 'income', source: 'POS Terminal', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't2', date: '2026-07-28', description: 'Transfer to landlord - shop rent', amount: -250000, type: 'expense', source: 'Bank Account', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't3', date: '2026-07-28', description: 'Payment to supplier - flour and packaging', amount: -180000, type: 'expense', source: 'Bank Account', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't4', date: '2026-07-27', description: 'Withdrawal - school fees for kids', amount: -95000, type: 'expense', source: 'Mobile Money', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't5', date: '2026-07-26', description: 'Staff salaries - July', amount: -220000, type: 'expense', source: 'Bank Account', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't6', date: '2026-07-25', description: 'NEPA / electricity bill payment', amount: -38000, type: 'expense', source: 'Mobile Money', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't7', date: '2026-07-24', description: 'Catering event deposit - Adeyemi wedding', amount: 500000, type: 'income', source: 'Bank Account', projectId: 'proj-catering', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't8', date: '2026-07-23', description: 'Loan repayment - Moniepoint working capital', amount: -60000, type: 'expense', source: 'Bank Account', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't9', date: '2026-07-22', description: 'Personal - hair salon appointment', amount: -25000, type: 'expense', source: 'POS Terminal', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't10', date: '2026-07-21', description: 'POS settlement - retail sales', amount: 298000, type: 'income', source: 'POS Terminal', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't11', date: '2026-07-20', description: 'Transfer to self - personal upkeep', amount: -70000, type: 'expense', source: 'Mobile Money', projectId: 'proj-main', category: 'Uncategorized', isPersonal: false, isCommingled: false },
    { id: 't12', date: '2026-07-18', description: 'Building materials - Lekki branch renovation', amount: -310000, type: 'expense', source: 'Bank Account', projectId: 'proj-expansion', category: 'Uncategorized', isPersonal: false, isCommingled: false },
];

export const invoices: Invoice[] = [
    { id: 'inv1', client: 'GreenLeaf Supermarket', amount: 420000, issuedDate: '2026-06-30', dueDate: '2026-07-14', paid: false },
    { id: 'inv2', client: 'Adeyemi Events', amount: 500000, issuedDate: '2026-07-01', dueDate: '2026-07-31', paid: false },
    { id: 'inv3', client: 'Zenith Retail Ltd', amount: 610000, issuedDate: '2026-05-20', dueDate: '2026-06-19', paid: false },
    { id: 'inv4', client: 'Coral Hotels', amount: 260000, issuedDate: '2026-07-20', dueDate: '2026-08-19', paid: false },
];

export const debtRecords: DebtRecord[] = [
    { id: 'd1', lender: 'Moniepoint', principal: 500000, onTimePayments: 9, missedPayments: 1, active: true },
    { id: 'd2', lender: 'Carbon', principal: 200000, onTimePayments: 6, missedPayments: 0, active: false },
];

export const documentChecklists: Record<string, DocumentChecklist> = {
    [BUSINESS_ID]: {
        hasTaxFilings: true,
        hasBankStatements: true,
        hasBusinessRegistration: false,
        hasFinancialStatements: false,
    },
};

export const lenderShares: Array<{ businessId: string; lenderId: string; sharedAt: string }> = [];
