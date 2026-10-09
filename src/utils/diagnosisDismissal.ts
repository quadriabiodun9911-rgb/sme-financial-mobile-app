/**
 * "Mark as intentional" -- the diagnosis engine is template-based (see
 * financialDiagnosisEngine.ts): it matches real numbers against real
 * thresholds, but it can't tell a genuine problem apart from a deliberate
 * business choice that happens to cross one of those thresholds (e.g. a
 * long cash-conversion cycle because of 60-day terms deliberately offered
 * to land a large client, not because collections are failing). Rather
 * than trying to make the rules themselves smarter -- which has no clear
 * stopping point and risks getting it wrong in a different direction --
 * this lets the business owner say "I know, this one's on purpose" and
 * have the engine stop raising it.
 *
 * Local-only, same pattern as Header.tsx's DISMISSED_ALERTS_KEY: a device-
 * level list of dismissed diagnosis ids, not synced to Supabase. Included
 * in storage.ts's FINANCIAL_CACHE_KEYS so a second account on this device
 * never inherits a stranger's dismissals.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DISMISSED_DIAGNOSES_KEY = '@quad360/dismissed_diagnoses';

export async function loadDismissedDiagnosisIds(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(DISMISSED_DIAGNOSES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return []; // corrupt value -- start fresh rather than throw
    }
}

export async function dismissDiagnosis(id: string): Promise<string[]> {
    const current = await loadDismissedDiagnosisIds();
    if (current.includes(id)) return current;
    const next = [...current, id];
    await AsyncStorage.setItem(DISMISSED_DIAGNOSES_KEY, JSON.stringify(next));
    return next;
}

export async function undismissDiagnosis(id: string): Promise<string[]> {
    const current = await loadDismissedDiagnosisIds();
    const next = current.filter(existingId => existingId !== id);
    await AsyncStorage.setItem(DISMISSED_DIAGNOSES_KEY, JSON.stringify(next));
    return next;
}
