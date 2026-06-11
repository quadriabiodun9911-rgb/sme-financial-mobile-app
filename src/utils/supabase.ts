import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[FinanceBook] Supabase environment variables not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: {
            getItem: async (key: string) => {
                try {
                    return await SecureStore.getItemAsync(key) || null;
                } catch {
                    return await AsyncStorage.getItem(key);
                }
            },
            setItem: async (key: string, value: string) => {
                try {
                    await SecureStore.setItemAsync(key, value);
                } catch {
                    await AsyncStorage.setItem(key, value);
                }
            },
            removeItem: async (key: string) => {
                try {
                    await SecureStore.deleteItemAsync(key);
                } catch {
                    await AsyncStorage.removeItem(key);
                }
            },
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
