/**
 * Plan-based feature gating — a second, independent axis from role-based
 * access (rolePermissions.ts). Role controls what a staff account can see
 * of an owner's data; this controls which parts of the app a free-plan
 * business can reach at all, regardless of role.
 *
 * Gates exactly the app's existing "Analytics" section (the same grouping
 * already shown under More > Analytics in FooterNav) — Insights, Analysis,
 * Advisor, Future Financial Statements, and Growth Intelligence (reachable
 * only via a deep link from Advisor's Forecast tab, but the same category).
 * Everything else — Dashboard, Business Passport, Invoices, Transactions,
 * Payroll, Cash Flow, Reports, Inventory, Assets, Loans, Goals, Budgets,
 * and more — stays free.
 */

import { Screen, BusinessSettings } from '../types';

const PRO_ONLY_SCREENS: Screen[] = ['insights', 'analysis', 'cfo', 'future-statements', 'growth'];

export function isProOnlyScreen(screen: Screen): boolean {
    return PRO_ONLY_SCREENS.includes(screen);
}

export function isProPlan(settings: Pick<BusinessSettings, 'subscriptionPlan'>): boolean {
    return settings.subscriptionPlan === 'pro';
}

export function canAccessScreen(screen: Screen, settings: Pick<BusinessSettings, 'subscriptionPlan'>): boolean {
    if (!isProOnlyScreen(screen)) return true;
    return isProPlan(settings);
}
