import { Transaction, TransactionCategory } from '../types';

// Keyword rules stand in for the supervised classifier described in the
// architecture doc (a model trained on labeled Nigerian SME transaction
// text would replace this function's body without touching its callers).
const RULES: Array<{ category: TransactionCategory; isPersonal: boolean; keywords: string[] }> = [
    { category: 'Sales Revenue', isPersonal: false, keywords: ['pos settlement', 'sales', 'sale', 'invoice payment', 'deposit', 'customer payment'] },
    { category: 'Supplier Payment', isPersonal: false, keywords: ['supplier', 'raw material', 'inventory', 'stock purchase', 'flour', 'packaging', 'building materials', 'renovation'] },
    { category: 'Rent', isPersonal: false, keywords: ['rent', 'landlord', 'lease'] },
    { category: 'Payroll', isPersonal: false, keywords: ['salary', 'salaries', 'payroll', 'wages'] },
    { category: 'Utilities', isPersonal: false, keywords: ['electricity', 'nepa', 'phcn', 'water bill', 'internet bill', 'data subscription'] },
    { category: 'Loan Repayment', isPersonal: false, keywords: ['loan repayment', 'loan installment', 'moniepoint working capital', 'carbon repayment'] },
    { category: 'Personal Expense', isPersonal: true, keywords: ['school fees', 'salon', 'personal', 'family', 'shopping', 'medical bill', 'vacation'] },
    { category: 'Personal Withdrawal', isPersonal: true, keywords: ['transfer to self', 'personal upkeep', 'cash withdrawal', 'atm withdrawal'] },
    { category: 'Transfer', isPersonal: false, keywords: ['transfer to', 'transfer from'] },
];

export function categorizeTransaction(description: string): { category: TransactionCategory; isPersonal: boolean } {
    const normalized = description.toLowerCase();
    for (const rule of RULES) {
        if (rule.keywords.some((kw) => normalized.includes(kw))) {
            return { category: rule.category, isPersonal: rule.isPersonal };
        }
    }
    return { category: 'Uncategorized', isPersonal: false };
}

// Every wallet in this prototype belongs to the business, so any transaction
// classified as personal activity flowing through it is commingling -
// the single biggest driver of "unbankable" status per the product brief.
export function categorizeTransactions(transactions: Transaction[]): Transaction[] {
    return transactions.map((tx) => {
        const { category, isPersonal } = categorizeTransaction(tx.description);
        return {
            ...tx,
            category,
            isPersonal,
            isCommingled: isPersonal,
        };
    });
}
