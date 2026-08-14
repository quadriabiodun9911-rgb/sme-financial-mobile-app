/**
 * The SME-side half of linking a loan to a real lender account -- see
 * types.ts's Loan.lenderOrgId comment. A loan's lenderName has always been
 * free text (self-reported, since Quad360 has no live lender
 * integrations), so it can't be trusted to identify a real
 * lender_organizations row. This is the narrow, name/type-only directory
 * read that lets a business pick their actual funding lender from Quad360's
 * own verified list instead -- see migration 010's new SELECT policy.
 */

import { supabase } from './supabase';

export interface LenderDirectoryEntry {
    id: string;
    name: string;
    orgType: string;
}

export async function loadActiveLenderOrganizations(): Promise<LenderDirectoryEntry[]> {
    try {
        const { data, error } = await supabase
            .from('lender_organizations')
            .select('id, name, org_type')
            .eq('status', 'active')
            .order('name', { ascending: true });
        if (error || !data) return [];
        return (data as { id: string; name: string; org_type: string }[]).map(r => ({
            id: r.id,
            name: r.name,
            orgType: r.org_type,
        }));
    } catch {
        return [];
    }
}
