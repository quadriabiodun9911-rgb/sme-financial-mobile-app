import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ColorThemeMode = 'dark' | 'warm-paper';

const THEME_KEY = '@quad360/color_theme';

const DARK_PALETTE = {
    bg: '#0f172a',
    surface: '#1e293b',
    surfaceVariant: '#334155',
    border: '#334155',
    muted: '#475569',
    card: '#1e293b',

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

// "Warm Paper" — a light theme option, born from the same palette used on
// the marketing site's "Today's Review" card. The dark theme's income/
// expense colors (bright emerald, bright red) are tuned to pop against
// near-black and read harshly on cream, so those two are deliberately
// muted here rather than reused as-is — everything else carries over
// directly.
const WARM_PAPER_PALETTE = {
    bg: '#fffdf8',
    surface: '#f0ead9',
    surfaceVariant: '#e9e2cd',
    border: '#ddd3ba',
    muted: '#8a8272',
    card: '#f0ead9',

    textPrimary: '#1b1f2b',
    textSecondary: '#3f3a2f',
    textMuted: '#6c6659',
    text: '#1b1f2b',

    income: '#2e9e64',
    expense: '#c94f38',
    asset: '#2a52d6',
    liability: '#b5641f',
    equity: '#7c53c8',
    warning: '#b5791f',
    primary: '#2a52d6',
    secondary: '#7c53c8',

    danger: '#c94f38',
    success: '#2e9e64',

    criticalBorder: '#b23a26',
    warningBorder: '#b5791f',
    healthyBorder: '#2e9e64',
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
    return 'dark';
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
