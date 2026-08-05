import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';

export default function LoginScreen() {
    const { login } = useApp();
    const [email, setEmail] = useState('amaka@obifreshfoods.ng');
    const [password, setPassword] = useState('');

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.form}>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.subtitle}>Log in to your CashClear account</Text>

                <View style={styles.field}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        placeholderTextColor={colors.textFaint}
                    />
                </View>
                <View style={styles.field}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        placeholder="••••••••"
                        placeholderTextColor={colors.textFaint}
                    />
                </View>

                <TouchableOpacity style={styles.cta} onPress={login}>
                    <Text style={styles.ctaText}>Log In</Text>
                </TouchableOpacity>

                <Text style={styles.hint}>This is a demo build - any credentials will sign you in with sample business data.</Text>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    form: { flex: 1, padding: 24, justifyContent: 'center' },
    title: { fontSize: 26, fontWeight: '800', color: colors.text },
    subtitle: { color: colors.textMuted, marginTop: 6, marginBottom: 28 },
    field: { marginBottom: 16 },
    label: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
    input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.text },
    cta: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    ctaText: { color: colors.background, fontWeight: '700', fontSize: 16 },
    hint: { color: colors.textFaint, fontSize: 12, marginTop: 20, textAlign: 'center' },
});
