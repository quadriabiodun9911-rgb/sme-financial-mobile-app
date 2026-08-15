import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import { t, LANGUAGES, Language } from '../utils/i18n';
import { DEMO_BUSINESSES } from '../utils/demoData';
import { trackUserLoggedIn, identifyUser } from '../utils/analytics';
import { supabase } from '../utils/supabase';
import { savePin, saveProfile, generateAuthSecret, saveAuthSecret, loadAuthSecret } from '../utils/storage';
import { Industry } from '../types';

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

const INDUSTRIES: { label: string; value: Industry; hint: string }[] = [
    { label: '🏬 Retail / Wholesale', value: 'retail', hint: 'Shops, boutiques, distributors — stock velocity & inventory-backed lending tools (shared with any business that carries stock)' },
    { label: '🍽️ Food Service', value: 'food-service', hint: 'Restaurants, catering, food stalls — recipe & food cost tools' },
    { label: '🏭 Manufacturing', value: 'manufacturing', hint: 'Makers, assemblers, processors — production & unit cost tools' },
    { label: '💼 Professional Services', value: 'professional-services', hint: 'Consultants, agencies, law firms — project & retainer profitability' },
    { label: '🏢 General / Other', value: 'general', hint: 'Anything else' },
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

type Mode = 'owner-setup' | 'owner-login' | 'join-team' | 'join-lender' | 'reset-pin' | 'demo-pick' | 'recover';
type LoginMethod = 'pin' | 'email';

export default function LoginScreen() {
    const { isFirstLaunch, setupAccount, login, joinTeam, joinAsLender, enterDemo, language, setLanguage, updateSettings, resetApp, isLockedOut, lockoutUntil, recoverAccount } = useApp();
    // The split-screen setup layout only applies on wide web viewports --
    // narrow/native rendering is untouched, so the primary mobile
    // experience carries zero risk from this. 900px comfortably fits the
    // two-column layout without cramping the brand panel.
    const { width: windowWidth } = useWindowDimensions();
    const isWideWebSetup = Platform.OS === 'web' && windowWidth >= 900;
    const [mode, setMode] = useState<Mode>(isFirstLaunch ? 'owner-setup' : 'owner-login');
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [loginMethod, setLoginMethod] = useState<LoginMethod>('pin');

    useEffect(() => {
        setMode(isFirstLaunch ? 'owner-setup' : 'owner-login');
    }, [isFirstLaunch]);

    // On web: detect Supabase recovery callback (access_token in URL hash)
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace('#', '?'));
        const type = params.get('type');
        const accessToken = params.get('access_token');
        if ((type === 'recovery' || type === 'signup') && accessToken) {
            // Let Supabase process the token first, then show the PIN reset form
            supabase.auth.getSession().then(() => {
                setMode('reset-pin');
                setResetStep('complete-web');
            });
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
    const [industry, setIndustry]   = useState<Industry>('general');
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

    // Join as lender (lender-side onboarding — see lenderAuth.ts / joinAsLender)
    const [lenderEmail, setLenderEmail]     = useState('');
    const [lenderPin, setLenderPin]         = useState('');
    const [lenderConfirm, setLenderConfirm] = useState('');
    const [lenderInviteCode, setLenderInviteCode] = useState('');
    const [joiningLender, setJoiningLender] = useState(false);

    // Reset PIN
    const [resetEmail, setResetEmail]         = useState('');
    const [resetNewPin, setResetNewPin]       = useState('');
    const [resetConfirmPin, setResetConfirmPin] = useState('');
    const [resetOtp, setResetOtp]             = useState('');
    const [resetStep, setResetStep]           = useState<'request' | 'verify' | 'complete-web'>('request');
    const [resetSubmitting, setResetSubmitting] = useState(false);

    // Alert.alert doesn't render on Expo web — every call site in this screen
    // used it unguarded, so PIN/email validation errors and reset/join-team
    // outcomes silently no-opped on web with zero visible feedback. This
    // mirrors the window.alert/window.confirm fallback already used in the
    // "email already registered" branch below.
    const showAlert = (
        title: string,
        message: string,
        buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[],
    ) => {
        if (Platform.OS === 'web') {
            const actionable = buttons?.filter(b => b.style !== 'cancel') ?? [];
            if (buttons && buttons.length > 1 && actionable.length >= 1) {
                if (window.confirm(`${title}\n\n${message}`)) actionable[0].onPress?.();
            } else {
                window.alert(`${title}\n\n${message}`);
                buttons?.[0]?.onPress?.();
            }
            return;
        }
        Alert.alert(title, message, buttons);
    };

    const handleSetup = async () => {
        if (!email.trim() || !business.trim()) {
            showAlert(t(setupLang, 'missingFields'), t(setupLang, 'email') + ' & ' + t(setupLang, 'businessName')); return;
        }
        if (!/^\d{6}$/.test(pin)) { showAlert(t(setupLang, 'error'), t(setupLang, 'invalidPin')); return; }
        if (pin !== confirmPin)   { showAlert(t(setupLang, 'error'), t(setupLang, 'pinMismatch')); return; }
        setSubmitting(true);
        try {
            setLanguage(setupLang);
            // Passed through setupAccount (not just updateSettings afterward) so
            // it's persisted before the post-signup settings-hydrate effect
            // resets/reloads settings — otherwise the chosen currency/industry can
            // be silently overwritten back to defaults by that reset.
            await setupAccount(email.trim(), business.trim(), pin, false, phone.trim(), { currency, industry });
            updateSettings({ currency, industry });
        } catch (e: any) {
            const msg: string = e?.message ?? '';
            if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered') || msg.toLowerCase().includes('user already exists') || msg.toLowerCase().includes('email address is already')) {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    const goSignIn = window.confirm(
                        'An account with this email already exists.\n\nPress OK to sign in, or Cancel to use a different email.'
                    );
                    if (goSignIn) { setMode('owner-login'); setLoginMethod('email'); setEmailLoginEmail(email.trim()); }
                } else {
                    Alert.alert(
                        'Email Already Registered',
                        'An account with this email already exists. Please sign in instead, or use a different email address.',
                        [
                            { text: 'Sign In', onPress: () => { setMode('owner-login'); setLoginMethod('email'); setEmailLoginEmail(email.trim()); } },
                            { text: 'Use Different Email', style: 'cancel' },
                        ]
                    );
                }
            } else {
                showAlert(t(setupLang, 'error'), msg || 'Could not create account. Please try again.');
            }
            setSubmitting(false);
        }
    };

    const handleLogin = async () => {
        if (isLockedOut && timeRemaining !== null && timeRemaining > 0) {
            showAlert(
                'Account Locked',
                `Too many failed login attempts. Please try again in ${Math.ceil(timeRemaining / 60)} minute${Math.ceil(timeRemaining / 60) !== 1 ? 's' : ''}.`,
            );
            return;
        }
        if (!returnPin) { showAlert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }
        const ok = await login(returnPin);
        if (!ok) {
            showAlert(t(language, 'error'), 'Incorrect PIN. Please try again.');
            setReturnPin('');
        }
    };

    const handleEmailLogin = async () => {
        if (isLockedOut && timeRemaining !== null && timeRemaining > 0) {
            showAlert(
                'Account Locked',
                `Too many failed login attempts. Please try again in ${Math.ceil(timeRemaining / 60)} minute${Math.ceil(timeRemaining / 60) !== 1 ? 's' : ''}.`,
            );
            return;
        }
        if (!emailLoginEmail.trim()) { showAlert(t(language, 'error'), 'Please enter your email address.'); return; }
        if (!emailLoginPin) { showAlert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }

        setSubmitting(true);
        let navigating = false;
        const email = emailLoginEmail.trim();
        try {
            // The PIN is never sent to Supabase as a credential — a 6-digit
            // PIN is far too small a space to be a real remote password (see
            // login()'s comment in OptimizedContexts.tsx for the full
            // reasoning). Only a device that already holds this account's
            // high-entropy secret (from a prior signup/recovery on this
            // device) can re-establish a session over the network; every
            // other case falls through to the local PIN check, which itself
            // handles migrating a legacy pre-secret account.
            const authSecret = await loadAuthSecret();
            if (authSecret) {
                const { error } = await supabase.auth.signInWithPassword({ email, password: authSecret });
                if (!error) {
                    await recoverAccount(email, emailLoginPin);
                    navigating = true;
                    identifyUser(email);
                    trackUserLoggedIn('email');
                    return;
                }
                // Secret didn't match this email (e.g. a different account was
                // set up on this device most recently) — fall through below.
            }
            const ok = await login(emailLoginPin);
            if (ok) { navigating = true; identifyUser(email); trackUserLoggedIn('email'); return; }
            showAlert('Sign In Failed', 'This device doesn\'t recognize that email and PIN yet. If this is a new device, use "Forgot PIN?" to verify your email and set it up.');
        } catch (e: any) {
            showAlert('Sign In Failed', 'Could not connect. Please check your internet connection and try again.');
        } finally {
            if (!navigating) setSubmitting(false);
        }
        setEmailLoginPin('');
    };

    const handleJoinTeam = async () => {
        if (!joinEmail.trim()) { showAlert(t(language, 'required'), t(language, 'email')); return; }
        if (!/^\d{6}$/.test(joinPin)) { showAlert(t(language, 'error'), t(language, 'invalidPin')); return; }
        if (joinPin !== joinConfirm)  { showAlert(t(language, 'error'), t(language, 'pinMismatch')); return; }
        if (!inviteCode.trim())       { showAlert(t(language, 'required'), t(language, 'inviteCode')); return; }
        setJoiningTeam(true);
        try {
            await joinTeam(joinEmail.trim(), joinPin, inviteCode.trim());
        } catch (e: any) {
            showAlert('Join Failed', e?.message ?? 'Invalid invite code or account error.');
            setJoiningTeam(false);
        }
    };

    const handleJoinLender = async () => {
        if (!lenderEmail.trim())        { showAlert(t(language, 'required'), t(language, 'email')); return; }
        if (!/^\d{6}$/.test(lenderPin)) { showAlert(t(language, 'error'), t(language, 'invalidPin')); return; }
        if (lenderPin !== lenderConfirm) { showAlert(t(language, 'error'), t(language, 'pinMismatch')); return; }
        if (!lenderInviteCode.trim())   { showAlert(t(language, 'required'), t(language, 'inviteCode')); return; }
        setJoiningLender(true);
        try {
            await joinAsLender(lenderEmail.trim(), lenderPin, lenderInviteCode.trim());
        } catch (e: any) {
            showAlert('Join Failed', e?.message ?? 'Invalid invite code or account error.');
            setJoiningLender(false);
        }
    };

    const handleResetRequest = async () => {
        if (!resetEmail.trim()) { showAlert('Error', 'Please enter your email address.'); return; }
        if (!/^\d{6}$/.test(resetNewPin)) { showAlert('Error', 'New PIN must be exactly 6 digits.'); return; }
        if (resetNewPin !== resetConfirmPin) { showAlert('Error', 'PINs do not match.'); return; }
        setResetSubmitting(true);
        try {
            const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
                ? window.location.origin + '/'
                : undefined;
            const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
            if (error) {
                const msg = error.message.toLowerCase();
                if (msg.includes('user not found') || msg.includes('not found')) {
                    showAlert('No Account Found', 'No account exists with that email address. Please check and try again.');
                } else {
                    showAlert('Error', error.message);
                }
            } else {
                setResetStep('verify');
            }
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'Failed to send reset email.');
        }
        setResetSubmitting(false);
    };

    // Called after user clicks email link on web — Supabase auto-sets session from URL hash
    const handleWebResetComplete = async () => {
        if (!/^\d{6}$/.test(resetNewPin)) { showAlert('Error', 'New PIN must be exactly 6 digits.'); return; }
        if (resetNewPin !== resetConfirmPin) { showAlert('Error', 'PINs do not match.'); return; }
        setResetSubmitting(true);
        try {
            // Wait briefly for Supabase to process the URL hash token
            await new Promise(r => setTimeout(r, 800));
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showAlert('Link Expired', 'This reset link has expired. Please request a new one.', [
                    { text: 'OK', onPress: () => { setResetStep('request'); setResetNewPin(''); setResetConfirmPin(''); } }
                ]);
                setResetSubmitting(false);
                return;
            }
            // A password reset is exactly the moment a device (re)establishes
            // trust with the account — the point to (re)generate this
            // device's high-entropy secret rather than ever deriving the
            // real Supabase password from the PIN.
            const newAuthSecret = generateAuthSecret();
            const { error } = await supabase.auth.updateUser({ password: newAuthSecret });
            if (error) {
                showAlert('Reset Failed', error.message + '\n\nPlease request a new reset link.', [
                    { text: 'Try Again', onPress: () => setResetStep('request') }
                ]);
                setResetSubmitting(false);
                return;
            }
            // Save PIN + the new secret locally and auto-login
            const email = session.user.email ?? '';
            await savePin(resetNewPin).catch(() => {});
            await saveAuthSecret(newAuthSecret).catch(() => {});
            await saveProfile({ email, businessName: '' }).catch(() => {});
            showAlert('PIN Reset Successful', 'Your new PIN is set. You are now logged in.', [
                { text: 'Continue', onPress: async () => {
                    try { await recoverAccount(email, resetNewPin); } catch {}
                    setResetStep('request'); setResetNewPin(''); setResetConfirmPin('');
                }}
            ]);
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'Reset failed. Please try again.');
            setResetStep('request');
        }
        setResetSubmitting(false);
    };

    const handleResetVerify = async () => {
        if (!/^\d{6}$/.test(resetOtp.trim())) { showAlert('Error', 'Please enter the 6-digit code from the email link.'); return; }
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
                showAlert('Invalid Code', 'The code is incorrect or has expired. Please request a new reset email.');
                setResetSubmitting(false);
                return;
            }
            // Same reasoning as handleWebResetComplete: this is the point to
            // (re)generate this device's real secret, never derive it from
            // the PIN, and save both locally so this device can log in
            // offline afterwards too.
            const newAuthSecret = generateAuthSecret();
            const { error: updateError } = await supabase.auth.updateUser({ password: newAuthSecret });
            if (updateError) {
                showAlert('Error', 'Could not update PIN: ' + updateError.message);
                setResetSubmitting(false);
                return;
            }
            const email = resetEmail.trim();
            await savePin(resetNewPin).catch(() => {});
            await saveAuthSecret(newAuthSecret).catch(() => {});
            await saveProfile({ email, businessName: '' }).catch(() => {});
            showAlert('PIN Reset Successful', 'Your new PIN is set. You are now logged in.', [
                { text: 'Continue', onPress: async () => {
                    try { await recoverAccount(email, resetNewPin); } catch {}
                    setResetStep('request'); setResetOtp(''); setResetNewPin(''); setResetConfirmPin('');
                }}
            ]);
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'Verification failed.');
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
                        <Text style={styles.brandTagline}>
                            The financial operating system every business trusts more than their bank balance.
                        </Text>
                        <Text style={styles.subtitle}>Sign in with your email and PIN to restore your account on this device.</Text>

                        <View style={styles.newDeviceBanner}>
                            <Icon name="smartphone" size={18} color={Colors.primary} />
                            <Text style={styles.newDeviceText}>
                                New device detected. If you've signed in here before, your email and PIN will restore your account. If this is the first time on this device, use "Forgot your PIN?" below to verify your email first.
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
                                <Icon name="chevron-right" size={18} color={Colors.primary} />
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

    // ── Join as Lender ────────────────────────────────────────────────────────
    if (mode === 'join-lender') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Text style={styles.title}>Join as Lender</Text>
                        <Text style={styles.subtitle}>
                            Use the invite code your Quad360 contact gave you to set up access to the financing pipeline for your organization.
                        </Text>

                        <Field label={t(language, 'yourEmail')}>
                            <TextInput style={styles.input} value={lenderEmail} onChangeText={setLenderEmail}
                                placeholder="you@lender.com" placeholderTextColor={Colors.muted}
                                autoCapitalize="none" keyboardType="email-address" />
                        </Field>
                        <Field label={t(language, 'newPin')}>
                            <TextInput style={styles.input} value={lenderPin} onChangeText={setLenderPin}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6} />
                        </Field>
                        <Field label={t(language, 'confirmPin')}>
                            <TextInput style={styles.input} value={lenderConfirm} onChangeText={setLenderConfirm}
                                placeholder="••••••" placeholderTextColor={Colors.muted}
                                secureTextEntry keyboardType="number-pad" maxLength={6} />
                        </Field>
                        <Field label={t(language, 'inviteCode')}>
                            <TextInput style={[styles.input, styles.codeInput]}
                                value={lenderInviteCode} onChangeText={v => setLenderInviteCode(v.toUpperCase())}
                                placeholder="ABC123" placeholderTextColor={Colors.muted}
                                autoCapitalize="characters" maxLength={6} />
                        </Field>

                        <TouchableOpacity style={[styles.btn, joiningLender && styles.btnDisabled]} onPress={handleJoinLender} disabled={joiningLender}>
                            {joiningLender
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnText}>Join as Lender</Text>
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
        // Shared across both layouts below -- the exact same fields, state,
        // and handlers either way, only the surrounding chrome differs.
        const languagePicker = (
            <>
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
            </>
        );

        const formFields = (
            <>
                <Field label={t(setupLang, 'email')}>
                    <TextInput style={styles.input} value={email} onChangeText={setEmail}
                        placeholder="admin@yourbusiness.com" placeholderTextColor={Colors.muted}
                        autoCapitalize="none" keyboardType="email-address" />
                </Field>
                <Field label="Phone Number (for financial health score)">
                    <TextInput style={styles.input} value={phone} onChangeText={setPhone}
                        placeholder="+1 555 000 1234" placeholderTextColor={Colors.muted}
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
                        <Icon name="chevron-down" size={16} color={Colors.muted} />
                    </TouchableOpacity>
                </Field>

                {/* Industry — drives which industry-specific tools show up later
                    (e.g. Recipe/Menu Item Costing only for Food Service), so it
                    doesn't clutter a retailer's or consultant's app. */}
                <Field label="What kind of business is this?">
                    {INDUSTRIES.map(ind => (
                        <TouchableOpacity
                            key={ind.value}
                            style={[styles.industryOption, industry === ind.value && styles.industryOptionActive]}
                            onPress={() => setIndustry(ind.value)}
                        >
                            <View style={styles.flex}>
                                <Text style={[styles.industryLabel, industry === ind.value && styles.industryLabelActive]}>{ind.label}</Text>
                                <Text style={styles.industryHint}>{ind.hint}</Text>
                            </View>
                            {industry === ind.value && <Icon name="check" size={16} color={Colors.primary} />}
                        </TouchableOpacity>
                    ))}
                </Field>

                <TouchableOpacity style={[styles.btn, submitting && styles.btnDisabled]} onPress={handleSetup} disabled={submitting}>
                    {submitting
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.btnText}>{t(setupLang, 'createAccount')}</Text>
                    }
                </TouchableOpacity>
                <View style={styles.trustNoteRow}>
                    <Icon name="lock" size={11} color={Colors.textMuted} />
                    <Text style={styles.trustNote}>Your data is encrypted and stored securely. We never share your information.</Text>
                </View>
                <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('join-team')}>
                    <Text style={styles.switchText}>{t(setupLang, 'joiningTeam')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('join-lender')}>
                    <Text style={styles.switchText}>Are you a lender? Join with invite code →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.switchBtn} onPress={() => { setEmailLoginEmail(email); setMode('recover'); }}>
                    <Text style={styles.switchText}>Already have an account? Sign In →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.demoBtn} onPress={() => setMode('demo-pick')}>
                    <Icon name="eye" size={13} color={Colors.primary} />
                    <Text style={styles.demoBtnText}>Try Demo (No sign-up needed)</Text>
                </TouchableOpacity>
            </>
        );

        const currencyModal = (
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
                                    {currency === c.value && <Icon name="check" size={16} color={Colors.primary} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        );

        // Wide web only -- narrow/native rendering (below) is completely
        // untouched by this branch.
        if (isWideWebSetup) {
            return (
                <SafeAreaView style={styles.safe}>
                    <View style={styles.splitShell}>
                        <View style={styles.splitBrand}>
                            <View style={styles.splitBrandMid}>
                                <Image source={require('../../assets/icon.png')} style={styles.splitLogo} />
                                <Text style={styles.splitHeadline}>
                                    The financial operating system every business trusts more than their bank balance.
                                </Text>
                                <Text style={styles.splitSub}>
                                    Turn your cash flow, invoices, and debt into a real financing case — then find financing built for what your business can prove.
                                </Text>
                            </View>
                            <View style={styles.socialProofSetup}>
                                <View style={styles.socialProofPill}>
                                    <Text style={styles.socialProofPillText}>Free forever · No credit card</Text>
                                </View>
                                <View style={styles.socialProofPill}>
                                    <Text style={styles.socialProofPillText}>Built for SMEs across Africa & beyond</Text>
                                </View>
                                <View style={styles.socialProofPill}>
                                    <Text style={styles.socialProofPillText}>Your data stays private</Text>
                                </View>
                            </View>
                        </View>

                        <ScrollView style={styles.splitFormPanel} contentContainerStyle={styles.splitFormPanelContent} keyboardShouldPersistTaps="handled">
                            <View style={styles.splitFormCard}>
                                <Text style={styles.splitFormTitle}>{t(setupLang, 'createAccount')}</Text>
                                <Text style={[styles.subtitle, styles.splitFormSubtitle]}>{t(setupLang, 'setupSubtitle')}</Text>
                                {languagePicker}
                                {formFields}
                            </View>
                        </ScrollView>
                    </View>
                    {currencyModal}
                </SafeAreaView>
            );
        }

        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.brandTagline}>
                            The financial operating system every business trusts more than their bank balance.
                        </Text>
                        <Text style={styles.subtitle}>{t(setupLang, 'setupSubtitle')}</Text>

                        {/* Social proof strip */}
                        <View style={styles.socialProofSetup}>
                            <View style={styles.socialProofPill}>
                                <Text style={styles.socialProofPillText}>Free forever · No credit card</Text>
                            </View>
                            <View style={styles.socialProofPill}>
                                <Text style={styles.socialProofPillText}>Built for SMEs across Africa & beyond</Text>
                            </View>
                            <View style={styles.socialProofPill}>
                                <Text style={styles.socialProofPillText}>Your data stays private</Text>
                            </View>
                        </View>

                        {languagePicker}
                        {formFields}
                    </View>
                </ScrollView>
                {currencyModal}
            </SafeAreaView>
        );
    }

    // ── Owner return login ────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Image source={require('../../assets/icon.png')} style={styles.logo} />
                    <Text style={styles.brandTagline}>
                        The financial operating system every business trusts more than their bank balance.
                    </Text>
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
                        <Text style={styles.socialProofText}>Built for SMEs across Africa & beyond</Text>
                    </View>

                    {isLockedOut && timeRemaining !== null && timeRemaining > 0 && (
                        <View style={styles.lockoutBanner}>
                            <Icon name="lock" size={14} color={Colors.danger} />
                            <Text style={styles.lockoutText}>
                                Too many failed attempts. Try again in {Math.ceil(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                            </Text>
                        </View>
                    )}

                    {/* Login Method Tabs */}
                    <View style={styles.methodTabRow}>
                        <TouchableOpacity
                            style={[styles.methodTab, loginMethod === 'pin' && styles.methodTabActive]}
                            onPress={() => setLoginMethod('pin')}
                        >
                            <Text style={[styles.methodTabText, loginMethod === 'pin' && styles.methodTabTextActive]}>PIN</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.methodTab, loginMethod === 'email' && styles.methodTabActive]}
                            onPress={() => setLoginMethod('email')}
                        >
                            <Text style={[styles.methodTabText, loginMethod === 'email' && styles.methodTabTextActive]}>Email</Text>
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
                            <Text style={{ textAlign: 'center', color: Colors.muted, fontSize: 12, marginTop: 8 }}>
                                New device or browser? Use the <Text style={{ color: Colors.primary }} onPress={() => setLoginMethod('email')}>Email tab</Text> instead.
                            </Text>
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
                            <TouchableOpacity style={[styles.btn, submitting && styles.btnDisabled]} onPress={handleEmailLogin} disabled={submitting}>
                                {submitting
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.btnText}>Unlock</Text>
                                }
                            </TouchableOpacity>
                        </>
                    )}

                    <TouchableOpacity style={styles.switchBtn} onPress={() => { setEmail(''); setBusiness(''); setPin(''); setConfirm(''); setMode('owner-setup'); }}>
                        <Text style={styles.switchText}>Don't have an account? Sign Up →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('join-team')}>
                        <Text style={styles.switchText}>{t(language, 'joiningTeam')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('join-lender')}>
                        <Text style={styles.switchText}>Are you a lender? Join with invite code →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.resetBtn} onPress={() => {
                        setResetEmail(''); setResetNewPin(''); setResetConfirmPin(''); setResetOtp(''); setResetStep('request');
                        setMode('reset-pin');
                    }}>
                        <Text style={styles.resetText}>Forgot your PIN? Reset it in 2 minutes →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.demoBtn} onPress={() => setMode('demo-pick')}>
                        <Icon name="eye" size={13} color={Colors.primary} />
                        <Text style={styles.demoBtnText}>Try Demo First (No sign-up needed)</Text>
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
        backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xxl,
        borderWidth: 1, borderColor: Colors.border,
        ...Shadow.lg,
    },
    logo:     { width: 80, height: 80, alignSelf: 'center', borderRadius: Radius.lg, marginBottom: 8, ...Shadow.md },
    title:    { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center' },
    brandTagline: { fontSize: 12.5, color: Colors.primary, textAlign: 'center', fontStyle: 'italic', lineHeight: 17, marginTop: 2, marginBottom: 6 },
    subtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 20, marginTop: 4 },

    // Wide-web-only split layout for owner-setup (see isWideWebSetup) --
    // reuses the same Colors tokens as the rest of the app, so it follows
    // whichever theme (dark / warm-paper) the device already has set,
    // rather than a fixed palette of its own.
    splitShell: { flex: 1, flexDirection: 'row' },
    splitBrand: {
        width: '42%', maxWidth: 480, minWidth: 360,
        backgroundColor: Colors.surface, borderRightWidth: 1, borderRightColor: Colors.border,
        padding: 48, justifyContent: 'space-between',
    },
    splitBrandMid: { flex: 1, justifyContent: 'center' },
    splitLogo: { width: 56, height: 56, borderRadius: Radius.lg, marginBottom: 28, ...Shadow.md },
    splitHeadline: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, lineHeight: 40, marginBottom: 16 },
    splitSub: { fontSize: 15, color: Colors.textSecondary, lineHeight: 23, maxWidth: 420 },
    splitFormPanel: { flex: 1, backgroundColor: Colors.bg },
    splitFormPanelContent: { flexGrow: 1, justifyContent: 'center', padding: 56 },
    splitFormCard: { maxWidth: 440, width: '100%', alignSelf: 'center' },
    splitFormTitle: { fontSize: 25, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
    splitFormSubtitle: { textAlign: 'left', marginTop: 0, marginBottom: 24 },

    group: { marginBottom: 14 },
    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    codeInput: { fontSize: 20, letterSpacing: 8, textAlign: 'center', fontWeight: 'bold' },

    sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip:         { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.pill, backgroundColor: Colors.bg },
    chipActive:   { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    chipText:     { fontSize: 12, color: Colors.textMuted },
    chipTextActive: { color: Colors.primary, fontWeight: '600' },

    currencyRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
        backgroundColor: Colors.bg, paddingHorizontal: 14, paddingVertical: 13,
    },
    currencySelected: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },

    flex: { flex: 1 },
    industryOption: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
        backgroundColor: Colors.bg, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    industryOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
    industryLabel: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    industryLabelActive: { color: Colors.primary },
    industryHint: { fontSize: 11, color: Colors.muted, marginTop: 2, lineHeight: 15 },
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

    btn:        { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginTop: 4, ...Shadow.sm },
    btnDisabled: { opacity: 0.6 },
    btnText:    { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    switchBtn:  { paddingVertical: 14, alignItems: 'center' },
    switchText: { color: Colors.primary, fontSize: 13 },
    resetBtn:   { paddingVertical: 10, alignItems: 'center' },
    resetText:  { color: Colors.danger, fontSize: 12 },
    trustNoteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10 },
    trustNote:  { fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },

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
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.danger + '18', borderWidth: 1, borderColor: Colors.danger,
        borderRadius: Radius.md, padding: 12, marginBottom: 16,
    },
    lockoutText: { flex: 1, color: Colors.danger, fontSize: 13, fontWeight: '600' },

    // Segmented control — a pill-shaped track with a solid active segment
    // reads as one deliberate control, unlike the flat two-button row this
    // replaced (which also happened to hardcode colors outside the theme).
    methodTabRow: {
        flexDirection: 'row',
        backgroundColor: Colors.bg,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 4,
        marginBottom: 16,
        gap: 4,
    },
    methodTab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: Radius.sm,
        alignItems: 'center',
    },
    methodTabActive: {
        backgroundColor: Colors.primary,
        ...Shadow.sm,
    },
    methodTabText: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.textMuted,
    },
    methodTabTextActive: {
        color: '#fff',
    },

    demoBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 12, paddingVertical: 12, borderRadius: Radius.md,
        borderWidth: 1, borderColor: Colors.primary, backgroundColor: 'transparent',
    },
    demoBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },

    newDeviceBanner: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: Colors.primary + '18', borderWidth: 1,
        borderColor: Colors.primary, borderRadius: Radius.lg,
        padding: 14, marginBottom: 20, gap: 10,
    },
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
