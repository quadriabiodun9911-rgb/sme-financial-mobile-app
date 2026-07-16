import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
    text: string; // without the trailing arrow — added automatically
    onPress: () => void;
    emphasis?: 'link' | 'button'; // 'link' = plain text (Budget→Forecast style); 'button' = tinted/bordered (CashFlow style)
}

// The consistent "here's what to check next" pattern used across the app:
// after a decision or a detected problem, point to exactly one next screen
// rather than leaving the user to find it. Reused verbatim wherever a
// screen-to-screen chain makes sense (Budget→Forecast, Inventory→Pricing,
// Pricing→Balance Sheet, low-margin→Inventory, etc.) so the interaction
// feels like one consistent app behavior, not a one-off per screen.
export default function NextStepLink({ text, onPress, emphasis = 'link' }: Props) {
    return (
        <TouchableOpacity style={emphasis === 'button' ? s.button : s.link} onPress={onPress}>
            <Text style={emphasis === 'button' ? s.buttonText : s.linkText}>{text} →</Text>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    link:      { marginTop: 10, paddingVertical: 8 },
    linkText:  { fontSize: 12, color: Colors.primary, fontWeight: '700', textAlign: 'center' },
    button:    { backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 10 },
    buttonText:{ fontSize: 14, fontWeight: '700', color: Colors.primary },
});
