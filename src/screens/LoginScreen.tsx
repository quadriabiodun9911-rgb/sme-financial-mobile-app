import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, Modal, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { t, LANGUAGES, Language } from '../utils/i18n';
import { DEMO_BUSINESSES } from '../utils/demoData';
import { trackUserLoggedIn, identifyUser } from '../utils/analytics';
import { supabase } from '../utils/supabase';

const CURRENCIES = [
    { label: 'USD ($)',    value: '$'   },
    { label: 'GBP (£)',   value: '£'   },
    { label: 'EUR (€)',   value: '€'   },
    { label: 'NGN (₦)',   value: '₦'   },
    { label: 'ZAR (R)',   value: 'R'   },
    { label: 'KES (KSh)', value: 'KSh' },
    { label: 'GHS (₵)',   value: '₵'   },
    { label: 'EGP (E£)',  value: 'E£'  },
    { label: 'AED (د.إ)', value: 'AED' },
    { label: 'INR (₹)',   value: '₹'   },
    { label: 'CNY (¥)',   value: '¥'   },
    { label: 'CAD (C$)',  value: 'C$'  },
    { label: 'AUD (A$)',  value: 'A$'  },
];

function detectLocaleCurrency(): string {
    try {
        if (typeof Intl !== 'undefined') {
            const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
            const region = locale.split('-')[1]?.toUpperCase();
            const map: Record<string, string> = {
                ZA: 'R', NG: '₦', KE: 'KSh', GH: '₵', EG: 'E£',
                GB: '£', DE: '€', FR: '€', AE: 'AED', IN: '₹',
                CN: '¥', CA: 'C$', AU: 'A$',
            };
            if (region && map[region]) return map[region];
        }
    } catch {}
    return '$';
}

type Mode = 'owner-setup' | 'owner-login' | 'join-team' | 'reset-pin' | 'demo-pick' | 'recover';
type LoginMethod = 'pin' | 'email';

export default function LoginScreen() {
    const { isFirstLaunch, setupAccount, login, joinTeam, enterDemo, language, setLanguage, updateSettings, resetApp, isLockedOut, lockoutUntil, recoverAccount } = useApp();
    const [mode, setMode] = useState<Mode>(isFirstLaunch ? 'owner-setup' : 'owner-login');
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [loginMethod, setLoginMethod] = useState<LoginMethod>('pin');

    useEffect(() => {
        setMode(isFirstLaunch ? 'owner-setup' : 'owner-login');
    }, [isFirstLaunch]);

    // On web: detect Supabase recovery callback (access_token in URL hash) and auto-update PIN
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace('#', '?'));
        const type = params.get('type');
        const accessToken = params.get('access_token');
        if (type === 'recovery' && accessToken) {
            setMode('reset-pin');
            setResetStep('complete-web');
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

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

    const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

    // Owner setup
    const [email, setEmail]         = useState('');
    const [phone, setPhone]         = useState('');
    const [business, setBusiness]   = useState('');
    const [pin, setPin]             = useState('');
    const [confirmPin, setConfirm]  = useState('');
    const [currency, setCurrency]   = useState(detectLocaleCurrency);
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
    const [resetStep, setResetStep]           = useState<'request' | 'verify' | 'complete-web'>('request');
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
            await setupAccount(email.trim(), business.trim(), pin, false, phone.trim());
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

        setSubmitting(true);
        let navigating = false;
        try {
            // First try local PIN match
            const ok = login(emailLoginPin);
            if (ok) { navigating = true; identifyUser(emailLoginEmail.trim()); trackUserLoggedIn('email'); return; }

            // If local fails, try Supabase to give specific error
            const { error } = await supabase.auth.signInWithPassword({ email: emailLoginEmail.trim(), password: emailLoginPin + '_Q360' });
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
                // Supabase auth succeeded — recover account data and log in
                navigating = true;
                await recoverAccount(emailLoginEmail.trim(), emailLoginPin);
                identifyUser(emailLoginEmail.trim());
                trackUserLoggedIn('email');
                return;
            }
        } catch {
            Alert.alert(t(language, 'error'), 'Incorrect email or PIN. Please try again.');
        } finally {
            if (!navigating) setSubmitting(false);
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
            
            const redirectTo = Platform.OS === 'web'
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

    // Called after user clicks email link on web — Supabase auto-sets session from URL hash
    const handleWebResetComplete = async () => {
        if (!/^\d{6}$/.test(resetNewPin)) { Alert.alert('Error', 'New PIN must be exactly 6 digits.'); return; }
        if (resetNewPin !== resetConfirmPin) { Alert.alert('Error', 'PINs do not match.'); return; }
        setResetSubmitting(true);
        try {
            
            const { error } = await supabase.auth.updateUser({ password: resetNewPin + '_Q360' });
            if (error) { Alert.alert('Error', error.message); setResetSubmitting(false); return; }
            Alert.alert('PIN Reset Successful', 'Your PIN has been updated. Please log in.', [
                { text: 'OK', onPress: () => { setMode('owner-login'); setLoginMethod('pin'); setResetStep('request'); setResetNewPin(''); setResetConfirmPin(''); } }
            ]);
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Reset failed.');
        }
        setResetSubmitting(false);
    };

    const handleResetVerify = async () => {
        if (!/^\d{6}$/.test(resetOtp.trim())) { Alert.alert('Error', 'Please enter the 6-digit code from the email link.'); return; }
        setResetSubmitting(true);
        try {
            
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
            const { error: updateError } = await supabase.auth.updateUser({ password: resetNewPin + '_Q360' });
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

    // ── Recover existing account on new device ────────────────────────────────
    if (mode === 'recover') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.title}>Welcome Back</Text>
                        <Text style={styles.subtitle}>Sign in with your email and PIN to restore your account on this device.</Text>

                        <View style={styles.newDeviceBanner}>
                            <Text style={styles.newDeviceIcon}>📱</Text>
                            <Text style={styles.newDeviceText}>
                                New device detected. Enter your email and PIN — your data will be restored automatically.
                            </Text>
                        </View>

                        <Field label="Email Address">
                            <TextInput style={styles.input} value={emailLoginEmail} onChangeText={setEmailLoginEmail}
                                placeholder="your@email.com" placeholderTextColor={Colors.muted}
                                autoCapitalize="none" keyboardType="email-address" autoFocus />
                        </Field>
                        <Field label="Your PIN (6 digits)">
                            <TextInput style={styles.input} value={emailLoginPin} onChangeText={setEmailLoginPin}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6}
                                onSubmitEditing={handleEmailLogin} />
                        </Field>

                        <TouchableOpacity
                            style={[styles.btn, submitting && styles.btnDisabled]}
                            onPress={handleEmailLogin}
                            disabled={submitting}
                        >
                            {submitting
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnText}>Restore My Account →</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.switchBtn} onPress={() => {
                            setResetEmail(''); setResetNewPin(''); setResetConfirmPin(''); setResetStep('request');
                            setMode('reset-pin');
                        }}>
                            <Text style={styles.resetText}>Forgot your PIN? Reset it →</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('owner-setup')}>
                            <Text style={styles.switchText}>← Create a new account instead</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Demo picker ───────────────────────────────────────────────────────────
    if (mode === 'demo-pick') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.title}>Try the Demo</Text>
                        <Text style={styles.subtitle}>Pick a business type to explore the app with realistic sample data. Nothing will be saved.</Text>

                        {DEMO_BUSINESSES.map(biz => (
                            <TouchableOpacity key={biz.id} style={styles.bizCard} onPress={() => enterDemo(biz.id)}>
                                <Text style={styles.bizEmoji}>{biz.flag}</Text>
                                <View style={styles.bizInfo}>
                                    <Text style={styles.bizCountry}>{biz.country}</Text>
                                    <Text style={styles.bizName}>{biz.businessName}</Text>
                                    <Text style={styles.bizDesc}>{biz.description} · {biz.currency}</Text>
                                </View>
                                <Text style={styles.bizArrow}>→</Text>
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity style={styles.switchBtn} onPress={() => setMode(isFirstLaunch ? 'owner-setup' : 'owner-login')}>
                            <Text style={styles.switchText}>← Back</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Reset PIN ─────────────────────────────────────────────────────────────
    if (mode === 'reset-pin') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.title}>Forgot Your PIN?</Text>
                        <Text style={styles.subtitle}>
                            {resetStep === 'request'
                                ? 'No problem. Follow the steps below and you\'ll be back in 2 minutes.'
                                : resetStep === 'complete-web'
                                ? 'Identity confirmed. Now set your new PIN.'
                                : 'Almost done — just check your email.'}
                        </Text>

                        {resetStep === 'request' ? (
                            <>
                                <View style={styles.stepsBox}>
                                    <Text style={styles.stepsTitle}>How it works:</Text>
                                    <Text style={styles.stepsItem}>1. Enter your email and choose a new PIN below</Text>
                                    <Text style={styles.stepsItem}>2. We send a reset link to your email</Text>
                                    <Text style={styles.stepsItem}>3. Open the email on this device and tap the link</Text>
                                    <Text style={styles.stepsItem}>4. The link brings you back here and sets your new PIN</Text>
                                </View>
                                <Field label="Your Account Email">
                                    <TextInput style={styles.input} value={resetEmail} onChangeText={setResetEmail}
                                        placeholder="your@email.com" placeholderTextColor={Colors.muted}
                                        autoCapitalize="none" keyboardType="email-address" />
                                </Field>
                                <Field label="Choose a New PIN (6 digits)">
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
                                        : <Text style={styles.btnText}>Send Reset Link to My Email</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoBoxTitle}>Check your email</Text>
                                    <Text style={styles.infoText}>
                                        We sent a reset link to:{'\n'}
                                        <Text style={{ fontWeight: 'bold', color: Colors.textPrimary }}>{resetEmail}</Text>
                                    </Text>
                                    <View style={styles.infoSteps}>
                                        <Text style={styles.infoStep}>1. Open your email app now</Text>
                                        <Text style={styles.infoStep}>2. Find the email from Quad360</Text>
                                        <Text style={styles.infoStep}>3. Tap "Reset Password" in the email</Text>
                                        <Text style={styles.infoStep}>4. It will bring you back here automatically</Text>
                                    </View>
                                    <Text style={styles.infoNote}>Link expires in 1 hour. Check your spam folder if you don't see it.</Text>
                                </View>
                                <TouchableOpacity style={styles.switchBtn} onPress={() => { setResetStep('request'); setResetOtp(''); }}>
                                    <Text style={styles.switchText}>Didn't get the email? Try again →</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {resetStep === 'complete-web' && (
                            <>
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
                                    onPress={handleWebResetComplete} disabled={resetSubmitting}>
                                    {resetSubmitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>Set New PIN</Text>}
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
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.subtitle}>{t(setupLang, 'setupSubtitle')}</Text>

                        {/* Social proof strip */}
                        <View style={styles.socialProofSetup}>
                            <View style={styles.socialProofPill}>
                                <Text style={styles.socialProofPillText}>Free forever · No credit card</Text>
                            </View>
                            <View style={styles.socialProofPill}>
                                <Text style={styles.socialProofPillText}>Trusted by SMEs in 10+ countries</Text>
                            </View>
                            <View style={styles.socialProofPill}>
                                <Text style={styles.socialProofPillText}>Your data stays private</Text>
                            </View>
                        </View>

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
                        <Field label="Phone Number (for financial health score)">
                            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
                                placeholder="+2348012345678" placeholderTextColor={Colors.muted}
                                keyboardType="phone-pad" />
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

                        {/* Currency picker — compact single row */}
                        <Field label={t(setupLang, 'preferredCurrency')}>
                            <TouchableOpacity style={styles.currencyRow} onPress={() => setCurrencyModalOpen(true)}>
                                <Text style={styles.currencySelected}>
                                    {CURRENCIES.find(c => c.value === currency)?.label ?? currency}
                                </Text>
                                <Text style={styles.currencyChevron}>▾</Text>
                            </TouchableOpacity>
                        </Field>

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
                        <TouchableOpacity style={styles.switchBtn} onPress={() => { setEmailLoginEmail(email); setMode('recover'); }}>
                            <Text style={styles.switchText}>Already have an account? Sign In →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.demoBtn} onPress={() => setMode('demo-pick')}>
                            <Text style={styles.demoBtnText}>👀 Try Demo (No sign-up needed)</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                {/* Currency picker modal */}
                <Modal visible={currencyModalOpen} transparent animationType="slide" onRequestClose={() => setCurrencyModalOpen(false)}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCurrencyModalOpen(false)}>
                        <View style={styles.currencyModal}>
                            <Text style={styles.currencyModalTitle}>Select Currency</Text>
                            <ScrollView>
                                {CURRENCIES.map(c => (
                                    <TouchableOpacity key={c.value} style={[styles.currencyOption, currency === c.value && styles.currencyOptionActive]}
                                        onPress={() => { setCurrency(c.value); setCurrencyModalOpen(false); }}>
                                        <Text style={[styles.currencyOptionText, currency === c.value && { color: Colors.primary, fontWeight: '700' }]}>
                                            {c.label}
                                        </Text>
                                        {currency === c.value && <Text style={{ color: Colors.primary }}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </SafeAreaView>
        );
    }

    // ── Owner return login ────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Image source={require('../../assets/icon.png')} style={styles.logo} />
                    <Text style={styles.subtitle}>{t(language, 'loginSubtitle')}</Text>

                    {/* Social proof strip */}
                    <View style={styles.socialProof}>
                        <View style={styles.socialProofAvatars}>
                            {['🇳🇬','🇿🇦','🇰🇪','🇬🇭','🇬🇧'].map((flag, i) => (
                                <View key={i} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -8 }]}>
                                    <Text style={styles.avatarFlag}>{flag}</Text>
                                </View>
                            ))}
                        </View>
                        <Text style={styles.socialProofText}>Trusted by SMEs across Africa & beyond</Text>
                    </View>

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
                        <Text style={styles.resetText}>Forgot your PIN? Reset it in 2 minutes →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.demoBtn} onPress={() => setMode('demo-pick')}>
                        <Text style={styles.demoBtnText}>👀 Try Demo First (No sign-up needed)</Text>
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
    logo:     { width: 80, height: 80, alignSelf: 'center', borderRadius: 18, marginBottom: 8 },
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

    currencyRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
        backgroundColor: Colors.bg, paddingHorizontal: 14, paddingVertical: 13,
    },
    currencySelected: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
    currencyChevron:  { fontSize: 16, color: Colors.muted },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    currencyModal: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingTop: 16, paddingHorizontal: 16, maxHeight: '60%',
    },
    currencyModalTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' },
    currencyOption: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    currencyOptionActive: { backgroundColor: Colors.primary + '11', marginHorizontal: -16, paddingHorizontal: 16 },
    currencyOptionText: { fontSize: 14, color: Colors.textPrimary },

    demoRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    demoOpt: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
        borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: Colors.bg,
    },
    demoOptActive:     { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    demoOptText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
    demoOptTextActive: { color: Colors.primary },
    demoOptSub:        { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },

    demoFooter: { marginTop: 24, marginBottom: 32, alignItems: 'center', padding: 20, backgroundColor: '#1e3a5f', borderRadius: 16, borderWidth: 1, borderColor: '#3b82f6' },
    demoFooterText: { color: '#93c5fd', fontSize: 13, marginBottom: 4 },
    demoFooterSub: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 12 },
    demoSignupBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    demoSignupBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

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

    stepsBox: {
        backgroundColor: Colors.bg, borderRadius: 10, padding: 14, marginBottom: 16,
        borderWidth: 1, borderColor: Colors.border,
    },
    stepsTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    stepsItem:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },

    infoBox: {
        backgroundColor: 'rgba(0,102,204,0.08)', borderWidth: 1, borderColor: Colors.primary,
        borderRadius: 12, padding: 16, marginBottom: 16,
    },
    infoBoxTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    infoText:     { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: 12 },
    infoSteps:    { backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 10 },
    infoStep:     { fontSize: 13, color: Colors.textSecondary, lineHeight: 24 },
    infoNote:     { fontSize: 11, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },

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

    demoBtn: {
        marginTop: 12, paddingVertical: 12, borderRadius: 8, alignItems: 'center',
        borderWidth: 1, borderColor: Colors.primary, backgroundColor: 'transparent',
    },
    demoBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },

    newDeviceBanner: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 1,
        borderColor: Colors.primary, borderRadius: 12,
        padding: 14, marginBottom: 20, gap: 10,
    },
    newDeviceIcon: { fontSize: 20 },
    newDeviceText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

    socialProof: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.bg, borderRadius: 10, padding: 10,
        marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
    },
    socialProofAvatars: { flexDirection: 'row' },
    avatar: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.surface, borderWidth: 1.5,
        borderColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
    },
    avatarFlag:      { fontSize: 14 },
    socialProofText: { flex: 1, fontSize: 11, color: Colors.textMuted, fontWeight: '500' },

    socialProofSetup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
    socialProofPill:  {
        backgroundColor: Colors.bg, borderRadius: 20,
        paddingHorizontal: 10, paddingVertical: 5,
        borderWidth: 1, borderColor: Colors.border,
    },
    socialProofPillText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },

    bizCard: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg,
        borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: Colors.border,
    },
    bizEmoji:   { fontSize: 28, marginRight: 12 },
    bizInfo:    { flex: 1 },
    bizCountry: { fontSize: 11, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    bizName:    { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    bizDesc:    { fontSize: 11, color: Colors.textMuted },
    bizArrow: { fontSize: 18, color: Colors.primary, marginLeft: 8 },
});
