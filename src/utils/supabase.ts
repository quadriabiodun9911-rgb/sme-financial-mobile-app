import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
        detectSessionInUrl: Platform.OS === 'web', // needed for email recovery links on web
    },
});
