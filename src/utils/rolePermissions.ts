import { Screen, UserRole } from '../types';

/**
 * The full capability matrix for invited team members. Seven roles:
 *
 *   owner               full control — the only role that can delete
 *                       business data outright. Can also manage the team,
 *                       payment/bank settings, and publish to lenders.
 *   admin               everything owner can do except delete business
 *                       data — a trusted deputy, not a second owner.
 *   accountant          full financial visibility + can record
 *                       transactions, invoices, inventory, same as owner
 *                       day-to-day.
 *   manager             ("Finance Manager") same day-to-day recording +
 *                       financial visibility as accountant — runs
 *                       operations, but isn't handed the business-critical
 *                       owner/admin actions below.
 *   external_accountant full financial visibility (like accountant) but
 *                       restricted to reporting/reconciliation screens —
 *                       see EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS below. For
 *                       a bookkeeper or auditor outside the business who
 *                       needs to see the numbers, not run day-to-day
 *                       operations.
 *   staff               operational only (see STAFF_ALLOWED_SCREENS below)
 *                       — no visibility into P&L, cash balance, bank/loan
 *                       details.
 *   viewer              pure read-only — same broad financial visibility as
 *                       external_accountant, but excluded from every screen
 *                       that has a write action on it at all (see
 *                       VIEWER_ALLOWED_SCREENS below). For someone who
 *                       should be able to look but never touch — a board
 *                       member, an investor, a silent partner.
 *
 * What "staff" actually means in this app: someone who runs day-to-day
 * operations (log a sale, send an invoice, manage stock) while the owner
 * isn't there — not someone who should see the business's full financial
 * picture. Previously every invited role saw an identical app; write
 * actions were gated by role but reads were not, so an invited "staff"
 * account had full visibility into everything despite the Settings
 * screen's own copy claiming otherwise.
 */
export function canViewFinancials(role: UserRole): boolean {
    return role !== 'staff';
}

// Human-facing label for each canonical role -- used anywhere the app
// displays "your role" (e.g. the Header account switcher), so display text
// always matches the actual permission-gating role instead of a separate,
// independently-hardcoded string that can drift out of sync with it.
export const ROLE_DISPLAY_LABEL: Record<UserRole, string> = {
    owner: 'Administrator',
    admin: 'Admin',
    accountant: 'Accountant',
    manager: 'Manager',
    external_accountant: 'External Accountant',
    staff: 'Staff',
    viewer: 'Viewer',
};

// Things that reshape who has access, where money moves, or that
// permanently destroy business records. Every one of these was previously
// an inline `userRole === 'owner'` check scattered across
// SettingsScreen.tsx and FinancingMarketplaceScreen — consolidated here so
// the actual rule is defined once and named for what it protects, not
// re-derived at each call site. 'admin' is trusted with everything except
// the one irreversible action (canDeleteBusinessData) — a deliberate
// narrower grant than owner, not an oversight.
export function canManageTeam(role: UserRole): boolean {
    return role === 'owner' || role === 'admin';
}

export function canManagePaymentSettings(role: UserRole): boolean {
    return role === 'owner' || role === 'admin';
}

export function canDeleteBusinessData(role: UserRole): boolean {
    return role === 'owner';
}

export function canPublishToLenders(role: UserRole): boolean {
    return role === 'owner' || role === 'admin';
}

// Screens staff can open. Everything else in the Screen union renders
// RestrictedAccessScreen instead. An allowlist (not a denylist) so a new
// screen added later defaults to restricted rather than accidentally
// exposed.
const STAFF_ALLOWED_SCREENS: Screen[] = [
    'landing', 'login', 'contact', 'blog', 'blog-post', 'privacy-policy', '2fa', 'two-factor-verify', 'onboarding-choice',
    'dashboard', 'transactions', 'invoices', 'inventory', 'payment-link',
];
// Note: 'settings' is deliberately excluded — it mixes team-management,
// tax config, and opening balances into one screen alongside things a
// staff account might legitimately want (e.g. 2FA). Signing out doesn't
// require it — Header's Sign Out button is always visible regardless of
// screen. If Settings is ever split into staff-safe vs owner-only
// sections, revisit this.

// Screens an external accountant can open — the mirror image of
// STAFF_ALLOWED_SCREENS: full reporting/analysis/reconciliation depth
// (canViewFinancials is true for this role), but none of the operational
// data-entry screens (invoices, inventory, payroll, budget, goals, assets,
// loans) or owner/admin-only screens (settings, team, financing admin,
// security center, data permission centre). Same allowlist shape as
// staff's, so a new screen added later defaults to restricted here too.
const EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS: Screen[] = [
    'landing', 'login', 'contact', 'blog', 'blog-post', 'privacy-policy', '2fa', 'two-factor-verify', 'onboarding-choice',
    'dashboard', 'reports', 'transactions', 'reconciliation', 'import-transactions',
    'scoreboard', 'cashflow', 'analysis', 'future-statements', 'insights',
    'business-passport', 'financial-assessment', 'financial-health',
    'risk-management', 'macro-assumptions', 'audit-log', 'business-timeline', 'data-integrity',
];

// Screens a pure viewer can open -- EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS
// minus reconciliation and import-transactions, since both of those carry
// a write action (matching/confirming a reconciled transaction, importing
// new records) even though they read as "reporting" screens at a glance.
// A viewer's enforcement model is entirely this exclusion: there is no
// separate per-action read/write check anywhere in the app, so a screen
// left off this list is the only thing that actually stops a write --
// don't add a screen here without checking it has no mutation on it.
const VIEWER_ALLOWED_SCREENS: Screen[] = EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS.filter(
    s => s !== 'reconciliation' && s !== 'import-transactions',
);

export function isScreenAllowedForRole(screen: Screen, role: UserRole): boolean {
    if (role === 'staff') return STAFF_ALLOWED_SCREENS.includes(screen);
    if (role === 'external_accountant') return EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS.includes(screen);
    if (role === 'viewer') return VIEWER_ALLOWED_SCREENS.includes(screen);
    return true;
}
