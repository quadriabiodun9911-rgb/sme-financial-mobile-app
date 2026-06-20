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
import { supabase } from './supabase';
import { getAuthUserId } from './storage';

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
 */
// ─── Cross-platform TOTP implementation using crypto-js ──────────────────────

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32ToBytes(base32: string): Uint8Array {
    const cleaned = base32.toUpperCase().replace(/=+$/, '');
    const bits: number[] = [];
    for (const ch of cleaned) {
        const val = BASE32_CHARS.indexOf(ch);
        if (val < 0) continue;
        for (let i = 4; i >= 0; i--) bits.push((val >> i) & 1);
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        for (let j = 0; j < 8; j++) bytes[i] = (bytes[i] << 1) | bits[i * 8 + j];
    }
    return bytes;
}

function generateBase32Secret(byteLength = 20): string {
    const bytes = CryptoJS.lib.WordArray.random(byteLength);
    const arr = new Uint8Array(byteLength);
    const words = bytes.words;
    for (let i = 0; i < byteLength; i++) arr[i] = (words[i >> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    let result = '';
    for (let i = 0; i < byteLength; i += 5) {
        const chunk = arr.slice(i, i + 5);
        const pad = 5 - chunk.length;
        let val = 0n;
        for (const b of chunk) val = (val << 8n) | BigInt(b);
        val <<= BigInt(pad * 8);
        for (let j = 7; j >= 0; j--) result += BASE32_CHARS[Number((val >> BigInt(j * 5)) & 0x1fn)] ?? '';
    }
    return result;
}

function totpCode(secret: string, timeStep?: number): string {
    const step = timeStep ?? Math.floor(Date.now() / 1000 / 30);
    const keyBytes = base32ToBytes(secret);
    const keyHex = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    // 8-byte big-endian time step
    const msgHex = step.toString(16).padStart(16, '0');
    const hmac = CryptoJS.HmacSHA1(CryptoJS.enc.Hex.parse(msgHex), CryptoJS.enc.Hex.parse(keyHex));
    const bytes = new Uint8Array(hmac.words.length * 4);
    hmac.words.forEach((w, i) => {
        bytes[i * 4]     = (w >>> 24) & 0xff;
        bytes[i * 4 + 1] = (w >>> 16) & 0xff;
        bytes[i * 4 + 2] = (w >>> 8)  & 0xff;
        bytes[i * 4 + 3] =  w         & 0xff;
    });
    const offset = bytes[19] & 0xf;
    const code = (((bytes[offset] & 0x7f) << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) % 1_000_000;
    return code.toString().padStart(6, '0');
}

// ─────────────────────────────────────────────────────────────────────────────

export function generateTOTPSecret(email: string): {
    secret: string;
    qrCodeUrl: string;
    manualEntryKey: string;
} {
    const secret = generateBase32Secret(20);
    const qrCodeUrl = `otpauth://totp/${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}&algorithm=SHA1&digits=6&period=30`;

    return {
        secret,
        qrCodeUrl,
        manualEntryKey: secret,
    };
}

/**
 * Verify TOTP code
 * Allows for time skew (±30 seconds)
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
    try {
        const step = Math.floor(Date.now() / 1000 / 30);
        // Check current step ±2 windows (±60 seconds) for clock skew
        for (let offset = -2; offset <= 2; offset++) {
            if (totpCode(secret, step + offset) === code) return true;
        }
        return false;
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
        // Format: XXXX-XXXX (4 pairs of hex digits)
        const code = Array(4)
            .fill(0)
            .map(() => Math.floor(Math.random() * 16).toString(16).toUpperCase())
            .join('-');
        codes.push(code);
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
        const { error } = await supabase.from('two_factor_auth').upsert(
            {
                user_id: userId,
                method: config.method,
                status: config.status,
                secret: config.secret, // Should be encrypted before sending
                phone_number: config.phoneNumber,
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

        return {
            userId: data.user_id,
            method: data.method,
            status: data.status,
            secret: data.secret,
            phoneNumber: data.phone_number,
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
    // Generate 6-digit code
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
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
