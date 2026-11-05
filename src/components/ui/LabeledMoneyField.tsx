import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface LabeledMoneyFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  currency?: string;
  suffix?: string;
  hint?: string;
}

// Shared by the loan/growth calculators (LoanAffordabilityChecker,
// LoanROICalculator, GrowthAffordabilityCalculator, LoanOfferComparison) --
// each used to carry its own byte-identical copy of this label + decimal-pad
// input + optional currency/suffix affix. Distinct from FormField, which
// handles the general text-input case (secure-entry toggle, error state);
// this one is specifically the numeric-money-field pattern.
export function LabeledMoneyField({ label, value, onChange, placeholder, currency, suffix, hint }: LabeledMoneyFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {currency && <Text style={styles.affix}>{currency}</Text>}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
        />
        {suffix && <Text style={styles.affix}>{suffix}</Text>}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
  affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  input: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },
});
