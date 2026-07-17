/**
 * A manually-bumped build marker, shown on the ErrorBoundary crash screen.
 *
 * Purpose: when a crash is reported, this string tells us — unambiguously,
 * from a single screenshot — whether the browser is actually running the
 * latest deployed code or a stale cached copy (browser cache, CDN edge
 * cache, or otherwise). Bump BUILD_STAMP any time this file is touched as
 * part of a fix, so the next crash report is self-diagnosing.
 */
export const BUILD_STAMP = '2026-07-17T04:30Z-merge-periods-tab-into-pnl';
