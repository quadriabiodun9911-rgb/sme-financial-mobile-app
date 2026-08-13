/**
 * Lender identity — Phase 2 of the Lender Auth & Financing-Visibility Flow
 * (see that scope document; Phase 0 is the data model/RLS in
 * supabase/migrations/008 and 009, Phase 1 is financingPipeline.ts's SME
 * publish side). This module is the write side for admins (create an
 * organization, invite a member) and the read side every signed-in
 * session uses to answer "is this a lender, and which organization."
 *
 * Phase 2 is deliberately admin-only onboarding, same precedent as
 * financing_products: a Quad360 admin creates the organization and
 * invites its first member. Self-serve lender signup is a later phase.
 *
 * No new auth system — a lender signs in through the exact same Supabase
 * Auth + authSecret/PIN flow an SME does (see joinLenderWithCode, which
 * mirrors storage.ts's joinTeamWithCode almost exactly). What's different
 * is purely which rows exist for their auth.uid() afterward.
 */

import { supabase } from './supabase';
import { isFinancingAdmin } from './financingAdmin';
import { LenderMember, LenderMemberRole, LenderOrgType, LenderOrganization } from '../types';

export { isFinancingAdmin as isLenderPipelineAdmin };

interface LenderOrgRow {
    id: string;
    name: string;
    org_type: string;
    verified_at: string | null;
    status: string;
    created_at: string;
}

function rowToOrg(row: LenderOrgRow): LenderOrganization {
    return {
        id: row.id,
        name: row.name,
        orgType: row.org_type as LenderOrgType,
        verifiedAt: row.verified_at,
        status: row.status as LenderOrganization['status'],
        createdAt: row.created_at,
    };
}

interface LenderMemberRow {
    id: string;
    lender_org_id: string;
    member_email: string;
    member_user_id: string | null;
    role: string;
    status: string;
    invite_code: string | null;
    invited_at: string;
}

function rowToMember(row: LenderMemberRow): LenderMember {
    return {
        id: row.id,
        lenderOrgId: row.lender_org_id,
        memberEmail: row.member_email,
        memberUserId: row.member_user_id,
        role: row.role as LenderMemberRole,
        status: row.status as LenderMember['status'],
        inviteCode: row.invite_code,
        invitedAt: row.invited_at,
    };
}

// ─── Admin: organizations ──────────────────────────────────────────────────

export async function createLenderOrganization(name: string, orgType: LenderOrgType): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await supabase
        .from('lender_organizations')
        .insert({ name: name.trim(), org_type: orgType, status: 'active', verified_at: new Date().toISOString() })
        .select('id')
        .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
}

export async function loadLenderOrganizations(): Promise<LenderOrganization[]> {
    try {
        const { data, error } = await supabase
            .from('lender_organizations')
            .select('*')
            .order('created_at', { ascending: false });
        if (error || !data) return [];
        return (data as LenderOrgRow[]).map(rowToOrg);
    } catch {
        return [];
    }
}

// ─── Admin: members ─────────────────────────────────────────────────────────

function generateInviteCode(): string {
    // Same two-segment shape as storage.ts's inviteTeamMember, for a
    // consistent "read this code out loud" invite UX across both flows.
    const seg1 = Math.random().toString(36).substring(2, 5).toUpperCase();
    const seg2 = Math.random().toString(36).substring(2, 5).toUpperCase();
    return (seg1 + seg2).substring(0, 6);
}

export async function inviteLenderMember(
    lenderOrgId: string,
    email: string,
    role: LenderMemberRole,
): Promise<{ ok: boolean; inviteCode?: string; error?: string }> {
    const inviteCode = generateInviteCode();
    const { error } = await supabase.from('lender_members').insert({
        lender_org_id: lenderOrgId,
        member_email: email.toLowerCase().trim(),
        role,
        invite_code: inviteCode,
        status: 'pending',
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, inviteCode };
}

export async function loadLenderMembersForOrg(lenderOrgId: string): Promise<LenderMember[]> {
    try {
        const { data, error } = await supabase
            .from('lender_members')
            .select('*')
            .eq('lender_org_id', lenderOrgId)
            .order('invited_at', { ascending: false });
        if (error || !data) return [];
        return (data as LenderMemberRow[]).map(rowToMember);
    } catch {
        return [];
    }
}

// ─── Join flow (the invited lender's own device) ───────────────────────────

// Mirrors storage.ts's joinTeamWithCode exactly: look up the pending
// invite by its code, then claim it. See migration 009's "A pending
// lender invite can be claimed once" policy for why this direct
// select+update is safe under RLS (the invite_code itself, sent out of
// band, is the authorization -- the same accepted model team_members
// already uses).
export async function joinLenderWithCode(
    memberUserId: string,
    inviteCode: string,
): Promise<{ lenderOrgId: string; lenderOrgName: string }> {
    const { data, error } = await supabase
        .from('lender_members')
        .select('*, lender_organizations(name)')
        .eq('invite_code', inviteCode.toUpperCase())
        .eq('status', 'pending')
        .single();
    if (error || !data) throw new Error('Invalid or already used invite code.');

    const { error: updateErr } = await supabase
        .from('lender_members')
        .update({ member_user_id: memberUserId, status: 'active' })
        .eq('id', data.id);
    if (updateErr) throw new Error('Could not activate lender membership: ' + updateErr.message);

    return {
        lenderOrgId: data.lender_org_id,
        lenderOrgName: (data as any).lender_organizations?.name ?? 'Your organization',
    };
}

// ─── Session check: "is the signed-in user a lender" ───────────────────────

// Called once after any successful sign-in (fresh login, session restore,
// or a completed lender join) to decide whether this session should route
// to the lender pipeline instead of the SME dashboard. Fails closed on any
// error (network, table not yet migrated, etc.) — the caller always
// treats a null/thrown result as "not a lender," never blocking or
// altering the existing SME login path.
export async function getMyLenderMembership(): Promise<{ lenderOrgId: string; lenderOrgName: string; role: LenderMemberRole } | null> {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) return null;

        const { data, error } = await supabase
            .from('lender_members')
            .select('lender_org_id, role, lender_organizations(name)')
            .eq('member_user_id', userId)
            .eq('status', 'active')
            .maybeSingle();
        if (error || !data) return null;

        return {
            lenderOrgId: data.lender_org_id,
            lenderOrgName: (data as any).lender_organizations?.name ?? 'Your organization',
            role: data.role as LenderMemberRole,
        };
    } catch {
        return null;
    }
}
