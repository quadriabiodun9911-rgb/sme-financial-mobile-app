import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SECURE_KEYS = {
    pin: '@quad360/secure/pin',
    sessionToken: '@quad360/secure/session',
    authSecret: '@quad360/secure/auth-secret',
    localAccounts: '@quad360/secure/local-accounts',
};

// expo-secure-store has no web support — skip it entirely on web
const isNative = Platform.OS !== 'web';

// Browsers have no OS-backed secure enclave a web page can reach, so
// there's no storage mechanism on web that's actually equivalent to
// SecureStore on native — anything in the page's origin (localStorage,
// sessionStorage, indexedDB) is readable by any script that runs there,
// e.g. via XSS.
//
// This used to be sessionStorage specifically to shrink that exposure
// window (cleared on tab/browser close, at the cost of "stay signed in").
// In practice that traded a security nicety for a broken product: every
// browser gives each tab (not just each browser session) its own separate
// sessionStorage bucket. Since the PIN-reset email link always opens in a
// *new* tab -- normal browser behavior, not something this app controls --
// a device could complete a reset and still never regain access: the
// secret it just saved lived only in that one throwaway tab, invisible to
// the tab the user actually kept using afterward. That's not a rare edge
// case, it's what happens on every single reset. localStorage (like the
// rest of the app's cached data via AsyncStorage) fixes that by being
// shared across tabs on the same origin -- the credential now persists
// exactly as long as everything else already effectively does.
const webSecureStorage = {
    async getItem(key: string): Promise<string | null> {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    async setItem(key: string, value: string): Promise<void> {
        try {
            window.localStorage.setItem(key, value);
        } catch { /* private-browsing / storage disabled — nothing to persist to */ }
    },
    async removeItem(key: string): Promise<void> {
        try {
            window.localStorage.removeItem(key);
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

// ─── Multiple accounts on one device ───────────────────────────────────────
// The single pin/authSecret/profile slots above hold whichever ONE account
// is currently active on this device -- every login, PIN reset, or device
// verification overwrites them, which is exactly why switching between two
// accounts on the same browser used to evict one every time the other
// signed in. This is a separate, additive registry of every account this
// device has ever set up or recovered, so a returning account's PIN hash
// and auth secret survive being temporarily not-the-active-one. Stored as
// one JSON blob (mirroring how the single pin/authSecret values are stored)
// rather than one key per account, since SecureStore only tracks bounded
// small values well and the account count per device is always small.
export async function loadLocalAccountsSecurely(): Promise<string | null> {
    return safeSecureStoreOperation(
        () => SecureStore.getItemAsync(SECURE_KEYS.localAccounts),
        () => webSecureStorage.getItem(SECURE_KEYS.localAccounts),
    );
}

export async function saveLocalAccountsSecurely(json: string): Promise<void> {
    await safeSecureStoreOperation(
        () => SecureStore.setItemAsync(SECURE_KEYS.localAccounts, json),
        () => webSecureStorage.setItem(SECURE_KEYS.localAccounts, json),
    );
}

export async function clearLocalAccountsSecurely(): Promise<void> {
    if (!isNative) { await webSecureStorage.removeItem(SECURE_KEYS.localAccounts); return; }
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.localAccounts);
    } catch {
        await webSecureStorage.removeItem(SECURE_KEYS.localAccounts);
    }
}
