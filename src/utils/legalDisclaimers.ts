/**
 * Shared legal/trust disclaimer text for anything related to lending,
 * credit scoring, or financing estimates -- Quad360 diagnoses and
 * estimates, it never decides or guarantees. Previously this exact
 * discipline was independently worded in five places (Financing
 * Marketplace, Credit-Worthiness x3, Business Passport, the
 * post-financing lender export) -- fine while they happened to agree,
 * but a future wording update to any one of them had no way to reach
 * the others. Centralized here so a change happens once.
 */

// The core guardrail: whatever score, fit, or estimate Quad360 shows,
// the actual credit decision is never Quad360's to make.
export const LENDING_DECISION_DISCLAIMER =
    'Quad360 does not make lending decisions. Each lender independently evaluates and approves any application.';

// For a single computed number (lending capacity, valuation, a credit
// score) rather than a whole screen's worth of content.
export const ESTIMATE_NOT_GUARANTEE =
    'An illustrative estimate based on your own recorded numbers, not a guarantee.';

// Same idea, phrased for a range rather than a single figure.
export const RANGE_NOT_OFFER =
    'An illustrative range based on your own numbers — not an offer from any lender, and not a guarantee. Actual terms depend on the lender you approach.';
