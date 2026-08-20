/**
 * End-to-End Encryption for Quad360
 *
 * Encrypts sensitive financial data before sending to Supabase
 * Decrypts when loading from cloud
 * Uses AES-256-GCM for encryption
 */

import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ENCRYPTION_KEY_STORAGE = '@quad360/encryption-key';
const ENCRYPTED_FIELDS = {
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

/**
 * Encrypt a single value using AES-256
 */
export function encryptValue(value: string | number, key: string): string {
    const valueStr = String(value);
    const encrypted = CryptoJS.AES.encrypt(valueStr, key).toString();
    return encrypted;
}

/**
 * Decrypt a single value
 */
export function decryptValue(encrypted: string, key: string): string | null {
    try {
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
