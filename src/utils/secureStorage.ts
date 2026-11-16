import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SECURE_KEYS = {
    pin: '@quad360/secure/pin',
    sessionToken: '@quad360/secure/session',
    authSecret: '@quad360/secure/auth-secret',
    localAccounts: '@quad360/secure/local-accounts',
    biometricPin: '@quad360/secure/biometric-pin',
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

// Face ID / fingerprint sign-in. The raw PIN -- not its hash -- gated
// behind the device's own biometric/passcode check via SecureStore's
// requireAuthentication, so reading it back always re-proves identity the
// same way typing the PIN does. This is the only place the raw PIN is
// ever stored; everywhere else (savePin/loadPin, storage.ts) stores only
// its hash, deliberately, so plaintext never otherwise sits in storage.
// It exists purely so login() can be called with this value exactly as if
// the owner had typed it, reusing every check login() already does
// (lockout, 2FA) instead of a separate "biometric path" duplicating any
// of them. No web fallback -- a browser has no OS biometric prompt to gate
// this on, so this feature simply doesn't apply there.
const BIOMETRIC_AUTH_PROMPT = 'Confirm to sign in to Quad360';

export async function saveBiometricPinSecurely(pin: string): Promise<void> {
    if (!isNative) return;
    await SecureStore.setItemAsync(SECURE_KEYS.biometricPin, pin, {
        requireAuthentication: true,
        authenticationPrompt: BIOMETRIC_AUTH_PROMPT,
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}

// Every call prompts Face ID/fingerprint -- that's the whole point. Never
// call this just to check whether biometric sign-in is enabled; see
// isBiometricLoginEnabledFlag for that.
export async function loadBiometricPinSecurely(): Promise<string | null> {
    if (!isNative) return null;
    try {
        return await SecureStore.getItemAsync(SECURE_KEYS.biometricPin, {
            requireAuthentication: true,
            authenticationPrompt: BIOMETRIC_AUTH_PROMPT,
        });
    } catch {
        // Cancelled, no biometric/passcode enrolled on this device, or the
        // key was invalidated (fingerprints/face changed since enabling) --
        // any of these fall back to manual PIN entry, not an error dialog.
        return null;
    }
}

export async function clearBiometricPinSecurely(): Promise<void> {
    if (!isNative) return;
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.biometricPin);
    } catch { /* nothing to remove */ }
}

// A plain, non-authenticated flag so the login screen can decide whether
// to show the "Sign in with Face ID" button WITHOUT itself triggering a
// biometric prompt just to render -- only tapping the button should ever
// prompt.
const BIOMETRIC_ENABLED_FLAG_KEY = '@quad360/biometric_login_enabled';

export async function isBiometricLoginEnabledFlag(): Promise<boolean> {
    if (!isNative) return false;
    try {
        return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_FLAG_KEY)) === 'true';
    } catch {
        return false;
    }
}

export async function setBiometricLoginEnabledFlag(enabled: boolean): Promise<void> {
    try {
        if (enabled) await AsyncStorage.setItem(BIOMETRIC_ENABLED_FLAG_KEY, 'true');
        else await AsyncStorage.removeItem(BIOMETRIC_ENABLED_FLAG_KEY);
    } catch { /* best-effort -- worst case the button is offered again next launch */ }
}

// Whether the owner has already been offered (and answered, either way)
// the one-time "enable Face ID?" prompt after a manual PIN login -- without
// this, declining once would just mean being asked again on every single
// future login, which is the opposite of "easy sign-in." Separate from the
// enabled flag above: declining leaves biometricEnabled false but this
// true, so the prompt stays gone while the feature remains available
// (via Settings) for whenever they change their mind.
const BIOMETRIC_PROMPT_ASKED_KEY = '@quad360/biometric_login_prompt_asked';

export async function hasAskedAboutBiometricLogin(): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(BIOMETRIC_PROMPT_ASKED_KEY)) === 'true';
    } catch {
        return false;
    }
}

export async function setAskedAboutBiometricLogin(): Promise<void> {
    try {
        await AsyncStorage.setItem(BIOMETRIC_PROMPT_ASKED_KEY, 'true');
    } catch { /* best-effort -- worst case the prompt is offered again once */ }
}

export async function clearAllSecureData(): Promise<void> {
    await Promise.all([
        clearPinSecurely(),
        clearSessionTokenSecurely(),
        clearAuthSecretSecurely(),
        clearBiometricPinSecurely(),
    ]);
    await setBiometricLoginEnabledFlag(false);
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
