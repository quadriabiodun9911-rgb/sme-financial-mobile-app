import { Platform } from 'react-native';
import { BUILD_STAMP } from './buildInfo';

// Sentry is web-only for now: this app's real production surface is the
// Vercel web build (quad360.vercel.app), and @sentry/react avoids pulling
// in the native SDK's build/config-plugin requirements for a deployment
// target that isn't in use. Guarded so it's a no-op on native.
let sentryModule: typeof import('@sentry/react') | null = null;

export function initSentry(): void {
    if (Platform.OS !== 'web') return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Sentry = require('@sentry/react');
        sentryModule = Sentry;
        Sentry.init({
            dsn: 'https://b3e6b6e29af12c7ca31f53d880e391af@o4511742282104832.ingest.us.sentry.io/4511742298357760',
            release: BUILD_STAMP,
            environment: __DEV__ ? 'development' : 'production',
            tracesSampleRate: 0, // error monitoring only — no performance/tracing on the free tier
        });
    } catch (e) {
        console.warn('[Sentry] init failed:', e);
    }
}

export function captureCrash(error: Error, componentStack?: string): void {
    if (!sentryModule) return;
    try {
        sentryModule.captureException(error, {
            contexts: componentStack ? { react: { componentStack } } : undefined,
        });
    } catch { /* never let error reporting itself crash the app */ }
}

// Attach the signed-in user's email so a crash report can be matched to a
// support conversation, without logging anything about their financial data.
export function setSentryUser(email: string | null): void {
    if (!sentryModule) return;
    try {
        sentryModule.setUser(email ? { email } : null);
    } catch { /* ignore */ }
}
