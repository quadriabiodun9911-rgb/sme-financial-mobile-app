/**
 * End-to-End Encryption for Quad360
 *
 * Encrypts sensitive financial data before sending to Supabase
 * Decrypts when loading from cloud
 * Uses AES-256 (CBC, via CryptoJS's default passphrase-based scheme) with
 * an Encrypt-then-MAC HMAC-SHA256 tag for integrity -- CryptoJS has no
 * built-in AEAD (GCM) mode, and React Native's JS runtime has no native
 * SubtleCrypto to fall back on for one, so the MAC is what actually
 * provides "was this ciphertext tampered with" here, not the cipher mode
 * itself. See CIPHERTEXT_VERSION_PREFIX below for why decryptValue still
 * accepts un-MAC'd ciphertext from before this was added.
 */

import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ENCRYPTION_KEY_STORAGE = '@quad360/encryption-key';
export const ENCRYPTED_FIELDS = {
    transactions: ['amount', 'description', 'category'],
    invoices: ['amount', 'description', 'clientName', 'clientEmail'],
    assets: ['description', 'purchasePrice', 'currentValue'],
    inventory: ['costPrice', 'sellingPrice'],
    goals: ['targetAmount', 'currentAmount', 'name'],
    loans: ['amount', 'interestRate', 'lenderName'],
    budgets: ['amount', 'spent', 'name'],
};

interface EncryptionMetadata {
    encrypted: boolean;
    version: number; // For future algorithm changes
    timestamp: number;
}

/**
 * Generate a secure encryption key for the user
 * Should be called once during account setup
 */
export async function generateEncryptionKey(): Promise<string> {
    const key = CryptoJS.lib.WordArray.random(32).toString();

    if (Platform.OS !== 'web') {
        try {
            await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key);
            return key;
        } catch { /* fall through to web storage */ }
    }
    // localStorage, not sessionStorage -- see secureStorage.ts for the full
    // reasoning (sessionStorage is scoped per browser TAB, not per session,
    // which silently orphans anything saved there the moment the user's
    // next action happens to open in a new tab). This function is currently
    // unreachable from live app code (see deriveFieldEncryptionKey below),
    // but kept consistent with secureStorage.ts rather than leaving a
    // latent version of the same bug for whenever it is wired up.
    try {
        if (typeof window !== 'undefined') window.localStorage.setItem(ENCRYPTION_KEY_STORAGE, key);
    } catch {
        console.warn('[Quad360] Could not persist encryption key — encrypted data will be unreadable after restart');
    }

    return key;
}

/**
 * Persist an explicit encryption key that was already decided elsewhere
 * (e.g. pulled from Supabase user_metadata during syncFieldEncryptionKey,
 * see storage.ts) — same storage locations as generateEncryptionKey, but
 * for a caller-supplied key instead of a freshly random one.
 */
export async function setEncryptionKey(key: string): Promise<void> {
    if (Platform.OS !== 'web') {
        try {
            await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key);
            return;
        } catch { /* fall through to web storage */ }
    }
    try {
        if (typeof window !== 'undefined') window.localStorage.setItem(ENCRYPTION_KEY_STORAGE, key);
    } catch {
        console.warn('[Quad360] Could not persist encryption key — encrypted data will be unreadable after restart');
    }
}

// A per-device random key (generateEncryptionKey above) can never be the
// real answer for data that's meant to sync across a business's devices --
// whichever device saves first would encrypt with a key no other device
// has, and every other device would see that data silently disappear on
// decrypt. generateEncryptionKey() was in fact never called anywhere in
// live app code (only in this module's own tests), so nothing has ever
// actually been encrypted in production -- this derives a key every device
// holding the account's real credential (its authSecret, see
// storage.ts/generateAuthSecret) can reproduce identically, closing that
// gap without needing any new server-side key storage or distribution.
export function deriveFieldEncryptionKey(authSecret: string): string {
    return CryptoJS.SHA256(authSecret + 'quad360-field-encryption-v1').toString(CryptoJS.enc.Hex);
}

/**
 * The encryption key to actually use: an explicitly stored/rotated key if
 * one exists (future-proofing for manual key rotation), otherwise derived
 * from the account's auth secret. Returns null only when neither is
 * available (e.g. a device that hasn't completed signup/recovery yet) --
 * callers already treat a null key as "save/load unencrypted," so this
 * fails safe rather than blocking.
 */
export async function getFieldEncryptionKey(authSecret: string | null): Promise<string | null> {
    const stored = await getEncryptionKey();
    if (stored) return stored;
    if (!authSecret) return null;
    return deriveFieldEncryptionKey(authSecret);
}

/**
 * Get the user's encryption key from secure storage
 */
export async function getEncryptionKey(): Promise<string | null> {
    if (Platform.OS !== 'web') {
        try {
            const key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE);
            if (key) return key;
        } catch { /* fall through */ }
    }
    try {
        return typeof window !== 'undefined' ? window.localStorage.getItem(ENCRYPTION_KEY_STORAGE) : null;
    } catch {
        return null;
    }
}

// Marks ciphertext produced by the Encrypt-then-MAC scheme below, so
// decryptValue can tell it apart from ciphertext written before this fix
// (plain CryptoJS.AES.encrypt() output, no MAC) and still read that older
// data -- every record encrypted in production before this change lacks
// this prefix, and there's no migration path that rewrites data at rest.
const CIPHERTEXT_VERSION_PREFIX = 'v2:';

// Deliberately NOT the encryption key itself -- a distinct, derived key so
// the same secret isn't reused for two different cryptographic purposes.
function deriveMacKey(encryptionKey: string): string {
    return CryptoJS.SHA256(encryptionKey + ':quad360-field-mac-v1').toString(CryptoJS.enc.Hex);
}

// Constant-time compare -- an early-exit === on a MAC would leak it one
// byte at a time via comparison timing.
function timingSafeEqualStr(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * Encrypt a single value using AES-256-CBC, then attach an HMAC-SHA256 tag
 * over the ciphertext (Encrypt-then-MAC) so tampering is detectable on
 * decrypt instead of silently producing garbled plaintext.
 */
export function encryptValue(value: string | number, key: string): string {
    const valueStr = String(value);
    const ciphertext = CryptoJS.AES.encrypt(valueStr, key).toString();
    const mac = CryptoJS.HmacSHA256(ciphertext, deriveMacKey(key)).toString(CryptoJS.enc.Hex);
    return CIPHERTEXT_VERSION_PREFIX + mac + ':' + ciphertext;
}

/**
 * Decrypt a single value. Verifies the MAC first for anything encrypted by
 * the current encryptValue() (returning null, not garbled text, on a
 * mismatch); falls back to a plain decrypt with no integrity check for
 * legacy pre-MAC ciphertext.
 */
export function decryptValue(encrypted: string, key: string): string | null {
    try {
        if (encrypted.startsWith(CIPHERTEXT_VERSION_PREFIX)) {
            const rest = encrypted.slice(CIPHERTEXT_VERSION_PREFIX.length);
            const sepIdx = rest.indexOf(':');
            if (sepIdx === -1) return null;
            const mac = rest.slice(0, sepIdx);
            const ciphertext = rest.slice(sepIdx + 1);
            const expectedMac = CryptoJS.HmacSHA256(ciphertext, deriveMacKey(key)).toString(CryptoJS.enc.Hex);
            if (!timingSafeEqualStr(mac, expectedMac)) {
                console.error('[Quad360] Decryption failed: integrity check failed (tampered ciphertext or wrong key)');
                return null;
            }
            const decrypted = CryptoJS.AES.decrypt(ciphertext, key).toString(CryptoJS.enc.Utf8);
            return decrypted || null;
        }
        const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
        return decrypted || null;
    } catch (e) {
        console.error('[Quad360] Decryption failed:', e);
        return null;
    }
}

/**
 * Encrypt sensitive fields in a transaction object
 */
export function encryptTransaction(
    transaction: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...transaction };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.transactions;
    for (const field of fieldsToEncrypt) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }

    return {
        ...encrypted,
        encrypted: true,
        version: 1,
        timestamp: Date.now(),
    };
}

/**
 * Decrypt sensitive fields in a transaction object
 */
export function decryptTransaction(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.transactions;
    for (const field of fieldsToEncrypt) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }

    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

/**
 * Encrypt sensitive fields in an invoice object
 */
export function encryptInvoice(
    invoice: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...invoice };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.invoices;
    for (const field of fieldsToEncrypt) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }

    return {
        ...encrypted,
        encrypted: true,
        version: 1,
        timestamp: Date.now(),
    };
}

/**
 * Decrypt sensitive fields in an invoice object
 */
export function decryptInvoice(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.invoices;
    for (const field of fieldsToEncrypt) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }

    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

/**
 * Encrypt sensitive fields in an asset object
 */
export function encryptAsset(
    asset: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...asset };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.assets;
    for (const field of fieldsToEncrypt) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }

    return {
        ...encrypted,
        encrypted: true,
        version: 1,
        timestamp: Date.now(),
    };
}

/**
 * Decrypt sensitive fields in an asset object
 */
export function decryptAsset(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.assets;
    for (const field of fieldsToEncrypt) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }

    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

/**
 * Encrypt inventory item
 */
export function encryptInventoryItem(
    item: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...item };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.inventory;
    for (const field of fieldsToEncrypt) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }

    return {
        ...encrypted,
        encrypted: true,
        version: 1,
        timestamp: Date.now(),
    };
}

/**
 * Decrypt inventory item
 */
export function decryptInventoryItem(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };

    const fieldsToEncrypt = ENCRYPTED_FIELDS.inventory;
    for (const field of fieldsToEncrypt) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }

    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

/**
 * Encrypt sensitive fields in a goal object
 */
export function encryptGoal(
    goal: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...goal };
    for (const field of ENCRYPTED_FIELDS.goals) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }
    return { ...encrypted, encrypted: true, version: 1, timestamp: Date.now() };
}

/**
 * Decrypt sensitive fields in a goal object
 */
export function decryptGoal(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };
    for (const field of ENCRYPTED_FIELDS.goals) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }
    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

/**
 * Encrypt sensitive fields in a loan object
 */
export function encryptLoan(
    loan: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...loan };
    for (const field of ENCRYPTED_FIELDS.loans) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }
    return { ...encrypted, encrypted: true, version: 1, timestamp: Date.now() };
}

/**
 * Decrypt sensitive fields in a loan object
 */
export function decryptLoan(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };
    for (const field of ENCRYPTED_FIELDS.loans) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }
    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

/**
 * Encrypt sensitive fields in a budget object
 */
export function encryptBudget(
    budget: Record<string, any>,
    key: string,
): Record<string, any> & EncryptionMetadata {
    const encrypted = { ...budget };
    for (const field of ENCRYPTED_FIELDS.budgets) {
        if (field in encrypted && encrypted[field] != null) {
            encrypted[`${field}_encrypted`] = encryptValue(encrypted[field], key);
            delete encrypted[field];
        }
    }
    return { ...encrypted, encrypted: true, version: 1, timestamp: Date.now() };
}

/**
 * Decrypt sensitive fields in a budget object
 */
export function decryptBudget(
    encrypted: Record<string, any> & EncryptionMetadata,
    key: string,
): Record<string, any> {
    const decrypted = { ...encrypted };
    for (const field of ENCRYPTED_FIELDS.budgets) {
        const encryptedField = `${field}_encrypted`;
        if (encryptedField in decrypted && decrypted[encryptedField]) {
            const value = decryptValue(decrypted[encryptedField], key);
            if (value) {
                decrypted[field] = isNaN(Number(value)) ? value : Number(value);
            }
        }
    }
    const { encrypted: _, version: __, timestamp: ___, ...cleanDecrypted } = decrypted;
    return cleanDecrypted;
}

// generateEncryptionKey() produces a 64-character hex string (32 random
// bytes). Anything drastically shorter isn't a key this app generated —
// but CryptoJS.AES will silently accept *any* non-empty string as a
// passphrase and derive key material from it, so an encrypt/decrypt
// round-trip alone previously "verified" clearly-bogus keys like
// 'invalid-key' or '' (empty passphrases still derive deterministic key
// material) as long as the same string was used on both sides.
const MIN_ENCRYPTION_KEY_LENGTH = 16;

/**
 * Verify encryption key is valid
 */
export function verifyEncryptionKey(key: string): boolean {
    if (!key || key.length < MIN_ENCRYPTION_KEY_LENGTH) return false;
    try {
        const testValue = 'test';
        const encrypted = encryptValue(testValue, key);
        const decrypted = decryptValue(encrypted, key);
        return decrypted === testValue;
    } catch {
        return false;
    }
}

/**
 * Which of a record's encrypted fields failed to decrypt (wrong/missing
 * key). Every decryptX() above deliberately leaves the raw `${field}_encrypted`
 * ciphertext in place whenever decryptValue() comes back empty -- it only
 * ever *sets* the plain `field` on success, never deletes the ciphertext on
 * failure -- so a field with `${field}_encrypted` present but no `field`
 * value is unambiguously "this device's key couldn't read it," not "this
 * was never filled in." That's the one reliable signal a corrupted-by-key-
 * rotation record leaves behind after going through decryptTransaction/
 * decryptInvoice/etc., which is what lets a cleanup screen tell those apart
 * from ordinary empty fields.
 */
export function getUndecryptedFields(
    record: Record<string, any>,
    entityType: keyof typeof ENCRYPTED_FIELDS,
): string[] {
    return ENCRYPTED_FIELDS[entityType].filter(
        field => record[`${field}_encrypted`] && record[field] === undefined
    );
}
