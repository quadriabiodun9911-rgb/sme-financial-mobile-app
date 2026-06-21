/**
 * Two-Factor Authentication Setup Screen
 *
 * Allows users to:
 * 1. Enable TOTP (Google Authenticator, Authy, etc.)
 * 2. View QR code and manual entry key
 * 3. Download backup codes
 * 4. Verify setup with OTP code
 * 5. Disable 2FA
 */

import React, { useState, useEffect } from 'react';
import {
    SafeAreaView,
    ScrollView,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Modal,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import {
    generateTOTPSecret,
    getTwoFactorStatus,
    verifyTOTPCode,
    verifyTwoFactorLogin,
    saveTwoFactorConfig,
    loadTwoFactorConfig,
    disableTwoFactor,
    generateBackupCodes,
    formatTOTPSecret,
    getBackupCodesCount,
} from '../utils/twoFactorAuth';

interface SetupStep {
    step: number;
    title: string;
    description: string;
}

const SETUP_STEPS: SetupStep[] = [
    { step: 1, title: 'Install Authenticator', description: 'Download Google Authenticator, Authy, or Microsoft Authenticator' },
    { step: 2, title: 'Scan QR Code', description: 'Open your authenticator app and scan the QR code' },
    { step: 3, title: 'Verify Code', description: 'Enter the 6-digit code from your authenticator' },
    { step: 4, title: 'Save Backup Codes', description: 'Download and store your backup codes safely' },
];

export default function TwoFactorSetupScreen() {
    const { user, language } = useApp();
    const [status, setStatus] = useState<'disabled' | 'enabled' | 'setup'>('disabled');
    const [loading, setLoading] = useState(true);
    const [setupStep, setSetupStep] = useState(0);
    const [secret, setSecret] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [showBackupCodes, setShowBackupCodes] = useState(false);
    const [backupCodesCount, setBackupCodesCount] = useState(0);

    useEffect(() => {
        loadTwoFactorStatus();
    }, []);

    const loadTwoFactorStatus = async () => {
        try {
            const config = await loadTwoFactorConfig();
            if (config?.status === 'enabled') {
                setStatus('enabled');
                const count = await getBackupCodesCount();
                setBackupCodesCount(count);
            } else {
                setStatus('disabled');
            }
        } catch (e) {
            console.error('Failed to load 2FA status:', e);
        } finally {
            setLoading(false);
        }
    };

    const startSetup = () => {
        const newSecret = generateTOTPSecret(user?.email || '');
        setSecret(newSecret.secret);
        setQrCodeUrl(newSecret.qrCodeUrl);
        setBackupCodes(generateBackupCodes());
        setSetupStep(1);
    };

    const handleVerifyCode = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            Alert.alert('Invalid Code', 'Please enter a 6-digit code');
            return;
        }

        setVerifying(true);
        try {
            // Verify against the in-memory secret — it hasn't been saved yet
            const isValid = verifyTOTPCode(secret, verificationCode);
            if (!isValid) {
                Alert.alert('Invalid Code', 'The code you entered is incorrect. Please try again.');
                return;
            }

            // Save 2FA configuration
            await saveTwoFactorConfig({
                method: 'totp',
                status: 'enabled',
                secret,
                backupCodes,
                createdAt: new Date().toISOString(),
                verifiedAt: new Date().toISOString(),
            });

            setStatus('enabled');
            setSetupStep(4);
            Alert.alert(
                '2FA Enabled!',
                'Two-factor authentication has been successfully enabled. Please save your backup codes in a secure location.',
            );
        } catch (e) {
            Alert.alert('Error', `Failed to enable 2FA: ${e}`);
        } finally {
            setVerifying(false);
        }
    };

    const handleDisable2FA = () => {
        Alert.alert('Disable 2FA?', 'Are you sure you want to disable two-factor authentication?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Disable',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await disableTwoFactor();
                        setStatus('disabled');
                        Alert.alert('2FA Disabled', 'Two-factor authentication has been disabled.');
                    } catch (e) {
                        Alert.alert('Error', `Failed to disable 2FA: ${e}`);
                    }
                },
            },
        ]);
    };

    const downloadBackupCodes = () => {
        const codesText = backupCodes.join('\n');
        // In production, use react-native-share or similar
        Alert.alert(
            'Backup Codes',
            'Save these codes in a secure location:\n\n' + codesText,
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safe}>
                <Header />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    if (status === 'enabled') {
        return (
            <SafeAreaView style={styles.safe}>
                <Header />
                <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                    <Text style={styles.title}>Two-Factor Authentication</Text>

                    <View style={styles.statusCard}>
                        <Text style={styles.statusIcon}>✅</Text>
                        <Text style={styles.statusTitle}>2FA is Enabled</Text>
                        <Text style={styles.statusText}>Your account is protected with two-factor authentication</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Backup Codes Remaining</Text>
                        <Text style={styles.infoValue}>{backupCodesCount}</Text>
                        <Text style={styles.infoText}>
                            Use backup codes when you don't have access to your authenticator app
                        </Text>
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={() => setShowBackupCodes(true)}>
                        <Text style={styles.btnText}>View Backup Codes</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.btn, styles.dangerBtn]} onPress={handleDisable2FA}>
                        <Text style={styles.btnText}>Disable 2FA</Text>
                    </TouchableOpacity>
                </ScrollView>
                <FooterNav />
            </SafeAreaView>
        );
    }

    if (setupStep === 0) {
        return (
            <SafeAreaView style={styles.safe}>
                <Header />
                <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                    <Text style={styles.title}>Two-Factor Authentication</Text>
                    <Text style={styles.subtitle}>Add an extra layer of security to your account</Text>

                    <View style={styles.benefitsCard}>
                        <Text style={styles.benefitTitle}>🔐 What is 2FA?</Text>
                        <Text style={styles.benefitText}>
                            Two-factor authentication requires you to verify your identity with something you know (your PIN) and something you have (your phone).
                        </Text>
                    </View>

                    <Text style={styles.stepsLabel}>Setup Steps:</Text>
                    {SETUP_STEPS.map((s) => (
                        <View key={s.step} style={styles.stepItem}>
                            <Text style={styles.stepNumber}>{s.step}</Text>
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>{s.title}</Text>
                                <Text style={styles.stepDesc}>{s.description}</Text>
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.btn} onPress={startSetup}>
                        <Text style={styles.btnText}>Start Setup</Text>
                    </TouchableOpacity>
                </ScrollView>
                <FooterNav />
            </SafeAreaView>
        );
    }

    if (setupStep === 1) {
        return (
            <SafeAreaView style={styles.safe}>
                <Header />
                <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                    <Text style={styles.title}>Scan QR Code</Text>

                    <View style={styles.qrCard}>
                        <Text style={styles.qrLabel}>Open your authenticator app and scan:</Text>
                        <View style={styles.qrPlaceholder}>
                            <Text style={{ color: Colors.textMuted }}>QR Code</Text>
                            <Text style={styles.qrUrl}>{qrCodeUrl.substring(0, 50)}...</Text>
                        </View>
                    </View>

                    <View style={styles.manualCard}>
                        <Text style={styles.manualLabel}>Or enter manually:</Text>
                        <Text style={styles.manualKey}>{formatTOTPSecret(secret)}</Text>
                        <Text style={styles.manualHint}>Account: {user?.email}</Text>
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={() => setSetupStep(2)}>
                        <Text style={styles.btnText}>I've Scanned the QR Code</Text>
                    </TouchableOpacity>
                </ScrollView>
                <FooterNav />
            </SafeAreaView>
        );
    }

    if (setupStep === 2) {
        return (
            <SafeAreaView style={styles.safe}>
                <Header />
                <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                    <Text style={styles.title}>Verify Code</Text>
                    <Text style={styles.subtitle}>Enter the 6-digit code from your authenticator app</Text>

                    <View style={styles.verifyCard}>
                        <TextInput
                            style={styles.codeInput}
                            placeholder="000000"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="number-pad"
                            maxLength={6}
                            value={verificationCode}
                            onChangeText={setVerificationCode}
                            editable={!verifying}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.btn, verifying && styles.btnDisabled]}
                        onPress={handleVerifyCode}
                        disabled={verifying || verificationCode.length !== 6}
                    >
                        {verifying ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>Verify & Continue</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
                <FooterNav />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <Text style={styles.title}>Save Backup Codes</Text>
                <Text style={styles.subtitle}>Keep these codes in a safe place</Text>

                <View style={styles.warningCard}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <Text style={styles.warningText}>
                        Save these backup codes. You can use them if you lose access to your authenticator app.
                    </Text>
                </View>

                <TouchableOpacity style={styles.btn} onPress={downloadBackupCodes}>
                    <Text style={styles.btnText}>Download Codes</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={() => setShowBackupCodes(true)}>
                    <Text style={styles.btnText}>View Codes</Text>
                </TouchableOpacity>

                <Text style={styles.completedLabel}>✅ Setup Complete!</Text>
            </ScrollView>
            <FooterNav />

            {/* Backup Codes Modal */}
            <Modal visible={showBackupCodes} transparent animationType="slide">
                <SafeAreaView style={styles.modalSafe}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Backup Codes</Text>
                        <TouchableOpacity onPress={() => setShowBackupCodes(false)}>
                            <Text style={styles.modalClose}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalContent}>
                        {backupCodes.map((code, index) => (
                            <View key={index} style={styles.codeRow}>
                                <Text style={styles.codeNum}>{index + 1}.</Text>
                                <Text style={styles.codeText}>{code}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },

    title: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textMuted, marginBottom: 20 },

    statusCard: {
        backgroundColor: 'rgba(16,185,129,0.1)',
        borderWidth: 1,
        borderColor: Colors.income,
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        marginBottom: 20,
    },
    statusIcon: { fontSize: 40, marginBottom: 8 },
    statusTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    statusText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

    infoCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    infoLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
    infoValue: { fontSize: 28, fontWeight: 'bold', color: Colors.primary, marginBottom: 8 },
    infoText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    benefitsCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
    },
    benefitTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    benefitText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    stepsLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    stepItem: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        alignItems: 'flex-start',
    },
    stepNumber: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.primary,
        marginRight: 12,
        minWidth: 30,
    },
    stepContent: { flex: 1 },
    stepTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    stepDesc: { fontSize: 12, color: Colors.textMuted },

    qrCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
    },
    qrLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, textAlign: 'center' },
    qrPlaceholder: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 250,
    },
    qrUrl: { fontSize: 10, color: Colors.textMuted, marginTop: 8 },

    manualCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    manualLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
    manualKey: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        fontFamily: 'monospace',
        marginBottom: 8,
    },
    manualHint: { fontSize: 11, color: Colors.textMuted },

    verifyCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        alignItems: 'center',
    },
    codeInput: {
        fontSize: 28,
        fontWeight: 'bold',
        letterSpacing: 8,
        textAlign: 'center',
        color: Colors.textPrimary,
        borderBottomWidth: 2,
        borderBottomColor: Colors.primary,
        width: 200,
        paddingVertical: 12,
    },

    warningCard: {
        backgroundColor: 'rgba(245,158,11,0.1)',
        borderWidth: 1,
        borderColor: Colors.warning,
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        flexDirection: 'row',
    },
    warningIcon: { fontSize: 24, marginRight: 12 },
    warningText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    codeRow: {
        flexDirection: 'row',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    codeNum: { fontSize: 14, color: Colors.textMuted, minWidth: 30 },
    codeText: { fontSize: 14, fontFamily: 'monospace', color: Colors.textPrimary, flex: 1 },

    completedLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.income,
        textAlign: 'center',
        marginTop: 20,
    },

    btn: {
        backgroundColor: Colors.primary,
        paddingVertical: 13,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 12,
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    dangerBtn: { backgroundColor: Colors.expense },
    primaryBtn: { backgroundColor: Colors.primary },

    modalSafe: { flex: 1, backgroundColor: Colors.bg },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    modalClose: { fontSize: 20, color: Colors.textMuted },
    modalContent: { flex: 1, padding: 16 },
});
