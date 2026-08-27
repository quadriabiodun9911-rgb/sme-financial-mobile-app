/**
 * Financing Outcome Stats — turns a business's own resolved financing
 * applications (see recordFinancingOutcome in OptimizedContexts.tsx) into
 * real aggregate history: how many times they've applied, the approval
 * rate, how approved amounts compared to what was requested, and what
 * rejection reasons were given.
 *
 * Gated on having at least one RESOLVED application (approved or
 * rejected) — a still-pending application has no outcome yet to count,
 * and this file never estimates one.
 */

import { MerchantFinancingApplication } from '../types';

export interface FinancingOutcomeStats {
    available: boolean;
    totalResolved: number;
    approvedCount: number;
    rejectedCount: number;
    approvalRatePct: number;
    // Average approvedAmount / requestedAmount across approved applications
    // that actually recorded an approvedAmount. Null when none did.
    avgApprovedVsRequestedPct: number | null;
    // As given by the business, deduped, most recently reported first.
    rejectionReasons: string[];
}

const UNAVAILABLE: FinancingOutcomeStats = {
    available: false,
    totalResolved: 0,
    approvedCount: 0,
    rejectedCount: 0,
    approvalRatePct: 0,
    avgApprovedVsRequestedPct: null,
    rejectionReasons: [],
};

const APPROVED_STATUSES = new Set(['approved', 'funded', 'repaying', 'paid_off']);

export function computeFinancingOutcomeStats(
    pastApplications: MerchantFinancingApplication[] = [],
    currentApplication?: MerchantFinancingApplication | null,
): FinancingOutcomeStats {
    // The current application only counts once it has an actual outcome --
    // 'pending' contributes nothing to a history of what's happened so far.
    const resolved = currentApplication && (APPROVED_STATUSES.has(currentApplication.status) || currentApplication.status === 'rejected')
        ? [...pastApplications, currentApplication]
        : pastApplications;

    if (resolved.length === 0) return UNAVAILABLE;

    const approved = resolved.filter(a => APPROVED_STATUSES.has(a.status));
    const rejected = resolved.filter(a => a.status === 'rejected');

    const ratios = approved
        .filter(a => a.approvedAmount != null && a.requestedAmount > 0)
        .map(a => (a.approvedAmount! / a.requestedAmount) * 100);
    const avgApprovedVsRequestedPct = ratios.length > 0
        ? ratios.reduce((s, r) => s + r, 0) / ratios.length
        : null;

    // Most recent first -- reverse the input order (both arrays are
    // assumed chronological: pastApplications oldest-first, current last).
    const rejectionReasons = Array.from(new Set(
        [...rejected].reverse()
            .map(a => a.rejectionReason?.trim())
            .filter((r): r is string => !!r)
    ));

    return {
        available: true,
        totalResolved: resolved.length,
        approvedCount: approved.length,
        rejectedCount: rejected.length,
        approvalRatePct: (approved.length / resolved.length) * 100,
        avgApprovedVsRequestedPct,
        rejectionReasons,
    };
}

export function describeFinancingOutcomeStats(stats: FinancingOutcomeStats): string | null {
    if (!stats.available) return null;
    const parts: string[] = [
        `Applied for financing ${stats.totalResolved} time${stats.totalResolved === 1 ? '' : 's'}: ${stats.approvedCount} approved, ${stats.rejectedCount} rejected (${Math.round(stats.approvalRatePct)}% approval rate)`,
    ];
    if (stats.avgApprovedVsRequestedPct != null) {
        parts.push(`approved for ~${Math.round(stats.avgApprovedVsRequestedPct)}% of the amount requested on average`);
    }
    if (stats.rejectionReasons[0]) {
        parts.push(`most recent rejection reason: "${stats.rejectionReasons[0]}"`);
    }
    return `${parts.join(' — ')}.`;
}
