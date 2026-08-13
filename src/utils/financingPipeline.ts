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
