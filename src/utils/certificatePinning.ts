/**
 * Certificate pinning status reporting for Quad360.
 *
 * The actual pinning enforcement does NOT happen here, or anywhere in JS —
 * it can't. A JS-level "verify the cert" function runs after the TLS
 * handshake has already completed, which is too late to reject a
 * connection based on it; a wrapper around `fetch()` has no access to the
 * underlying certificate at all on most platforms. This file previously
 * contained exactly that kind of non-functional simulation
 * (`verifyCertificatePin`, `pinnedFetch`) — removed, since keeping code
 * that looks like pinning but isn't is worse than having none: it invites
 * a future reader (or security review) to believe protection exists where
 * it doesn't.
 *
 * Real pinning is enforced natively, below the JS layer, automatically for
 * every request the OS makes once configured:
 *   - Android: a Network Security Config XML with a <pin-set>
 *   - iOS: Info.plist's NSAppTransportSecurity.NSPinnedDomains (iOS 14+)
 * Both are generated at build time by plugins/withCertificatePinning.js
 * (an Expo config plugin, applied during `expo prebuild` / EAS Build) from
 * the pins in certificate-pins.json — see that file and
 * scripts/regenerate-cert-pins.js for how to populate real pins and why
 * they aren't populated yet.
 *
 * Web is a separate, permanent limitation, not a gap to be closed later:
 * browsers own the TLS stack and give no JS-reachable API to pin a
 * certificate. Every request already goes to an https:// URL (the
 * Supabase client is configured with one), so there's no JS-level
 * "enforce HTTPS" step needed or possible beyond that.
 */
import { Platform } from 'react-native';
// resolveJsonModule is enabled in tsconfig (inherited from Expo's base
// config), so this reads the same registry the config plugin reads.
import pinsConfig from '../../certificate-pins.json';

export interface CertificatePinningStatus {
    enabled: boolean;
    pinnedHosts: string[];
    reason: string;
}

/**
 * Reports whether certificate pinning is actually active for the current
 * platform and build — not whether the infrastructure to support it exists.
 * `pinsConfig.generated` only turns true once real pins have been fetched
 * outside this app's own build environment (see
 * scripts/regenerate-cert-pins.js) and wired in; until then this correctly
 * reports `false` on every platform, matching what a native build compiled
 * right now would actually do (nothing).
 */
export function getCertificatePinningStatus(): CertificatePinningStatus {
    const hostsWithPins = Object.entries(pinsConfig.hosts)
        .filter(([, entry]) => (entry as { spkiSha256Base64: string[] }).spkiSha256Base64.length > 0)
        .map(([host]) => host);

    if (Platform.OS === 'web') {
        return {
            enabled: false,
            pinnedHosts: [],
            reason: 'Not applicable on web — browsers own the TLS stack and provide no way to pin a certificate from JavaScript. HTTPS is still enforced.',
        };
    }

    if (!pinsConfig.generated || hostsWithPins.length === 0) {
        return {
            enabled: false,
            pinnedHosts: [],
            reason: 'certificate-pins.json has no real pins yet (generated: false) — run scripts/regenerate-cert-pins.js from a trusted network, then rebuild natively. Until then this build uses normal (unpinned) HTTPS.',
        };
    }

    return {
        enabled: true,
        pinnedHosts: hostsWithPins,
        reason: 'Enforced natively via Android Network Security Config / iOS NSPinnedDomains, applied by plugins/withCertificatePinning.js at build time.',
    };
}
