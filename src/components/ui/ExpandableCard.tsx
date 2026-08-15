/**
 * A card with an always-visible header and a detail region that only
 * renders when expanded. Three screens built this exact interaction
 * independently: FinancingMarketplaceScreen's ProductCard (tap a listing
 * to see why the fit score is what it is), FinancingAdminScreen's lender
 * organization row (tap to reveal its member roster), and
 * LenderPipelineScreen's listing row (tap to reveal band/score/purpose).
 * Same shape every time: header content, a chevron-style hint, a detail
 * region gated on a boolean the parent owns.
 *
 * Controlled, not self-managing `expanded` state internally — every
 * existing usage needs the parent to know which one row is open (so
 * opening a second row collapses the first), which a component owning its
 * own boolean can't express.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Radius, Shadow } from '../../theme/tokens';

interface ExpandableCardProps {
  /** Always-visible summary content — the row's title/badges/metrics. */
  header: React.ReactNode;
  /** Detail content, mounted only while expanded (not just visually
   *  hidden) — matches every existing usage, where the detail region does
   *  its own data-shaping work that's wasted while collapsed. */
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Left border accent — e.g. the fit-verdict color in ProductCard. Omit
   *  for a plain card (FinancingAdminScreen's org row has no accent). */
  accentColor?: string;
  /** Set false to hide the "Tap to see why" / "Tap to collapse" hint line
   *  for a screen where the header content itself already signals
   *  tappability. */
  showToggleHint?: boolean;
  expandedHint?: string;
  collapsedHint?: string;
  style?: ViewStyle;
}

function ExpandableCardInner({
  header,
  children,
  expanded,
  onToggle,
  accentColor,
  showToggleHint = true,
  expandedHint = 'Tap to collapse ▲',
  collapsedHint = 'Tap for details ▼',
  style,
}: ExpandableCardProps) {
  // The toggle TouchableOpacity wraps ONLY the header (+ hint), never
  // `children` — on React Native Web, a tap on an interactive element
  // inside the detail region (a TextInput, a nested TouchableOpacity)
  // bubbles up through a wrapping TouchableOpacity's onPress, so the card
  // used to re-collapse the instant you tapped into e.g. the "invite a
  // member by email" field, making it impossible to type into. Plain View
  // for the outer card and the detail region fixes that; only the header
  // and hint stay tappable to toggle.
  return (
    <View style={[s.card, accentColor ? { borderLeftWidth: 4, borderLeftColor: accentColor } : null, style]}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Collapses this card' : 'Expands this card for more detail'}
      >
        {header}
      </TouchableOpacity>
      {expanded && <View style={s.detail}>{children}</View>}
      {showToggleHint && (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
          <Text style={s.hint}>{expanded ? expandedHint : collapsedHint}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export const ExpandableCard = memo(ExpandableCardInner);

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  hint: { fontSize: 11, color: Colors.primary, marginTop: 6, textAlign: 'right' },
});
