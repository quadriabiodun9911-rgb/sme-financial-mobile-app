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
import { supabase, createEphemeralAuthClient } from '../utils/supabase';
import { savePin, saveProfile, generateAuthSecret, saveAuthSecret, loadAuthSecret, loadProfile, localProfileMatchesEmail, syncFieldEncryptionKey, registerLocalAccount } from '../utils/storage';
import { Industry } from '../types';

const CURRENCIES = [
    { label: 'USD ($)',    value: '$',   code: 'USD' },
    { label: 'GBP (£)',   value: '£',   code: 'GBP' },
    { label: 'EUR (€)',   value: '€',   code: 'EUR' },
    { label: 'NGN (₦)',   value: '₦',   code: 'NGN' },
    { label: 'ZAR (R)',   value: 'R',   code: 'ZAR' },
    { label: 'KES (KSh)', value: 'KSh', code: 'KES' },
    { label: 'GHS (₵)',   value: '₵',   code: 'GHS' },
    { label: 'EGP (E£)',  value: 'E£',  code: 'EGP' },
    { label: 'AED (د.إ)', value: 'AED', code: 'AED' },
    { label: 'INR (₹)',   value: '₹',   code: 'INR' },
    { label: 'CNY (¥)',   value: '¥',   code: 'CNY' },
    { label: 'CAD (C$)',  value: 'C$',  code: 'CAD' },
    { label: 'AUD (A$)',  value: 'A$',  code: 'AUD' },
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

// Same region map as detectLocaleCurrency, in ISO codes rather than
// symbols -- kept as a sibling function (not a derived lookup) so the two
// can't drift silently out of sync with each other's region list.
function detectLocaleCurrencyCode(): string {
    try {
        if (typeof Intl !== 'undefined') {
            const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
            const region = locale.split('-')[1]?.toUpperCase();
            const map: Record<string, string> = {
                ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', EG: 'EGP',
                GB: 'GBP', DE: 'EUR', FR: 'EUR', AE: 'AED', IN: 'INR',
                CN: 'CNY', CA: 'CAD', AU: 'AUD',
            };
            if (region && map[region]) return map[region];
        }
    } catch {}
    return 'USD';
}

type Mode = 'owner-setup' | 'owner-login' | 'join-team' | 'join-lender' | 'reset-pin' | 'demo-pick' | 'recover';
type LoginMethod = 'pin' | 'email';

export default function LoginScreen() {
    const { isFirstLaunch, setupAccount, login, joinTeam, requestJoinRecoveryOtp, completeJoinWithOtp, joinAsLender, enterDemo, enterGuest, isDemoMode, transactions, assets, loans, inventory, invoices, settings, language, setLanguage, updateSettings, resetApp, isLockedOut, lockoutUntil, recoverAccount, navParams, recordConsent, navigate, localAccounts, switchAccount, refreshLocalAccounts } = useApp();
    // The split-screen setup layout only applies on wide web viewports --
    // narrow/native rendering is untouched, so the primary mobile
    // experience carries zero risk from this. 900px comfortably fits the
    // two-column layout without cramping the brand panel.
    const { width: windowWidth } = useWindowDimensions();
    const isWideWebSetup = Platform.OS === 'web' && windowWidth >= 900;
    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied to the currency picker
    // sheet so it doesn't stretch full-bleed on desktop.
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;
    // LandingScreen's Login/Sign Up/Try Demo/Join as Lender buttons pass an
    // explicit starting mode via navParams so each button opens the form it
    // promised, rather than this screen guessing from isFirstLaunch (which
    // reflects "does this device have a saved profile," not what the
    // visitor just clicked).
    const initialMode: Mode = (navParams?.mode as Mode | undefined) ?? (isFirstLaunch ? 'owner-setup' : 'owner-login');
    const [mode, setMode] = useState<Mode>(initialMode);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [loginMethod, setLoginMethod] = useState<LoginMethod>('pin');

    useEffect(() => {
        // Skip when an explicit mode was requested (LandingScreen's
        // Login/Sign Up/Try Demo/Join as Lender buttons) -- this effect
        // existed to keep `mode` in sync with isFirstLaunch for the
        // no-params entry path, but it ran unconditionally on every mount
        // and silently clobbered any explicitly-requested mode back to
        // owner-setup/owner-login a moment after render, which is why
        // e.g. "Try Demo" and "Join as Lender" from the landing page
        // always landed on the Create Account form instead.
        if (navParams?.mode) return;
        setMode(isFirstLaunch ? 'owner-setup' : 'owner-login');
    }, [isFirstLaunch, navParams]);

    // On web: detect a Supabase recovery/magic-link callback via the URL
    // hash's classic implicit-flow shape (#access_token=...&type=...).
    // The tokens are captured into recoveryTokens (state, above) rather
    // than left for handleWebResetComplete/handleDeviceVerifyComplete to
    // re-read window.location.hash later -- replaceState below clears the
    // hash immediately, long before the user finishes typing a new PIN and
    // submits. The main `supabase` client deliberately does NOT auto-adopt
    // this token itself (detectSessionInUrl is off -- see utils/supabase.ts
    // for why); the reset/verify handlers exchange it for a session on an
    // isolated client instead, so landing on this link can never silently
    // swap which account this browser's shared session is signed in as.
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace('#', '?'));
        const type = params.get('type');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if ((type === 'recovery' || type === 'signup') && accessToken && refreshToken) {
            setRecoveryTokens({ accessToken, refreshToken });
            setMode('reset-pin');
            setResetStep('complete-web');
            window.history.replaceState(null, '', window.location.pathname);
        }
        // A magic-link landing (device verification, not a PIN reset) has no
        // distinct auth event the way PASSWORD_RECOVERY does -- signInWithOtp
        // just fires a plain SIGNED_IN, which is too generic to key off
        // (ordinary password logins fire it too). This hash check is the
        // only reliable signal, same best-effort caveat as the recovery
        // check above.
        if (type === 'magiclink' && accessToken && refreshToken) {
            setRecoveryTokens({ accessToken, refreshToken });
            setResetIntent('verify-device');
            setMode('reset-pin');
            setResetStep('confirm-device');
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
    const [currencyCode, setCurrencyCode] = useState(detectLocaleCurrencyCode);
    const [industry, setIndustry]   = useState<Industry>('general');
    const [setupLang, setSetupLang] = useState<Language>(language);
    const [submitting, setSubmitting] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);

    // Owner return
    const [returnPin, setReturnPin] = useState('');
    const [emailLoginEmail, setEmailLoginEmail] = useState('');
    const [emailLoginPin, setEmailLoginPin] = useState('');

    // Switch Account — which of this device's other known accounts (if any)
    // is currently being switched to, and its inline PIN prompt. See
    // localAccounts/switchAccount (OptimizedContexts.tsx) for why this
    // exists: the PIN-unlock screen only ever showed whichever ONE account
    // was last active on this device, so a second account sharing the same
    // browser had no way in without evicting the first.
    const [activeAccountEmail, setActiveAccountEmail] = useState<string | null>(null);
    const [switchTarget, setSwitchTarget] = useState<string | null>(null);
    const [switchPin, setSwitchPin] = useState('');
    const [switchSubmitting, setSwitchSubmitting] = useState(false);

    useEffect(() => {
        loadProfile().then(p => setActiveAccountEmail(p?.email ?? null)).catch(() => {});
    }, [localAccounts]);

    const otherLocalAccounts = localAccounts.filter(a => a.email.toLowerCase() !== (activeAccountEmail ?? '').toLowerCase());

    const handleSwitchAccount = async (targetEmail: string) => {
        if (!/^\d{6}$/.test(switchPin)) { showAlert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }
        setSwitchSubmitting(true);
        try {
            const result = await switchAccount(targetEmail, switchPin);
            if (result === 'ok') {
                setSwitchTarget(null); setSwitchPin('');
                identifyUser(targetEmail);
                trackUserLoggedIn('switch-account');
            } else if (result === 'wrong-pin') {
                showAlert(t(language, 'error'), 'Incorrect PIN for that account. Please try again.');
                setSwitchPin('');
            } else {
                showAlert(t(language, 'error'), 'That account is no longer available on this device.');
                setSwitchTarget(null); setSwitchPin('');
            }
        } finally {
            setSwitchSubmitting(false);
        }
    };

    // Join team
    const [joinEmail, setJoinEmail]     = useState('');
    const [joinPin, setJoinPin]         = useState('');
    const [joinConfirm, setJoinConfirm] = useState('');
    const [inviteCode, setInviteCode]   = useState('');
    const [joiningTeam, setJoiningTeam] = useState(false);
    // Set when joinTeam signals JOIN_ACCOUNT_RECOVERY_NEEDED -- an earlier
    // join attempt already created the Supabase Auth account but never
    // finished claiming the invite, so this device's password guess can
    // never match. Switches the form into an OTP step instead of a
    // dead-end "invalid login credentials" alert.
    const [joinNeedsRecovery, setJoinNeedsRecovery] = useState(false);
    const [joinOtp, setJoinOtp]         = useState('');
    const [joinOtpSending, setJoinOtpSending] = useState(false);
    const [joinOtpSubmitting, setJoinOtpSubmitting] = useState(false);

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
    // Read from navParams so a recovery link detected at the top level
    // (AuthProvider, see the matching comment there) can land directly on
    // the "set a new PIN" step instead of the request-email step.
    const [resetStep, setResetStep]           = useState<'request' | 'verify' | 'complete-web' | 'confirm-device'>((navParams?.resetStep as any) ?? 'request');
    const [resetSubmitting, setResetSubmitting] = useState(false);
    // Distinguishes "I forgot my PIN" (resetPasswordForEmail — rotates this
    // account's real Supabase credential, correctly invalidating any other
    // device's stored secret) from "this is a new device" (signInWithOtp —
    // a magic link that authenticates without touching the shared
    // credential at all). Conflating these used to mean verifying a second
    // device silently broke sign-in on the first one, since Supabase only
    // has one password per account and every PIN-unlock re-derives a
    // session from whichever device's secret is currently set. See
    // handleResetRequest and the 'confirm-device' step below.
    const [resetIntent, setResetIntent]       = useState<'forgot-pin' | 'verify-device'>((navParams?.resetIntent as any) ?? 'forgot-pin');
    // Captured from the recovery/magic-link URL hash the moment it's seen
    // (see the hash-detection effect below) -- the hash gets cleared via
    // history.replaceState right after, well before the user finishes
    // typing a new PIN and submits, so handleWebResetComplete/
    // handleDeviceVerifyComplete can't just re-read window.location.hash
    // themselves. These are exchanged for a session on a throwaway client
    // (see createEphemeralAuthClient's comment) rather than the shared one.
    const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

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
        if (!agreedToTerms) { showAlert(t(setupLang, 'error'), 'Please agree to the Privacy Policy to continue.'); return; }
        setSubmitting(true);
        try {
            setLanguage(setupLang);
            // Converting from Guest Mode: capture whatever's currently in
            // memory (uploaded/entered while browsing as a guest) so
            // setupAccount can carry it into the new account instead of
            // losing it to its own anti-leak cache clear -- see that
            // function's guestData handling. Also carry forward the guest
            // session's own settings (e.g. currency they were already
            // using) rather than only the form's fresh currency/industry
            // picks, which take priority via the spread order below.
            const guestData = isDemoMode
                ? { transactions, assets, loans, inventory, invoices }
                : undefined;
            // Passed through setupAccount (not just updateSettings afterward) so
            // it's persisted before the post-signup settings-hydrate effect
            // resets/reloads settings — otherwise the chosen currency/industry can
            // be silently overwritten back to defaults by that reset.
            await setupAccount(
                email.trim(), business.trim(), pin, false, phone.trim(),
                isDemoMode ? { ...settings, currency, currencyCode, industry } : { currency, currencyCode, industry },
                guestData,
            );
            updateSettings({ currency, currencyCode, industry });
            // Fire-and-forget: recording consent must never block a
            // signup that already succeeded — see recordConsent's own
            // no-op-on-failure contract in storage.ts.
            recordConsent('privacy_policy', 'draft-v1');
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
        // An incomplete PIN (e.g. Enter pressed before all 6 digits are
        // typed) would otherwise still reach login() and burn one of the
        // 5 attempts before the lockout on a submission that was never
        // going to be correct -- validate the shape first, same as the
        // signup form already does, so only a real guess counts.
        if (!/^\d{6}$/.test(returnPin)) { showAlert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }
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
        // Same reasoning as handleLogin above -- an incomplete PIN must not
        // reach the local PIN check and burn one of the 5 lockout attempts.
        if (!/^\d{6}$/.test(emailLoginPin)) { showAlert(t(language, 'error'), 'Please enter your 6-digit PIN.'); return; }

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
            // login(pin) is a PURELY LOCAL check -- see
            // localProfileMatchesEmail's comment (storage.ts) for why it
            // must not run here unless the locally cached profile actually
            // belongs to the email that was typed.
            const localProfile = await loadProfile();
            const ok = localProfileMatchesEmail(localProfile, email) && await login(emailLoginPin);
            if (ok) { navigating = true; identifyUser(email); trackUserLoggedIn('email'); return; }
            // Neither the active session nor the active local profile is
            // this email -- but this device may still know it as a SECOND
            // registered account (e.g. just reset or verified while a
            // different account was active here, see the PIN-reset/
            // device-verify flows). switchAccount checks the on-device
            // registry directly rather than only the single active slot,
            // so a known second account signs in here exactly like the
            // first one would, instead of wrongly reporting this device
            // as never having seen it.
            const switchResult = await switchAccount(email, emailLoginPin);
            if (switchResult === 'ok') { navigating = true; identifyUser(email); trackUserLoggedIn('switch-account'); return; }
            if (switchResult === 'wrong-pin') {
                showAlert(t(language, 'error'), 'Incorrect PIN. Please try again.');
                return;
            }
            // A brand-new device holds neither a local profile nor the
            // account's real secret, so this failure is expected, not a
            // dead end -- verifying by email (the flow below) is the actual
            // way to authenticate on a device that's never seen this
            // account before. Routing straight there with the email already
            // filled in turns "read an error, go find the right button,
            // retype your email" into one tap.
            showAlert('Sign In Failed', 'This device doesn\'t recognize that email and PIN yet. Verify your email to set it up here.', [
                { text: 'Verify Email', onPress: () => {
                    setResetEmail(email); setResetNewPin(''); setResetConfirmPin(''); setResetOtp('');
                    setResetIntent('verify-device'); setResetStep('request'); setMode('reset-pin');
                } },
                { text: 'Try Again', style: 'cancel' },
            ]);
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
            if (e?.message === 'JOIN_ACCOUNT_RECOVERY_NEEDED') {
                setJoiningTeam(false);
                await handleRequestJoinRecoveryOtp();
                return;
            }
            showAlert('Join Failed', e?.message ?? 'Invalid invite code or account error.');
            setJoiningTeam(false);
        }
    };

    // A previous join attempt already created this email's Supabase Auth
    // account but never finished claiming the invite (e.g. it hit the RLS
    // recursion bug that has since been fixed), so no password typed here
    // can ever match. Proves ownership via a one-time email code instead,
    // then rotates the account's password and completes the join --
    // exactly what a Dashboard-side "delete the orphaned user" manual fix
    // achieved before, but self-service.
    const handleRequestJoinRecoveryOtp = async () => {
        setJoinOtpSending(true);
        try {
            await requestJoinRecoveryOtp(joinEmail.trim());
            setJoinNeedsRecovery(true);
        } catch (e: any) {
            showAlert('Join Failed', e?.message ?? 'Could not send a verification code. Please try again.');
        } finally {
            setJoinOtpSending(false);
        }
    };

    const handleCompleteJoinWithOtp = async () => {
        if (!/^\d{4,8}$/.test(joinOtp.trim())) { showAlert(t(language, 'error'), 'Enter the code we emailed you.'); return; }
        setJoinOtpSubmitting(true);
        try {
            await completeJoinWithOtp(joinEmail.trim(), joinOtp.trim(), joinPin, inviteCode.trim());
        } catch (e: any) {
            showAlert('Join Failed', e?.message ?? 'That code didn\'t work. Please try again.');
        } finally {
            setJoinOtpSubmitting(false);
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
        setResetSubmitting(true);
        try {
            const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
                ? window.location.origin + '/'
                : undefined;
            // verify-device (a new phone/laptop, PIN unchanged) uses a magic
            // link, which authenticates without touching this account's real
            // Supabase credential at all -- forgot-pin uses the password
            // reset, which deliberately does rotate it. See the resetIntent
            // state comment for why conflating these broke multi-device use.
            const { error } = resetIntent === 'verify-device'
                ? await supabase.auth.signInWithOtp({ email: resetEmail.trim(), options: { emailRedirectTo: redirectTo, shouldCreateUser: false } })
                : await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
            if (error) {
                const msg = error.message.toLowerCase();
                if (msg.includes('user not found') || msg.includes('not found') || msg.includes('signups not allowed')) {
                    showAlert('No Account Found', 'No account exists with that email address. Please check and try again.');
                } else {
                    showAlert('Could Not Send Reset Link', error.message);
                }
            } else {
                setResetStep('verify');
            }
        } catch (e: any) {
            showAlert('Could Not Send Reset Link', e?.message ?? 'Something went wrong. Please try again.');
        }
        setResetSubmitting(false);
    };

    // Called after the user clicks the reset-email link on web, which opens
    // in a fresh tab -- possibly while a DIFFERENT account is still active
    // in another tab on this same browser. The recovery token is exchanged
    // for a session on a throwaway client (see createEphemeralAuthClient's
    // comment in utils/supabase.ts) specifically so that never touches this
    // browser's shared session -- only once we know WHICH account this link
    // was for do we decide whether it's safe to make it the active one here.
    const handleWebResetComplete = async () => {
        if (!/^\d{6}$/.test(resetNewPin)) { showAlert('Error', 'New PIN must be exactly 6 digits.'); return; }
        if (resetNewPin !== resetConfirmPin) { showAlert('Error', 'PINs do not match.'); return; }
        if (!recoveryTokens) {
            showAlert('Link Expired', 'This reset link has expired. Please request a new one.', [
                { text: 'OK', onPress: () => { setResetStep('request'); setResetNewPin(''); setResetConfirmPin(''); } }
            ]);
            return;
        }
        setResetSubmitting(true);
        const ephemeral = createEphemeralAuthClient();
        try {
            const { data: { session }, error: sessionError } = await ephemeral.auth.setSession({
                access_token: recoveryTokens.accessToken,
                refresh_token: recoveryTokens.refreshToken,
            });
            if (sessionError || !session) {
                showAlert('Link Expired', 'This reset link has expired. Please request a new one.', [
                    { text: 'OK', onPress: () => { setResetStep('request'); setResetNewPin(''); setResetConfirmPin(''); } }
                ]);
                return;
            }
            // A password reset is exactly the moment a device (re)establishes
            // trust with the account — the point to (re)generate this
            // device's high-entropy secret rather than ever deriving the
            // real Supabase password from the PIN. Applied on the ephemeral
            // client -- it's this account's real credential either way,
            // regardless of which browser/tab happens to be doing the reset.
            const newAuthSecret = generateAuthSecret();
            const { error } = await ephemeral.auth.updateUser({ password: newAuthSecret });
            if (error) {
                showAlert('Reset Failed', error.message + '\n\nPlease request a new reset link.', [
                    { text: 'Try Again', onPress: () => setResetStep('request') }
                ]);
                return;
            }
            const email = session.user.email ?? '';
            const activeProfile = await loadProfile();
            const isDifferentActiveAccount = !!activeProfile
                && activeProfile.email.trim().toLowerCase() !== email.trim().toLowerCase();

            if (isDifferentActiveAccount) {
                // This browser is currently signed in to a DIFFERENT
                // account -- overwriting the active pin/profile/authSecret
                // slots (or this tab's live session) here would silently
                // evict it, which is exactly the "resetting one account
                // affects the other" bug. Just remember this account for
                // the Switch Account list instead; nothing about the
                // currently active account is touched.
                await registerLocalAccount(email, '', resetNewPin, newAuthSecret, new Date().toISOString()).catch(() => {});
                // Registering directly via storage.ts bypasses every
                // context method that would normally refresh the
                // AuthProvider's own localAccounts state -- without this,
                // Switch Account wouldn't list this account until the next
                // full reload.
                await refreshLocalAccounts().catch(() => {});
                const resetPinForSwitch = resetNewPin;
                showAlert(
                    'PIN Reset Successful',
                    `${email}'s PIN has been reset. This device is still signed in to ${activeProfile!.email}.`,
                    [
                        { text: 'Switch to ' + email, onPress: async () => {
                            // The user just proved they know this account's
                            // new PIN by setting it -- that's as explicit a
                            // signal to switch as asking again would be, so
                            // do it directly instead of sending them to find
                            // the Email tab or Switch Account themselves and
                            // retype what they just typed.
                            const result = await switchAccount(email, resetPinForSwitch);
                            if (result !== 'ok') {
                                // Very unlikely (the PIN was just set moments
                                // ago) -- fall back to a pre-filled Email tab
                                // rather than leaving the user stuck.
                                setLoginMethod('email'); setEmailLoginEmail(email); setEmailLoginPin('');
                            }
                            setResetStep('request'); setResetNewPin(''); setResetConfirmPin(''); setMode('owner-login');
                        } },
                        { text: `Stay signed in to ${activeProfile!.email}`, style: 'cancel', onPress: () => {
                            setResetStep('request'); setResetNewPin(''); setResetConfirmPin(''); setMode('owner-login');
                        } },
                    ],
                );
                return;
            }

            // Same account (or nothing else active on this device) — safe
            // to become the active session here, same as before. Capture
            // the field-encryption key on the ephemeral client BEFORE
            // overwriting the local auth secret below -- if this device
            // still holds the pre-reset secret and Supabase has no
            // canonical key yet, this is the last moment it can be
            // recovered and published for every future device/reset to
            // converge on, instead of the new secret silently minting an
            // incompatible key and orphaning existing data.
            await syncFieldEncryptionKey(ephemeral).catch(() => {});
            await savePin(resetNewPin).catch(() => {});
            await saveAuthSecret(newAuthSecret).catch(() => {});
            await saveProfile({ email, businessName: activeProfile?.businessName ?? '' }).catch(() => {});
            showAlert('PIN Reset Successful', 'Your new PIN is set. You are now logged in.', [
                { text: 'Continue', onPress: async () => {
                    try {
                        await supabase.auth.signInWithPassword({ email, password: newAuthSecret });
                        await recoverAccount(email, resetNewPin);
                    } catch {}
                    setResetStep('request'); setResetNewPin(''); setResetConfirmPin('');
                }}
            ]);
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'Reset failed. Please try again.');
            setResetStep('request');
        } finally {
            setRecoveryTokens(null);
            setResetSubmitting(false);
            // scope: 'local' matters here -- the default ('global') revokes
            // the refresh token for EVERY session this account has, on
            // every device, not just this throwaway client (see
            // createEphemeralAuthClient's comment: it "holds no state worth
            // keeping around," which was never meant to imply logging the
            // account out everywhere). This client's own session was never
            // persisted, so there's nothing server-side that needs revoking
            // -- just drop it locally.
            await ephemeral.auth.signOut({ scope: 'local' }).catch(() => {});
        }
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
            // See the matching comment in handleWebResetComplete -- must run
            // before the local secret is overwritten below.
            await syncFieldEncryptionKey().catch(() => {});
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

    // Called after a magic-link click — device verification, not a password
    // reset, so in the common case this never touches the account's shared
    // Supabase credential (see the resetIntent comment). The click already
    // proved this device can read the account's email; this step just
    // confirms the user knows the existing PIN and saves it as this
    // device's own local unlock. login()'s cloud reconnection is
    // best-effort and never gates its return value (see its comment in
    // OptimizedContexts.tsx), so leaving this device without its own auth
    // secret is fine in that case — the session this magic link just
    // established is what keeps it synced going forward. As with PIN reset,
    // the token is exchanged for a session on a throwaway client first so
    // simply opening the link can never silently swap which account a
    // DIFFERENT already-active tab on this browser is signed in as.
    const handleDeviceVerifyComplete = async () => {
        if (!/^\d{6}$/.test(resetNewPin)) { showAlert('Error', 'Enter your 6-digit PIN.'); return; }
        if (!recoveryTokens) {
            showAlert('Link Expired', 'This verification link has expired. Please request a new one.', [
                { text: 'OK', onPress: () => { setResetStep('request'); setResetNewPin(''); } }
            ]);
            return;
        }
        setResetSubmitting(true);
        const ephemeral = createEphemeralAuthClient();
        try {
            const { data: { session }, error: sessionError } = await ephemeral.auth.setSession({
                access_token: recoveryTokens.accessToken,
                refresh_token: recoveryTokens.refreshToken,
            });
            if (sessionError || !session) {
                showAlert('Link Expired', 'This verification link has expired. Please request a new one.', [
                    { text: 'OK', onPress: () => { setResetStep('request'); setResetNewPin(''); } }
                ]);
                return;
            }
            const email = session.user.email ?? '';
            const activeProfile = await loadProfile();
            const isDifferentActiveAccount = !!activeProfile
                && activeProfile.email.trim().toLowerCase() !== email.trim().toLowerCase();

            if (isDifferentActiveAccount) {
                // Adding a SECOND account to this device via device-verify,
                // same situation as PIN-reset's cross-account branch. Unlike
                // the common case above, this needs a real secret to be
                // registered for Switch Account -- mint one via the same
                // ephemeral client, again never touching this browser's
                // live session or the currently active account's slots.
                const newAuthSecret = generateAuthSecret();
                const { error } = await ephemeral.auth.updateUser({ password: newAuthSecret });
                if (error) {
                    showAlert('Error', 'Could not verify this device: ' + error.message);
                    return;
                }
                await registerLocalAccount(email, '', resetNewPin, newAuthSecret, new Date().toISOString()).catch(() => {});
                // Registering directly via storage.ts bypasses every
                // context method that would normally refresh the
                // AuthProvider's own localAccounts state -- without this,
                // Switch Account wouldn't list this account until the next
                // full reload.
                await refreshLocalAccounts().catch(() => {});
                const devicePinForSwitch = resetNewPin;
                showAlert(
                    'Device Verified',
                    `${email} is now available on this device. This device is still signed in to ${activeProfile!.email}.`,
                    [
                        { text: 'Switch to ' + email, onPress: async () => {
                            const result = await switchAccount(email, devicePinForSwitch);
                            if (result !== 'ok') {
                                setLoginMethod('email'); setEmailLoginEmail(email); setEmailLoginPin('');
                            }
                            setResetStep('request'); setResetNewPin(''); setMode('owner-login');
                        } },
                        { text: `Stay signed in to ${activeProfile!.email}`, style: 'cancel', onPress: () => {
                            setResetStep('request'); setResetNewPin(''); setMode('owner-login');
                        } },
                    ],
                );
                return;
            }

            // Same account (or nothing else active here) — persist this
            // magic-link session on the shared client, exactly as before.
            await supabase.auth.setSession({
                access_token: recoveryTokens.accessToken,
                refresh_token: recoveryTokens.refreshToken,
            });
            try { await recoverAccount(email, resetNewPin); } catch {}
            setResetStep('request'); setResetNewPin('');
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'Verification failed. Please try again.');
        } finally {
            setRecoveryTokens(null);
            setResetSubmitting(false);
            // scope: 'local' is the actual fix here, not just tidiness --
            // the "same account" branch above hands the MAIN persisted
            // client the exact same access/refresh token pair this
            // ephemeral client is holding (supabase.auth.setSession(...)
            // with recoveryTokens). Signing out here with the default
            // 'global' scope revokes that shared refresh token server-side,
            // so the session the app just adopted stops being able to
            // refresh -- it looks fine locally (device-trust/PIN already
            // saved) until the next refresh or reload, when every
            // authenticated call starts failing with "Not authenticated"
            // even though the account's data was never actually at risk.
            await ephemeral.auth.signOut({ scope: 'local' }).catch(() => {});
        }
    };

    // A visitor who lands on any of this screen's modes (Sign In, Sign Up,
    // Join Team, Reset PIN, ...) previously had no way back to the marketing
    // page short of the browser's own back button -- this screen never had
    // a header, logo link, or nav of its own. Same "Back to home" pattern
    // ContactScreen/BlogScreen already use, reused in every branch below.
    const goLanding = () => navigate('landing');
    const backToHomeLink = (
        <TouchableOpacity onPress={goLanding} style={styles.backLink}>
            <Icon name="arrow-left" size={13} color={Colors.textMuted} />
            <Text style={styles.backLinkText}>Back to home</Text>
        </TouchableOpacity>
    );

    // ── Recover existing account on new device ────────────────────────────────
    if (mode === 'recover') {
        return (
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    {backToHomeLink}
                    <View style={styles.card}>
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.title}>Welcome Back</Text>
                        <Text style={styles.brandTagline}>
                            Quad360 helps you understand your business, know what you can afford, become financing-ready, and find the right capital — all in one place.
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
                            setResetIntent('forgot-pin'); setMode('reset-pin');
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
                    {backToHomeLink}
                    <View style={styles.card}>
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.title}>Try Quad360</Text>
                        <Text style={styles.subtitle}>Two ways to look around — nothing is saved unless you create an account.</Text>

                        {/* Language applies immediately (not deferred to a
                            form submit like the signup screen's picker) --
                            there's no submit step here, guest/demo entry
                            happens the moment a card below is tapped. */}
                        <Text style={styles.pickerSectionLabel}>LANGUAGE</Text>
                        <View style={styles.chipRow}>
                            {LANGUAGES.map(l => (
                                <TouchableOpacity key={l.code}
                                    style={[styles.chip, language === l.code && styles.chipActive]}
                                    onPress={() => setLanguage(l.code)}>
                                    <Text style={[styles.chipText, language === l.code && styles.chipTextActive]}>
                                        {l.nativeLabel}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.pickerDivider}>
                            <View style={styles.pickerDividerLine} />
                        </View>

                        {/* Guest Mode is specifically the "your own numbers" path
                            below -- it must never show fake/sample data, so it's
                            kept visually and textually separate from the sample
                            businesses further down. */}
                        <Text style={styles.pickerSectionLabel}>GUEST MODE</Text>
                        <TouchableOpacity style={styles.bizCard} onPress={() => enterGuest()}>
                            <Text style={styles.bizEmoji}>📤</Text>
                            <View style={styles.bizInfo}>
                                <Text style={styles.bizCountry}>YOUR BUSINESS</Text>
                                <Text style={styles.bizName}>Start blank — use your own numbers</Text>
                                <Text style={styles.bizDesc}>Upload a bank statement or add transactions yourself. No sample data.</Text>
                            </View>
                            <Icon name="chevron-right" size={18} color={Colors.primary} />
                        </TouchableOpacity>

                        <View style={styles.pickerDivider}>
                            <View style={styles.pickerDividerLine} />
                            <Text style={styles.pickerDividerText}>OR</Text>
                            <View style={styles.pickerDividerLine} />
                        </View>

                        <Text style={styles.pickerSectionLabel}>PREVIEW WITH SAMPLE DATA</Text>
                        <Text style={styles.pickerSectionHint}>Every number below is fictional — see what a fully populated Quad360 looks like.</Text>
                        {/* One representative sample instead of a business
                            picked per country -- the country flags/names
                            used to imply localized content for each one,
                            when in reality only the LANGUAGE picker above
                            (English/Chinese/Hausa/Yoruba/Igbo) is actually
                            localized. A single sample plus an honest
                            language choice is more truthful than a long
                            list of countries that were only ever cosmetic. */}
                        {DEMO_BUSINESSES.slice(0, 1).map(biz => (
                            <TouchableOpacity key={biz.id} style={styles.bizCard} onPress={() => enterDemo(biz.id)}>
                                <Text style={styles.bizEmoji}>{biz.emoji}</Text>
                                <View style={styles.bizInfo}>
                                    {/* Currency, not the country name -- with
                                        only one sample business left, "NIGERIA"
                                        as an eyebrow read like the sample was
                                        still country-specific/localized. The
                                        currency symbol just labels what the
                                        numbers below are actually in. */}
                                    <Text style={styles.bizCountry}>{biz.currency}</Text>
                                    <Text style={styles.bizName}>{biz.businessName}</Text>
                                    <Text style={styles.bizDesc}>{biz.description}</Text>
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
                    {backToHomeLink}
                    <View style={styles.card}>
                        <Text style={styles.title}>
                            {resetIntent === 'verify-device' ? 'Verify This Device' : 'Forgot Your PIN?'}
                        </Text>
                        <Text style={styles.subtitle}>
                            {resetStep === 'request'
                                ? (resetIntent === 'verify-device'
                                    ? 'One-time check for a device that hasn\'t signed in before. Your PIN won\'t change.'
                                    : 'No problem. Follow the steps below and you\'ll be back in 2 minutes.')
                                : resetStep === 'complete-web'
                                ? 'Identity confirmed. Now set your new PIN.'
                                : resetStep === 'confirm-device'
                                ? 'Identity confirmed. Set a PIN to unlock this device.'
                                : 'Almost done — just check your email.'}
                        </Text>

                        {resetStep === 'request' && (
                            <>
                                <View style={styles.stepsBox}>
                                    <Text style={styles.stepsTitle}>How it works:</Text>
                                    <Text style={styles.stepsItem}>1. Enter your account email below</Text>
                                    <Text style={styles.stepsItem}>2. We send a {resetIntent === 'verify-device' ? 'verification' : 'reset'} link to your email</Text>
                                    <Text style={styles.stepsItem}>3. Open the email on this device and tap the link</Text>
                                    <Text style={styles.stepsItem}>
                                        4. {resetIntent === 'verify-device'
                                            ? 'The link brings you back here to set a PIN for this device'
                                            : 'The link brings you back here to set your new PIN'}
                                    </Text>
                                </View>
                                <Field label="Your Account Email">
                                    <TextInput style={styles.input} value={resetEmail} onChangeText={setResetEmail}
                                        placeholder="your@email.com" placeholderTextColor={Colors.muted}
                                        autoCapitalize="none" keyboardType="email-address" />
                                </Field>
                                <TouchableOpacity style={[styles.btn, resetSubmitting && styles.btnDisabled]}
                                    onPress={handleResetRequest} disabled={resetSubmitting}>
                                    {resetSubmitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>
                                            {resetIntent === 'verify-device' ? 'Send Verification Link' : 'Send Reset Link to My Email'}
                                        </Text>}
                                </TouchableOpacity>
                            </>
                        )}

                        {resetStep === 'verify' && (
                            <>
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoBoxTitle}>Check your email</Text>
                                    <Text style={styles.infoText}>
                                        We sent a {resetIntent === 'verify-device' ? 'verification' : 'reset'} link to:{'\n'}
                                        <Text style={{ fontWeight: 'bold', color: Colors.textPrimary }}>{resetEmail}</Text>
                                    </Text>
                                    <View style={styles.infoSteps}>
                                        <Text style={styles.infoStep}>1. Open your email app now</Text>
                                        <Text style={styles.infoStep}>2. Find the email from Quad360</Text>
                                        <Text style={styles.infoStep}>3. Tap the link in the email</Text>
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

                        {resetStep === 'confirm-device' && (
                            <>
                                <Field label="PIN for This Device (6 digits)">
                                    <TextInput style={styles.input} value={resetNewPin} onChangeText={setResetNewPin}
                                        placeholder="••••••" placeholderTextColor={Colors.muted}
                                        secureTextEntry keyboardType="number-pad" maxLength={6} />
                                </Field>
                                <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 16, marginTop: -8 }}>
                                    This just unlocks the app on this device — it doesn't need to match the PIN on your other devices.
                                </Text>
                                <TouchableOpacity style={[styles.btn, resetSubmitting && styles.btnDisabled]}
                                    onPress={handleDeviceVerifyComplete} disabled={resetSubmitting}>
                                    {resetSubmitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>Confirm This Device</Text>}
                                </TouchableOpacity>
                            </>
                        )}

                        <TouchableOpacity style={styles.switchBtn}
                            onPress={() => { setMode('owner-login'); setResetStep('request'); setResetIntent('forgot-pin'); }}>
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
                    {backToHomeLink}
                    <View style={styles.card}>
                        <Text style={styles.title}>{t(language, 'joinTeam')}</Text>

                        {!joinNeedsRecovery ? (
                            <>
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

                                <TouchableOpacity style={[styles.btn, (joiningTeam || joinOtpSending) && styles.btnDisabled]} onPress={handleJoinTeam} disabled={joiningTeam || joinOtpSending}>
                                    {(joiningTeam || joinOtpSending)
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>{t(language, 'joinTeamBtn')}</Text>
                                    }
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.switchBtn} onPress={() => setMode(isFirstLaunch ? 'owner-setup' : 'owner-login')}>
                                    <Text style={styles.switchText}>{t(language, 'backToSignIn')}</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.subtitle}>
                                    We found an account for {joinEmail.trim()} from an earlier join attempt that didn't finish. Enter the verification code we just emailed you to finish joining.
                                </Text>

                                <Field label="Verification Code">
                                    <TextInput style={[styles.input, styles.codeInput]}
                                        value={joinOtp} onChangeText={setJoinOtp}
                                        placeholder="123456" placeholderTextColor={Colors.muted}
                                        keyboardType="number-pad" maxLength={8} />
                                </Field>

                                <TouchableOpacity style={[styles.btn, joinOtpSubmitting && styles.btnDisabled]} onPress={handleCompleteJoinWithOtp} disabled={joinOtpSubmitting}>
                                    {joinOtpSubmitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>Verify & Join</Text>
                                    }
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.switchBtn} onPress={handleRequestJoinRecoveryOtp} disabled={joinOtpSending}>
                                    <Text style={styles.switchText}>{joinOtpSending ? 'Sending…' : "Didn't get a code? Resend"}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.switchBtn} onPress={() => { setJoinNeedsRecovery(false); setJoinOtp(''); }}>
                                    <Text style={styles.switchText}>← Back</Text>
                                </TouchableOpacity>
                            </>
                        )}
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
                    {backToHomeLink}
                    <View style={styles.card}>
                        <Text style={styles.title}>Join as Lender</Text>
                        <Text style={styles.brandTagline}>
                            Don't just receive SME loan applications. Understand the businesses behind them.
                        </Text>
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
                {isDemoMode && (
                    <View style={styles.guestCarryoverNote}>
                        <Icon name="lock" size={13} color={Colors.primary} />
                        <Text style={styles.guestCarryoverNoteText}>
                            Your analysis is ready. Create your account to securely save it — you won't need to upload again.
                        </Text>
                    </View>
                )}
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

                <TouchableOpacity style={styles.consentRow} onPress={() => setAgreedToTerms(v => !v)} activeOpacity={0.7}>
                    <View style={[styles.consentCheckbox, agreedToTerms && styles.consentCheckboxChecked]}>
                        {agreedToTerms && <Icon name="check" size={12} color="#fff" />}
                    </View>
                    <Text style={styles.consentText}>
                        I agree to the{' '}
                        <Text style={styles.consentLink} onPress={() => navigate('privacy-policy')}>Privacy Policy</Text>
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.btn, (submitting || !agreedToTerms) && styles.btnDisabled]} onPress={handleSetup} disabled={submitting || !agreedToTerms}>
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
                    <Text style={styles.demoBtnText}>Try Guest Mode (No sign-up needed)</Text>
                </TouchableOpacity>
            </>
        );

        const currencyModal = (
            <Modal visible={currencyModalOpen} transparent animationType="slide" onRequestClose={() => setCurrencyModalOpen(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCurrencyModalOpen(false)}>
                    <View style={[styles.currencyModal, constrainSheetWidth && styles.currencyModalWide]}>
                        <Text style={styles.currencyModalTitle}>Select Currency</Text>
                        <ScrollView>
                            {CURRENCIES.map(c => (
                                <TouchableOpacity key={c.value} style={[styles.currencyOption, currency === c.value && styles.currencyOptionActive]}
                                    onPress={() => { setCurrency(c.value); setCurrencyCode(c.code); setCurrencyModalOpen(false); }}>
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
                            {backToHomeLink}
                            <View style={styles.splitBrandMid}>
                                <Image source={require('../../assets/icon.png')} style={styles.splitLogo} />
                                <Text style={styles.splitTagline}>The Financial Intelligence Layer Between African Businesses and Capital</Text>
                                <Text style={styles.splitHeadline}>
                                    From business data to better decisions to better capital.
                                </Text>
                                <Text style={styles.splitSub}>
                                    Understand your business. Improve your financial health. Become financing-ready. Find the right capital.
                                </Text>
                            </View>
                            <View style={styles.socialProofSetup}>
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
                    {backToHomeLink}
                    <View style={styles.card}>
                        <Image source={require('../../assets/icon.png')} style={styles.logo} />
                        <Text style={styles.brandTagline}>
                            Quad360 helps you understand your business, know what you can afford, become financing-ready, and find the right capital — all in one place.
                        </Text>
                        <Text style={styles.subtitle}>{t(setupLang, 'setupSubtitle')}</Text>

                        {/* Social proof strip */}
                        <View style={styles.socialProofSetup}>
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
    const loginFormFields = (
        <>
            {isLockedOut && timeRemaining !== null && timeRemaining > 0 && (
                <View style={styles.lockoutBanner}>
                    <Icon name="lock" size={14} color={Colors.danger} />
                    <Text style={styles.lockoutText}>
                        Too many failed attempts. Try again in {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                    </Text>
                </View>
            )}

            {/* Switch Account — only appears once this device actually knows
                more than one account, so the ~100% of single-account devices
                see zero change here. */}
            {otherLocalAccounts.length > 0 && (
                <View style={styles.switchAccountBox}>
                    <Text style={styles.switchAccountTitle}>Switch Account</Text>
                    {otherLocalAccounts.map(acct => (
                        <View key={acct.email} style={styles.switchAccountRow}>
                            <TouchableOpacity
                                style={styles.switchAccountRowMain}
                                onPress={() => {
                                    setSwitchTarget(switchTarget === acct.email ? null : acct.email);
                                    setSwitchPin('');
                                }}
                            >
                                <View style={styles.switchAccountAvatar}>
                                    <Text style={styles.switchAccountAvatarText}>{acct.businessName.trim().charAt(0).toUpperCase() || '?'}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.switchAccountName} numberOfLines={1}>{acct.businessName}</Text>
                                    <Text style={styles.switchAccountEmail} numberOfLines={1}>{acct.email}</Text>
                                </View>
                                <Icon name={switchTarget === acct.email ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.muted} />
                            </TouchableOpacity>
                            {switchTarget === acct.email && (
                                <View style={styles.switchAccountExpand}>
                                    <TextInput
                                        style={styles.switchAccountPinInput}
                                        placeholder="Enter PIN for this account"
                                        placeholderTextColor={Colors.muted}
                                        secureTextEntry keyboardType="number-pad" maxLength={6}
                                        value={switchPin} onChangeText={setSwitchPin}
                                        onSubmitEditing={() => handleSwitchAccount(acct.email)}
                                        autoFocus
                                    />
                                    <TouchableOpacity
                                        style={[styles.switchAccountBtn, switchSubmitting && styles.btnDisabled]}
                                        onPress={() => handleSwitchAccount(acct.email)}
                                        disabled={switchSubmitting}
                                    >
                                        {switchSubmitting
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={styles.switchAccountBtnText}>Switch</Text>
                                        }
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ))}
                    <Text style={styles.switchAccountHint}>
                        Adding a different account? Use the <Text style={{ color: Colors.primary }} onPress={() => setLoginMethod('email')}>Email tab</Text> below.
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
                setResetIntent('forgot-pin'); setMode('reset-pin');
            }}>
                <Text style={styles.resetText}>Forgot your PIN? Reset it in 2 minutes →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.demoBtn} onPress={() => setMode('demo-pick')}>
                <Icon name="eye" size={13} color={Colors.primary} />
                <Text style={styles.demoBtnText}>Try Guest Mode First (No sign-up needed)</Text>
            </TouchableOpacity>
        </>
    );

    // Wide web only -- narrow/native rendering (below) is completely
    // untouched by this branch. Mirrors the owner-setup split layout above
    // so Log In carries the same brand panel as Sign Up instead of falling
    // back to a plain centered card just because this mode has no explicit
    // wide-web branch of its own.
    if (isWideWebSetup) {
        return (
            <SafeAreaView style={styles.safe}>
                <View style={styles.splitShell}>
                    <View style={styles.splitBrand}>
                        {backToHomeLink}
                        <View style={styles.splitBrandMid}>
                            <Image source={require('../../assets/icon.png')} style={styles.splitLogo} />
                            <Text style={styles.splitTagline}>The Financial Intelligence Layer Between African Businesses and Capital</Text>
                            <Text style={styles.splitHeadline}>
                                From business data to better decisions to better capital.
                            </Text>
                            <Text style={styles.splitSub}>
                                Understand your business. Improve your financial health. Become financing-ready. Find the right capital.
                            </Text>
                        </View>
                        <View style={styles.socialProofSetup}>
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
                            <Text style={styles.splitFormTitle}>Welcome Back</Text>
                            <Text style={[styles.subtitle, styles.splitFormSubtitle]}>{t(language, 'loginSubtitle')}</Text>
                            {loginFormFields}
                        </View>
                    </ScrollView>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {backToHomeLink}
                <View style={styles.card}>
                    <Image source={require('../../assets/icon.png')} style={styles.logo} />
                    <Text style={styles.brandTagline}>
                        Quad360 helps you understand your business, know what you can afford, become financing-ready, and find the right capital — all in one place.
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

                    {loginFormFields}
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
    backLink: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        width: '100%', maxWidth: 480, alignSelf: 'center', marginBottom: 14,
    },
    backLinkText: { fontSize: 12.5, color: Colors.textMuted, fontWeight: '600' },
    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xxl,
        borderWidth: 1, borderColor: Colors.border,
        width: '100%', maxWidth: 480, alignSelf: 'center',
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
    splitLogo: { width: 56, height: 56, borderRadius: Radius.lg, marginBottom: 12, ...Shadow.md },
    splitTagline: { fontSize: 12.5, fontWeight: '600', color: Colors.textMuted, marginBottom: 16 },
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
    currencyModalWide: { maxWidth: 440, width: '100%', alignSelf: 'center' },
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

    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 6, marginBottom: 10 },
    consentCheckbox: {
        width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center', marginTop: 1,
    },
    consentCheckboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    consentText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17 },
    consentLink: { color: Colors.primary, fontWeight: '700' },

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

    switchAccountBox: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: Radius.md, padding: 10, marginBottom: 16, gap: 4,
    },
    switchAccountTitle: {
        fontSize: 11, fontWeight: '700', color: Colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, paddingHorizontal: 2,
    },
    switchAccountRow: { borderRadius: Radius.sm, overflow: 'hidden' },
    switchAccountRowMain: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 8, paddingHorizontal: 4,
    },
    switchAccountAvatar: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '22',
        alignItems: 'center', justifyContent: 'center',
    },
    switchAccountAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
    switchAccountName: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    switchAccountEmail: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
    switchAccountExpand: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 4, paddingBottom: 10,
    },
    switchAccountPinInput: {
        flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
        paddingVertical: 8, paddingHorizontal: 10, fontSize: 14, color: Colors.textPrimary,
        backgroundColor: Colors.surface,
    },
    switchAccountBtn: {
        backgroundColor: Colors.primary, borderRadius: Radius.sm,
        paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
    },
    switchAccountBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    switchAccountHint: { fontSize: 11, color: Colors.textMuted, paddingHorizontal: 2, paddingTop: 2 },

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

    guestCarryoverNote: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: Colors.primary + '15', borderWidth: 1, borderColor: Colors.primary,
        borderRadius: Radius.md, padding: 12, marginBottom: 16,
    },
    guestCarryoverNoteText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },

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

    pickerSectionLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, marginTop: 4, marginBottom: 8 },
    pickerSectionHint: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 10, lineHeight: 16 },
    pickerDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
    pickerDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
    pickerDividerText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
});
