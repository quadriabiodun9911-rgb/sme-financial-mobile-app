/**
 * PostHog analytics — sends events directly via the REST API.
 * No package needed. Works on web and React Native.
 *
 * Setup (5 minutes):
 *   1. Go to https://posthog.com and create a free account
 *   2. Create a new project called "Quad360"
 *   3. Copy your Project API Key (starts with phc_...)
 *   4. Replace the POSTHOG_KEY value below with your real key
 */

const POSTHOG_KEY  = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? 'phc_pFhpUVaDw5PD4NoTwqgL7EWANxbsYdavkHWFcCrVnkzE';
const POSTHOG_HOST = 'https://app.posthog.com';

// Shared identity across a session
let _distinctId = 'anonymous';
let _enabled    = POSTHOG_KEY !== 'phc_REPLACE_WITH_YOUR_POSTHOG_KEY' && POSTHOG_KEY !== '';

function getTimestamp() {
    return new Date().toISOString();
}

function send(event: string, properties: Record<string, unknown> = {}) {
    if (!_enabled) return; // no-op until a real key is set
    const body = {
        api_key:     POSTHOG_KEY,
        event,
        distinct_id: _distinctId,
        timestamp:   getTimestamp(),
        properties:  {
            $lib:    'quad360-app',
            ...properties,
        },
    };
    fetch(`${POSTHOG_HOST}/capture/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    }).catch(() => {}); // never throw — analytics must never crash the app
}

// ── Identity ────────────────────────────────────────────────────────────────

export function identifyUser(email: string, properties?: Record<string, unknown>) {
    _distinctId = email;
    send('$identify', {
        $set: { email, ...properties },
    });
}

export function identifyDemo(businessId: string) {
    _distinctId = `demo_${businessId}`;
}

export function resetIdentity() {
    _distinctId = 'anonymous';
}

// ── Core events ─────────────────────────────────────────────────────────────

/** Called when the app finishes loading */
export function trackAppOpened() {
    send('app_opened');
}

/** Called when user taps "Try Demo" and picks a business */
export function trackDemoStarted(businessId: string, businessName: string, country: string) {
    identifyDemo(businessId);
    send('demo_started', { business_id: businessId, business_name: businessName, country });
}

/** Called when demo user taps "Create Account →" banner */
export function trackDemoConvertTapped() {
    send('demo_convert_tapped');
}

/** Called when a new account is successfully created */
export function trackUserRegistered(currency: string) {
    send('user_registered', { currency });
}

/** Called on every successful PIN or email login */
export function trackUserLoggedIn(method: 'pin' | 'email') {
    send('user_logged_in', { method });
}

/** Called on logout */
export function trackUserLoggedOut() {
    send('user_logged_out');
    resetIdentity();
}

// ── Screen tracking ──────────────────────────────────────────────────────────

/** Call this whenever the user navigates to a new screen */
export function trackScreenViewed(screen: string, params?: Record<string, unknown>) {
    send('screen_viewed', { screen, ...params });
}

// ── Feature usage ────────────────────────────────────────────────────────────

export function trackTransactionAdded(type: 'income' | 'expense', amount: number, currency: string) {
    send('transaction_added', { type, amount, currency });
}

export function trackInvoiceCreated(total: number, currency: string) {
    send('invoice_created', { total, currency });
}

export function trackAssetAdded(category: string, cost: number, currency: string) {
    send('asset_added', { category, cost, currency });
}

export function trackLoanAdded(principal: number, currency: string) {
    send('loan_added', { principal, currency });
}

export function trackInventoryItemAdded() {
    send('inventory_item_added');
}

export function trackReportViewed(tab: string) {
    send('report_viewed', { tab });
}

export function trackInsightViewed(type: string) {
    send('insight_viewed', { type });
}

export function trackGoalCreated(goalType: string) {
    send('goal_created', { goal_type: goalType });
}

export function trackDataExported() {
    send('data_exported');
}
