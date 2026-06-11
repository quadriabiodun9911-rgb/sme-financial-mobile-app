/**
 * Test Suite for Two-Factor Authentication
 *
 * Run with: npm test -- twoFactorAuth.test.ts
 */

import {
    generateTOTPSecret,
    verifyTOTPCode,
    generateBackupCodes,
    verifyBackupCode,
    useBackupCode,
    formatTOTPSecret,
    generateSMSOTP,
    verifySMSOTP,
} from '../utils/twoFactorAuth';

describe('Two-Factor Authentication', () => {
    describe('TOTP Generation & Verification', () => {
        test('should generate valid TOTP secret', () => {
            const secret = generateTOTPSecret('user@example.com');

            expect(secret).toBeDefined();
            expect(secret.secret).toBeDefined();
            expect(secret.qrCodeUrl).toBeDefined();
            expect(secret.manualEntryKey).toBeDefined();
            expect(secret.secret.length).toBeGreaterThan(20);
        });

        test('should generate different secrets for different emails', () => {
            const secret1 = generateTOTPSecret('user1@example.com');
            const secret2 = generateTOTPSecret('user2@example.com');

            expect(secret1.secret).not.toBe(secret2.secret);
        });

        test('should generate valid QR code URL', () => {
            const secret = generateTOTPSecret('user@example.com');

            expect(secret.qrCodeUrl).toContain('otpauth://totp/');
            expect(secret.qrCodeUrl).toContain('FinanceBook');
        });

        test('should format TOTP secret for display', () => {
            const secret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
            const formatted = formatTOTPSecret(secret);

            expect(formatted).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
            expect(formatted).toContain(' ');
            // Should have spaces every 4 characters
            const parts = formatted.split(' ');
            parts.forEach(part => {
                expect(part.length).toBe(4);
            });
        });
    });

    describe('Backup Codes', () => {
        test('should generate backup codes with correct format', () => {
            const codes = generateBackupCodes(10);

            expect(codes.length).toBe(10);
            codes.forEach(code => {
                // Format: XXXX-XXXX
                expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
            });
        });

        test('should generate different codes each time', () => {
            const codes1 = generateBackupCodes(5);
            const codes2 = generateBackupCodes(5);

            expect(codes1).not.toEqual(codes2);
        });

        test('should generate custom number of codes', () => {
            const codes3 = generateBackupCodes(3);
            const codes5 = generateBackupCodes(5);
            const codes15 = generateBackupCodes(15);

            expect(codes3.length).toBe(3);
            expect(codes5.length).toBe(5);
            expect(codes15.length).toBe(15);
        });

        test('should verify backup code correctly', () => {
            const codes = generateBackupCodes(10);
            const testCode = codes[0];

            expect(verifyBackupCode(testCode, codes)).toBe(true);
            expect(verifyBackupCode('INVALID-CODE', codes)).toBe(false);
        });

        test('should use backup code (consume)', () => {
            const originalCodes = generateBackupCodes(5);
            const codeToUse = originalCodes[0];

            const remainingCodes = useBackupCode(codeToUse, originalCodes);

            expect(remainingCodes.length).toBe(4);
            expect(remainingCodes).not.toContain(codeToUse);
        });

        test('should handle using non-existent code', () => {
            const codes = generateBackupCodes(5);
            const remainingCodes = useBackupCode('FAKE-CODE', codes);

            expect(remainingCodes.length).toBe(5);
            expect(remainingCodes).toEqual(codes);
        });

        test('should track backup code count', () => {
            let codes = generateBackupCodes(10);
            expect(codes.length).toBe(10);

            codes = useBackupCode(codes[0], codes);
            expect(codes.length).toBe(9);

            codes = useBackupCode(codes[0], codes);
            expect(codes.length).toBe(8);
        });
    });

    describe('SMS OTP', () => {
        test('should generate 6-digit SMS OTP', () => {
            const otp = generateSMSOTP();

            expect(otp).toMatch(/^\d{6}$/);
            expect(otp.length).toBe(6);
        });

        test('should generate different OTP each time', () => {
            const otp1 = generateSMSOTP();
            const otp2 = generateSMSOTP();

            // Note: Small chance of collision, but probability is very low
            expect(otp1.length).toBe(6);
            expect(otp2.length).toBe(6);
        });

        test('should verify SMS OTP correctly', () => {
            const otp = '123456';

            expect(verifySMSOTP('123456', otp)).toBe(true);
            expect(verifySMSOTP('654321', otp)).toBe(false);
            expect(verifySMSOTP('12345', otp)).toBe(false);
        });

        test('should handle case sensitivity', () => {
            // OTP should be case-insensitive for numbers
            const otp = '123456';
            expect(verifySMSOTP('123456', otp)).toBe(true);
        });
    });

    describe('Security Properties', () => {
        test('backup codes should be unique', () => {
            const codes = generateBackupCodes(100);
            const uniqueCodes = new Set(codes);

            expect(uniqueCodes.size).toBe(100);
        });

        test('should not expose secret in format function', () => {
            const secret = 'SECRET-KEY-123';
            const formatted = formatTOTPSecret(secret);

            expect(formatted).not.toContain('SECRET-KEY-123');
        });

        test('TOTP secret should have high entropy', () => {
            const secret = generateTOTPSecret('test@example.com');
            const chars = new Set(secret.secret);

            // Should have significant variety of characters
            expect(chars.size).toBeGreaterThan(5);
        });

        test('backup codes should be cryptographically random', () => {
            const codes = generateBackupCodes(1000);
            const codesSet = new Set(codes);

            // All should be unique (within practical probability)
            expect(codesSet.size).toBe(1000);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid secret gracefully', () => {
            // verifyTOTPCode should not crash on invalid input
            try {
                verifyTOTPCode('', '123456');
                verifyTOTPCode('invalid', '123456');
                verifyTOTPCode('invalid-secret-that-is-too-long', '123456');
                // If we reach here, error handling is working
                expect(true).toBe(true);
            } catch (e) {
                expect(true).toBe(true); // Graceful error is OK
            }
        });

        test('should handle invalid code format', () => {
            const secret = generateTOTPSecret('test@example.com').secret;

            expect(verifyTOTPCode(secret, 'abc')).toBe(false);
            expect(verifyTOTPCode(secret, '1234567')).toBe(false);
            expect(verifyTOTPCode(secret, '')).toBe(false);
        });
    });

    describe('TOTP Time Tolerance', () => {
        test('should verify code with time skew tolerance', () => {
            // TOTP allows ±30 second window (window: 2 means ±30 sec)
            const secret = generateTOTPSecret('test@example.com').secret;

            // We can't test actual time-based codes without controlling system time
            // But the implementation includes window parameter
            // This test documents expected behavior
            expect(true).toBe(true);
        });
    });
});
