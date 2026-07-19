import { Screen, UserRole } from '../types';

/**
 * What "staff" actually means in this app: someone who runs day-to-day
 * operations (log a sale, send an invoice, manage stock) while the owner
 * isn't there — not someone who should see the business's full financial
 * picture (P&L, cash balance, bank details, loan terms). Previously every
 * invited role saw an identical app; write actions were gated by role but
 * reads were not, so an invited "staff" account had full visibility into
 * everything despite the Settings screen's own copy claiming otherwise.
 *
 * Owner and accountant both see everything (accountant is read+export,
 * enforced at the mutation layer in AppContext.tsx via canManage/canWrite,
 * not here). This file only decides what STAFF can reach.
 */
export function canViewFinancials(role: UserRole): boolean {
    return role !== 'staff';
}

// Screens staff can open. Everything else in the Screen union renders
// RestrictedAccessScreen instead. An allowlist (not a denylist) so a new
// screen added later defaults to restricted rather than accidentally
// exposed.
const STAFF_ALLOWED_SCREENS: Screen[] = [
    'login', '2fa', 'two-factor-verify', 'onboarding-choice',
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
