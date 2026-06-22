import { supabase } from './supabase';
import { Config } from '../config';

/**
 * Authenticated fetch to the Quad360 backend.
 * Automatically attaches the current Supabase session token as Bearer.
 * Throws on network error; returns parsed JSON on success.
 */
export async function apiFetch(
    path: string,
    options: RequestInit = {},
): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${Config.BACKEND_URL}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
    }

    return res.json();
}
