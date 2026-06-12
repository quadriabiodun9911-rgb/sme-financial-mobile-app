import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Use hardcoded credentials with env var fallback
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xfiqezxifsfwkwlbaxbj.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmaXFlenhpZnNmd2t3bGJheGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Njk3NTcsImV4cCI6MjA5NjU0NTc1N30.IFLvZ7xSDZECsJyj3NlVioGKImlp7-UATH-bV3-RtWs';

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
