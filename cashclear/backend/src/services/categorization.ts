import { Transaction, TransactionCategory } from '../types';

// Stands in for the "Transaction Categorization" core service in the
// architecture diagram: a supervised model trained on labeled Nigerian SME
// transaction text. Same input/output contract, so the rule table below can
// be replaced by a model call without touching route handlers.
const RULES: Array<{ category: TransactionCategory; isPersonal: boolean; keywords: string[] }> = [
    { category: 'Sales Revenue', isPersonal: false, keywords: ['pos settlement', 'sales', 'sale', 'invoice payment', 'deposit', 'customer payment'] },
    { category: 'Supplier Payment', isPersonal: false, keywords: ['supplier', 'raw material', 'inventory', 'stock purchase', 'flour', 'packaging', 'building materials', 'renovation'] },
    { category: 'Rent', isPersonal: false, keywords: ['rent', 'landlord', 'lease'] },
    { category: 'Payroll', isPersonal: false, keywords: ['salary', 'salaries', 'payroll', 'wages'] },
    { category: 'Utilities', isPersonal: false, keywords: ['electricity', 'nepa', 'phcn', 'water bill', 'internet bill', 'data subscription'] },
    { category: 'Loan Repayment', isPersonal: false, keywords: ['loan repayment', 'loan installment', 'working capital', 'repayment'] },
    { category: 'Personal Expense', isPersonal: true, keywords: ['school fees', 'salon', 'personal', 'family', 'shopping', 'medical bill', 'vacation'] },
    { category: 'Personal Withdrawal', isPersonal: true, keywords: ['transfer to self', 'personal upkeep', 'cash withdrawal', 'atm withdrawal'] },
    { category: 'Transfer', isPersonal: false, keywords: ['transfer to', 'transfer from'] },
];

export function categorizeDescription(description: string): { category: TransactionCategory; isPersonal: boolean } {
    const normalized = description.toLowerCase();
    for (const rule of RULES) {
        if (rule.keywords.some((kw) => normalized.includes(kw))) {
            return { category: rule.category, isPersonal: rule.isPersonal };
        }
    }
    return { category: 'Uncategorized', isPersonal: false };
}

export function categorizeTransactions(txs: Transaction[]): Transaction[] {
    return txs.map((tx) => {
        const { category, isPersonal } = categorizeDescription(tx.description);
        return { ...tx, category, isPersonal, isCommingled: isPersonal };
    });
}
