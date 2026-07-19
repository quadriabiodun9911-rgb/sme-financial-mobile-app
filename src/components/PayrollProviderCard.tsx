import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { AVAILABLE_PAYROLL_PROVIDERS, getPayrollProvider } from '../utils/payrollProvider';

interface Props {
    providerId: string;
    onChangeProvider: (id: string) => void;
}

export default function PayrollProviderCard({ providerId, onChangeProvider }: Props) {
    const [expanded, setExpanded] = useState(false);
    const active = getPayrollProvider(providerId);

    return (
        <View style={s.card}>
            <TouchableOpacity style={s.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                    <Text style={s.label}>Payroll Provider</Text>
                    <Text style={s.value}>{active.info.name}</Text>
                </View>
                <Text style={s.chevron}>{expanded ? '︿' : '﹀'}</Text>
            </TouchableOpacity>

            {!active.info.isReal && (
                <Text style={s.hint}>
                    Runs below are recorded, not processed — no real tax withholding, direct deposit, or statutory filing happens. You're responsible for actually paying staff and their taxes outside the app.
                </Text>
            )}
            {active.info.isReal && !active.isConfigured() && (
                <Text style={[s.hint, { color: Colors.warning }]}>
                    ⚠ {active.info.name} is selected but not connected — payroll runs are still tracked manually until this is set up with real API credentials.
                </Text>
            )}

            {expanded && (
                <View style={s.list}>
                    {AVAILABLE_PAYROLL_PROVIDERS.map(p => (
                        <TouchableOpacity
                            key={p.id}
                            style={[s.option, p.id === providerId && s.optionActive]}
                            onPress={() => onChangeProvider(p.id)}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={s.optionName}>{p.name}{!p.isReal ? '' : ' (requires partner account)'}</Text>
                                <Text style={s.optionDesc}>{p.description}</Text>
                            </View>
                            {p.id === providerId && <Text style={s.check}>✓</Text>}
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        marginHorizontal: 16,
        marginTop: 10,
        padding: 12,
    },
    header: { flexDirection: 'row', alignItems: 'center' },
    label: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
    value: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    chevron: { fontSize: 12, color: Colors.textMuted },
    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, lineHeight: 15, fontStyle: 'italic' },
    list: { marginTop: 10, gap: 8 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.bg, borderRadius: 8, padding: 10,
    },
    optionActive: { borderWidth: 1, borderColor: Colors.primary },
    optionName: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    optionDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
    check: { fontSize: 14, color: Colors.primary, fontWeight: 'bold' },
});
