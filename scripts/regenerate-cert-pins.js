#!/usr/bin/env node
// Fetches a host's live TLS certificate chain and prints the SPKI-SHA256
// pin for each certificate in it, ready to paste into certificate-pins.json.
//
// IMPORTANT: run this from a machine/network you're confident has a direct,
// unintercepted TLS connection to the target host -- NOT from behind a
// corporate/CI TLS-inspecting proxy, which would present its own
// certificate instead of the real one and produce a pin for the wrong
// certificate entirely. (This is exactly why this script was never run
// during development in this repo's sandboxed environment -- that
// environment's own outbound HTTPS is intercepted by an egress proxy for
// unrelated reasons, which would have produced a pin for the proxy's
// certificate, not Supabase's.)
//
// Usage:
//   node scripts/regenerate-cert-pins.js xfiqezxifsfwkwlbaxbj.supabase.co
//
// Pin to the intermediate/root CA certificate (not just the leaf) unless
// you have a process to update the pin every time the leaf rotates (often
// every ~60-90 days for a Let's Encrypt-issued cert) -- this script prints
// the full chain so you can choose. Include at least 2 pins (e.g. current
// + one from the issuing CA) so a routine cert renewal doesn't brick the
// app until the next release.

const https = require('https');
const crypto = require('crypto');

const host = process.argv[2];
if (!host) {
    console.error('Usage: node scripts/regenerate-cert-pins.js <hostname>');
    process.exit(1);
}

const req = https.request({ host, port: 443, method: 'GET', path: '/', rejectUnauthorized: true }, (res) => {
    const cert = req.socket.getPeerCertificate(true);
    const seen = new Set();
    function printChain(c, depth) {
        if (!c || Object.keys(c).length === 0) return;
        const spki = crypto.createHash('sha256').update(c.pubkey).digest('base64');
        if (seen.has(spki)) return; // self-signed root loops issuerCertificate back to itself
        seen.add(spki);
        console.log(`depth ${depth}: ${JSON.stringify(c.subject)}`);
        console.log(`  issuer: ${JSON.stringify(c.issuer)}`);
        console.log(`  valid: ${c.valid_from} -> ${c.valid_to}`);
        console.log(`  SPKI-SHA256-BASE64: ${spki}`);
        console.log('');
        if (c.issuerCertificate && depth < 5) printChain(c.issuerCertificate, depth + 1);
    }
    printChain(cert, 0);
    console.log(`Paste the pin(s) you choose into certificate-pins.json under hosts["${host}"].spkiSha256Base64, then set "generated": true.`);
    res.resume();
    res.on('end', () => process.exit(0));
});
req.on('error', (e) => { console.error('Connection failed:', e.message); process.exit(1); });
req.end();
setTimeout(() => { console.error('Timed out connecting to', host); process.exit(1); }, 15000);
