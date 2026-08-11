/**
 * Two-Factor Authentication for Quad360
 *
 * Supports:
 * - TOTP (Time-based One-Time Password) - Google Authenticator, Authy, Microsoft Authenticator
 * - SMS OTP (requires Supabase SMS provider)
 *
 * Setup flow:
 * 1. User initiates 2FA setup
 * 2. Generate secret key for TOTP
 * 3. Show QR code to user
 * 4. User scans with authenticator app
 * 5. User verifies with code
 * 6. Save 2FA config to Supabase
 */

import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import { generateSecret as generateTOTPSecretKey, generateURI, verifySync } from 'otplib';
import { supabase } from './supabase';
import { getAuthUserId, loadAuthSecret } from './storage';
import { getFieldEncryptionKey, encryptValue, decryptValue } from './encryption';

export type TwoFactorMethod = 'totp' | 'sms';
export type TwoFactorStatus = 'disabled' | 'enabled' | 'pending_verification';

export interface TwoFactorConfig {
    userId: string;
    method: TwoFactorMethod;
    status: TwoFactorStatus;
    secret?: string; // TOTP secret (encrypted)
    phoneNumber?: string; // SMS phone number (encrypted)
    backupCodes: string[]; // For recovery
    createdAt: string;
    verifiedAt?: string;
    lastUsedAt?: string;
}

const TOTP_ISSUER = 'Quad360';
const TOTP_LABEL = 'Quad360';
const BACKUP_CODES_COUNT = 10;

/**
 * Generate TOTP secret for the user
 * Returns secret and QR code URI
 *
 * Uses `otplib` (RFC 6238-compliant, constant-time verification) rather
 * than a hand-rolled HMAC-SHA1 implementation. Its default plugins
 * (`NobleCryptoPlugin` / `ScureBase32Plugin`) are pure-JS with no
 * `crypto.subtle`/WebCrypto dependency, so they work unmodified on
 * React Native/Hermes as well as web and Node (tests).
 */
export function generateTOTPSecret(email: string): {
    secret: string;
    qrCodeUrl: string;
    manualEntryKey: string;
} {
    const secret = generateTOTPSecretKey();
    const qrCodeUrl = generateURI({
        issuer: TOTP_ISSUER,
        label: email,
        secret,
        algorithm: 'sha1',
        digits: 6,
        period: 30,
    });

    return {
        secret,
        qrCodeUrl,
        manualEntryKey: secret,
    };
}

/**
 * Verify TOTP code
 * Allows for time skew (±60 seconds), matching the previous implementation's
 * ±2-window tolerance rather than RFC 6238's stricter past-only default,
 * since authenticator apps can also run slightly ahead of the server clock.
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
    try {
        const result = verifySync({ secret, token: code, epochTolerance: 60 });
        return result.valid;
    } catch (e) {
        console.error('[Quad360] TOTP verification failed:', e);
        return false;
    }
}

/**
 * Generate backup codes for account recovery
 * User should save these in a secure location
 */
export function generateBackupCodes(count: number = BACKUP_CODES_COUNT): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        // Format: XXXX-XXXX (4 hex digits, dash, 4 hex digits) — 16^8 ≈ 4.3
        // billion possible codes, drawn from CryptoJS's CSPRNG (the same
        // source generateBase32Secret uses for TOTP secrets, above).
        // Previously generated 4 *single* hex digits joined by dashes
        // (e.g. "4-E-D-2") via Math.random() — a 16^4 = 65,536-code space
        // of weak, non-cryptographic randomness that collided within a
        // batch of just 1,000 codes.
        const hex = CryptoJS.lib.WordArray.random(4).toString(CryptoJS.enc.Hex).toUpperCase();
        codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
    }
    return codes;
}

/**
 * Verify a backup code and consume it
 */
export function verifyBackupCode(code: string, backupCodes: string[]): boolean {
    return backupCodes.includes(code);
}

/**
 * Use a backup code (remove it from the list)
 */
export function useBackupCode(code: string, backupCodes: string[]): string[] {
    return backupCodes.filter(c => c !== code);
}

/**
 * Save 2FA config to Supabase
 */
export async function saveTwoFactorConfig(config: Omit<TwoFactorConfig, 'userId'>): Promise<void> {
    const userId = await getAuthUserId();
    if (!userId) throw new Error('User not authenticated');

    try {
        // The TOTP secret (and SMS phone number) are exactly what an
        // attacker would need to generate valid codes for this account, so
        // they're encrypted before ever leaving the device -- a database-
        // level compromise or RLS misconfiguration then exposes ciphertext,
        // not a working bypass. Same derived-key mechanism as every other
        // encrypted field (see getFieldEncryptionKey), so any device that
        // already holds this account's auth secret can also decrypt it.
        const encKey = await getFieldEncryptionKey(await loadAuthSecret());
        const { error } = await supabase.from('two_factor_auth').upsert(
            {
                user_id: userId,
                method: config.method,
                status: config.status,
                secret: config.secret && encKey ? encryptValue(config.secret, encKey) : config.secret,
                phone_number: config.phoneNumber && encKey ? encryptValue(config.phoneNumber, encKey) : config.phoneNumber,
                backup_codes: config.backupCodes,
                created_at: config.createdAt,
                verified_at: config.verifiedAt,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
        );

        if (error) {
            throw new Error(`Failed to save 2FA config: ${error.message}`);
        }
    } catch (e) {
        console.error('[Quad360] Failed to save 2FA config:', e);
        throw e;
    }
}

/**
 * Load 2FA config from Supabase
 */
export async function loadTwoFactorConfig(): Promise<TwoFactorConfig | null> {
    const userId = await getAuthUserId();
    if (!userId) return null;

    try {
        const { data, error } = await supabase
            .from('two_factor_auth')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Not found
            }
            throw error;
        }

        if (!data) return null;

        const encKey = await getFieldEncryptionKey(await loadAuthSecret());
        // Decrypt when a key is available, falling back to the raw stored
        // value if that fails (e.g. a row saved before this field started
        // being encrypted) rather than surfacing a broken/empty secret.
        const decryptField = (val: string | null | undefined): string | undefined => {
            if (!val) return val ?? undefined;
            if (!encKey) return val;
            return decryptValue(val, encKey) ?? val;
        };

        return {
            userId: data.user_id,
            method: data.method,
            status: data.status,
            secret: decryptField(data.secret),
            phoneNumber: decryptField(data.phone_number),
            backupCodes: data.backup_codes || [],
            createdAt: data.created_at,
            verifiedAt: data.verified_at,
            lastUsedAt: data.last_used_at,
        };
    } catch (e) {
        console.error('[Quad360] Failed to load 2FA config:', e);
        return null;
    }
}

/**
 * Disable 2FA for user
 */
export async function disableTwoFactor(): Promise<void> {
    const userId = await getAuthUserId();
    if (!userId) throw new Error('User not authenticated');

    try {
        const { error } = await supabase.from('two_factor_auth').delete().eq('user_id', userId);

        if (error) {
            throw new Error(`Failed to disable 2FA: ${error.message}`);
        }
    } catch (e) {
        console.error('[Quad360] Failed to disable 2FA:', e);
        throw e;
    }
}

/**
 * Verify 2FA during login
 * Accepts either TOTP code or backup code
 */
export async function verifyTwoFactorLogin(
    code: string,
    method: TwoFactorMethod,
): Promise<boolean> {
    const config = await loadTwoFactorConfig();

    if (!config || config.status !== 'enabled') {
        console.warn('[Quad360] 2FA not enabled for this user');
        return false;
    }

    if (config.method === 'totp' && method === 'totp') {
        if (!config.secret) {
            console.error('[Quad360] TOTP secret not found');
            return false;
        }
        return verifyTOTPCode(config.secret, code);
    }

    // Check backup code
    if (verifyBackupCode(code, config.backupCodes)) {
        // Consume the backup code
        const updatedCodes = useBackupCode(code, config.backupCodes);
        await saveTwoFactorConfig({
            ...config,
            backupCodes: updatedCodes,
        });
        return true;
    }

    return false;
}

/**
 * Format TOTP secret for display
 * Adds spaces every 4 characters for readability
 */
export function formatTOTPSecret(secret: string): string {
    return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Generate SMS OTP code (would be sent by Supabase SMS service)
 */
export function generateSMSOTP(): string {
    // CryptoJS's CSPRNG, not Math.random() -- same reasoning as
    // generateBackupCodes above: a predictable PRNG makes a code guessable
    // faster than its 6-digit space alone would suggest.
    const n = CryptoJS.lib.WordArray.random(4).words[0] >>> 0;
    return String(n % 1_000_000).padStart(6, '0');
}

/**
 * Verify SMS OTP code
 */
export function verifySMSOTP(enteredCode: string, actualCode: string): boolean {
    return enteredCode === actualCode;
}

/**
 * Get 2FA status
 */
export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
    const config = await loadTwoFactorConfig();
    return config?.status ?? 'disabled';
}

/**
 * Check if user has backup codes remaining
 */
export async function hasBackupCodesRemaining(): Promise<boolean> {
    const config = await loadTwoFactorConfig();
    return config ? config.backupCodes.length > 0 : false;
}

/**
 * Get remaining backup codes count
 */
export async function getBackupCodesCount(): Promise<number> {
    const config = await loadTwoFactorConfig();
    return config?.backupCodes.length ?? 0;
}
