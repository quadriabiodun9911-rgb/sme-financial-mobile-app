import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, TextInputProps, ViewStyle } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
  required?: boolean;
  secureToggle?: boolean;
}

export function FormField({
  label,
  error,
  hint,
  containerStyle,
  required,
  secureToggle,
  secureTextEntry,
  ...inputProps
}: FormFieldProps) {
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={[styles.inputRow, error ? styles.inputError : styles.inputNormal]}>
        <TextInput
          {...inputProps}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
          placeholderTextColor="#475569"
          style={[styles.input, inputProps.style]}
          accessibilityLabel={label}
          accessibilityHint={hint}
        />
        {secureToggle && (
          <TouchableOpacity onPress={() => setHidden(h => !h)} style={styles.toggle} accessibilityLabel={hidden ? 'Show' : 'Hide'}>
            <Text style={styles.toggleText}>{hidden ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#cbd5e1', marginBottom: 6 },
  required: { color: '#ef4444' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#0f172a',
  },
  inputNormal: { borderColor: '#334155' },
  inputError: { borderColor: '#ef4444' },
  input: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  toggle: { paddingHorizontal: 12 },
  toggleText: { fontSize: 16 },
  error: { fontSize: 12, color: '#ef4444', marginTop: 5 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 5 },
});
