import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SECURE_KEYS = {
    pin: '@quad360/secure/pin',
    sessionToken: '@quad360/secure/session',
};

// expo-secure-store has no web support — skip it entirely on web
const isNative = Platform.OS !== 'web';

async function safeSecureStoreOperation<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
): Promise<T> {
    if (!isNative) return fallback();
    try {
        return await operation();
    } catch (e) {
        console.warn('[Quad360] SecureStore failed, falling back to AsyncStorage:', e);
        return fallback();
    }
}

export async function savePinSecurely(pin: string): Promise<void> {
    await safeSecureStoreOperation(
        () => SecureStore.setItemAsync(SECURE_KEYS.pin, pin),
        () => AsyncStorage.setItem(SECURE_KEYS.pin, pin),
    );
}

export async function loadPinSecurely(): Promise<string | null> {
    return safeSecureStoreOperation(
        () => SecureStore.getItemAsync(SECURE_KEYS.pin),
        () => AsyncStorage.getItem(SECURE_KEYS.pin),
    );
}

export async function clearPinSecurely(): Promise<void> {
    if (!isNative) { await AsyncStorage.removeItem(SECURE_KEYS.pin); return; }
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.pin);
    } catch {
        await AsyncStorage.removeItem(SECURE_KEYS.pin);
    }
}

export async function saveSessionTokenSecurely(token: string): Promise<void> {
    await safeSecureStoreOperation(
        () => SecureStore.setItemAsync(SECURE_KEYS.sessionToken, token),
        () => AsyncStorage.setItem(SECURE_KEYS.sessionToken, token),
    );
}

export async function loadSessionTokenSecurely(): Promise<string | null> {
    return safeSecureStoreOperation(
        () => SecureStore.getItemAsync(SECURE_KEYS.sessionToken),
        () => AsyncStorage.getItem(SECURE_KEYS.sessionToken),
    );
}

export async function clearSessionTokenSecurely(): Promise<void> {
    if (!isNative) { await AsyncStorage.removeItem(SECURE_KEYS.sessionToken); return; }
    try {
        await SecureStore.deleteItemAsync(SECURE_KEYS.sessionToken);
    } catch {
        await AsyncStorage.removeItem(SECURE_KEYS.sessionToken);
    }
}

export async function clearAllSecureData(): Promise<void> {
    await Promise.all([
        clearPinSecurely(),
        clearSessionTokenSecurely(),
    ]);
}
