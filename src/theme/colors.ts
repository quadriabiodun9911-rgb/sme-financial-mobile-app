import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ColorThemeMode = 'dark' | 'warm-paper';

const THEME_KEY = '@quad360/color_theme';

const DARK_PALETTE = {
    // Deeper near-black base with more headroom above it than the old
    // slate-900/800 pairing gave — surface now reads as a distinct layer
    // floating above bg rather than a barely-different shade of the same
    // grey, which is what makes card-based layouts read as "designed"
    // instead of "default dark mode."
    bg: '#0a0e18',
    surface: '#141b2d',
    surfaceVariant: '#1f2840',
    border: '#232c46',
    muted: '#4b5875',
    card: '#141b2d',

    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    text: '#f8fafc',

    income: '#10b981',
    expense: '#ef4444',
    asset: '#3b82f6',
    liability: '#f97316',
    equity: '#8b5cf6',
    warning: '#f59e0b',
    primary: '#2563eb',
    secondary: '#8b5cf6',

    danger: '#ef4444',
    success: '#10b981',

    criticalBorder: '#dc2626',
    warningBorder: '#f59e0b',
    healthyBorder: '#10b981',
};

// "Light" (internal key stays 'warm-paper' — every persisted user
// preference, AsyncStorage value and theme-mode type literal already
// spells it that way, and renaming the key would need a migration for
// zero visible benefit). Was a cream/beige "warm paper" look; replaced
// with a restrained navy-and-blue premium SaaS palette per the 2026
// design-system direction — white cards on a cool slate-white canvas,
// navy ink, one brand blue, instead of beige dominating every screen.
const WARM_PAPER_PALETTE = {
    bg: '#f8fafc',
    surface: '#ffffff',
    surfaceVariant: '#f1f5f9',
    border: '#e2e8f0',
    muted: '#94a3b8',
    card: '#ffffff',

    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    text: '#0f172a',

    income: '#16a34a',
    expense: '#dc2626',
    asset: '#0066cc',
    liability: '#b45309',
    equity: '#7c3aed',
    warning: '#d97706',
    primary: '#0066cc',
    secondary: '#7c3aed',

    danger: '#dc2626',
    success: '#16a34a',

    criticalBorder: '#dc2626',
    warningBorder: '#d97706',
    healthyBorder: '#16a34a',
};

// Most screens build their StyleSheet.create(...) objects at module scope,
// reading Colors.xxx once when that module first evaluates — a plain
// mutation of this object after screens have already loaded would not
// retroactively update those already-baked style objects. Switching theme
// therefore always reloads the app (same "change setting -> reload"
// pattern already used for resetApp/clearData), and the trick is making
// sure the *correct* palette is applied before any other module's
// module-level StyleSheet.create runs on that fresh load. AsyncStorage is
// always async, which is too late for that; on web, localStorage is
// synchronous, so it's read directly here at module-init time, before
// any screen that imports Colors gets a chance to build its stylesheet.
function readInitialMode(): ColorThemeMode {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
            const stored = localStorage.getItem(THEME_KEY);
            if (stored === 'warm-paper' || stored === 'dark') return stored;
        } catch { /* ignore (privacy mode, disabled storage, etc.) */ }
    }
    // Warm Paper is the default look for anyone who hasn't explicitly
    // chosen a theme yet -- an explicit 'dark' choice above still wins.
    return 'warm-paper';
}

export const Colors: typeof DARK_PALETTE = {
    ...(readInitialMode() === 'warm-paper' ? WARM_PAPER_PALETTE : DARK_PALETTE),
};

export function getColorThemeMode(): ColorThemeMode {
    return Colors.bg === WARM_PAPER_PALETTE.bg ? 'warm-paper' : 'dark';
}

/** Persist the choice and reload so every screen's stylesheet rebuilds
 *  against the new palette from a clean module-evaluation order. */
export async function setColorThemeMode(mode: ColorThemeMode): Promise<void> {
    try {
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_KEY, mode);
        }
        await AsyncStorage.setItem(THEME_KEY, mode);
    } catch { /* best-effort */ }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
        window.location.reload();
    }
    // Native: AsyncStorage has no synchronous read, so a native cold-start
    // briefly renders the previous palette before Settings re-applies it.
    // The web deployment is this app's primary target today; native
    // support for a flash-free switch is a follow-up.
}
