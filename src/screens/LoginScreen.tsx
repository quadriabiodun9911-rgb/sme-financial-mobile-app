import React, { useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

export default function LoginScreen() {
    const { isFirstLaunch, setupAccount, login } = useApp();

    // Setup state
    const [email, setEmail]         = useState('');
    const [business, setBusiness]   = useState('');
    const [pin, setPin]             = useState('');
    const [confirmPin, setConfirm]  = useState('');
    const [loadDemo, setLoadDemo]   = useState(false);

    // Return-visit state
    const [returnPin, setReturnPin] = useState('');

    const handleSetup = async () => {
        if (!email.trim() || !business.trim()) {
            Alert.alert('Missing fields', 'Please enter your email and business name.');
            return;
        }
        if (!/^\d{4}$/.test(pin)) {
            Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
            return;
        }
        if (pin !== confirmPin) {
            Alert.alert('PIN mismatch', 'PINs do not match. Please try again.');
            return;
        }
        try {
            await setupAccount(email.trim(), business.trim(), pin, loadDemo);
        } catch {
            Alert.alert('Error', 'Could not save your account. Please try again.');
        }
    };

    const handleLogin = () => {
        if (!returnPin) {
            Alert.alert('Enter PIN', 'Please enter your 4-digit PIN.');
            return;
        }
        const ok = login(returnPin);
        if (!ok) {
            Alert.alert('Incorrect PIN', 'The PIN you entered is incorrect.');
            setReturnPin('');
        }
    };

    if (isFirstLaunch) {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.title}>FinanceBook</Text>
                        <Text style={styles.subtitle}>Set up your account to get started</Text>

                        <Field label="Email">
                            <TextInput
                                style={styles.input}
                                placeholder="admin@yourbusiness.com"
                                placeholderTextColor={Colors.muted}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </Field>

                        <Field label="Business Name">
                            <TextInput
                                style={styles.input}
                                placeholder="Acme Corp"
                                placeholderTextColor={Colors.muted}
                                value={business}
                                onChangeText={setBusiness}
                            />
                        </Field>

                        <Field label="Create 4-Digit PIN">
                            <TextInput
                                style={styles.input}
                                placeholder="••••"
                                placeholderTextColor={Colors.muted}
                                secureTextEntry
                                keyboardType="number-pad"
                                maxLength={4}
                                value={pin}
                                onChangeText={setPin}
                            />
                        </Field>

                        <Field label="Confirm PIN">
                            <TextInput
                                style={styles.input}
                                placeholder="••••"
                                placeholderTextColor={Colors.muted}
                                secureTextEntry
                                keyboardType="number-pad"
                                maxLength={4}
                                value={confirmPin}
                                onChangeText={setConfirm}
                            />
                        </Field>

                        <Text style={styles.sectionLabel}>Starting data</Text>
                        <View style={styles.demoRow}>
                            <TouchableOpacity
                                style={[styles.demoOpt, !loadDemo && styles.demoOptActive]}
                                onPress={() => setLoadDemo(false)}
                            >
                                <Text style={[styles.demoOptText, !loadDemo && styles.demoOptTextActive]}>Start Fresh</Text>
                                <Text style={styles.demoOptSub}>Empty ledger, ready for real data</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.demoOpt, loadDemo && styles.demoOptActive]}
                                onPress={() => setLoadDemo(true)}
                            >
                                <Text style={[styles.demoOptText, loadDemo && styles.demoOptTextActive]}>Load Demo Data</Text>
                                <Text style={styles.demoOptSub}>Explore with sample transactions</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.btn} onPress={handleSetup}>
                            <Text style={styles.btnText}>Create Account</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Text style={styles.title}>FinanceBook</Text>
                    <Text style={styles.subtitle}>Enter your PIN to continue</Text>

                    <View style={styles.pinContainer}>
                        <TextInput
                            style={styles.pinInput}
                            placeholder="••••"
                            placeholderTextColor={Colors.muted}
                            secureTextEntry
                            keyboardType="number-pad"
                            maxLength={4}
                            value={returnPin}
                            onChangeText={setReturnPin}
                            onSubmitEditing={handleLogin}
                            autoFocus
                        />
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={handleLogin}>
                        <Text style={styles.btnText}>Unlock</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={styles.group}>
            <Text style={styles.label}>{label}</Text>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    title:    { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 24, marginTop: 4 },

    group: { marginBottom: 14 },
    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
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

    sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },
    demoRow:      { flexDirection: 'row', gap: 10, marginBottom: 20 },
    demoOpt: {
        flex: 1, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 10, padding: 12, alignItems: 'center',
        backgroundColor: Colors.bg,
    },
    demoOptActive:    { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    demoOptText:      { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
    demoOptTextActive:{ color: Colors.primary },
    demoOptSub:       { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },

    pinContainer: { alignItems: 'center', marginVertical: 24 },
    pinInput: {
        backgroundColor: Colors.bg,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 24,
        paddingVertical: 14,
        color: Colors.textPrimary,
        fontSize: 28,
        letterSpacing: 12,
        textAlign: 'center',
        width: 180,
    },

    btn:     { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 8, alignItems: 'center', marginTop: 4 },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
});
