import React from 'react';
import { Platform, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
    value: string;           // ISO date string YYYY-MM-DD
    onChange: (v: string) => void;
    style?: object;
}

export default function DateInput({ value, onChange, style }: Props) {
    if (Platform.OS === 'web') {
        // Native HTML date picker on web
        return (
            <input
                type="date"
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    backgroundColor: Colors.bg,
                    border: `1px solid ${Colors.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: Colors.textPrimary,
                    fontSize: 14,
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                    ...(style as any),
                }}
            />
        );
    }
    // Fallback for native (plain text input)
    return (
        <TextInput
            style={[styles.input, style]}
            value={value}
            onChangeText={onChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.muted}
        />
    );
}

const styles = StyleSheet.create({
    input: {
        backgroundColor: Colors.bg,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.textPrimary,
        fontSize: 14,
    },
});
