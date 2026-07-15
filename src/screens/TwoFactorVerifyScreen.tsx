/**
 * Two-Factor Verification Screen
 *
 * Shown after a correct PIN when the account has 2FA enabled. The user must
 * enter a valid authenticator code (or a backup code) before `user` is set
 * and they're granted access to the dashboard — this is the real login-time
 * enforcement that was previously missing (2FA could be enabled and saved,
 * but nothing ever checked it again after that).
 */

import React, { useState } from 'react';
import {
    SafeAreaView, View, Text, TextInput, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

export default function TwoFactorVerifyScreen() {
    const { pendingTwoFactorProfile, completeTwoFactorLogin, cancelTwoFactorLogin } = useApp();
    const [code, setCode] = useState('');
    const [useBackupCode, setUseBackupCode] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleVerify = async () => {
        const trimmed = code.trim();
        if (!trimmed) {
            Alert.alert('Enter a code', useBackupCode ? 'Enter one of your backup codes.' : 'Enter your 6-digit authenticator code.');
            return;
        }
        setSubmitting(true);
        try {
            const ok = await completeTwoFactorLogin(trimmed, 'totp');
            if (!ok) {
                Alert.alert('Incorrect Code', useBackupCode ? 'That backup code is invalid or already used.' : 'That code is incorrect or has expired. Try again.');
                setCode('');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.container}>
                <Text style={s.icon}>🔒</Text>
                <Text style={s.title}>Two-Factor Verification</Text>
                <Text style={s.subtitle}>
                    {pendingTwoFactorProfile?.email ? `Signing in as ${pendingTwoFactorProfile.email}` : 'Enter the code from your authenticator app'}
                </Text>

                <TextInput
                    style={s.input}
                    value={code}
                    onChangeText={setCode}
                    placeholder={useBackupCode ? 'Backup code' : '6-digit code'}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType={useBackupCode ? 'default' : 'number-pad'}
                    maxLength={useBackupCode ? 12 : 6}
                    autoFocus
                    autoCapitalize="characters"
                />

                <TouchableOpacity style={s.primaryBtn} onPress={handleVerify} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Verify</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setUseBackupCode(!useBackupCode); setCode(''); }}>
                    <Text style={s.link}>{useBackupCode ? 'Use authenticator code instead' : "Can't access your authenticator? Use a backup code"}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={cancelTwoFactorLogin} style={{ marginTop: 24 }}>
                    <Text style={s.cancelLink}>← Back to login</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    icon: { fontSize: 48, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
    input: {
        width: '100%', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
        paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, color: Colors.textPrimary, textAlign: 'center',
        letterSpacing: 4, marginBottom: 20,
    },
    primaryBtn: { width: '100%', backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
    primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    link: { fontSize: 13, color: Colors.primary, fontWeight: '600', textAlign: 'center' },
    cancelLink: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
