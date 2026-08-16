# FinanceBook Advanced Security Features

This document describes the advanced security features implemented in FinanceBook to protect user data and prevent attacks.

## Table of Contents

1. [End-to-End Encryption](#end-to-end-encryption)
2. [Two-Factor Authentication](#two-factor-authentication)
3. [Certificate Pinning](#certificate-pinning)
4. [Per-Field Encryption](#per-field-encryption)

---

## End-to-End Encryption

### Overview

End-to-End Encryption (E2E) ensures that sensitive financial data is encrypted on the client device before being sent to Supabase, and only decrypted when loaded locally.

**Who can read the data**: Only the account owner with the encryption key

### Encrypted Fields

**Transactions**:
- `amount` - Transaction amount
- `description` - Transaction description/notes
- `category` - Transaction category

**Invoices**:
- `amount` - Invoice total amount
- `description` - Invoice description
- `clientName` - Client name
- `clientEmail` - Client email address

**Assets**:
- `description` - Asset description
- `purchasePrice` - Original purchase price
- `currentValue` - Current asset value

**Inventory**:
- `costPrice` - Cost per unit
- `sellingPrice` - Selling price per unit

### How It Works

1. **Key Generation**: During account setup, a unique 256-bit encryption key is generated
2. **Key Storage**: Key is stored in `expo-secure-store` (encrypted on device)
3. **Encryption**: Before sending to Supabase, sensitive fields are encrypted using AES-256
4. **Decryption**: When loading from Supabase, encrypted fields are decrypted locally
5. **Metadata**: Each encrypted object includes version info and timestamp

### Usage in Code

```typescript
import { encryptTransaction, decryptTransaction } from './utils/encryption';

// Encrypt before sending to Supabase
const transaction = { amount: 1000, description: 'Client payment' };
const encryptedTx = encryptTransaction(transaction, encryptionKey);
await supabase.from('transactions').insert(encryptedTx);

// Decrypt when loading
const { data } = await supabase.from('transactions').select('*');
const decryptedTx = decryptTransaction(data[0], encryptionKey);
```

### Security Considerations

- ✅ Encryption key never leaves the device
- ✅ Keys encrypted in secure storage
- ✅ AES-256 provides military-grade encryption
- ⚠️ Supabase server never has plaintext financial data
- ⚠️ But: Database backups contain encrypted data (key required to read)

### Decryption Fallback

If decryption fails:
1. Returns `null` for that field
2. Logs warning to console
3. Continues with other data
4. Does not crash app

---

## Two-Factor Authentication

### Overview

Two-Factor Authentication (2FA) adds a second security layer beyond PIN-only access.

**Supported Methods**:
- TOTP (Time-based One-Time Password) - Recommended
- SMS OTP (requires Supabase SMS provider)
- Backup Codes (for recovery)

### TOTP Setup Flow

1. User navigates to Settings → Security → 2FA
2. Taps "Enable 2FA"
3. System generates secret key
4. User scans QR code with authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)
5. User enters 6-digit code to verify
6. System saves backup codes (user downloads for safekeeping)
7. 2FA is now enabled

### Login with 2FA

1. User enters PIN
2. PIN validated
3. If 2FA enabled, prompt for 6-digit code
4. User enters code from authenticator app (or uses backup code)
5. Code verified (allows 60-second time skew)
6. Login successful

### Backup Codes

- 10 single-use codes generated during 2FA setup
- Format: `XXXX-XXXX` (4 pairs of hex digits)
- Used when phone is lost/inaccessible
- Each code can only be used once
- User can view remaining codes in settings

### Code Verification

```typescript
import { verifyTwoFactorLogin } from './utils/twoFactorAuth';

// During login
const isValid = await verifyTwoFactorLogin(code, 'totp');
if (isValid) {
  // Allow login
}

// Or with backup code
const isValid = await verifyTwoFactorLogin(code, 'backup_code');
```

### Time-Based Verification

- TOTP codes valid for 30-second window
- System allows ±30 seconds (total 60-second window)
- Handles timezone differences automatically
- No internet required for verification

### SMS OTP (Future)

When implemented:
```typescript
// Send OTP
await sendSMSOTP(phoneNumber);

// Verify OTP
const isValid = verifySMSOTP(enteredCode, sentCode);
```

### Security Considerations

- ✅ TOTP secret stored securely (encrypted)
- ✅ Backup codes stored securely
- ✅ Failed attempts logged for audit
- ⚠️ User must keep authenticator app secure
- ⚠️ Backup codes should be stored offline

### Audit Logging

All 2FA events logged:
- Successful 2FA verification
- Failed attempts
- 2FA enabled/disabled
- Backup code usage

---

## Certificate Pinning

### Overview

Certificate Pinning prevents Man-in-the-Middle (MITM) attacks by verifying that the server's SSL/TLS certificate matches an expected value.

### Current Status: infrastructure built, pins not yet generated

This section previously described certificate pinning as implemented. It
wasn't — the old `src/utils/certificatePinning.ts` only *simulated*
verification in JS (`verifyCertificatePin()` always returned `true`;
`pinnedFetch()` just called plain `fetch()`), and nothing in the app's
actual network layer (`supabase.ts`) ever routed through it. A JS-level
check like that can't be real pinning regardless of implementation quality:
it runs after the TLS handshake has already completed, too late to reject
a connection based on it.

What's real now: `plugins/withCertificatePinning.js`, an Expo config plugin
applied at `expo prebuild` / EAS Build time, which generates:
- **Android**: a Network Security Config XML (`<pin-set>`) wired via
  `android:networkSecurityConfig` in the manifest
- **iOS**: `NSAppTransportSecurity.NSPinnedDomains` in Info.plist (iOS 14+
  ATS pinning)

Both are enforced by the OS automatically for every native network request
to a matching host — no app code needs to call anything. This has been
verified end-to-end by actually running `expo prebuild` for both platforms
and inspecting the generated native files (both produced correct output).

**What's still missing: real pin values.** `certificate-pins.json` ships
with `generated: false` and an empty pin list, which makes the plugin a
deliberate no-op — see that file's own comment for why. In short: this
project's own outbound HTTPS (including from this development environment)
goes through a TLS-intercepting egress proxy, so any certificate captured
from here would be the proxy's certificate, not Supabase's real one.
Shipping a pin generated that way wouldn't just fail to protect — it would
hard-fail every native network request for real users, which is worse than
no pinning at all. Real pins have to be generated from a trusted,
unintercepted network.

### To finish this (before the next native release)

1. From a trusted network (not a corporate/CI TLS-inspecting proxy), run:
   ```bash
   node scripts/regenerate-cert-pins.js xfiqezxifsfwkwlbaxbj.supabase.co
   ```
2. Choose 2+ pins from the printed chain — pinning the intermediate/root CA
   (not just the leaf) means routine cert renewal doesn't silently break
   the app until the next release.
3. Paste the pins into `certificate-pins.json`, set `"generated": true`.
4. `expo prebuild` + a real EAS build, then verify connectivity on an
   actual device before releasing.
5. Repeat before every native release — certificates rotate.

### Web

Certificate pinning is not possible on web — browsers own the TLS stack
and give no JS-reachable API to pin a certificate. This is a permanent
platform limitation, not a gap to close later. HTTPS enforcement (below)
is the ceiling on web.

### HTTPS Enforcement

**Level: MODERATE**
- All Supabase API calls use HTTPS
- Minimum TLS 1.2
- HTTP fallback NOT allowed
- Certificate pinning: see status above (native only, pending real pins)

---

## Per-Field Encryption

### Implementation Strategy

In addition to end-to-end encryption of sensitive amounts, consider field-level encryption for:

1. **Personal Information**:
   - Email addresses
   - Phone numbers
   - User names

2. **Financial Data**:
   - Invoice amounts
   - Transaction descriptions
   - Asset values

3. **Business Data**:
   - Business name
   - Account numbers (if stored)
   - Client information

### Database Schema

```sql
-- Example: Store encrypted amounts
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    amount NUMERIC,  -- Original value
    amount_encrypted TEXT,  -- Encrypted value
    amount_key_id VARCHAR(20),  -- Which key was used (for rotation)
    encrypted_at TIMESTAMP,
    ...
);
```

### Encryption Key Rotation

Strategy for rotating encryption keys:

1. **Generate New Key**: Create new key for user
2. **Re-encrypt Data**: Decrypt all data with old key, encrypt with new key
3. **Update Key Reference**: Mark new key as current
4. **Delete Old Key**: (After retention period) delete old key

```typescript
async function rotateEncryptionKey(userId: string) {
    const oldKey = await getEncryptionKey(userId);
    const newKey = await generateEncryptionKey(userId);
    
    // Get all encrypted records
    const records = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);
    
    // Re-encrypt with new key
    for (const record of records.data) {
        const decrypted = decryptTransaction(record, oldKey);
        const reencrypted = encryptTransaction(decrypted, newKey);
        await supabase
            .from('transactions')
            .update(reencrypted)
            .eq('id', record.id);
    }
}
```

---

## Implementation Roadmap

### Phase 1: ✅ COMPLETE
- [x] PIN secure storage (SecureStore)
- [x] Session token encryption
- [x] Input validation
- [x] Rate limiting
- [x] Audit logging

### Phase 2: ✅ IN PROGRESS
- [x] End-to-End Encryption
- [x] Two-Factor Authentication (TOTP + Backup Codes)
- [ ] Certificate Pinning (native config-plugin infrastructure built and verified via `expo prebuild`; real pin values not yet generated — see Certificate Pinning section)
- [ ] Database RLS policies (migration files cover every table as of `013_gdpr_account_deletion_and_consent.sql`; still needs to be confirmed applied to each live environment — see supabase/migrations/)

### Phase 3: PLANNED
- [ ] SMS OTP support
- [ ] Biometric authentication
- [ ] Encryption key rotation
- [ ] Advanced audit dashboard

### Phase 4: FUTURE
- [ ] Zero-knowledge proof authentication
- [ ] Hardware security key support
- [ ] Advanced threat detection

---

## Testing Security Features

### Test Encryption

```bash
# Unit test encryption/decryption
npm test -- encryption.test.ts
```

### Test 2FA

```bash
# Generate test TOTP codes
npm test -- twoFactorAuth.test.ts

# Manual test:
1. Enable 2FA in app
2. Scan QR code with authenticator
3. Enter code at login
```

### Test Certificate Pinning

```bash
# Unit tests for the config plugin's XML/plist generation logic
npm test -- certPinningTransforms.test.ts

# Full integration check -- generates real native project files and lets
# you inspect them directly (see Certificate Pinning section for what to
# look for: <pin-set> in the Android XML, NSPinnedDomains in Info.plist)
npx expo prebuild --platform android --no-install
npx expo prebuild --platform ios --no-install
```

---

## Deployment Checklist

Before deploying advanced security features:

- [ ] End-to-End Encryption enabled in code
- [ ] 2FA database migration applied
- [ ] Certificate pins updated
- [ ] Audit logging tested
- [ ] RLS policies applied
- [ ] User documentation updated
- [ ] Security warnings in release notes
- [ ] 2FA setup guide published
- [ ] Backup code recovery procedure documented

---

## Security Best Practices

### For Users

1. **Encryption Keys**:
   - Never share encryption keys
   - Don't write down keys
   - Keys are device-specific

2. **2FA**:
   - Use authenticator app (not SMS when possible)
   - Save backup codes offline
   - Don't share backup codes

3. **Recovery**:
   - Test backup codes periodically
   - Keep offline copies of important data
   - Set up alternate 2FA method

### For Developers

1. **Never**:
   - Log encryption keys or secrets
   - Store secrets in code
   - Skip certificate validation
   - Disable HTTPS

2. **Always**:
   - Use HTTPS for all requests
   - Encrypt before sending to server
   - Validate user input
   - Log security events

---

## References

- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [OWASP Cheat Sheet: Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [RFC 6238: TOTP](https://tools.ietf.org/html/rfc6238)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**Last Updated**: June 11, 2024
**Status**: Advanced Features - Beta Implementation
