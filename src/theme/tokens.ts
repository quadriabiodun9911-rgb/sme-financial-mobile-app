import { Platform, ViewStyle } from 'react-native';

/**
 * Design tokens — additive to colors.ts, never replacing it. Every existing
 * screen already builds its StyleSheet.create(...) against Colors.xxx; this
 * file only adds the scales (spacing/radius/type/shadow) that were missing,
 * so a screen can adopt them incrementally without every other screen
 * needing to change first.
 */

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 40,
} as const;

export const Radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
} as const;

export const Type = {
    // Large numbers/headline figures — the thing a user's eye lands on first
    display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
    title:   { fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.3 },
    heading: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.1 },
    body:    { fontSize: 14, fontWeight: '500' as const },
    caption: { fontSize: 12, fontWeight: '600' as const },
    // Section eyebrows ("ANALYTICS", "OPERATIONS") — uppercase + tracked out
    // reads as considered information architecture rather than a label
    // slapped above a list.
    eyebrow: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
} as const;

// react-native-web translates shadow* props to a real CSS box-shadow, and
// native reads them directly on iOS (Android needs the separate `elevation`
// prop, included alongside every level here) — one object covers both
// platforms without a Platform.select at every call site.
function shadow(elevation: number, opacity: number, radius: number, y: number): ViewStyle {
    return {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: y },
        shadowOpacity: opacity,
        shadowRadius: radius,
        elevation,
    };
}

export const Shadow = {
    // Resting card — barely-there depth, not a hard drop shadow. This is
    // the difference between "card with a border" and "card that feels
    // like it's sitting slightly above the page."
    sm: shadow(2, Platform.OS === 'web' ? 0.16 : 0.24, 6, 1),
    // Modals, popovers, anything meant to feel like it's floating above
    // the rest of the screen.
    md: shadow(6, Platform.OS === 'web' ? 0.22 : 0.3, 16, 6),
    lg: shadow(12, Platform.OS === 'web' ? 0.28 : 0.36, 28, 12),
} as const;
