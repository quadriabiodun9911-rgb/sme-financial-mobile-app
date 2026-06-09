import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://xfiqezxifsfwkwlbaxbj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmaXFlenhpZnNmd2t3bGJheGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Njk3NTcsImV4cCI6MjA5NjU0NTc1N30.IFLvZ7xSDZECsJyj3NlVioGKImlp7-UATH-bV3-RtWs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
