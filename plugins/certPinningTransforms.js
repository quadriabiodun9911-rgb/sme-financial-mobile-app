// Pure, framework-free transform functions for certificate pinning's native
// config. Split out from withCertificatePinning.js so these can be unit
// tested directly (see __tests__/certPinningTransforms.test.js) without
// invoking `expo prebuild` or mocking @expo/config-plugins' mod system --
// the actual XML/plist generation logic is what needs verifying; the
// plumbing that writes it to a file is a thin, low-risk wrapper around it.

/**
 * Android Network Security Config XML for one or more pinned hosts. The OS
 * enforces this automatically for every native network request to a
 * matching domain -- no app code (fetch wrapper, interceptor, etc.) needs to
 * call anything for it to take effect, which is also why the old JS-level
 * `pinnedFetch()` approach in certificatePinning.ts could never have been
 * real pinning: a wrapper around `fetch()` runs after the TLS handshake
 * already completed, too late to reject a connection based on it.
 */
function buildAndroidNetworkSecurityConfig(hosts) {
    const domainConfigs = Object.entries(hosts)
        .filter(([, pins]) => pins && pins.length > 0)
        .map(([host, pins]) => {
            const pinTags = pins.map(p => `            <pin digest="SHA-256">${p}</pin>`).join('\n');
            return `    <domain-config>\n        <domain includeSubdomains="true">${host}</domain>\n        <pin-set>\n${pinTags}\n        </pin-set>\n    </domain-config>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n${domainConfigs}\n</network-security-config>\n`;
}

/**
 * iOS App Transport Security pinning (NSPinnedDomains, iOS 14+) as a JS
 * object ready to merge into Info.plist's NSAppTransportSecurity dict.
 * Pins directly to SPKI-SHA256-BASE64 hashes -- no certificate file needs
 * to be bundled into the app, matching Android's digest-only approach above.
 */
function buildIosPinnedDomains(hosts) {
    const NSPinnedDomains = {};
    for (const [host, pins] of Object.entries(hosts)) {
        if (!pins || pins.length === 0) continue;
        NSPinnedDomains[host] = {
            NSIncludesSubdomains: true,
            NSPinnedCAIdentities: pins.map(p => ({ 'SPKI-SHA256-BASE64': p })),
        };
    }
    return NSPinnedDomains;
}

// Every host with at least one real pin -- hosts with an empty pin array
// (the placeholder state) are silently skipped rather than pinned to
// nothing, since a domain-config with an empty <pin-set> is invalid and a
// host omitted entirely just falls back to normal (unpinned) HTTPS, which
// is the correct degrade-safe behavior for "not generated yet".
function hostsWithRealPins(hostsConfig) {
    const out = {};
    for (const [host, entry] of Object.entries(hostsConfig || {})) {
        const pins = entry && entry.spkiSha256Base64;
        if (Array.isArray(pins) && pins.length > 0) out[host] = pins;
    }
    return out;
}

module.exports = { buildAndroidNetworkSecurityConfig, buildIosPinnedDomains, hostsWithRealPins };
