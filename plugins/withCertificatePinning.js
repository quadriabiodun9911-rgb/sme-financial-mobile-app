// Expo config plugin: real, OS-enforced certificate pinning for native
// builds, applied at `expo prebuild` time (so it works with Expo's managed
// workflow / continuous native generation -- no permanent ios/ or android/
// directory needs to live in this repo, and no ejecting to bare workflow is
// required).
//
// Deliberately does nothing on web -- browsers own the TLS stack and give
// no JS-reachable API to pin a certificate; that's a browser sandbox
// limitation, not something any config or library can work around. Web
// keeps HTTPS-only enforcement (see certificatePinning.ts's
// getCertificatePinningStatus()), same as before.
//
// Deliberately a no-op on native too until certificate-pins.json has
// `generated: true` and at least one real pin -- see that file's own
// comment for why: a wrong pin doesn't degrade gracefully, it hard-fails
// every native network request to that host, which is worse than the
// placeholder state this replaces.
const { withInfoPlist, withDangerousMod, withAndroidManifest } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { buildAndroidNetworkSecurityConfig, buildIosPinnedDomains, hostsWithRealPins } = require('./certPinningTransforms');

function loadPinsConfig() {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'certificate-pins.json'), 'utf8');
    return JSON.parse(raw);
}

function withAndroidCertPinning(config, hosts) {
    config = withDangerousMod(config, [
        'android',
        async (config) => {
            const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
            fs.mkdirSync(xmlDir, { recursive: true });
            fs.writeFileSync(
                path.join(xmlDir, 'network_security_config.xml'),
                buildAndroidNetworkSecurityConfig(hosts),
            );
            return config;
        },
    ]);

    return withAndroidManifest(config, (config) => {
        const application = config.modResults.manifest.application?.[0];
        if (application) {
            application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
        }
        return config;
    });
}

function withIosCertPinning(config, hosts) {
    return withInfoPlist(config, (config) => {
        const NSPinnedDomains = buildIosPinnedDomains(hosts);
        config.modResults.NSAppTransportSecurity = {
            ...(config.modResults.NSAppTransportSecurity || {}),
            NSPinnedDomains,
        };
        return config;
    });
}

module.exports = function withCertificatePinning(config) {
    const pinsConfig = loadPinsConfig();
    const hosts = hostsWithRealPins(pinsConfig.hosts);

    if (!pinsConfig.generated || Object.keys(hosts).length === 0) {
        console.warn(
            '[withCertificatePinning] certificate-pins.json has no real pins yet (generated=false) -- ' +
            'skipping native pin config for this build. Run scripts/regenerate-cert-pins.js from a ' +
            'trusted network before a production release. This build will use normal (unpinned) HTTPS.'
        );
        return config;
    }

    config = withAndroidCertPinning(config, hosts);
    config = withIosCertPinning(config, hosts);
    return config;
};
