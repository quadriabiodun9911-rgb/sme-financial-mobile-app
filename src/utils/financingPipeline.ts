/**
 * SME-side of the lender pipeline — Phase 1 of the Lender Auth &
 * Financing-Visibility Flow (see that scope document). Publishes an
 * opted-in, aggregated readiness snapshot into financing_pipeline_listings
 * (supabase/migrations/008_lender_pipeline_phase0.sql) — never a raw
 * transaction, never an exact revenue figure. No lender-facing screen
 * reads from this yet (that's Phase 2); this is the write side only, used
 * by FinancingMarketplaceScreen's "Be Visible to Lenders" section.
 *
 * Publishing is deliberately owner-only. This module keys every row on
 * getAuthUserId() (the signed-in session's own id) rather than
 * getWorkspaceOwnerId() (the pattern every other per-business table uses,
 * so a team member's writes land under the business owner's row) —
 * financing_pipeline_listings' RLS policy checks business_user_id =
 * auth.uid() directly, and lender visibility is gated to the owner role in
 * the UI, so the two ids are always the same account here regardless.
 */

import { getAuthUserId } from './storage';
import { supabase } from './supabase';
import { FinancingProductType, PipelineListing, PipelineListingStatus } from '../types';

interface PipelineListingRow {
    id: string;
    business_user_id: string;
    financing_type: string;
    grade: string | null;
    band: string | null;
    score: number | null;
    dscr: number | null;
    dscr_status: string | null;
    sector: string | null;
    revenue_band: string | null;
    requested_amount: number | null;
    purpose: string | null;
    status: string;
    opted_in_at: string;
    expires_at: string | null;
}

function rowToListing(row: PipelineListingRow): PipelineListing {
    return {
        id: row.id,
        financingType: row.financing_type as FinancingProductType,
        grade: row.grade ?? '',
        band: row.band ?? '',
        score: row.score ?? 0,
        dscr: row.dscr ?? 0,
        dscrStatus: (row.dscr_status ?? 'warning') as PipelineListing['dscrStatus'],
        sector: row.sector ?? undefined,
        revenueBand: row.revenue_band ?? undefined,
        requestedAmount: row.requested_amount ?? undefined,
        purpose: row.purpose ?? undefined,
        status: row.status as PipelineListingStatus,
        optedInAt: row.opted_in_at,
        expiresAt: row.expires_at ?? undefined,
    };
}

// Bucketed, not exact — the scope document's non-negotiable constraint on
// revenue exposure (Constraint 3). Boundaries are currency-symbol-generic
// since the app supports more than one currency; annualRevenue should be
// an annualized figure (FinancingFitInput.annualRevenue already is one).
export function bandRevenue(annualRevenue: number, currency: string): string {
    const bands: [number, string][] = [
        [1_000_000, `Under ${currency}1M`],
        [5_000_000, `${currency}1M–5M`],
        [10_000_000, `${currency}5M–10M`],
        [50_000_000, `${currency}10M–50M`],
        [100_000_000, `${currency}50M–100M`],
        [500_000_000, `${currency}100M–500M`],
    ];
    for (const [ceiling, label] of bands) {
        if (annualRevenue < ceiling) return label;
    }
    return `${currency}500M+`;
}

const EXPIRY_DAYS = 90;

export interface PublishListingInput {
    financingType: FinancingProductType;
    grade: string;
    band: string;
    score: number;
    dscr: number;
    dscrStatus: 'healthy' | 'warning' | 'danger';
    sector?: string;
    revenueBand?: string;
    requestedAmount?: number;
    purpose?: string;
}

export async function publishPipelineListing(input: PublishListingInput): Promise<{ ok: boolean; error?: string }> {
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'Not signed in.' };

    try {
        // No DB-level unique constraint on (business_user_id, financing_type)
        // — re-opting-in for a type already listed updates that row instead
        // of creating a duplicate.
        const { data: existing } = await supabase
            .from('financing_pipeline_listings')
            .select('id')
            .eq('business_user_id', userId)
            .eq('financing_type', input.financingType)
            .maybeSingle();

        const now = new Date();
        const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const row = {
            business_user_id: userId,
            financing_type: input.financingType,
            grade: input.grade,
            band: input.band,
            score: input.score,
            dscr: input.dscr,
            dscr_status: input.dscrStatus,
            sector: input.sector ?? null,
            revenue_band: input.revenueBand ?? null,
            requested_amount: input.requestedAmount ?? null,
            purpose: input.purpose ?? null,
            status: 'active' as PipelineListingStatus,
            opted_in_at: now.toISOString(),
            expires_at: expiresAt,
        };

        const { error } = existing
            ? await supabase.from('financing_pipeline_listings').update(row).eq('id', existing.id)
            : await supabase.from('financing_pipeline_listings').insert(row);

        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not publish listing.' };
    }
}

// Excludes 'inactive' rather than filtering to only 'active', so a
// 'matched' listing still shows in the SME's own view of their pipeline
// presence even though it's no longer what a lender's RLS-scoped SELECT
// would surface as available.
export async function loadMyPipelineListings(): Promise<PipelineListing[]> {
    const userId = await getAuthUserId();
    if (!userId) return [];
    try {
        const { data, error } = await supabase
            .from('financing_pipeline_listings')
            .select('*')
            .eq('business_user_id', userId)
            .neq('status', 'inactive');
        if (error || !data) return [];
        return (data as PipelineListingRow[]).map(rowToListing);
    } catch {
        return [];
    }
}

// A status flip, not a delete — keeps the row (e.g. a 'matched' listing's
// history) while immediately removing it from what any lender's RLS-scoped
// SELECT can see (that policy only matches status = 'active').
export async function revokePipelineListing(id: string): Promise<{ ok: boolean }> {
    try {
        const { error } = await supabase
            .from('financing_pipeline_listings')
            .update({ status: 'inactive' })
            .eq('id', id);
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}

// ─── Lender side (Phase 2) ──────────────────────────────────────────────
// The one read a lender session ever does against this table. No filters
// are applied here beyond what the caller passes in — access control is
// entirely RLS's job (migration 008's "Active lenders can read active
// listings" policy), not this function's. An unverified/pending lender's
// query simply returns nothing, same result as if the table were empty.
export interface PipelineListingFilters {
    financingType?: FinancingProductType;
    sector?: string;
    minGrade?: string; // 'A' | 'B' | 'C' | 'D' | 'F' — filters client-side, see GRADE_ORDER below
    dscrStatus?: 'healthy' | 'warning' | 'danger';
    minAmount?: number;
    maxAmount?: number;
}

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A'];

// Capped rather than unbounded: at scale the active-listings table can grow
// far past what any lender screen renders or a person reviews in one
// sitting. Most-recent-first ordering means the cap trims the long tail,
// not what a lender actually wants to see next.
const LENDER_QUERY_LIMIT = 200;

export async function loadPipelineListingsForLender(filters: PipelineListingFilters = {}): Promise<PipelineListing[]> {
    try {
        let query = supabase.from('financing_pipeline_listings').select('*').eq('status', 'active');
        if (filters.financingType) query = query.eq('financing_type', filters.financingType);
        if (filters.sector) query = query.eq('sector', filters.sector);
        if (filters.dscrStatus) query = query.eq('dscr_status', filters.dscrStatus);
        if (filters.minAmount !== undefined) query = query.gte('requested_amount', filters.minAmount);
        if (filters.maxAmount !== undefined) query = query.lte('requested_amount', filters.maxAmount);

        const { data, error } = await query.order('opted_in_at', { ascending: false }).limit(LENDER_QUERY_LIMIT);
        if (error || !data) return [];
        let listings = (data as PipelineListingRow[]).map(rowToListing);

        if (filters.minGrade) {
            const minIdx = GRADE_ORDER.indexOf(filters.minGrade);
            listings = listings.filter(l => GRADE_ORDER.indexOf(l.grade) >= minIdx);
        }
        return listings;
    } catch {
        return [];
    }
}

// "Why is this business a good fit for financing" — grounded entirely in
// fields already stored on the listing (grade/band/score/dscr/sector/
// revenueBand/purpose), never anything requiring a new column. A lender
// scanning a long pipeline shouldn't have to reverse-engineer a grade
// letter and a DSCR number into a judgment themselves every time; this is
// that judgment made explicit, in the same plain-language style the SME
// side's financingRecommendation.ts uses, and equally honest about
// weaker signals (a 'danger' DSCR gets a real caution, not a rephrased
// positive spin).
export interface ListingFitSummary {
    tier: 'strong' | 'moderate' | 'caution';
    reasons: string[];
}

function fmtListingAmt(currency: string, n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${currency}${(n / 1_000).toFixed(0)}K`;
    return `${currency}${Math.round(n).toLocaleString()}`;
}

// Synthetic pipeline for the landing page's "Preview as Lender (Demo)" mode
// -- a visitor previewing the lender product with no real lender account.
// Same shape loadPipelineListingsForLender returns, but generated client-side
// with clearly-labeled sample figures instead of a real Supabase read.
// PipelineListing carries no business name (see file header), so nothing
// here needs to be flagged as fictional beyond the numbers themselves.
export function getDemoPipelineListings(): PipelineListing[] {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
    const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000).toISOString();
    return [
        { id: 'demo-1', financingType: 'working_capital', grade: 'A', band: 'Excellent', score: 91, dscr: 2.1, dscrStatus: 'healthy', sector: 'Retail & Trade', revenueBand: '₦10M–50M', requestedAmount: 4_500_000, purpose: 'Inventory restock', status: 'active', optedInAt: daysAgo(3), expiresAt: daysFromNow(87) },
        { id: 'demo-2', financingType: 'invoice_financing', grade: 'B', band: 'Good', score: 78, dscr: 1.4, dscrStatus: 'warning', sector: 'Manufacturing', revenueBand: '₦50M–100M', requestedAmount: 12_000_000, purpose: 'Bridge outstanding receivables', status: 'active', optedInAt: daysAgo(9), expiresAt: daysFromNow(81) },
        { id: 'demo-3', financingType: 'asset_financing', grade: 'A', band: 'Excellent', score: 88, dscr: 1.9, dscrStatus: 'healthy', sector: 'Logistics & Transport', revenueBand: '₦5M–10M', requestedAmount: 3_200_000, purpose: 'Delivery vehicle purchase', status: 'active', optedInAt: daysAgo(1), expiresAt: daysFromNow(89) },
        { id: 'demo-4', financingType: 'term_loan', grade: 'C', band: 'Fair', score: 61, dscr: 0.9, dscrStatus: 'danger', sector: 'Food & Beverage', revenueBand: '₦1M–5M', requestedAmount: 1_800_000, purpose: 'Equipment upgrade', status: 'active', optedInAt: daysAgo(14), expiresAt: daysFromNow(76) },
        { id: 'demo-5', financingType: 'trade_finance', grade: 'B', band: 'Good', score: 74, dscr: 1.3, dscrStatus: 'warning', sector: 'Import & Export', revenueBand: '₦10M–50M', requestedAmount: 8_000_000, purpose: 'Import letter of credit', status: 'active', optedInAt: daysAgo(6), expiresAt: daysFromNow(84) },
        { id: 'demo-6', financingType: 'overdraft', grade: 'A', band: 'Excellent', score: 85, dscr: 2.4, dscrStatus: 'healthy', sector: 'Retail & Trade', revenueBand: '₦5M–10M', requestedAmount: 2_000_000, purpose: 'Seasonal cash-flow buffer', status: 'active', optedInAt: daysAgo(20), expiresAt: daysFromNow(70) },
    ];
}

export function describeListingFit(listing: PipelineListing, currency: string): ListingFitSummary {
    const reasons: string[] = [];

    const highGrade = ['A', 'B'].includes(listing.grade);
    reasons.push(
        listing.band
            ? `Rated ${listing.band} (${listing.grade || '—'}) by Quad360's risk assessment — a composite of profitability, liquidity, debt, and efficiency signals drawn from their own recorded transactions.`
            : `Quad360 grade: ${listing.grade || 'not yet scored'}.`,
    );

    if (listing.dscrStatus === 'healthy') {
        reasons.push(`Debt-service coverage of ${listing.dscr.toFixed(2)}x — income comfortably covers existing obligations, with room for additional repayment.`);
    } else if (listing.dscrStatus === 'warning') {
        reasons.push(`Debt-service coverage of ${listing.dscr.toFixed(2)}x — obligations are covered, but headroom is thin; a smaller facility or shorter term may fit better than a large one.`);
    } else {
        reasons.push(`Debt-service coverage is below 1x — current income doesn't fully cover existing obligations. Best suited to structures that don't add near-term repayment burden, such as invoice financing against confirmed receivables, rather than new term debt.`);
    }

    if (listing.sector && listing.revenueBand) {
        reasons.push(`An established ${listing.sector.toLowerCase()} business generating ${listing.revenueBand} annually.`);
    } else if (listing.revenueBand) {
        reasons.push(`Generating ${listing.revenueBand} annually.`);
    }

    if (listing.requestedAmount !== undefined) {
        reasons.push(`Seeking ${fmtListingAmt(currency, listing.requestedAmount)}${listing.purpose ? ` for ${listing.purpose.toLowerCase()}` : ''}.`);
    }

    const tier: ListingFitSummary['tier'] =
        listing.dscrStatus === 'danger' ? 'caution' : highGrade && listing.dscrStatus === 'healthy' ? 'strong' : 'moderate';

    return { tier, reasons };
}
