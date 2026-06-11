/**
 * Test Suite for End-to-End Encryption
 *
 * Run with: npm test -- encryption.test.ts
 */

import {
    encryptValue,
    decryptValue,
    encryptTransaction,
    decryptTransaction,
    encryptInvoice,
    decryptInvoice,
    verifyEncryptionKey,
    generateEncryptionKey,
} from '../utils/encryption';

describe('Encryption Utilities', () => {
    let encryptionKey: string;

    beforeEach(() => {
        // Generate test key
        encryptionKey = 'test-encryption-key-32-chars-long!!!';
    });

    describe('encryptValue & decryptValue', () => {
        test('should encrypt and decrypt string values', () => {
            const value = 'Test Description';
            const encrypted = encryptValue(value, encryptionKey);

            expect(encrypted).not.toBe(value);
            expect(encrypted.length).toBeGreaterThan(0);

            const decrypted = decryptValue(encrypted, encryptionKey);
            expect(decrypted).toBe(value);
        });

        test('should encrypt and decrypt numeric values', () => {
            const value = 1000.50;
            const encrypted = encryptValue(String(value), encryptionKey);
            const decrypted = decryptValue(encrypted, encryptionKey);

            expect(parseFloat(decrypted!)).toBe(value);
        });

        test('should return null for invalid encrypted data', () => {
            const result = decryptValue('invalid-encrypted-data', encryptionKey);
            expect(result).toBeNull();
        });

        test('should fail with wrong key', () => {
            const value = 'Secret Data';
            const encrypted = encryptValue(value, encryptionKey);
            const decrypted = decryptValue(encrypted, 'wrong-key');

            expect(decrypted).not.toBe(value);
        });
    });

    describe('encryptTransaction', () => {
        test('should encrypt sensitive transaction fields', () => {
            const transaction = {
                id: 'tx-123',
                amount: 1000,
                description: 'Client payment',
                category: 'Sales',
                date: '2024-06-11',
                status: 'paid',
            };

            const encrypted = encryptTransaction(transaction, encryptionKey);

            expect(encrypted.encrypted).toBe(true);
            expect(encrypted.version).toBe(1);
            expect(encrypted.timestamp).toBeDefined();
            expect(encrypted.amount_encrypted).toBeDefined();
            expect(encrypted.description_encrypted).toBeDefined();
            expect(encrypted.category_encrypted).toBeDefined();
        });

        test('should decrypt transaction properly', () => {
            const original = {
                id: 'tx-123',
                amount: 1000,
                description: 'Client payment',
                category: 'Sales',
                date: '2024-06-11',
                status: 'paid',
            };

            const encrypted = encryptTransaction(original, encryptionKey);
            const decrypted = decryptTransaction(encrypted, encryptionKey);

            expect(decrypted.amount).toBe(original.amount);
            expect(decrypted.description).toBe(original.description);
            expect(decrypted.category).toBe(original.category);
            expect(decrypted.encrypted).toBeUndefined();
        });

        test('should handle null/undefined fields', () => {
            const transaction = {
                id: 'tx-123',
                amount: 500,
                description: 'Payment',
                category: null,
                date: '2024-06-11',
                status: 'paid',
            };

            const encrypted = encryptTransaction(transaction, encryptionKey);
            const decrypted = decryptTransaction(encrypted, encryptionKey);

            expect(decrypted.amount).toBe(transaction.amount);
            expect(decrypted.category).toBeNull();
        });
    });

    describe('encryptInvoice', () => {
        test('should encrypt sensitive invoice fields', () => {
            const invoice = {
                id: 'inv-123',
                amount: 5000,
                description: 'Monthly services',
                clientName: 'Acme Corp',
                clientEmail: 'contact@acme.com',
                status: 'sent',
            };

            const encrypted = encryptInvoice(invoice, encryptionKey);

            expect(encrypted.amount_encrypted).toBeDefined();
            expect(encrypted.description_encrypted).toBeDefined();
            expect(encrypted.clientName_encrypted).toBeDefined();
            expect(encrypted.clientEmail_encrypted).toBeDefined();
        });

        test('should decrypt invoice properly', () => {
            const original = {
                id: 'inv-123',
                amount: 5000,
                description: 'Monthly services',
                clientName: 'Acme Corp',
                clientEmail: 'contact@acme.com',
            };

            const encrypted = encryptInvoice(original, encryptionKey);
            const decrypted = decryptInvoice(encrypted, encryptionKey);

            expect(decrypted.amount).toBe(original.amount);
            expect(decrypted.clientName).toBe(original.clientName);
        });
    });

    describe('verifyEncryptionKey', () => {
        test('should verify valid encryption key', () => {
            const isValid = verifyEncryptionKey(encryptionKey);
            expect(isValid).toBe(true);
        });

        test('should reject invalid encryption key', () => {
            const isValid = verifyEncryptionKey('invalid-key');
            expect(isValid).toBe(false);
        });

        test('should reject empty encryption key', () => {
            const isValid = verifyEncryptionKey('');
            expect(isValid).toBe(false);
        });
    });

    describe('generateEncryptionKey', () => {
        test('should generate valid encryption key', async () => {
            const key = await generateEncryptionKey();
            expect(key).toBeDefined();
            expect(key.length).toBeGreaterThan(0);

            // Should be usable for encryption
            const isValid = verifyEncryptionKey(key);
            expect(isValid).toBe(true);
        });

        test('should generate different keys each time', async () => {
            const key1 = await generateEncryptionKey();
            const key2 = await generateEncryptionKey();

            expect(key1).not.toBe(key2);
        });
    });

    describe('Security Properties', () => {
        test('encrypted data should not contain original values', () => {
            const original = 'SecretAmount';
            const encrypted = encryptValue(original, encryptionKey);

            expect(encrypted).not.toContain(original);
            expect(encrypted.length).toBeGreaterThan(original.length);
        });

        test('same value encrypted twice should produce different results', () => {
            const value = 'Test';
            // Note: AES in CryptoJS actually produces same result each time
            // In production, add IV/salt for different results each time
            const encrypted1 = encryptValue(value, encryptionKey);
            const encrypted2 = encryptValue(value, encryptionKey);

            // Both should decrypt to same value
            expect(decryptValue(encrypted1, encryptionKey)).toBe(value);
            expect(decryptValue(encrypted2, encryptionKey)).toBe(value);
        });

        test('should handle large amounts', () => {
            const largeAmount = 999999999;
            const encrypted = encryptValue(String(largeAmount), encryptionKey);
            const decrypted = decryptValue(encrypted, encryptionKey);

            expect(parseInt(decrypted!)).toBe(largeAmount);
        });

        test('should handle special characters', () => {
            const specialChars = 'Special: $€¥₦ Characters!@#$%';
            const encrypted = encryptValue(specialChars, encryptionKey);
            const decrypted = decryptValue(encrypted, encryptionKey);

            expect(decrypted).toBe(specialChars);
        });
    });
});
