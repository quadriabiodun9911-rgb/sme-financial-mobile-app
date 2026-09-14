/**
 * Post-Financing Intelligence, Phase 2b: turns the one-off Phase 2a export
 * (lenderSummaryExport.ts's buildPostFinancingShareExport) into an ongoing,
 * opted-in feed. Same coarsening discipline as that export -- category-level
 * status and flags only, never the numeric DSCR, revenue figures, or
 * transaction detail computePostFinancingMonitor's own signals carry -- and
 * the same "app computes, then upserts only derived output" pattern
 * financingPipeline.ts's publishPipelineListing already uses.
 *
 * Requires the loan to already be linked to a real lender_organizations row
 * (Loan.lenderOrgId, see lenderDirectory.ts). A loan whose lender isn't a
 * registered Quad360 lender simply has nothing to publish to -- that's
 * surfaced as an error the caller shows, not silently swallowed.
 */

import { getAuthUserId } from './storage';
import { supabase } from './supabase';
import { Loan, LoanStatus } from '../types';
import { PostFinancingMonitor, PostFinancingStatus } from './postFinancingMonitor';
import { ReadinessTrend } from './readinessHistory';
import { auditEvents } from './auditLog';

const PRINCIPAL_BANDS: [number, string][] = [
    [500_000, 'Under 500K'],
    [2_000_000, '500K–2M'],
    [10_000_000, '2M–10M'],
    [50_000_000, '10M–50M'],
];
function bandPrincipal(principal: number): string {
    for (const [ceiling, label] of PRINCIPAL_BANDS) {
        if (principal < ceiling) return label;
    }
    return '50M+';
}

// Rolling consent window, not a one-time grant -- see migration 021. Reset
// to another SHARE_EXPIRY_DAYS out on every publish/renewal, so a loan
// actually being monitored never lapses; only a share nobody has touched
// in three months goes stale.
const SHARE_EXPIRY_DAYS = 90;
function nextExpiry(): string {
    return new Date(Date.now() + SHARE_EXPIRY_DAYS * 86400000).toISOString();
}

export async function publishLoanMonitoringShare(
    loan: Loan,
    monitor: PostFinancingMonitor,
    businessName: string,
    currency: string,
): Promise<{ ok: boolean; error?: string }> {
    if (!loan.lenderOrgId) return { ok: false, error: "This loan isn't linked to a lender on Quad360 yet." };
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'Not signed in.' };

    try {
        const dscrSignal = monitor.signals.find(s => s.label === 'Debt-service coverage');
        const revenueSignal = monitor.signals.find(s => s.label === 'Revenue trend since funding');
        const paceSignal = monitor.signals.find(s => s.label === 'Repayment pace');

        const row = {
            business_user_id: userId,
            lender_org_id: loan.lenderOrgId,
            loan_id: loan.id,
            business_name: businessName,
            status: monitor.status,
            readiness_trend: monitor.readinessSinceFunding?.trend ?? null,
            dscr_flag: !!dscrSignal?.tripped,
            revenue_decline_flag: !!revenueSignal?.tripped,
            repayment_pace_flag: !!paceSignal?.tripped,
            loan_purpose: loan.purpose || null,
            principal_band: bandPrincipal(loan.principal),
            // Needed so a lender's portfolio total (estimateOutstandingByCurrency
            // below) never sums bands from different currencies into one
            // meaningless number -- see migration 012.
            currency,
            // Terminal outcome (migration 035) -- mirrors loan.status verbatim
            // so a payoff/default is a fact the lender's portfolio can roll up,
            // not something that just silently drops off the feed.
            loan_status: loan.status,
            revenue_growth_pct: monitor.revenueSinceFunding?.pctChange ?? null,
            funded_at: loan.startDate,
            consent_active: true,
            expires_at: nextExpiry(),
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from('loan_monitoring_shares')
            .upsert(row, { onConflict: 'business_user_id,loan_id' });
        if (error) return { ok: false, error: error.message };
        auditEvents.lenderShareGranted(loan.id, loan.lenderOrgId);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not publish status.' };
    }
}

// A status flip, not a delete -- same "keep the row, exclude it via RLS"
// precedent as revokePipelineListing. Immediate: the moment consent_active
// is false, the lender's own SELECT policy stops matching this row.
export async function revokeLoanMonitoringShare(loanId: string): Promise<{ ok: boolean }> {
    try {
        const userId = await getAuthUserId();
        if (!userId) return { ok: false };
        const { error } = await supabase
            .from('loan_monitoring_shares')
            .update({ consent_active: false, updated_at: new Date().toISOString() })
            .eq('business_user_id', userId)
            .eq('loan_id', loanId);
        if (!error) auditEvents.lenderShareRevoked(loanId);
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}

// Manual extension for the Data Permission Centre's "Renew" action -- the
// automatic rolling renewal in publishLoanMonitoringShare only fires when
// the monitor's own status/trend/flags actually change (see LoansScreen's
// useEffect), so a loan that's been genuinely stable for months could
// otherwise lapse with nothing wrong. This bumps expires_at without
// requiring a fresh monitor computation.
export async function renewLoanMonitoringShare(loanId: string): Promise<{ ok: boolean }> {
    try {
        const userId = await getAuthUserId();
        if (!userId) return { ok: false };
        const { error } = await supabase
            .from('loan_monitoring_shares')
            .update({ expires_at: nextExpiry(), updated_at: new Date().toISOString() })
            .eq('business_user_id', userId)
            .eq('loan_id', loanId);
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}

// ─── Lender side (Phase 2b/2c) ──────────────────────────────────────────
// The one read a lender session does against this table. No lender_org_id
// filter is applied client-side -- RLS ("Active lenders can read consented
// shares for their org") already scopes every row to the caller's own
// lender_members membership, so an explicit filter here would be redundant,
// not an extra safeguard. Capped, same reasoning as loadPipelineListingsForLender.
export interface LoanMonitoringShareRow {
    id: string;
    loanId: string;
    businessName: string;
    status: PostFinancingStatus;
    readinessTrend: ReadinessTrend | null;
    dscrFlag: boolean;
    revenueDeclineFlag: boolean;
    repaymentPaceFlag: boolean;
    loanPurpose?: string;
    principalBand?: string;
    currency?: string;
    // Migration 035 -- both optional since rows published before that
    // migration (or by the demo fixtures below) may not carry them.
    loanStatus?: LoanStatus;
    revenueGrowthPct?: number;
    fundedAt: string;
    updatedAt: string;
    expiresAt: string;
}

// Rough midpoint of each band, for an ESTIMATED portfolio total only --
// never a substitute for a business's real principal, which this table
// deliberately never stores or shares (see file header). '50M+' is
// open-ended, so its "midpoint" is really just the band floor -- a
// portfolio with several large loans will under-, never over-, estimate.
// Any total built from this is explicitly a rough estimate, not a real
// sum, and callers must present it that way (e.g. an "~" prefix).
const PRINCIPAL_BAND_MIDPOINT: Record<string, number> = {
    'Under 500K': 250_000,
    '500K–2M': 1_250_000,
    '2M–10M': 6_000_000,
    '10M–50M': 30_000_000,
    '50M+': 50_000_000,
};

export interface CurrencyOutstandingEstimate {
    currency: string;
    total: number;
    businessCount: number;
}

// Grouped by currency, not summed across them -- a lender's funded
// businesses can span multiple currencies (Quad360 is multi-currency per
// business), and adding a Naira band midpoint to a Dollar one would produce
// a number with no real meaning. Rows published before migration 012
// (no currency recorded) are excluded from every total rather than guessed
// into a currency they were never confirmed to be in.
export function estimateOutstandingByCurrency(rows: LoanMonitoringShareRow[]): CurrencyOutstandingEstimate[] {
    const byCurrency = new Map<string, CurrencyOutstandingEstimate>();
    for (const r of rows) {
        if (!r.currency || !r.principalBand) continue;
        const amount = PRINCIPAL_BAND_MIDPOINT[r.principalBand] ?? 0;
        const existing = byCurrency.get(r.currency);
        if (existing) { existing.total += amount; existing.businessCount += 1; }
        else byCurrency.set(r.currency, { currency: r.currency, total: amount, businessCount: 1 });
    }
    return Array.from(byCurrency.values()).sort((a, b) => b.total - a.total);
}

export interface LenderConcentrationGroup {
    label: string;
    currency: string;
    estimatedAmount: number;
    loanCount: number;
    percentage: number;
    risk: 'low' | 'medium' | 'high';
}

// The lender-side counterpart of finance.ts's computeCustomerConcentration --
// same three-tier >=40%/>=20% risk cutoff, same "group first, never sum
// across currencies" discipline as estimateOutstandingByCurrency above, just
// answering "how exposed is MY BOOK to one borrower or one purpose" instead
// of "how exposed is this business to one customer." Weighted by estimated
// exposure (band midpoint), not loan count -- a single 50M+ facility
// dominating the book is the real risk a count-only view would understate.
// A band-less/currency-less row (predates migration 012, or the demo
// fixtures were edited without one) is excluded from every group, same as
// estimateOutstandingByCurrency.
export function computeLenderExposureConcentration(
    rows: LoanMonitoringShareRow[],
    dimension: 'business' | 'purpose',
): LenderConcentrationGroup[] {
    const byCurrency = new Map<string, LoanMonitoringShareRow[]>();
    for (const r of rows) {
        if (!r.currency || !r.principalBand) continue;
        const arr = byCurrency.get(r.currency) ?? [];
        arr.push(r);
        byCurrency.set(r.currency, arr);
    }

    const result: LenderConcentrationGroup[] = [];
    for (const [currency, currencyRows] of byCurrency) {
        const groups = new Map<string, { amount: number; count: number }>();
        let total = 0;
        for (const r of currencyRows) {
            const amount = PRINCIPAL_BAND_MIDPOINT[r.principalBand!] ?? 0;
            const label = dimension === 'business' ? r.businessName : (r.loanPurpose || 'Unspecified');
            const g = groups.get(label) ?? { amount: 0, count: 0 };
            g.amount += amount;
            g.count += 1;
            groups.set(label, g);
            total += amount;
        }
        for (const [label, { amount, count }] of groups) {
            const percentage = total > 0 ? (amount / total) * 100 : 0;
            const risk: LenderConcentrationGroup['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            result.push({ label, currency, estimatedAmount: amount, loanCount: count, percentage, risk });
        }
    }
    return result.sort((a, b) => b.percentage - a.percentage);
}

export interface LenderPortfolioOutcomes {
    activeCount: number;
    paidOffCount: number;
    defaultedCount: number;
    // Of loans with a known terminal outcome (paid off or defaulted) --
    // still-active loans haven't resolved yet, so including them would
    // understate a young portfolio's real repayment rate.
    repaymentRatePct: number | null;
    // Simple mean across every row carrying a revenueGrowthPct (i.e. at
    // least 2 months of revenue history since funding) -- not weighted by
    // exposure, since this answers "are the businesses I fund growing," a
    // headcount question, not a dollar-weighted one.
    avgRevenueGrowthPct: number | null;
    revenueGrowthSampleSize: number;
}

// The "real economic impact, in aggregate" rollup -- the single number set
// this whole feature exists to produce. Both numbers are honest about being
// null when there isn't enough data yet, same discipline as
// estimateOutstandingByCurrency's own "explicitly a rough estimate" framing.
export function computeLenderPortfolioOutcomes(rows: LoanMonitoringShareRow[]): LenderPortfolioOutcomes {
    let activeCount = 0, paidOffCount = 0, defaultedCount = 0;
    let revenueGrowthSum = 0, revenueGrowthSampleSize = 0;
    for (const r of rows) {
        if (r.loanStatus === 'paid_off') paidOffCount++;
        else if (r.loanStatus === 'defaulted') defaultedCount++;
        else activeCount++;
        if (typeof r.revenueGrowthPct === 'number' && !Number.isNaN(r.revenueGrowthPct)) {
            revenueGrowthSum += r.revenueGrowthPct;
            revenueGrowthSampleSize++;
        }
    }
    const resolvedCount = paidOffCount + defaultedCount;
    const repaymentRatePct = resolvedCount > 0 ? (paidOffCount / resolvedCount) * 100 : null;
    const avgRevenueGrowthPct = revenueGrowthSampleSize > 0 ? revenueGrowthSum / revenueGrowthSampleSize : null;
    return { activeCount, paidOffCount, defaultedCount, repaymentRatePct, avgRevenueGrowthPct, revenueGrowthSampleSize };
}

// Synthetic portfolio for the landing page's "Preview as Lender (Demo)" mode.
// Unlike the pipeline demo above, this table's rows DO carry a business name
// (see file header — funded businesses are no longer anonymous to their own
// lender), so every name here is deliberately, visibly fictional rather than
// resembling a real company.
export function getDemoPortfolioShares(): LoanMonitoringShareRow[] {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
    // fundedAt is rendered raw as "Funded {fundedAt}" (no Date formatting at
    // the call site) -- matches Loan.startDate's real format (date-only,
    // see demoData.ts's own `d()` helper) rather than a full ISO timestamp,
    // which would otherwise print the literal "T21:00:...Z" suffix.
    const daysAgoDate = (n: number) => daysAgo(n).split('T')[0];
    const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000).toISOString();
    return [
        { id: 'demo-p1', loanId: 'demo-loan-1', businessName: 'Sample Foods Co. (Demo)', status: 'healthy', readinessTrend: 'improving', dscrFlag: false, revenueDeclineFlag: false, repaymentPaceFlag: false, loanPurpose: 'Working capital', principalBand: '2M–10M', currency: '₦', loanStatus: 'active', revenueGrowthPct: 18.4, fundedAt: daysAgoDate(210), updatedAt: daysAgo(2), expiresAt: daysFromNow(88) },
        { id: 'demo-p2', loanId: 'demo-loan-2', businessName: 'Demo Textiles Ltd.', status: 'watch', readinessTrend: 'stable', dscrFlag: true, revenueDeclineFlag: false, repaymentPaceFlag: false, loanPurpose: 'Asset financing', principalBand: '500K–2M', currency: '₦', loanStatus: 'active', revenueGrowthPct: -3.9, fundedAt: daysAgoDate(140), updatedAt: daysAgo(5), expiresAt: daysFromNow(85) },
        { id: 'demo-p3', loanId: 'demo-loan-3', businessName: 'Sample Logistics (Demo)', status: 'at-risk', readinessTrend: 'declining', dscrFlag: true, revenueDeclineFlag: true, repaymentPaceFlag: true, loanPurpose: 'Fleet expansion', principalBand: '10M–50M', currency: '₦', loanStatus: 'active', revenueGrowthPct: -21.7, fundedAt: daysAgoDate(300), updatedAt: daysAgo(1), expiresAt: daysFromNow(89) },
        { id: 'demo-p4', loanId: 'demo-loan-4', businessName: 'Demo Home Goods Co.', status: 'healthy', readinessTrend: 'improving', dscrFlag: false, revenueDeclineFlag: false, repaymentPaceFlag: false, loanPurpose: 'Inventory restock', principalBand: '500K–2M', currency: '₦', loanStatus: 'paid_off', revenueGrowthPct: 34.6, fundedAt: daysAgoDate(95), updatedAt: daysAgo(3), expiresAt: daysFromNow(87) },
        { id: 'demo-p5', loanId: 'demo-loan-5', businessName: 'Demo Print Shop Ltd.', status: 'at-risk', readinessTrend: 'declining', dscrFlag: true, revenueDeclineFlag: true, repaymentPaceFlag: true, loanPurpose: 'Working capital', principalBand: '500K–2M', currency: '₦', loanStatus: 'defaulted', revenueGrowthPct: -48.2, fundedAt: daysAgoDate(260), updatedAt: daysAgo(30), expiresAt: daysFromNow(60) },
    ];
}

// ─── Business-owner side ────────────────────────────────────────────────
// For the Security Center's "who currently has an ongoing view of your
// data" signal -- counts only what's genuinely still live (consent_active
// = true), scoped by the owner-policy above to the caller's own rows.
export async function countMyActiveLoanMonitoringShares(): Promise<number> {
    try {
        const userId = await getAuthUserId();
        if (!userId) return 0;
        const { count, error } = await supabase
            .from('loan_monitoring_shares')
            .select('id', { count: 'exact', head: true })
            .eq('business_user_id', userId)
            .eq('consent_active', true)
            .gt('expires_at', new Date().toISOString());
        if (error) return 0;
        return count ?? 0;
    } catch {
        return 0;
    }
}

// Item-level counterpart of the count above, for the Data Permission
// Centre's "who has an ongoing view of my data" list -- each row is a
// live (consent_active = true) share the owner can individually revoke.
// businessName on the stored row is the SME's OWN name (see file header),
// not useful here; callers join loanId against their own Loan[] to show
// which lender/loan each row belongs to.
export async function loadMyActiveLoanMonitoringShares(): Promise<LoanMonitoringShareRow[]> {
    try {
        const userId = await getAuthUserId();
        if (!userId) return [];
        const { data, error } = await supabase
            .from('loan_monitoring_shares')
            .select('*')
            .eq('business_user_id', userId)
            .eq('consent_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('updated_at', { ascending: false });
        if (error || !data) return [];
        return (data as any[]).map(r => ({
            id: r.id,
            loanId: r.loan_id,
            businessName: r.business_name,
            status: r.status,
            readinessTrend: r.readiness_trend,
            dscrFlag: r.dscr_flag,
            revenueDeclineFlag: r.revenue_decline_flag,
            repaymentPaceFlag: r.repayment_pace_flag,
            loanPurpose: r.loan_purpose ?? undefined,
            principalBand: r.principal_band ?? undefined,
            currency: r.currency ?? undefined,
            loanStatus: r.loan_status ?? undefined,
            revenueGrowthPct: r.revenue_growth_pct ?? undefined,
            fundedAt: r.funded_at,
            updatedAt: r.updated_at,
            expiresAt: r.expires_at,
        }));
    } catch {
        return [];
    }
}

const LENDER_PORTFOLIO_LIMIT = 200;

export async function loadPortfolioSharesForLender(): Promise<LoanMonitoringShareRow[]> {
    try {
        const { data, error } = await supabase
            .from('loan_monitoring_shares')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(LENDER_PORTFOLIO_LIMIT);
        if (error || !data) return [];
        return (data as any[]).map(r => ({
            id: r.id,
            loanId: r.loan_id,
            businessName: r.business_name,
            status: r.status,
            readinessTrend: r.readiness_trend,
            dscrFlag: r.dscr_flag,
            revenueDeclineFlag: r.revenue_decline_flag,
            repaymentPaceFlag: r.repayment_pace_flag,
            loanPurpose: r.loan_purpose ?? undefined,
            principalBand: r.principal_band ?? undefined,
            currency: r.currency ?? undefined,
            loanStatus: r.loan_status ?? undefined,
            revenueGrowthPct: r.revenue_growth_pct ?? undefined,
            fundedAt: r.funded_at,
            updatedAt: r.updated_at,
            expiresAt: r.expires_at,
        }));
    } catch {
        return [];
    }
}
