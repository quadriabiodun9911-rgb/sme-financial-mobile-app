/**
 * Admin-managed financing listings — the write side of the Financing
 * Marketplace's "lenders publish requirements" idea. v1 is deliberately
 * admin-only (no lender self-service accounts exist yet): Quad360 staff
 * add/edit listings on a lender's behalf via FinancingAdminScreen, into the
 * real financing_products Supabase table (see
 * supabase/migrations/006_financing_products_table.sql). Once real listings
 * exist, FinancingMarketplaceScreen shows those instead of the hardcoded
 * SAMPLE_FINANCING_PRODUCTS.
 *
 * Access control note: FINANCING_ADMIN_EMAILS below only hides the admin
 * screen's UI from everyone else — it is NOT the real security boundary.
 * The actual enforcement is the Postgres RLS policies in that migration,
 * which check the same emails at the database level. Keep both lists in
 * sync; the client-side check existing alone would be meaningless (anyone
 * could still call the Supabase API directly).
 */

import { FinancingProduct } from '../types';
import { supabase } from './supabase';

const FINANCING_ADMIN_EMAILS = ['quadriabiodun9911@gmail.com'];

export function isFinancingAdmin(email?: string | null): boolean {
    if (!email) return false;
    return FINANCING_ADMIN_EMAILS.includes(email.toLowerCase());
}

interface FinancingProductRow {
    id: string;
    lender_name: string;
    lender_type: string;
    product_type: string;
    product_name: string;
    description: string;
    min_amount: number;
    max_amount: number;
    min_term_months: number;
    max_term_months: number;
    interest_rate_min_pct: number;
    interest_rate_max_pct: number;
    eligibility: FinancingProduct['eligibility'];
    status: string;
    owner_user_id: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

function rowToProduct(row: FinancingProductRow): FinancingProduct {
    return {
        id: row.id,
        lenderName: row.lender_name,
        lenderType: row.lender_type as FinancingProduct['lenderType'],
        productType: row.product_type as FinancingProduct['productType'],
        productName: row.product_name,
        description: row.description,
        minAmount: row.min_amount,
        maxAmount: row.max_amount,
        minTermMonths: row.min_term_months,
        maxTermMonths: row.max_term_months,
        interestRateMinPct: row.interest_rate_min_pct,
        interestRateMaxPct: row.interest_rate_max_pct,
        eligibility: row.eligibility ?? {},
        status: (row.status as FinancingProduct['status']) ?? 'active',
        ownerUserId: row.owner_user_id ?? undefined,
        createdBy: row.created_by ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function productToRow(product: FinancingProduct, createdBy: string): Omit<FinancingProductRow, 'created_at' | 'updated_at'> {
    return {
        id: product.id,
        lender_name: product.lenderName,
        lender_type: product.lenderType,
        product_type: product.productType,
        product_name: product.productName,
        description: product.description,
        min_amount: product.minAmount,
        max_amount: product.maxAmount,
        min_term_months: product.minTermMonths,
        max_term_months: product.maxTermMonths,
        interest_rate_min_pct: product.interestRateMinPct,
        interest_rate_max_pct: product.interestRateMaxPct,
        eligibility: product.eligibility,
        status: product.status ?? 'active',
        owner_user_id: product.ownerUserId ?? null,
        created_by: product.createdBy ?? createdBy,
    };
}

/** Active listings only — what the SME-facing Marketplace shows. Returns null on any failure (offline, table not yet created) so the caller can fall back to the sample list. */
export async function loadActiveFinancingProducts(): Promise<FinancingProduct[] | null> {
    try {
        const { data, error } = await supabase
            .from('financing_products')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (error || !data) return null;
        return (data as FinancingProductRow[]).map(rowToProduct);
    } catch {
        return null;
    }
}

/** All listings (active + inactive) — what the admin screen shows. */
export async function loadAllFinancingProductsForAdmin(): Promise<FinancingProduct[] | null> {
    try {
        const { data, error } = await supabase
            .from('financing_products')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error || !data) return null;
        return (data as FinancingProductRow[]).map(rowToProduct);
    } catch {
        return null;
    }
}

export async function saveFinancingProduct(product: FinancingProduct, adminEmail: string): Promise<{ error?: string }> {
    try {
        const row = productToRow(product, adminEmail);
        const { error } = await supabase
            .from('financing_products')
            .upsert([{ ...row, updated_at: new Date().toISOString() }], { onConflict: 'id' });
        if (error) return { error: error.message };
        return {};
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Failed to save listing' };
    }
}

export async function deleteFinancingProduct(id: string): Promise<{ error?: string }> {
    try {
        const { error } = await supabase.from('financing_products').delete().eq('id', id);
        if (error) return { error: error.message };
        return {};
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Failed to delete listing' };
    }
}
