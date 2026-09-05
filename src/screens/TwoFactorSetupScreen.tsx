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
    Modal,
    ActivityIndicator,
    TextInput,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { showAlert, confirmAction } from '../utils/webAlert';
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

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the full-page
    // backup codes modal so it doesn't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainModalWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [status, setStatus] = useState<'disabled' | 'enabled' | 'setup'>('disabled');
    const [loading, setLoading] = useState(true);
    const [setupStep, setSetupStep] = useState(0);
    const [secret, setSecret] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [codeError, setCodeError] = useState('');
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
        setCodeError('');
        if (!verificationCode || verificationCode.length !== 6) {
            setCodeError('Please enter a 6-digit code');
            return;
        }

        setVerifying(true);
        try {
            // Verify against the in-memory secret — it hasn't been saved yet
            const isValid = verifyTOTPCode(secret, verificationCode);
            if (!isValid) {
                setCodeError('The code you entered is incorrect. Please try again.');
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
        } catch (e) {
            setCodeError(`Failed to enable 2FA: ${e}`);
        } finally {
            setVerifying(false);
        }
    };

    const handleDisable2FA = () => {
        const doDisable = async () => {
            try {
                await disableTwoFactor();
                setStatus('disabled');
                showAlert('2FA Disabled', 'Two-factor authentication has been disabled.');
            } catch (e) {
                showAlert('Error', `Failed to disable 2FA: ${e}`);
            }
        };
        confirmAction('Disable 2FA?', 'Are you sure you want to disable two-factor authentication?', 'Disable', doDisable);
    };

    const downloadBackupCodes = () => {
        const codesText = backupCodes.join('\n');
        if (Platform.OS === 'web') {
            const blob = new Blob([codesText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quad360-2fa-backup-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
            return;
        }
        // In production, use react-native-share or similar
        showAlert('Backup Codes', 'Save these codes in a secure location:\n\n' + codesText);
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
                        <View style={styles.statusIconWrap}>
                            <Icon name="check" size={28} color={Colors.income} />
                        </View>
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
                        <View style={styles.benefitTitleRow}>
                            <Icon name="lock" size={16} color={Colors.textPrimary} />
                            <Text style={styles.benefitTitle}>What is 2FA?</Text>
                        </View>
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
                            onChangeText={(text) => { setVerificationCode(text); if (codeError) setCodeError(''); }}
                            editable={!verifying}
                        />
                        {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}
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
                    <Icon name="alert-triangle" size={20} color={Colors.warning} />
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

                <View style={styles.completedRow}>
                    <Icon name="check-circle" size={18} color={Colors.income} />
                    <Text style={styles.completedLabel}>Setup Complete!</Text>
                </View>
            </ScrollView>
            <FooterNav />

            {/* Backup Codes Modal */}
            <Modal visible={showBackupCodes} transparent animationType="slide">
                <SafeAreaView style={styles.modalSafe}>
                    <View style={[{ flex: 1, width: '100%' }, constrainModalWidth && styles.modalConstrainedColumn]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Backup Codes</Text>
                            <TouchableOpacity onPress={() => setShowBackupCodes(false)}>
                                <Icon name="x" size={18} color={Colors.textMuted} />
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
                    </View>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100, width: '100%', maxWidth: 560, alignSelf: 'center' },

    title: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textMuted, marginBottom: Spacing.xl },

    statusCard: {
        backgroundColor: 'rgba(16,185,129,0.1)',
        borderWidth: 1,
        borderColor: Colors.income,
        borderRadius: Radius.md,
        padding: Spacing.xl,
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    statusIconWrap: { marginBottom: Spacing.sm },
    statusTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    statusText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

    infoCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    infoLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },
    infoValue: { fontSize: 28, fontWeight: 'bold', color: Colors.primary, marginBottom: Spacing.sm },
    infoText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    benefitsCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        ...Shadow.sm,
    },
    benefitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    benefitTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
    benefitText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    stepsLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.md },
    stepItem: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: Spacing.md,
        marginBottom: 10,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    stepNumber: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.primary,
        marginRight: Spacing.md,
        minWidth: 30,
    },
    stepContent: { flex: 1 },
    stepTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    stepDesc: { fontSize: 12, color: Colors.textMuted },

    qrCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        padding: Spacing.xl,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    qrLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, textAlign: 'center' },
    qrPlaceholder: {
        backgroundColor: Colors.bg,
        borderRadius: Radius.sm,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 250,
    },
    qrUrl: { fontSize: 10, color: Colors.textMuted, marginTop: Spacing.sm },

    manualCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    manualLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.md },
    manualKey: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        fontFamily: 'monospace',
        marginBottom: Spacing.sm,
    },
    manualHint: { fontSize: 11, color: Colors.textMuted },

    verifyCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        padding: Spacing.xl,
        marginBottom: Spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
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
        paddingVertical: Spacing.md,
    },
    errorText: {
        fontSize: 13,
        color: Colors.expense,
        marginTop: Spacing.md,
        textAlign: 'center',
    },

    warningCard: {
        backgroundColor: 'rgba(245,158,11,0.1)',
        borderWidth: 1,
        borderColor: Colors.warning,
        borderRadius: Radius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
    },
    warningText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    codeRow: {
        flexDirection: 'row',
        padding: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    codeNum: { fontSize: 14, color: Colors.textMuted, minWidth: 30 },
    codeText: { fontSize: 14, fontFamily: 'monospace', color: Colors.textPrimary, flex: 1 },

    completedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.xl,
    },
    completedLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.income,
        textAlign: 'center',
    },

    btn: {
        backgroundColor: Colors.primary,
        paddingVertical: 13,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: Spacing.md,
        ...Shadow.sm,
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    dangerBtn: { backgroundColor: Colors.expense },
    primaryBtn: { backgroundColor: Colors.primary },

    modalSafe: { flex: 1, backgroundColor: Colors.bg },
    // Matches App.tsx's centeredAppColumn width.
    modalConstrainedColumn: { maxWidth: 1040, alignSelf: 'center' },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    modalContent: { flex: 1, padding: Spacing.lg },
});
