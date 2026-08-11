import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SECURE_KEYS = {
    pin: '@quad360/secure/pin',
    sessionToken: '@quad360/secure/session',
    authSecret: '@quad360/secure/auth-secret',
};

// expo-secure-store has no web support — skip it entirely on web
const isNative = Platform.OS !== 'web';

// Browsers have no OS-backed secure enclave a web page can reach, so
// there's no storage mechanism on web that's actually equivalent to
// SecureStore on native — anything in the page's origin (localStorage,
// sessionStorage, indexedDB) is readable by any script that runs there,
// e.g. via XSS. AsyncStorage's web backend is plain localStorage, which
// persists indefinitely; that turns a one-time XSS/device-compromise into
// a standing credential an attacker can use anytime after, not just while
// the tab is open. sessionStorage carries the same read exposure while a
// tab is open, but is cleared when the tab/browser closes — so these three
// secrets (PIN, session token, auth secret; the ones that gate account
// access) use it on web, trading "stay signed in across browser restarts"
// for a materially smaller exposure window. Everything else (cached
// business data) still uses localStorage via AsyncStorage, since it isn't
// itself a credential and losing offline persistence on every browser
// restart would be a poor tradeoff for data that isn't the attack target.
const webSecureStorage = {
    async getItem(key: string): Promise<string | null> {
        try {
            return window.sessionStorage.getItem(key);
        } catch {
            return null;
        }
    },
    async setItem(key: string, value: string): Promise<void> {
        try {
            window.sessionStorage.setItem(key, value);
        } catch { /* private-browsing / storage disabled — nothing to persist to */ }
    },
    async removeItem(key: string): Promise<void> {
        try {
            window.sessionStorage.removeItem(key);
        } catch { /* nothing to remove */ }
    },
};

async function safeSecureStoreOperation<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
): Promise<T> {
    if (!isNative) return fallback();
    try {
        return await operation();
    } catch (e) {
        console.warn('[Quad360] SecureStore failed, falling back to web session storage:', e);
        return fallback();
    }
}

export async function savePinSecurely(pin: string): Promise<void> {
    await safeSecureStoreOperation(
        () => SecureStore.setItemAsync(SECURE_KEYS.pin, pin),
        () => webSecureStorage.setItem(SECURE_KEYS.pin, pin),
    );
}

export async function loadPinSecurely(): Promise<string | null> {
    return safeSecureStoreOperation(
        () => SecureStore.getItemAsync(SECURE_KEYS.pin),
        () => webSecureStorage.getItem(SECURE_KEYS.pin),
    );
}

export async function clearPinSecurely(): Promise<void> {
    if (!isNative) { await webSecureStorage.removeItem(SECURE_KEYS.pin); return; }
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.pin);
    } catch {
        await webSecureStorage.removeItem(SECURE_KEYS.pin);
    }
}

export async function saveSessionTokenSecurely(token: string): Promise<void> {
    await safeSecureStoreOperation(
        () => SecureStore.setItemAsync(SECURE_KEYS.sessionToken, token),
        () => webSecureStorage.setItem(SECURE_KEYS.sessionToken, token),
    );
}

export async function loadSessionTokenSecurely(): Promise<string | null> {
    return safeSecureStoreOperation(
        () => SecureStore.getItemAsync(SECURE_KEYS.sessionToken),
        () => webSecureStorage.getItem(SECURE_KEYS.sessionToken),
    );
}

export async function clearSessionTokenSecurely(): Promise<void> {
    if (!isNative) { await webSecureStorage.removeItem(SECURE_KEYS.sessionToken); return; }
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.sessionToken);
    } catch {
        await webSecureStorage.removeItem(SECURE_KEYS.sessionToken);
    }
}

// The real Supabase Auth credential -- a high-entropy secret generated once
// at signup/join, independent of the PIN. The PIN never leaves the device
// and is never sent anywhere; it only gates whether this stored secret gets
// used to (re)establish the cloud session. See generateAuthSecret() in
// OptimizedContexts.tsx for why this exists: deriving the real password
// from a 6-digit PIN made it brute-forceable directly against Supabase.
export async function saveAuthSecretSecurely(secret: string): Promise<void> {
    await safeSecureStoreOperation(
        () => SecureStore.setItemAsync(SECURE_KEYS.authSecret, secret),
        () => webSecureStorage.setItem(SECURE_KEYS.authSecret, secret),
    );
}

export async function loadAuthSecretSecurely(): Promise<string | null> {
    return safeSecureStoreOperation(
        () => SecureStore.getItemAsync(SECURE_KEYS.authSecret),
        () => webSecureStorage.getItem(SECURE_KEYS.authSecret),
    );
}

export async function clearAuthSecretSecurely(): Promise<void> {
    if (!isNative) { await webSecureStorage.removeItem(SECURE_KEYS.authSecret); return; }
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.authSecret);
    } catch {
        await webSecureStorage.removeItem(SECURE_KEYS.authSecret);
    }
}

export async function clearAllSecureData(): Promise<void> {
    await Promise.all([
        clearPinSecurely(),
        clearSessionTokenSecurely(),
        clearAuthSecretSecurely(),
    ]);
}
