import { Screen, UserRole } from '../types';

/**
 * The full capability matrix for invited team members. Four roles:
 *
 *   owner       full control — the only role that can touch team
 *               membership, payment/bank settings, and business-data
 *               deletion.
 *   accountant  full financial visibility + can record transactions,
 *               invoices, inventory, same as owner day-to-day.
 *   manager     same day-to-day recording + financial visibility as
 *               accountant — runs operations, but isn't handed the
 *               business-critical owner actions below.
 *   staff       operational only (see STAFF_ALLOWED_SCREENS below) — no
 *               visibility into P&L, cash balance, bank/loan details.
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

// Owner-only actions: things that reshape who has access, where money
// moves, or that permanently destroy business records. Every one of these
// was previously an inline `userRole === 'owner'` check scattered across
// SettingsScreen.tsx and FinancingMarketplaceScreen — consolidated here so
// the actual rule (which is "owner only" for all four today) is defined
// once and named for what it protects, not re-derived at each call site.
export function canManageTeam(role: UserRole): boolean {
    return role === 'owner';
}

export function canManagePaymentSettings(role: UserRole): boolean {
    return role === 'owner';
}

export function canDeleteBusinessData(role: UserRole): boolean {
    return role === 'owner';
}

export function canPublishToLenders(role: UserRole): boolean {
    return role === 'owner';
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

export function isScreenAllowedForRole(screen: Screen, role: UserRole): boolean {
    if (role !== 'staff') return true;
    return STAFF_ALLOWED_SCREENS.includes(screen);
}
