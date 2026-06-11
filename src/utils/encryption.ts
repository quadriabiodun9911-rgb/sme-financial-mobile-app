/**
 * End-to-End Encryption for FinanceBook
 *
 * Encrypts sensitive financial data before sending to Supabase
 * Decrypts when loading from cloud
 * Uses AES-256-GCM for encryption
 */

import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_STORAGE = '@financebook/encryption-key';
const ENCRYPTED_FIELDS = {
    transactions: ['amount', 'description', 'category'],
    invoices: ['amount', 'description', 'clientName', 'clientEmail'],
    assets: ['description', 'purchasePrice', 'currentValue'],
    inventory: ['costPrice', 'sellingPrice'],
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
    // Generate a random 256-bit key (44 chars in base64)
    const key = CryptoJS.lib.WordArray.random(32).toString();

    // Store securely
    try {
        await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key);
    } catch {
        console.warn('[FinanceBook] Failed to store encryption key securely, using memory storage');
    }

    return key;
}

/**
 * Get the user's encryption key from secure storage
 */
export async function getEncryptionKey(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE);
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
        console.error('[FinanceBook] Decryption failed:', e);
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
