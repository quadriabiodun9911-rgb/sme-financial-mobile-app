/**
 * Flags business-account expense transactions that look like personal
 * spending -- school fees, family support, personal grooming, nightlife,
 * streaming subscriptions, home rent, an explicit owner drawing. This is
 * one of the more damaging data-quality problems an SME's bank statement
 * can carry: a profit figure that quietly includes the owner's personal
 * spending overstates the business's real cost base and understates real
 * profit, or vice versa if it's excluded inconsistently.
 *
 * Deliberately conservative: every keyword here is specific enough to a
 * personal-life context that it shouldn't collide with a normal business
 * expense. "Rent" alone is NOT included -- transactionCategorization.ts
 * already treats generic "rent"/"office rent" as a legitimate business
 * expense, and most SMEs really do pay shop/office rent from this account,
 * so flagging every rent payment as personal would be wrong far more often
 * than it's right. Only "home rent"/"apartment rent"/"house rent" (a
 * description that says the rent ISN'T the business premises) qualifies.
 * Never auto-recategorizes anything -- this only flags for the owner to
 * confirm or dismiss, the same way "Needs Review" does in dataQuality.ts.
 */

import { Transaction } from '../types';

// Shared AsyncStorage key for the owner's "not personal" confirmations --
// exported so every screen that reads this list (TransactionsScreen's row
// action, DashboardScreen's warning banner) reads the exact same key
// rather than each hardcoding its own copy of the string.
export const DISMISSED_PERSONAL_KEY = '@quad360/dismissed_personal_flags';

export interface PersonalSpendingFlag {
    transactionId: string;
    reason: string;
}

export interface PersonalSpendingReport {
    flaggedCount: number;
    estimatedPersonalAmount: number;
    flagged: PersonalSpendingFlag[];
    summary: string;
}

// The "nightlife" rule is kept separate from PERSONAL_RULES below --
// "lounge"/"nightclub"/"bar tab" catches a genuine personal outing for
// most businesses, but for a bar, lounge, or nightclub itself (which
// registers under the 'food-service' industry -- see SettingsScreen's
// INDUSTRIES list), those exact words describe the business's own normal
// operations ("Lounge furniture restock", "Nightclub sound equipment").
// Applying it there would flag the business for being itself. Excluded
// only for food-service; every other industry keeps this rule exactly as
// before, since the same wording genuinely would be anomalous for a
// retailer, manufacturer, or professional-services firm.
const NIGHTLIFE_RULE = { keywords: ['nightclub', 'night club', 'lounge', 'bar tab', 'club vip'], reason: 'Looks like personal nightlife spending' };

// Same reasoning as NIGHTLIFE_RULE, but for a wider band of industries:
// "owambe"/"aso ebi"/"birthday party" are core vocabulary for an events &
// entertainment business (a planner, a caterer doing party bookings, an
// aso-ebi fabric vendor, a party-rental supplier) -- "Owambe event
// equipment rental", "Aso ebi fabric supply for client", "Birthday party
// decor booking" are all real revenue-generating work, not a personal
// celebration paid for from business funds. That business could plausibly
// register under Retail (fabric/rental supplies), Food Service
// (catering), or Professional Services (planning/coordination) -- none of
// the five options fits "events & entertainment" specifically -- so this
// is excluded for all three rather than guessing which one. Kept active
// for General and Manufacturing, where this vocabulary genuinely has no
// legitimate business reading.
const CELEBRATION_RULE = { keywords: ['owambe', 'birthday party', 'wedding contribution', 'aso ebi', 'wedding gift'], reason: 'Looks like a personal social/celebration expense' };
const CELEBRATION_RULE_EXCLUDED_INDUSTRIES = new Set(['retail', 'food-service', 'professional-services']);

// Same reasoning again: "salon"/"spa"/"barbing"/"barber"/"hairdresser"/
// "manicure"/"pedicure" are the core vocabulary of a salon & beauty
// business's own expenses -- "Salon chair repair", "Barbing clippers
// restock", "Spa towels and product supplies", "Hairdresser training
// course" are real operating costs, not the owner treating themselves.
// That business sells a personal-care SERVICE (closest fit: Professional
// Services) but may also register as Retail if beauty products are a real
// part of the business. Food Service and Manufacturing keep this rule
// active -- neither has a plausible reading for this vocabulary.
const GROOMING_RULE = { keywords: ['salon', 'spa', 'barbing', 'barber', 'hairdresser', 'manicure', 'pedicure'], reason: 'Looks like personal grooming' };
const GROOMING_RULE_EXCLUDED_INDUSTRIES = new Set(['retail', 'professional-services']);

const PERSONAL_RULES: { keywords: string[]; reason: string }[] = [
    { keywords: ['school fees', 'school fee', 'tuition'], reason: 'Looks like a school-fees payment' },
    { keywords: ['family support', 'family upkeep', 'send family', 'family expense', 'family feeding'], reason: 'Looks like a family expense' },
    { keywords: ['netflix', 'spotify', 'dstv', 'gotv', 'showmax', 'amazon prime', 'apple music'], reason: 'Looks like a personal entertainment subscription' },
    { keywords: ['gym membership', 'fitness club'], reason: 'Looks like a personal gym/fitness expense' },
    { keywords: ['personal shopping', 'personal purchase'], reason: 'Looks like personal shopping' },
    { keywords: ['home rent', 'apartment rent', 'house rent', 'residential rent'], reason: 'Looks like personal (home) rent, not business rent' },
    { keywords: ['owner withdrawal', 'personal withdrawal', 'director drawing', "owner's drawing", 'proprietor drawing', "owner's personal"], reason: 'Recorded as an owner drawing from the business' },
];

function normalise(s: string): string {
    return (s || '').toLowerCase().trim();
}

/**
 * @param dismissedIds transaction ids the owner has already reviewed and
 * confirmed are real business spending -- excluded from the report so a
 * false positive doesn't keep nagging every time the list re-renders.
 * @param industry settings.industry -- gates out the nightlife rule for a
 * food-service business (see NIGHTLIFE_RULE's own comment), the
 * celebration rule for Retail/Food Service/Professional Services (see
 * CELEBRATION_RULE's own comment), and the grooming rule for Retail/
 * Professional Services (see GROOMING_RULE's own comment). Every other
 * industry, and the unset/undefined default, keeps all three rules active.
 */
export function detectPersonalSpending(transactions: Transaction[], currency: string = '₦', dismissedIds: string[] = [], industry?: string): PersonalSpendingReport {
    const dismissed = new Set(dismissedIds);
    const flagged: PersonalSpendingFlag[] = [];
    let estimatedPersonalAmount = 0;
    const rules = [...PERSONAL_RULES];
    if (industry !== 'food-service') rules.push(NIGHTLIFE_RULE);
    if (!industry || !CELEBRATION_RULE_EXCLUDED_INDUSTRIES.has(industry)) rules.push(CELEBRATION_RULE);
    if (!industry || !GROOMING_RULE_EXCLUDED_INDUSTRIES.has(industry)) rules.push(GROOMING_RULE);

    for (const t of transactions) {
        if (t.type !== 'expense' || dismissed.has(t.id)) continue;
        const d = normalise(t.description);
        const rule = rules.find(r => r.keywords.some(k => d.includes(k)));
        if (rule) {
            flagged.push({ transactionId: t.id, reason: rule.reason });
            estimatedPersonalAmount += t.amount ?? 0;
        }
    }

    const flaggedCount = flagged.length;
    const summary = flaggedCount === 0
        ? 'No transactions look like personal spending.'
        : `Estimated personal transactions: ${currency}${Math.round(estimatedPersonalAmount).toLocaleString()} across ${flaggedCount} transaction${flaggedCount === 1 ? '' : 's'}. These appear unrelated to your business activity — review them before relying on this month's profit estimate.`;

    return { flaggedCount, estimatedPersonalAmount, flagged, summary };
}
