import React, { useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { BusinessSettings } from '../types';

const CURRENCIES = [
    { label: 'USD ($)', value: '$' },
    { label: 'EUR (€)', value: '€' },
    { label: 'GBP (£)', value: '£' },
    { label: 'NGN (₦)', value: '₦' },
    { label: 'JPY (¥)', value: '¥' },
    { label: 'CAD (CA$)', value: 'CA$' },
];

const BUSINESS_TYPES: { label: string; value: BusinessSettings['businessType'] }[] = [
    { label: 'Product', value: 'product' },
    { label: 'Service', value: 'service' },
    { label: 'Both', value: 'both' },
];

export default function SettingsScreen() {
    const { settings, updateSettings, setCurrentScreen } = useApp();

    const [form, setForm] = useState({ ...settings });

    const handleSave = () => {
        if (isNaN(parseFloat(form.minReserve)) || parseFloat(form.minReserve) < 0) {
            Alert.alert('Invalid value', 'Minimum reserve must be a non-negative number.');
            return;
        }
        if (isNaN(parseFloat(form.targetMargin)) || parseFloat(form.targetMargin) < 0 || parseFloat(form.targetMargin) > 100) {
            Alert.alert('Invalid value', 'Target margin must be between 0 and 100.');
            return;
        }
        updateSettings(form);
        Alert.alert('Saved', 'Settings updated successfully.', [
            { text: 'OK', onPress: () => setCurrentScreen('dashboard') },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Settings</Text>

                    {/* Business Type */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Business Type</Text>
                        <View style={styles.optRow}>
                            {BUSINESS_TYPES.map(bt => (
                                <TouchableOpacity
                                    key={bt.value}
                                    style={[styles.opt, form.businessType === bt.value && styles.optActive]}
                                    onPress={() => setForm(f => ({ ...f, businessType: bt.value }))}
                                >
                                    <Text style={styles.optText}>{bt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Currency */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Currency</Text>
                        <View style={styles.optRow}>
                            {CURRENCIES.map(c => (
                                <TouchableOpacity
                                    key={c.value}
                                    style={[styles.opt, form.currency === c.value && styles.optActive]}
                                    onPress={() => setForm(f => ({ ...f, currency: c.value }))}
                                >
                                    <Text style={styles.optText}>{c.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Financial thresholds */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Financial Thresholds</Text>

                        <Text style={styles.label}>Minimum Cash Reserve ({form.currency})</Text>
                        <TextInput
                            style={styles.input}
                            value={form.minReserve}
                            onChangeText={v => setForm(f => ({ ...f, minReserve: v }))}
                            keyboardType="numeric"
                            placeholder="5000"
                            placeholderTextColor={Colors.muted}
                        />

                        <Text style={styles.label}>Target Profit Margin (%)</Text>
                        <TextInput
                            style={styles.input}
                            value={form.targetMargin}
                            onChangeText={v => setForm(f => ({ ...f, targetMargin: v }))}
                            keyboardType="numeric"
                            placeholder="65"
                            placeholderTextColor={Colors.muted}
                        />
                    </View>

                    {/* Balance Sheet Opening Balances */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Opening Balance Sheet</Text>
                        <Text style={styles.hint}>
                            Enter pre-existing asset and liability balances. These are added to your transaction-derived cash position to produce correct balance sheet totals.
                        </Text>

                        <Text style={styles.label}>Opening Assets ({form.currency})</Text>
                        <TextInput
                            style={styles.input}
                            value={form.openingAssets}
                            onChangeText={v => setForm(f => ({ ...f, openingAssets: v }))}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={Colors.muted}
                        />

                        <Text style={styles.label}>Opening Liabilities ({form.currency})</Text>
                        <TextInput
                            style={styles.input}
                            value={form.openingLiabilities}
                            onChangeText={v => setForm(f => ({ ...f, openingLiabilities: v }))}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={Colors.muted}
                        />
                    </View>

                    <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                        <Text style={styles.saveBtnText}>Save Settings</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setCurrentScreen('dashboard')}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 20 },
    section: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },
    label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 10 },
    input: {
        backgroundColor: Colors.bg,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.textPrimary,
        fontSize: 14,
    },
    optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText: { color: Colors.textSecondary, fontSize: 13 },
    saveBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
    saveBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelBtnText: { color: Colors.textMuted, fontSize: 14 },
});
