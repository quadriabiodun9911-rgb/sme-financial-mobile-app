import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// createClient() throws synchronously on an empty/missing URL — since this
// module sits at the root of the import graph, that throw happens before
// React ever mounts, so no ErrorBoundary can catch it and the whole app is a
// blank white screen. Falling back to a syntactically valid placeholder lets
// the app boot even if the env vars are missing (e.g. not configured on the
// hosting platform); real API calls will then fail individually, which the
// rest of the app already has to handle for ordinary network errors anyway.
export const isSupabaseConfigured = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
if (!isSupabaseConfigured) {
    console.error('[Quad360] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set — running with a placeholder client, login and sync will not work.');
}
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// SecureStore is native-only — import dynamically to avoid web crashes
let SecureStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

const authStorage = {
    getItem: async (key: string) => {
        if (SecureStore) {
            try { return await SecureStore.getItemAsync(key) || null; } catch {}
        }
        return AsyncStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
        if (SecureStore) {
            try { await SecureStore.setItemAsync(key, value); return; } catch {}
        }
        await AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
        if (SecureStore) {
            try { await SecureStore.deleteItemAsync(key); return; } catch {}
        }
        await AsyncStorage.removeItem(key);
    },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
});
