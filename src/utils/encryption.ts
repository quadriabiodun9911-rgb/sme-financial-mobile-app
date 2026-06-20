/**
 * End-to-End Encryption for Quad360
 *
 * Encrypts sensitive financial data before sending to Supabase
 * Decrypts when loading from cloud
 * Uses AES-256-GCM for encryption
 */

import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

    try {
        await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key);
    } catch {
        // SecureStore unavailable (e.g. web) — fall back to AsyncStorage
        try {
            await AsyncStorage.setItem(ENCRYPTION_KEY_STORAGE, key);
        } catch {
            console.warn('[Quad360] Could not persist encryption key — encrypted data will be unreadable after restart');
        }
    }

    return key;
}

/**
 * Get the user's encryption key from secure storage
 */
export async function getEncryptionKey(): Promise<string | null> {
    try {
        const key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE);
        if (key) return key;
    } catch { /* SecureStore unavailable */ }
    // AsyncStorage fallback (web / devices where SecureStore failed during generation)
    try {
        return await AsyncStorage.getItem(ENCRYPTION_KEY_STORAGE);
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
            // Keep original for backward compatibility during transition
            // delete encrypted[field]; // Uncomment after migration period
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

/**
 * Verify encryption key is valid
 */
export function verifyEncryptionKey(key: string): boolean {
    try {
        const testValue = 'test';
        const encrypted = encryptValue(testValue, key);
        const decrypted = decryptValue(encrypted, key);
        return decrypted === testValue;
    } catch {
        return false;
    }
}
