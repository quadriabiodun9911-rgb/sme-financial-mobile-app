const { buildAndroidNetworkSecurityConfig, buildIosPinnedDomains, hostsWithRealPins } = require('../plugins/certPinningTransforms');

describe('hostsWithRealPins', () => {
    it('keeps only hosts with at least one pin', () => {
        const result = hostsWithRealPins({
            'real.example.com': { spkiSha256Base64: ['abc123'] },
            'placeholder.example.com': { spkiSha256Base64: [] },
        });
        expect(result).toEqual({ 'real.example.com': ['abc123'] });
    });

    it('returns an empty object for missing/empty input', () => {
        expect(hostsWithRealPins({})).toEqual({});
        expect(hostsWithRealPins(undefined)).toEqual({});
    });

    it('ignores a host whose entry is malformed (not an array)', () => {
        const result = hostsWithRealPins({ 'bad.example.com': { spkiSha256Base64: 'not-an-array' } });
        expect(result).toEqual({});
    });
});

describe('buildAndroidNetworkSecurityConfig', () => {
    it('produces a domain-config with a pin-set for each host', () => {
        const xml = buildAndroidNetworkSecurityConfig({
            'api.example.com': ['pin1==', 'pin2=='],
        });
        expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
        expect(xml).toContain('<domain includeSubdomains="true">api.example.com</domain>');
        expect(xml).toContain('<pin digest="SHA-256">pin1==</pin>');
        expect(xml).toContain('<pin digest="SHA-256">pin2==</pin>');
    });

    it('skips hosts with no pins rather than emitting an invalid empty pin-set', () => {
        const xml = buildAndroidNetworkSecurityConfig({ 'empty.example.com': [] });
        expect(xml).not.toContain('empty.example.com');
        expect(xml).not.toContain('<pin-set>');
    });

    it('emits one domain-config per host for multiple hosts', () => {
        const xml = buildAndroidNetworkSecurityConfig({
            'a.example.com': ['pinA=='],
            'b.example.com': ['pinB=='],
        });
        expect((xml.match(/<domain-config>/g) || []).length).toBe(2);
    });
});

describe('buildIosPinnedDomains', () => {
    it('produces an NSPinnedDomains entry with SPKI hashes for each host', () => {
        const result = buildIosPinnedDomains({ 'api.example.com': ['pin1==', 'pin2=='] });
        expect(result).toEqual({
            'api.example.com': {
                NSIncludesSubdomains: true,
                NSPinnedCAIdentities: [
                    { 'SPKI-SHA256-BASE64': 'pin1==' },
                    { 'SPKI-SHA256-BASE64': 'pin2==' },
                ],
            },
        });
    });

    it('omits hosts with no pins', () => {
        const result = buildIosPinnedDomains({ 'empty.example.com': [] });
        expect(result).toEqual({});
    });
});
