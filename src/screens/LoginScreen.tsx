import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { t, LANGUAGES, Language } from '../utils/i18n';

const CURRENCIES = [
    { label: 'USD ($)',   value: '$'   },
    { label: 'EUR (€)',   value: '€'   },
    { label: 'GBP (£)',   value: '£'   },
    { label: 'NGN (₦)',   value: '₦'   },
    { label: 'CNY (¥)',   value: '¥'   },
    { label: 'CAD (CA$)', value: 'CA$' },
];

type Mode = 'owner-setup' | 'owner-login' | 'join-team' | 'reset-pin';
type LoginMethod = 'pin' | 'email';

export default function LoginScreen() {
    const { isFirstLaunch, setupAccount, login, joinTeam, language, setLanguage, updateSettings, resetApp, isLockedOut, lockoutUntil } = useApp();
    const [mode, setMode] = useState<Mode>(isFirstLaunch ? 'owner-setup' : 'owner-login');
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [loginMethod, setLoginMethod] = useState<LoginMethod>('pin');

    useEffect(() => {
        setMode(isFirstLaunch ? 'owner-setup' : 'owner-login');
    }, [isFirstLaunch]);

    // Update lockout timer
    useEffect(() => {
        if (!isLockedOut || !lockoutUntil) {
            setTimeRemaining(null);
            return;
        }
        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, lockoutUntil - now);
            if (remaining === 0) {
                setTimeRemaining(null);
            } else {
                setTimeRemaining(Math.ceil(remaining / 1000));
            }
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [isLockedOut, lockoutUntil]);

    // Owner setup
    const [email, setEmail]         = useState('');
    const [business, setBusiness]   = useState('');
    const [pin, setPin]             = useState('');
    const [confirmPin, setConfirm]  = useState('');
    const [currency, setCurrency]   = useState('$');
    const [setupLang, setSetupLang] = useState<Language>(language);
    const [submitting, setSubmitting] = useState(false);

    // Owner return
    const [returnPin, setReturnPin] = useState('');
    const [emailLoginEmail, setEmailLoginEmail] = useState('');
    const [emailLoginPin, setEmailLoginPin] = useState('');

    // Join team
    const [joinEmail, setJoinEmail]     = useState('');
    const [joinPin, setJoinPin]         = useState('');
    const [joinConfirm, setJoinConfirm] = useState('');
    const [inviteCode, setInviteCode]   = useState('');
    const [joiningTeam, setJoiningTeam] = useState(false);

    // Reset PIN
    const [resetEmail, setResetEmail]         = useState('');
    const [resetNewPin, setResetNewPin]       = useState('');
    const [resetConfirmPin, setResetConfirmPin] = useState('');
    const [resetOtp, setResetOtp]             = useState('');
    const [resetStep, setResetStep]           = useState<'request' | 'verify'>('request');
    const [resetSubmitting, setResetSubmitting] = useState(false);

    const handleSetup = async () => {
        if (!email.trim() || !business.trim()) {
            Alert.alert(t(setupLang, 'missingFields'), t(setupLang, 'email') + ' & ' + t(setupLang, 'businessName')); return;
        }
        if (!/^\d{6}$/.test(pin)) { Alert.alert(t(setupLang, 'error'), t(setupLang, 'invalidPin')); return; }
        if (pin !== confirmPin)   { Alert.alert(t(setupLang, 'error'), t(setupLang, 'pinMismatch')); return; }
        setSubmitting(true);
        try {
            setLanguage(setupLang);
            await setupAccount(email.trim(), business.trim(), pin, false);
            updateSettings({ currency });
        } catch (e: any) {
            const msg: string = e?.message ?? '';
            if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered') || msg.toLowerCase().includes('user already exists') || msg.toLowerCase().includes('email address is already')) {
                Alert.alert(
                    'Email Already Registered',
                    'An account with this email already exists. Please sign in instead, or use a different email address.',
                    [
                        { text: 'Sign In', onPress: () => { setMode('owner-login'); setLoginMethod('email'); setEmailLoginEmail(email.trim()); } },
                        { text: 'Use Different Email', style: 'cancel' },
                    ]
                );
            } else {
                Alert.alert(t(setupLang, 'error'), msg || 'Could not create account. Please try again.');
            }
            setSubmitting(false);
        }
    };

    const handleLogin = () => {
        if (isLockedOut && timeRemaining !== null && timeRemaining > 0) {
            Alert.alert(
                'Account Locked',
                `Too many failed login attempts. Please try again in ${Math.ceil(timeRemaining / 60)} minute${Math.ceil(timeRemaining / 60) !== 1 ? 's' : ''}.`,
            );
            return;
        }
        if (!returnPin) { Alert.alert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }
        const ok = login(returnPin);
        if (!ok) {
            Alert.alert(t(language, 'error'), 'Incorrect PIN. Please try again.');
            setReturnPin('');
        }
    };

    const handleEmailLogin = async () => {
        if (isLockedOut && timeRemaining !== null && timeRemaining > 0) {
            Alert.alert(
                'Account Locked',
                `Too many failed login attempts. Please try again in ${Math.ceil(timeRemaining / 60)} minute${Math.ceil(timeRemaining / 60) !== 1 ? 's' : ''}.`,
            );
            return;
        }
        if (!emailLoginEmail.trim()) { Alert.alert(t(language, 'error'), 'Please enter your email address.'); return; }
        if (!emailLoginPin) { Alert.alert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }

        // First try local PIN match
        const ok = login(emailLoginPin);
        if (ok) return;

        // If local fails, try Supabase to give specific error
        try {
            const { error } = await import('../utils/supabase').then(m =>
                m.supabase.auth.signInWithPassword({ email: emailLoginEmail.trim(), password: emailLoginPin })
            );
            if (error) {
                if (error.message.toLowerCase().includes('invalid login') || error.message.toLowerCase().includes('invalid credentials')) {
                    Alert.alert('Incorrect Details', 'The email or PIN you entered does not match any account. Please check and try again.');
                } else if (error.message.toLowerCase().includes('email not confirmed')) {
                    Alert.alert('Email Not Verified', 'Please check your inbox and confirm your email before logging in.');
                } else if (error.message.toLowerCase().includes('too many requests')) {
                    Alert.alert('Too Many Attempts', 'Too many login attempts. Please wait a few minutes and try again.');
                } else {
                    Alert.alert(t(language, 'error'), 'Incorrect email or PIN. Please try again.');
                }
            } else {
                Alert.alert(t(language, 'error'), 'Incorrect PIN. Please try again.');
            }
        } catch {
            Alert.alert(t(language, 'error'), 'Incorrect email or PIN. Please try again.');
        }
        setEmailLoginPin('');
    };

    const handleJoinTeam = async () => {
        if (!joinEmail.trim()) { Alert.alert(t(language, 'required'), t(language, 'email')); return; }
        if (!/^\d{6}$/.test(joinPin)) { Alert.alert(t(language, 'error'), t(language, 'invalidPin')); return; }
        if (joinPin !== joinConfirm)  { Alert.alert(t(language, 'error'), t(language, 'pinMismatch')); return; }
        if (!inviteCode.trim())       { Alert.alert(t(language, 'required'), t(language, 'inviteCode')); return; }
        setJoiningTeam(true);
        try {
            await joinTeam(joinEmail.trim(), joinPin, inviteCode.trim());
        } catch (e: any) {
            Alert.alert('Join Failed', e?.message ?? 'Invalid invite code or account error.');
            setJoiningTeam(false);
        }
    };

    const handleResetRequest = async () => {
        if (!resetEmail.trim()) { Alert.alert('Error', 'Please enter your email address.'); return; }
        if (!/^\d{6}$/.test(resetNewPin)) { Alert.alert('Error', 'New PIN must be exactly 6 digits.'); return; }
        if (resetNewPin !== resetConfirmPin) { Alert.alert('Error', 'PINs do not match.'); return; }
        setResetSubmitting(true);
        try {
            const { supabase } = await import('../utils/supabase');
            const redirectTo = typeof window !== 'undefined'
                ? `${window.location.origin}/?reset=1`
                : undefined;
            const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
            if (error) {
                const msg = error.message.toLowerCase();
                if (msg.includes('user not found') || msg.includes('not found')) {
                    Alert.alert('No Account Found', 'No account exists with that email address. Please check and try again.');
                } else {
                    Alert.alert('Error', error.message);
                }
            } else {
                setResetStep('verify');
            }
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to send reset email.');
        }
        setResetSubmitting(false);
    };

    const handleResetVerify = async () => {
        if (!/^\d{6}$/.test(resetOtp.trim())) { Alert.alert('Error', 'Please enter the 6-digit code from the email link.'); return; }
        setResetSubmitting(true);
        try {
            const { supabase } = await import('../utils/supabase');
            // On web the reset link sets a session automatically via the URL hash;
            // verify the OTP token directly for environments that support it
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email: resetEmail.trim(),
                token: resetOtp.trim(),
                type: 'recovery',
            });
            if (verifyError) {
                Alert.alert('Invalid Code', 'The code is incorrect or has expired. Please request a new reset email.');
                setResetSubmitting(false);
                return;
            }
            const { error: updateError } = await supabase.auth.updateUser({ password: resetNewPin });
            if (updateError) {
                Alert.alert('Error', 'Could not update PIN: ' + updateError.message);
                setResetSubmitting(false);
                return;
            }
            Alert.alert('PIN Reset Successful', 'Your PIN has been updated. Please log in with your new PIN.', [
                { text: 'OK', onPress: () => { setMode('owner-login'); setLoginMethod('email'); setEmailLoginEmail(resetEmail.trim()); setResetStep('request'); setResetOtp(''); setResetNewPin(''); setResetConfirmPin(''); } }
            ]);
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Verification failed.');
        }
        setResetSubmitting(false);
    };

    // ── Reset PIN ─────────────────────────────────────────────────────────────
    if (mode === 'reset-pin') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.title}>Reset PIN</Text>
                        <Text style={styles.subtitle}>
                            {resetStep === 'request'
                                ? 'Enter your email and new PIN. We\'ll send a reset link to your inbox.'
                                : `Check your inbox at ${resetEmail} — open the link, then enter the 6-digit code from the email here.`}
                        </Text>

                        {resetStep === 'request' ? (
                            <>
                                <Field label="Email Address">
                                    <TextInput style={styles.input} value={resetEmail} onChangeText={setResetEmail}
                                        placeholder="your@email.com" placeholderTextColor={Colors.muted}
                                        autoCapitalize="none" keyboardType="email-address" />
                                </Field>
                                <Field label="New PIN (6 digits)">
                                    <TextInput style={styles.input} value={resetNewPin} onChangeText={setResetNewPin}
                                        placeholder="••••••" placeholderTextColor={Colors.muted}
                                        secureTextEntry keyboardType="number-pad" maxLength={6} />
                                </Field>
                                <Field label="Confirm New PIN">
                                    <TextInput style={styles.input} value={resetConfirmPin} onChangeText={setResetConfirmPin}
                                        placeholder="••••••" placeholderTextColor={Colors.muted}
                                        secureTextEntry keyboardType="number-pad" maxLength={6} />
                                </Field>
                                <TouchableOpacity style={[styles.btn, resetSubmitting && styles.btnDisabled]}
                                    onPress={handleResetRequest} disabled={resetSubmitting}>
                                    {resetSubmitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>Send Reset Email</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoText}>
                                        📧 A reset email has been sent to{'\n'}<Text style={{ fontWeight: 'bold' }}>{resetEmail}</Text>{'\n\n'}
                                        Open the email → click the link → come back here and enter the 6-digit code shown in the email.{'\n\n'}
                                        ⚠️ Check your spam/junk folder if you don't see it.
                                    </Text>
                                </View>
                                <Field label="6-Digit Code from Email">
                                    <TextInput style={[styles.input, styles.codeInput]}
                                        value={resetOtp} onChangeText={setResetOtp}
                                        placeholder="000000" placeholderTextColor={Colors.muted}
                                        keyboardType="number-pad" maxLength={6} />
                                </Field>
                                <TouchableOpacity style={[styles.btn, resetSubmitting && styles.btnDisabled]}
                                    onPress={handleResetVerify} disabled={resetSubmitting}>
                                    {resetSubmitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>Verify & Set New PIN</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.switchBtn} onPress={() => setResetStep('request')}>
                                    <Text style={styles.switchText}>← Resend or change email</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        <TouchableOpacity style={styles.switchBtn}
                            onPress={() => { setMode('owner-login'); setResetStep('request'); }}>
                            <Text style={styles.switchText}>← Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Join Team ─────────────────────────────────────────────────────────────
    if (mode === 'join-team') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.title}>{t(language, 'joinTeam')}</Text>
                        <Text style={styles.subtitle}>{t(language, 'joinSubtitle')}</Text>

                        <Field label={t(language, 'yourEmail')}>
                            <TextInput style={styles.input} value={joinEmail} onChangeText={setJoinEmail}
                                placeholder="you@example.com" placeholderTextColor={Colors.muted}
                                autoCapitalize="none" keyboardType="email-address" />
                        </Field>
                        <Field label={t(language, 'newPin')}>
                            <TextInput style={styles.input} value={joinPin} onChangeText={setJoinPin}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6} />
                        </Field>
                        <Field label={t(language, 'confirmPin')}>
                            <TextInput style={styles.input} value={joinConfirm} onChangeText={setJoinConfirm}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6} />
                        </Field>
                        <Field label={t(language, 'inviteCode')}>
                            <TextInput style={[styles.input, styles.codeInput]}
                                value={inviteCode} onChangeText={v => setInviteCode(v.toUpperCase())}
                                placeholder="ABC123" placeholderTextColor={Colors.muted}
                                autoCapitalize="characters" maxLength={6} />
                        </Field>

                        <TouchableOpacity style={[styles.btn, joiningTeam && styles.btnDisabled]} onPress={handleJoinTeam} disabled={joiningTeam}>
                            {joiningTeam
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnText}>{t(language, 'joinTeamBtn')}</Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.switchBtn} onPress={() => setMode(isFirstLaunch ? 'owner-setup' : 'owner-login')}>
                            <Text style={styles.switchText}>{t(language, 'backToSignIn')}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Owner first-launch setup ──────────────────────────────────────────────
    if (mode === 'owner-setup') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.title}>{t(setupLang, 'appName')}</Text>
                        <Text style={styles.subtitle}>{t(setupLang, 'setupSubtitle')}</Text>

                        {/* Language picker — shown first so the rest renders in chosen language */}
                        <Text style={styles.sectionLabel}>{t(setupLang, 'preferredLanguage')}</Text>
                        <View style={styles.chipRow}>
                            {LANGUAGES.map(l => (
                                <TouchableOpacity key={l.code}
                                    style={[styles.chip, setupLang === l.code && styles.chipActive]}
                                    onPress={() => setSetupLang(l.code)}>
                                    <Text style={[styles.chipText, setupLang === l.code && styles.chipTextActive]}>
                                        {l.nativeLabel}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Field label={t(setupLang, 'email')}>
                            <TextInput style={styles.input} value={email} onChangeText={setEmail}
                                placeholder="admin@yourbusiness.com" placeholderTextColor={Colors.muted}
                                autoCapitalize="none" keyboardType="email-address" />
                        </Field>
                        <Field label={t(setupLang, 'businessName')}>
                            <TextInput style={styles.input} value={business} onChangeText={setBusiness}
                                placeholder="Acme Corp" placeholderTextColor={Colors.muted} />
                        </Field>
                        <Field label={t(setupLang, 'createPin')}>
                            <TextInput style={styles.input} value={pin} onChangeText={setPin}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6} />
                        </Field>
                        <Field label={t(setupLang, 'confirmPin')}>
                            <TextInput style={styles.input} value={confirmPin} onChangeText={setConfirm}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6} />
                        </Field>

                        {/* Currency picker */}
                        <Text style={styles.sectionLabel}>{t(setupLang, 'preferredCurrency')}</Text>
                        <View style={styles.chipRow}>
                            {CURRENCIES.map(c => (
                                <TouchableOpacity key={c.value}
                                    style={[styles.chip, currency === c.value && styles.chipActive]}
                                    onPress={() => setCurrency(c.value)}>
                                    <Text style={[styles.chipText, currency === c.value && styles.chipTextActive]}>
                                        {c.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={[styles.btn, submitting && styles.btnDisabled]} onPress={handleSetup} disabled={submitting}>
                            {submitting
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnText}>{t(setupLang, 'createAccount')}</Text>
                            }
                        </TouchableOpacity>
                        <Text style={styles.trustNote}>🔒 Your data is encrypted and stored securely. We never share your information.</Text>
                        <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('join-team')}>
                            <Text style={styles.switchText}>{t(setupLang, 'joiningTeam')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('owner-login')}>
                            <Text style={styles.switchText}>Already have an account? Sign In →</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Owner return login ────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Text style={styles.title}>{t(language, 'appName')}</Text>
                    <Text style={styles.subtitle}>{t(language, 'loginSubtitle')}</Text>

                    {isLockedOut && timeRemaining !== null && timeRemaining > 0 && (
                        <View style={styles.lockoutBanner}>
                            <Text style={styles.lockoutText}>
                                🔒 Too many failed attempts. Try again in {Math.ceil(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                            </Text>
                        </View>
                    )}

                    {/* Login Method Tabs */}
                    <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                        <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 12, backgroundColor: loginMethod === 'pin' ? '#0066cc' : '#cccccc', borderRadius: 6, marginRight: 8 }}
                            onPress={() => setLoginMethod('pin')}
                        >
                            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>PIN</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 12, backgroundColor: loginMethod === 'email' ? '#0066cc' : '#cccccc', borderRadius: 6 }}
                            onPress={() => setLoginMethod('email')}
                        >
                            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>Email</Text>
                        </TouchableOpacity>
                    </View>

                    {loginMethod === 'pin' ? (
                        // PIN Login Form
                        <>
                            <View style={styles.pinContainer}>
                                <TextInput style={styles.pinInput}
                                    placeholder="••••••" placeholderTextColor={Colors.muted}
                                    secureTextEntry keyboardType="number-pad" maxLength={6}
                                    value={returnPin} onChangeText={setReturnPin}
                                    onSubmitEditing={handleLogin} autoFocus />
                            </View>
                            <TouchableOpacity style={styles.btn} onPress={handleLogin}>
                                <Text style={styles.btnText}>{t(language, 'unlock')}</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        // Email Login Form
                        <>
                            <Field label="Email Address">
                                <TextInput style={styles.input}
                                    placeholder="your@email.com"
                                    placeholderTextColor={Colors.muted}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    value={emailLoginEmail}
                                    onChangeText={setEmailLoginEmail}
                                />
                            </Field>
                            <Field label="PIN">
                                <TextInput style={styles.input}
                                    placeholder="••••••"
                                    placeholderTextColor={Colors.muted}
                                    secureTextEntry
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    value={emailLoginPin}
                                    onChangeText={setEmailLoginPin}
                                    onSubmitEditing={handleEmailLogin}
                                />
                            </Field>
                            <TouchableOpacity style={styles.btn} onPress={handleEmailLogin}>
                                <Text style={styles.btnText}>Unlock</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    <TouchableOpacity style={styles.switchBtn} onPress={() => { setEmail(''); setBusiness(''); setPin(''); setConfirm(''); setMode('owner-setup'); }}>
                        <Text style={styles.switchText}>Don't have an account? Sign Up →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('join-team')}>
                        <Text style={styles.switchText}>{t(language, 'joiningTeam')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.resetBtn} onPress={() => {
                        setResetEmail(''); setResetNewPin(''); setResetConfirmPin(''); setResetOtp(''); setResetStep('request');
                        setMode('reset-pin');
                    }}>
                        <Text style={styles.resetText}>Forgot PIN?</Text>
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
        backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
    },
    title:    { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 20, marginTop: 4 },

    group: { marginBottom: 14 },
    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    codeInput: { fontSize: 20, letterSpacing: 8, textAlign: 'center', fontWeight: 'bold' },

    sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip:         { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, backgroundColor: Colors.bg },
    chipActive:   { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    chipText:     { fontSize: 12, color: Colors.textMuted },
    chipTextActive: { color: Colors.primary, fontWeight: '600' },

    demoRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    demoOpt: {
        flex: 1, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: Colors.bg,
    },
    demoOptActive:     { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    demoOptText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
    demoOptTextActive: { color: Colors.primary },
    demoOptSub:        { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },

    pinContainer: { alignItems: 'center', marginVertical: 24 },
    pinInput: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: 10, paddingHorizontal: 24, paddingVertical: 14,
        color: Colors.textPrimary, fontSize: 28, letterSpacing: 12,
        textAlign: 'center', width: 180,
    },

    btn:        { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 8, alignItems: 'center', marginTop: 4 },
    btnDisabled: { opacity: 0.6 },
    btnText:    { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
    switchBtn:  { paddingVertical: 14, alignItems: 'center' },
    switchText: { color: Colors.primary, fontSize: 13 },
    resetBtn:   { paddingVertical: 10, alignItems: 'center' },
    resetText:  { color: '#ef4444', fontSize: 12 },
    trustNote:  { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 16 },

    infoBox: {
        backgroundColor: 'rgba(0,102,204,0.12)', borderWidth: 1, borderColor: Colors.primary,
        borderRadius: 10, padding: 14, marginBottom: 16,
    },
    infoText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },

    lockoutBanner: {
        backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: '#ef4444',
        borderRadius: 10, padding: 12, marginBottom: 16,
    },
    lockoutText: { color: '#ef4444', fontSize: 13, fontWeight: '600', textAlign: 'center' },

    loginTabs: {
        flexDirection: 'row',
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    loginTab: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    loginTabActive: {
        borderBottomColor: Colors.primary,
    },
    loginTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    loginTabTextActive: {
        color: Colors.primary,
    },
});
