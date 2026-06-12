import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Mock client for when Supabase credentials are not available
const mockSupabase = {
    auth: {
        signUp: async () => ({ data: null, error: null }),
        signInWithPassword: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        updateUser: async () => ({ data: null, error: null }),
    },
    from: () => ({
        select: () => ({ data: null, error: null }),
    }),
};

// Only create real Supabase client if credentials are available
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
    })
    : (mockSupabase as any);
