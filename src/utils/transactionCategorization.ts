import AsyncStorage from '@react-native-async-storage/async-storage';

// Shared by every place a raw bank-statement description needs to become a
// transaction category: ImportTransactionsScreen's CSV/Excel/PDF/photo-scan
// flow, and ReconciliationScreen's "import this unmatched bank row" action.
// Previously ReconciliationScreen had its own hardcoded ternary
// (credit -> 'Sales', debit -> 'Operating Expense') that never benefited
// from any of the keyword coverage built up here -- a transaction imported
// through Reconciliation and the same transaction imported through the main
// Import screen could land in different categories for no reason a user
// would ever guess. Keeping one canonical rule set (and one learned-rules
// cache) closes that drift for good.

export type TxCategory = 'income' | 'expense' | 'cost' | 'asset' | 'unknown';

export interface CategoryResult {
    category: TxCategory;
    subCategory: string;
    flagged: boolean;
}

export const CATEGORY_RULES: { keywords: string[]; category: TxCategory; subCategory: string }[] = [
    { keywords: ['salary', 'payroll', 'wage', 'staff pay'],                                         category: 'expense',  subCategory: 'Payroll' },
    { keywords: ['rent', 'lease', 'office rent'],                                                   category: 'expense',  subCategory: 'Rent' },
    { keywords: ['diesel', 'fuel', 'petrol', 'gas station'],                                        category: 'expense',  subCategory: 'Fuel & Generator' },
    { keywords: ['airtime', 'data', 'mtn', 'airtel', 'glo', '9mobile', 'etisalat'],                category: 'expense',  subCategory: 'Utilities' },
    { keywords: ['electricity', 'nepa', 'phcn', 'eko electric', 'ikedc', 'aedc', 'kedco'],         category: 'expense',  subCategory: 'Utilities' },
    { keywords: ['water', 'lawma', 'waste'],                                                        category: 'expense',  subCategory: 'Utilities' },
    { keywords: ['internet', 'wifi', 'spectranet', 'smile', 'ipnx', 'swift'],                      category: 'expense',  subCategory: 'Internet' },
    { keywords: ['supplier', 'stock', 'inventory', 'goods', 'raw material', 'merchandise'],        category: 'cost',     subCategory: 'Cost of Goods' },
    { keywords: ['equipment', 'laptop', 'machine', 'vehicle', 'generator', 'furniture', 'asset'],  category: 'asset',    subCategory: 'Asset Purchase' },
    { keywords: ['software', 'license', 'licence', 'subscription', 'saas', 'renewal', 'app store', 'play store'], category: 'expense', subCategory: 'Software & Subscriptions' },
    { keywords: ['advert', 'marketing', 'promotion', 'flyer', 'banner', 'social media', 'google'], category: 'expense',  subCategory: 'Marketing' },
    { keywords: ['transport', 'uber', 'bolt', 'taxi', 'logistics', 'dispatch', 'delivery'],        category: 'expense',  subCategory: 'Transport' },
    { keywords: ['pos purchase', 'pos payment', 'pos trxn'],                                       category: 'expense',  subCategory: 'POS Purchase' },
    { keywords: ['loan repayment', 'loan payment', 'emi', 'mortgage repayment'],                   category: 'expense',  subCategory: 'Loan Repayment' },
    // 'paystack'/'flutterwave' bare are deliberately left out -- both also
    // appear in a genuine incoming-settlement description (e.g. "Paystack
    // settlement — sales"), which this rule runs before the income rules
    // below and would wrongly claim as an expense. Only phrasing that
    // names an actual deducted FEE is safe here -- real gap for any
    // e-commerce/online-payment business (the app's own Flutterwave/
    // Paystack checkout, see PaymentLinkScreen), whose every card/transfer
    // sale carries one of these on the statement.
    { keywords: ['bank charge', 'sms charge', 'maintenance fee', 'card fee', 'vat charge', 'paystack fee', 'flutterwave fee', 'gateway fee', 'processing fee', 'settlement fee', 'transaction fee'], category: 'expense',  subCategory: 'Bank Charges' },
    // Income signals
    { keywords: ['invoice', 'sales', 'revenue', 'payment received', 'customer payment', 'client payment'], category: 'income', subCategory: 'Sales Revenue' },
    { keywords: ['consulting', 'consultation', 'retainer', 'professional fee', 'service fee', 'contract payment', 'freelance', 'commission'], category: 'income', subCategory: 'Service Income' },
    { keywords: ['transfer from', 'trf from', 'payment from'],                                     category: 'income',   subCategory: 'Transfer Received' },
    { keywords: ['interest earned', 'interest credit'],                                             category: 'income',   subCategory: 'Interest' },
    { keywords: ['refund', 'reversal'],                                                             category: 'income',   subCategory: 'Refund' },
    // Internal transfers -- money moving to the business's own savings/
    // reserve account, not actually leaving the business. Not a P&L
    // expense, but the row still needs a bucket to land in without being
    // flagged, since a user can't correctly guess what category "Transfer
    // to Savings Account" belongs in any more than the app can.
    { keywords: ['transfer to savings', 'transfer to reserve', 'trf to savings', 'own account transfer', 'internal transfer'], category: 'expense', subCategory: 'Internal Transfer' },
];

// ─── Learned rules ────────────────────────────────────────────────────────────
// Persisted to AsyncStorage so a category correction made in one import
// session still applies to future statement uploads, not just this one.
const LEARNED_RULES_KEY = 'quad360_learned_category_rules_v1';
const learnedRules: Map<string, { category: TxCategory; subCategory: string }> = new Map();
let learnedRulesLoaded = false;

export async function loadLearnedRules(): Promise<void> {
    if (learnedRulesLoaded) return;
    learnedRulesLoaded = true;
    try {
        const raw = await AsyncStorage.getItem(LEARNED_RULES_KEY);
        if (raw) {
            const entries: [string, { category: TxCategory; subCategory: string }][] = JSON.parse(raw);
            entries.forEach(([k, v]) => learnedRules.set(k, v));
        }
    } catch { /* ignore corrupt/missing cache */ }
}

export function persistLearnedRules(): void {
    AsyncStorage.setItem(LEARNED_RULES_KEY, JSON.stringify(Array.from(learnedRules.entries()))).catch(() => {});
}

// Records a user's manual correction so future imports (from any of the
// screens sharing this module) recognise the same description. "unknown"
// (the picker's "Not sure" option) is an honest non-answer and must never
// get memorized as if it were the correct category for similar transactions
// later.
export function learnCategory(description: string, category: TxCategory, subCategory: string): void {
    if (category === 'unknown') return;
    const key = normalise(description).split(' ').slice(0, 4).join(' ');
    learnedRules.set(key, { category, subCategory });
    persistLearnedRules();
}

export function normalise(s: string): string {
    return (s || '').toLowerCase().trim();
}

// Whether a rule's category is even plausible for the statement row's own
// credit/debit direction -- 'cost'/'asset'/'expense' are all outflow-shaped,
// 'income' is inflow-shaped. Without this, a rule's keywords could win
// regardless of direction: "POS Trxn — customer cash withdrawal" or "Loan
// repayment received from customer" are ordinary INCOME for a POS
// agent/agent-banking business or a moneylender/microfinance business --
// the exact activity those keyword rules assume is always an expense, for
// every other business. Forcing an expense-shaped category onto a real
// income transaction (or vice-versa) is worse than not matching at all --
// it silently mixes that revenue into an expense-looking bucket in Category
// Breakdown/Cost Exposure. Falling through to the next rule, and ultimately
// to the honest flagged default, is strictly safer.
function ruleMatchesDirection(category: TxCategory, direction: 'income' | 'expense'): boolean {
    return category === 'income' ? direction === 'income' : direction === 'expense';
}

export function classifyByDescription(desc: string, direction: 'income' | 'expense'): CategoryResult {
    const d = normalise(desc);

    // Check learned rules first -- a user's own explicit correction is
    // never gated by direction; they taught the app this exact mapping.
    for (const [pattern, result] of learnedRules.entries()) {
        if (d.includes(pattern)) return { ...result, flagged: false };
    }

    for (const rule of CATEGORY_RULES) {
        if (rule.keywords.some(k => d.includes(k)) && ruleMatchesDirection(rule.category, direction)) {
            return { category: rule.category, subCategory: rule.subCategory, flagged: false };
        }
    }

    // Default to direction with unknown sub-category → flagged for review
    return { category: direction, subCategory: direction === 'income' ? 'Other Income' : 'Other Expense', flagged: true };
}
