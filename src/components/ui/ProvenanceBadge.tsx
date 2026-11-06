import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Radius } from '../../theme/tokens';
import { Colors } from '../../theme/colors';
import { DataProvenanceState, DATA_PROVENANCE_META } from '../../utils/dataProvenance';

interface ProvenanceBadgeProps {
  state: DataProvenanceState;
}

// Same tinted-pill look as the shared Badge component (ui/Badge.tsx), but
// tappable: a one-line "what does this mean" underneath on press, same
// toggle-expand interaction DashboardScreen's own Business Health "Why?
// What is this built on?" button uses, just inline rather than a boxed
// panel since this only ever needs one sentence.
function ProvenanceBadgeComponent({ state }: ProvenanceBadgeProps) {
  const [open, setOpen] = useState(false);
  const meta = DATA_PROVENANCE_META[state];

  return (
    <View>
      <TouchableOpacity
        style={[styles.base, { backgroundColor: meta.color + '26' }]}
        activeOpacity={0.7}
        onPress={() => setOpen(o => !o)}
      >
        <Text style={[styles.text, { color: meta.color }]}>{meta.label}</Text>
      </TouchableOpacity>
      {open && <Text style={styles.description}>{meta.description}</Text>}
    </View>
  );
}

export const ProvenanceBadge = memo(ProvenanceBadgeComponent);

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 9.5, fontWeight: '700' },
  description: {
    fontSize: 9.5,
    color: Colors.textMuted,
    marginTop: 3,
    maxWidth: 160,
  },
});
