import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_KEYS = {
    pin: '@financebook/secure/pin',
    sessionToken: '@financebook/secure/session',
};

async function safeSecureStoreOperation<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
): Promise<T> {
    try {
        return await operation();
    } catch (e) {
        console.warn('[FinanceBook] SecureStore failed, falling back to AsyncStorage:', e);
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
