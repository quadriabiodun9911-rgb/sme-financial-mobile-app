/**
 * One pill-chip picker, two selection modes. Before this component, the
 * exact same chip visuals (border, fill-on-select, pill radius) were
 * hand-rolled independently in three places: FinancingAdminScreen's local
 * `SegmentRow` (single-select — lender type, product type, status),
 * LenderPipelineScreen's filter rows (single-select — financing type,
 * DSCR band), and FinancingMarketplaceScreen's visibility picker
 * (multi-select — which financing types to publish for). Same look, same
 * interaction shape, three independent implementations to keep in sync.
 *
 * `multiple` is a discriminated literal, not just a boolean flag — TS
 * enforces the right `value`/`onChange` shape for each mode, so passing a
 * single value where an array is expected (or vice versa) is a compile
 * error, not a runtime surprise.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/tokens';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** A secondary "already active" signal distinct from "currently selected"
   *  — e.g. a financing type the business is already published under,
   *  shown with a leading dot and a distinct border even while the user is
   *  still deciding whether to keep it selected in this session. Takes
   *  visual precedence over the selected style when both are true, same
   *  as the "published" state always outranking the "about to change"
   *  state it's layered on top of. */
  indicator?: boolean;
}

interface BaseProps<T extends string> {
  options: ChipOption<T>[];
  /** Group label rendered above the chips and used as the accessible name
   *  for screen readers — required, not optional, because an unlabeled
   *  group of pills is meaningless to anyone not looking at the screen. */
  label: string;
  style?: ViewStyle;
}

interface SingleProps<T extends string> extends BaseProps<T> {
  multiple?: false;
  value: T | null;
  onChange: (value: T | null) => void;
  /** Tapping the already-selected chip clears the selection back to null.
   *  Defaults on — every existing single-select usage this replaces
   *  ("All" / "Any" as the cleared state) relies on this. */
  allowDeselect?: boolean;
}

interface MultiProps<T extends string> extends BaseProps<T> {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
}

export type ChipGroupProps<T extends string> = SingleProps<T> | MultiProps<T>;

function ChipGroupInner<T extends string>(props: ChipGroupProps<T>) {
  const { options, label, style } = props;

  // TS's discriminated-union narrowing doesn't carry across a generic type
  // parameter as cleanly as it does for a concrete one — `props.multiple`
  // narrows fine at each individual access above in the JSX below, but not
  // across this closure's two branches together. The public signature
  // above is still fully type-checked at every call site; these two casts
  // are purely an internal implementation detail of reconciling one
  // function body with two prop shapes.
  const multi = props as MultiProps<T>;
  const single = props as SingleProps<T>;

  const isSelected = (v: T): boolean =>
    props.multiple ? multi.value.includes(v) : single.value === v;

  const toggle = (v: T) => {
    if (props.multiple) {
      const next = multi.value.includes(v) ? multi.value.filter(x => x !== v) : [...multi.value, v];
      multi.onChange(next);
    } else {
      const allowDeselect = single.allowDeselect ?? true;
      single.onChange(single.value === v && allowDeselect ? null : v);
    }
  };

  return (
    <View style={style}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row} accessibilityRole={props.multiple ? undefined : 'radiogroup'} accessibilityLabel={label}>
        {options.map(opt => {
          const selected = isSelected(opt.value);
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => toggle(opt.value)}
              style={[s.chip, selected && s.chipSelected, opt.indicator && s.chipIndicator]}
              accessibilityRole={props.multiple ? 'checkbox' : 'radio'}
              accessibilityState={props.multiple ? { checked: selected } : { selected }}
              accessibilityLabel={opt.label}
            >
              <Text style={[s.chipText, selected && s.chipTextSelected]}>
                {opt.indicator ? '● ' : ''}{opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// memo + generics don't naturally coexist in TS (memo erases the generic
// signature) — this cast preserves ChipGroup<T>'s call-site type-checking
// while still getting memo's re-render skip.
export const ChipGroup = memo(ChipGroupInner) as typeof ChipGroupInner;

const s = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  chipIndicator: { borderColor: Colors.income },
  chipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },
  chipTextSelected: { color: Colors.primary },
});
