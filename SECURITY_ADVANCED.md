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

### How It Works

1. **Pin Storage**: Expected certificate fingerprints stored in app
2. **Verification**: Before each HTTPS connection, certificate is verified
3. **Match Check**: Certificate fingerprint must match one of the pinned values
4. **Rejection**: If no match, connection is rejected (fail-secure)

### Pinned Certificates

Currently pinned for Supabase:
- `xfiqezxifsfwkwlbaxbj.supabase.co`
- `api.supabase.co`

Using:
- Let's Encrypt ISRG Root X1 (primary)
- Let's Encrypt ISRG Root X2 (backup)

### HTTPS Enforcement

**Level: MODERATE** (production ready)
- All Supabase API calls use HTTPS
- Certificate pinning enabled
- Minimum TLS 1.2
- HTTP fallback NOT allowed

### Updating Certificates

When Supabase rotates certificates:

1. Extract new certificate fingerprint:
```bash
openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform DER | \
  openssl dgst -sha256 -binary | base64
```

2. Update `CERTIFICATE_PINS` in `src/utils/certificatePinning.ts`
3. Deploy new app build

### Validation

```typescript
import { validateSSLConnection } from './utils/certificatePinning';

const isValid = await validateSSLConnection('xfiqezxifsfwkwlbaxbj.supabase.co');
if (!isValid) {
  console.error('SSL/TLS validation failed!');
}
```

### Limitations

- Certificate pinning requires native implementation
- `react-native-cert-pinning` library provides native support
- Currently implemented at library level
- Production deployment recommended before rollout

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
- [x] Certificate Pinning
- [ ] Database RLS policies (needs manual setup)

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
# Validate SSL connection
curl -vI https://xfiqezxifsfwkwlbaxbj.supabase.co
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
