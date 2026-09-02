// Optional real password a business owner can set once (Settings) and use
// to sign in directly on a device that's never seen this account before --
// no email round trip, unlike the per-device secret the PIN normally
// unlocks. See supabase/functions/password-login for the full design and
// why this is intentionally a separate credential from that device secret.

import { supabase } from './supabase';

async function invokePasswordLogin(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('password-login', { body });
    if (error) {
        const errResponse = (error as { context?: Response }).context;
        const errBody = errResponse && typeof errResponse.json === 'function'
            ? await errResponse.json().catch(() => null)
            : null;
        throw new Error(errBody?.error || error.message || 'Something went wrong.');
    }
    return data;
}

export async function setBackupPassword(password: string): Promise<void> {
    await invokePasswordLogin({ action: 'set', password });
}

export async function deleteBackupPassword(): Promise<void> {
    await invokePasswordLogin({ action: 'delete' });
}

export async function getBackupPasswordStatus(): Promise<boolean> {
    try {
        const data = await invokePasswordLogin({ action: 'status' });
        return !!data?.isSet;
    } catch {
        return false;
    }
}

// Verifies email + password against the stored backup password. Resolves
// (no return value) if correct, throws with the server's own message (e.g.
// "Incorrect email or password.", or a lockout message) otherwise -- the
// caller shows it directly. Deliberately doesn't establish a session by
// itself: the caller follows up with its own signInWithOtp/verifyOtp email
// code as a second factor, since this is reachable with no session at all.
export async function verifyBackupPassword(email: string, password: string): Promise<void> {
    await invokePasswordLogin({ action: 'login', email, password });
}
