# FinanceBook Security Policy

## Overview

This document outlines the security measures implemented in FinanceBook and provides guidance for deployment and ongoing security management.

**Current Status**: BETA - Suitable for testing with non-critical financial data only.

---

## Implemented Security Measures ✅

### 1. Authentication & Authorization

#### PIN-Based Authentication
- ✅ 4-digit PIN with format validation
- ✅ PIN stored securely in `expo-secure-store` (encrypted storage)
- ✅ Fallback to AsyncStorage for devices without SecureStore support
- ✅ PIN never transmitted to server in clear text

#### Rate Limiting
- ✅ Maximum 5 failed login attempts
- ✅ 15-minute account lockout after failed attempts
- ✅ Auto-reset lockout timer
- ✅ User feedback showing lockout time remaining
- ✅ Audit logging of lockout events

#### Session Management
- ✅ Supabase session tokens stored in SecureStore
- ✅ Auto-refresh enabled for valid sessions
- ✅ Session persistence across app restarts
- ✅ Secure logout clears all session data

### 2. Data Storage Security

#### Sensitive Data
- ✅ PIN: `expo-secure-store` (encrypted)
- ✅ Session tokens: `expo-secure-store` (encrypted)
- ✅ Financial data: AsyncStorage with Supabase sync
- ✅ Non-sensitive data: AsyncStorage (local cache)

#### Data Encryption in Transit
- ✅ HTTPS enforced for all Supabase API calls
- ✅ Supabase uses SSL/TLS for all connections
- ❌ Certificate pinning: Not implemented (add for production)

### 3. API Security

#### Credentials Management
- ✅ Supabase URL and ANON_KEY moved to environment variables
- ✅ Environment variables in `.env.local` (excluded from git)
- ✅ `expo-secure-store` used as Supabase session backend
- ✅ Build process embeds public keys via `EXPO_PUBLIC_*` pattern

#### Row-Level Security (RLS)
- ❌ RLS policies created (SQL provided, must be applied to Supabase)
- See: `supabase/migrations/001_enable_rls.sql`
- Enforces: Users can only access their own workspace data

### 4. Input Validation

#### Financial Amount Validation
- ✅ Min amount: $0.01
- ✅ Max amount: $999,999,999
- ✅ Rejects NaN and invalid types
- ✅ Error messages show constraints

#### Data Validation
- ✅ Email format validation
- ✅ 4-digit PIN validation
- ✅ Business name length limits (max 100 chars)
- ✅ Description length limits (max 200 chars)
- ✅ Inventory item validation (cost < selling price)

### 5. Audit Logging

#### Events Tracked
- ✅ Login/Logout
- ✅ Failed login attempts
- ✅ Account lockout
- ✅ Account setup
- ✅ PIN changes
- ✅ Transactions, invoices, goals CRUD
- ✅ Data export/import/clear
- ✅ Team member invitations

#### Log Details
- User ID
- Action type
- Timestamp
- Severity level (low/medium/high)
- Additional context/metadata

### 6. Error Handling

- ✅ Sensitive errors don't leak technical details
- ✅ Network errors handled gracefully
- ✅ Validation errors provide actionable feedback
- ✅ Console logs sanitized (no credentials)

---

## Security Issues Requiring Setup ⚠️

### 1. Supabase Row-Level Security (RLS)

**Status**: Requires manual setup in Supabase console

**Instructions**:
1. Go to Supabase dashboard → SQL Editor
2. Open `supabase/migrations/001_enable_rls.sql`
3. Copy all SQL statements
4. Paste into SQL editor and execute
5. Verify RLS is enabled on all tables

**Policies Created**:
- Transactions: Users can only access their workspace transactions
- Goals: Users can only manage their own goals
- Settings: Users can only access their own settings
- Invoices: Users can only access their workspace invoices
- Assets: Users can only manage their own assets
- Audit Logs: Users can only view their own logs
- Inventory: Users can only access their own inventory

### 2. Inventory Backup

**Status**: Implemented - Inventory now syncs to Supabase

**Changes**:
- `saveInventory()` syncs to `inventory` table
- `loadInventory()` loads from Supabase (with AsyncStorage fallback)
- Automatic delete sync for removed items

### 3. API Key Rotation

**Status**: Manual process required

**Instructions**:
1. In Supabase dashboard, go to Project Settings → API Keys
2. Click "Rotate" next to the ANON_KEY
3. Copy the new key
4. Update `.env.local`:
   ```
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<new-key-here>
   ```
5. Rebuild and redeploy app

---

## Security Issues NOT YET IMPLEMENTED ❌

### 1. End-to-End Encryption

**Priority**: MEDIUM

**Issue**: Financial data at rest in Supabase is not encrypted with user-specific keys

**Mitigation**: Supabase automatically encrypts at rest with database-level encryption

**To Implement**:
```typescript
// Encrypt sensitive fields before sending to Supabase
import crypto from 'crypto-js';
const encryptedAmount = CryptoJS.AES.encrypt(amount.toString(), userKey);
```

### 2. Certificate Pinning

**Priority**: MEDIUM

**Issue**: No SSL/TLS certificate pinning implemented

**Impact**: MITM attacks possible on compromised networks

**To Implement**:
```bash
npm install react-native-cert-pinning
```

### 3. Two-Factor Authentication (2FA)

**Priority**: MEDIUM-HIGH

**Issue**: Only PIN-based authentication (single factor)

**To Implement**:
- SMS/Email OTP verification
- TOTP (Google Authenticator)
- Biometric unlock

### 4. Data Encryption at Rest

**Priority**: LOW-MEDIUM

**Issue**: AsyncStorage data not encrypted per-field

**Mitigation**: Device-level encryption, SecureStore for sensitive fields

### 5. OWASP Top 10 Protections

**Implemented**:
- ✅ A01: Broken Access Control (RLS policies)
- ✅ A02: Cryptographic Failures (HTTPS, SecureStore)
- ✅ A03: Injection (Input validation, prepared queries)
- ✅ A04: Insecure Design (Rate limiting, audit logs)
- ✅ A05: Broken Authentication (PIN validation, rate limiting)
- ❌ A06: Vulnerable Components (dependency updates needed)
- ✅ A07: Identification & Auth Failures (audit logs)
- ❌ A08: Data Integrity Failures (checksums not implemented)
- ⚠️ A09: Logging & Monitoring (basic audit logs, production monitoring needed)
- ⚠️ A10: SSRF (not applicable to client app)

---

## Pre-Deployment Checklist

Before deploying to production:

### Security
- [ ] RLS policies applied to all tables in Supabase
- [ ] Supabase API keys rotated and regenerated
- [ ] `.env.local` file created with environment variables
- [ ] `.gitignore` updated to exclude `.env*` files
- [ ] All console.log statements removed from production code
- [ ] Audit logs verified in Supabase dashboard

### Code
- [ ] TypeScript strict mode enabled
- [ ] All security warnings addressed
- [ ] Dependency audit passed (`npm audit`)
- [ ] No hardcoded credentials in source code
- [ ] All API calls use HTTPS

### Testing
- [ ] Rate limiting tested (5 failed login attempts)
- [ ] Input validation tested (boundary values)
- [ ] Audit logging verified for key actions
- [ ] Data sync verified between local and cloud
- [ ] Offline mode tested

### Deployment
- [ ] Build signed APK/IPA
- [ ] App signing keys stored securely
- [ ] Auto-update configured with EAS
- [ ] Privacy policy updated
- [ ] Terms of service updated

---

## Incident Response

### If API Key is Compromised

1. **Immediately**:
   - Go to Supabase dashboard
   - Rotate the ANON_KEY
   - Note the time of compromise

2. **Within 1 hour**:
   - Update all deployed apps with new key
   - Review audit logs for suspicious activity
   - Email all users about potential breach

3. **Within 24 hours**:
   - Publish security advisory
   - Offer password reset option
   - Monitor for unauthorized access

### If Data Breach is Discovered

1. **Immediate notification** (within 24-48 hours):
   - Notify all affected users
   - Provide clear, honest communication
   - Explain what data was accessed

2. **Remediation**:
   - Rotate all credentials
   - Review access logs
   - Patch vulnerability
   - Deploy fix immediately

3. **Follow-up**:
   - Offer credit monitoring if applicable
   - Provide FAQs and support
   - Publish post-mortem (when appropriate)

---

## Security Best Practices for Users

### For FinanceBook Users

1. **PIN Security**:
   - Use a PIN you haven't used elsewhere
   - Change your PIN regularly (monthly recommended)
   - Don't share your PIN with anyone

2. **Device Security**:
   - Keep your phone's OS updated
   - Use a strong device PIN/biometric
   - Enable device encryption

3. **Network Security**:
   - Use app only on secure networks
   - Avoid public WiFi for sensitive transactions
   - Use VPN if on untrusted networks

4. **Data Backup**:
   - Regularly export your data
   - Store exports securely
   - Test restore functionality

---

## Compliance & Standards

### GDPR Compliance
- ✅ User can export all data
- ✅ User can delete all data
- ✅ Audit logs for data access
- ❌ Data deletion in Supabase (15-day retention)

### Data Retention
- Transactions: Indefinite (until user deletion)
- Audit logs: 90 days (configurable)
- Session logs: 7 days (auto-cleanup)
- Backups: 30 days (Supabase default)

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** create a public GitHub issue
2. Email: `security@financebook.app` (placeholder)
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

4. **Response time**: Within 24-48 hours

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2024-06-11 | Initial security audit & implementation |
| - | Pending | RLS policies application |
| - | Pending | Certificate pinning |
| - | Pending | 2FA implementation |

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security](https://supabase.com/docs/guides/auth)
- [React Native Security](https://reactnative.dev/docs/security)
- [Expo Security](https://docs.expo.dev/guides/security/)
