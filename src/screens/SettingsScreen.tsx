import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Share, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors, ColorThemeMode, getColorThemeMode, setColorThemeMode } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DateInput from '../components/DateInput';
import { BusinessSettings } from '../types';
import { t, LANGUAGES } from '../utils/i18n';
import { generateAccountantReportCSV } from '../utils/finance';
import { Config } from '../config';
import { openSupportChat } from '../utils/whatsappIntegration';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { trackDataExported } from '../utils/analytics';
import { isFinancingAdmin } from '../utils/financingAdmin';
import { PRIMARY_GOAL_OPTIONS } from '../utils/primaryGoals';

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

const BUSINESS_TYPES: { label: string; value: BusinessSettings['businessType'] }[] = [
    { label: 'Product', value: 'product' },
    { label: 'Service', value: 'service' },
    { label: 'Both',    value: 'both'    },
];

const INDUSTRIES: { label: string; value: NonNullable<BusinessSettings['industry']> }[] = [
    { label: '🏬 Retail / Wholesale', value: 'retail' },
    { label: '🍽️ Food Service', value: 'food-service' },
    { label: '🏭 Manufacturing', value: 'manufacturing' },
    { label: '💼 Professional Services', value: 'professional-services' },
    { label: '🏢 General / Other', value: 'general' },
];

const LEGAL_ENTITY_TYPES: { label: string; value: NonNullable<BusinessSettings['legalEntityType']> }[] = [
    { label: 'Sole Proprietorship', value: 'sole-proprietorship' },
    { label: 'Partnership', value: 'partnership' },
    { label: 'LLC / Limited Company', value: 'llc' },
    { label: 'Corporation', value: 'corporation' },
    { label: 'Nonprofit', value: 'nonprofit' },
];

export default function SettingsScreen() {
    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const {
        settings, updateSettings, setCurrentScreen,
        changePin, exportData, importData, clearData, resetBusinessData, deleteAccount, logout,
        userRole, teamMembers, inviteMember, removeMember, refreshTeam,
        language, setLanguage,
        transactions, user, updateProfile,
        finance, assets, loans, isDemoMode,
    } = useApp() as ReturnType<typeof useApp>;

    // Feature flags
    const enableTeam = process.env.EXPO_PUBLIC_ENABLE_TEAM !== 'false';

    const [form, setForm]       = useState({ ...settings });
    const [phone, setPhone]     = useState(user?.phone || '');
    const [colorTheme, setColorThemeState] = useState<ColorThemeMode>(getColorThemeMode());
    const [applyingTheme, setApplyingTheme] = useState(false);

    // Re-sync the whole form once real settings arrive from storage/Supabase.
    // settings hydrates asynchronously (a network round-trip, then an
    // AsyncStorage fallback) well after this screen's first render, so the
    // form's useState({ ...settings }) above can capture nothing but
    // hardcoded app defaults if Settings is opened before that finishes.
    // This used to only re-sync the two payment-key fields — every other
    // field (tax rate, opening balances, target margin, business type,
    // mission/vision/values, next tax deadline...) stayed frozen at
    // whatever `form` captured at mount, so hitting Save while settings
    // were still loading silently overwrote the user's real, already-saved
    // settings back to those defaults. `settings` only ever changes here
    // from hydration completing or this same screen's own updateSettings()
    // calls, so re-syncing the full object on every change is safe — it's
    // a no-op after a self-triggered save, since form already matches.
    useEffect(() => {
        setForm({ ...settings });
    }, [settings]);

    // Change PIN
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin]         = useState('');
    const [confirmPin, setConfirmPin] = useState('');

    // Import modal
    const [importModal, setImportModal] = useState(false);
    const [importJson, setImportJson]   = useState('');

    // Type-to-confirm modals
    const [resetModal, setResetModal]       = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');
    const [deleteModal, setDeleteModal]     = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    // Team invite modal
    const [inviteModal, setInviteModal]   = useState(false);
    const [inviteEmail, setInviteEmail]   = useState('');
    const [inviteRole, setInviteRole]     = useState<'accountant' | 'staff'>('accountant');
    const [pendingCode, setPendingCode]   = useState<string | null>(null);

    useEffect(() => {
        if (userRole === 'owner') refreshTeam().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doSave = () => {
        updateSettings(form);
        if (updateProfile && phone !== (user?.phone || '')) updateProfile({ phone: phone.trim() });
        showAlert(t(language, 'success'), 'Settings updated successfully.', () => setCurrentScreen('dashboard'));
    };

    const handleSave = () => {
        if (isNaN(parseFloat(form.minReserve)) || parseFloat(form.minReserve) < 0) {
            showAlert('Invalid value', 'Minimum reserve must be a non-negative number.'); return;
        }
        if (isNaN(parseFloat(form.targetMargin)) || parseFloat(form.targetMargin) < 0 || parseFloat(form.targetMargin) > 100) {
            showAlert('Invalid value', 'Target margin must be between 0 and 100.'); return;
        }
        const taxRate = parseFloat(form.defaultTaxRate);
        if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
            showAlert('Invalid value', 'Default tax rate must be between 0 and 100.'); return;
        }
        if (form.openingAssets && isNaN(parseFloat(form.openingAssets))) {
            showAlert('Invalid value', 'Opening assets must be a number.'); return;
        }
        if (form.openingLiabilities && isNaN(parseFloat(form.openingLiabilities))) {
            showAlert('Invalid value', 'Opening liabilities must be a number.'); return;
        }
        if (phone.trim() && !/^\+?[\d\s\-().]{7,20}$/.test(phone.trim())) {
            showAlert('Invalid phone', 'Enter your number with country code, e.g. +1 555 000 1234 (USA), +44 7700 900123 (UK), +234 801 234 5678 (Nigeria).'); return;
        }
        // Warn if currency changed
        if (form.currency !== settings.currency) {
            confirmAction(t(language, 'currencyChangeTitle'), t(language, 'currencyChangeWarning'), t(language, 'confirm'), doSave, false);
            return;
        }
        doSave();
    };

    const handleSavePaymentKeys = () => {
        if (userRole !== 'owner') {
            showAlert('Permission denied', 'Only the account owner can change payment settings.');
            return;
        }
        const paystackPublicKey = (form.paystackPublicKey ?? '').trim();
        const korapayPublicKey  = (form.korapayPublicKey ?? '').trim();
        updateSettings({ paystackPublicKey, korapayPublicKey });
        showAlert('✅ Saved', 'Payment keys saved. Tap "Create Payment Link →" to charge customers.');
    };

    const handleChangePin = async () => {
        if (!/^\d{6}$/.test(newPin)) {
            showAlert('Invalid PIN', 'New PIN must be exactly 6 digits.');
            return;
        }
        if (newPin !== confirmPin) {
            showAlert('PIN mismatch', 'New PINs do not match.');
            return;
        }
        const result = await changePin(currentPin, newPin);
        if (!result.ok) {
            if (result.lockedUntil) {
                const mins = Math.ceil((result.lockedUntil - Date.now()) / 60000);
                showAlert('Too Many Attempts', `PIN change locked for ${mins} minute${mins !== 1 ? 's' : ''}. Use "Forgot PIN?" if needed.`);
            } else {
                showAlert('Incorrect PIN', 'Your current PIN is wrong. Please try again.');
            }
            return;
        }
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
        showAlert('✅ PIN Changed', 'Your PIN has been updated on this device. Other devices you\'re signed in on keep using their own PIN — set a new one there separately, or use "Forgot PIN?" if you need to.');
    };

    const handleExport = async () => {
        try {
            const json = await exportData();
            if (!isDemoMode) trackDataExported();
            if (Platform.OS === 'web') {
                const blob = new Blob([json], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `quad360-backup-${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                await Share.share({ message: json, title: 'Quad360 Backup' });
            }
        } catch {
            showAlert('Export failed', 'Could not export data. Please try again.');
        }
    };

    const handleAccountantExport = () => {
        try {
            const csv = generateAccountantReportCSV(finance, transactions, assets, loans);
            if (!isDemoMode) trackDataExported();
            const filename = `quad360-accountant-report-${new Date().toISOString().slice(0, 10)}.csv`;
            if (Platform.OS === 'web') {
                const blob = new Blob([csv], { type: 'text/csv' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                Share.share({ message: csv, title: filename });
            }
        } catch {
            showAlert('Export failed', 'Could not generate report. Please try again.');
        }
    };

    const handleImport = async () => {
        if (!importJson.trim()) {
            showAlert('Empty input', 'Please paste your backup JSON.');
            return;
        }
        try {
            await importData(importJson.trim());
            setImportModal(false);
            setImportJson('');
            showAlert('Imported', 'Data restored successfully.');
        } catch (e: any) {
            showAlert('Import failed', e?.message ?? 'Invalid backup file.');
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim()) { showAlert('Required', 'Please enter the member\'s email.'); return; }
        try {
            const code = await inviteMember(inviteEmail.trim(), inviteRole);
            setInviteEmail('');
            setPendingCode(code);
        } catch (e: any) {
            showAlert('Invite failed', e?.message ?? 'Could not create invite.');
        }
    };

    const handleRemoveMember = (id: string, email: string) => {
        confirmAction('Remove member', `Remove ${email} from your team?`, 'Remove', () => removeMember(id));
    };

    const handleResetBusinessData = () => {
        setResetConfirmText('');
        setResetModal(true);
    };

    const handleClearData = () => {
        const msg = 'This signs you out and clears the local app cache. Your data stays safely in the cloud — sign back in any time to restore everything.';
        confirmAction('Sign Out & Clear Local Cache', msg, 'Sign Out', async () => { await clearData(); logout(); });
    };

    const handleDeleteAccount = () => {
        setDeleteConfirmText('');
        setDeleteModal(true);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Settings</Text>

                    {/* Appearance — switching palette requires every screen's
                        stylesheet to rebuild against the new colors, which
                        only happens on a fresh module evaluation, so this
                        reloads the app the same way other global settings
                        changes (reset/clear data) already do. */}
                    <SectionHeader icon="sliders" title="APPEARANCE" />
                    <CollapsibleSection title="Color Theme" defaultOpen={true}>
                        <Section title="Theme">
                            <View style={styles.optRow}>
                                <Opt
                                    label="Dark"
                                    active={colorTheme === 'dark'}
                                    onPress={async () => {
                                        if (colorTheme === 'dark' || applyingTheme) return;
                                        setApplyingTheme(true);
                                        setColorThemeState('dark');
                                        await setColorThemeMode('dark');
                                    }}
                                />
                                <Opt
                                    label="Warm Paper"
                                    active={colorTheme === 'warm-paper'}
                                    onPress={async () => {
                                        if (colorTheme === 'warm-paper' || applyingTheme) return;
                                        setApplyingTheme(true);
                                        setColorThemeState('warm-paper');
                                        await setColorThemeMode('warm-paper');
                                    }}
                                />
                            </View>
                            {applyingTheme && (
                                <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8 }}>
                                    Applying theme — reloading…
                                </Text>
                            )}
                        </Section>
                    </CollapsibleSection>

                    {/* OPERATIONS */}
                    <SectionHeader icon="settings" title="ACCOUNT & BUSINESS" />

                    {/* Business Setup */}
                    <CollapsibleSection title="Business Setup" defaultOpen={true}>
                        <Section title="Business Type">
                            <View style={styles.optRow}>
                                {BUSINESS_TYPES.map(bt => (
                                    <Opt key={bt.value} label={bt.label} active={form.businessType === bt.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, businessType: bt.value }))} />
                                ))}
                            </View>
                        </Section>

                        {/* Set once at onboarding, changeable any time here.
                            Reranks Dashboard's priority list and the action
                            plan toward this -- see dashboardPriorities.ts and
                            actionRecommendationEngine.ts -- it never changes
                            what's shown, only what surfaces first. */}
                        <Section title="What Matters Most Right Now">
                            <Text style={styles.hint}>
                                Changes what Dashboard and your action plan surface first — never what's shown, only the order.
                            </Text>
                            <View style={styles.optRow}>
                                {PRIMARY_GOAL_OPTIONS.map(opt => (
                                    <Opt key={opt.label} label={opt.label} active={(form.primaryGoal ?? null) === opt.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, primaryGoal: opt.value ?? undefined }))} />
                                ))}
                            </View>
                        </Section>

                        {/* Drives which industry-specific tools show up (e.g. Recipe/Menu
                            Item Costing is Food Service only) — doesn't clutter a
                            retailer's or consultant's app with tools that don't apply. */}
                        <Section title="Industry">
                            <Text style={styles.hint}>
                                Unlocks tools built for how your industry actually works — e.g. food cost costing for Food Service.
                            </Text>
                            <View style={styles.optRow}>
                                {INDUSTRIES.map(ind => (
                                    <Opt key={ind.value} label={ind.label} active={(form.industry ?? 'general') === ind.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, industry: ind.value }))} />
                                ))}
                            </View>
                        </Section>

                        <Section title="Mission, Vision & Values">
                            <Text style={styles.hint}>
                                The vision is your destination, the mission is how you get there daily, and your values are the rules of the road for how your team behaves along the way. Shown alongside your weekly priorities and strategy — a guideline to check decisions against, not just a statement to file away.
                            </Text>
                            <FieldLabel>Mission — how you get there, daily</FieldLabel>
                            <TextInput
                                style={[styles.input, { minHeight: 70 }]}
                                value={form.missionStatement ?? ''}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, missionStatement: v }))}
                                multiline
                                textAlignVertical="top"
                                placeholder="e.g. We deliver fresh produce to every small shop owner in our city, every day, at a fair price"
                                placeholderTextColor={Colors.muted}
                            />
                            <FieldLabel>Vision — your long-term destination</FieldLabel>
                            <TextInput
                                style={[styles.input, { minHeight: 70 }]}
                                value={form.visionStatement ?? ''}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, visionStatement: v }))}
                                multiline
                                textAlignVertical="top"
                                placeholder="e.g. The most trusted produce supplier in every neighbourhood in the state"
                                placeholderTextColor={Colors.muted}
                            />
                            <FieldLabel>Values — how your team behaves getting there</FieldLabel>
                            <TextInput
                                style={[styles.input, { minHeight: 50 }]}
                                value={form.coreValues ?? ''}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, coreValues: v }))}
                                multiline
                                textAlignVertical="top"
                                placeholder="e.g. Integrity, reliability, community focus"
                                placeholderTextColor={Colors.muted}
                            />
                        </Section>

                        <Section title="Macro Assumptions">
                            <Text style={styles.hint}>
                                Quad360 has no live feed for energy prices, FX, interest rates, inflation or other external factors — tell it what you're seeing, linked to the expense categories it affects. When a linked category is also rising in your own transactions, Cost Exposure turns that into a specific early warning instead of a generic headline.
                            </Text>
                            <TouchableOpacity style={styles.dataBtn} onPress={() => setCurrentScreen('macro-assumptions')}>
                                <Text style={styles.dataBtnText}>
                                    {(settings.macroAssumptions?.length ?? 0) > 0
                                        ? `Manage Assumptions (${settings.macroAssumptions!.length})`
                                        : 'Add External Factor Assumptions'}
                                </Text>
                            </TouchableOpacity>
                        </Section>

                        <Section title={t(language, 'language')}>
                            <View style={styles.optRow}>
                                {LANGUAGES.map(l => (
                                    <Opt key={l.code} label={l.nativeLabel} active={language === l.code}
                                        onPress={() => setLanguage(l.code)} />
                                ))}
                            </View>
                        </Section>

                        <Section title={t(language, 'currency')}>
                            <View style={styles.optRow}>
                                {CURRENCIES.map(c => (
                                    <Opt key={c.value} label={c.label} active={form.currency === c.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, currency: c.value, currencyCode: c.code }))} />
                                ))}
                            </View>
                        </Section>

                        <Section title="Phone Number">
                            <Text style={styles.hint}>Include your country code — e.g. +1 (USA/Canada), +44 (UK), +234 (Nigeria), +27 (South Africa), +254 (Kenya), +233 (Ghana)</Text>
                            <TextInput
                                style={styles.input}
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="+1 555 000 1234"
                                placeholderTextColor="#888"
                                keyboardType="phone-pad"
                            />
                        </Section>

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>Save Settings</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setCurrentScreen('dashboard')}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </CollapsibleSection>

                    {/* Security */}
                    <CollapsibleSection title="Security" defaultOpen={false}>
                        <Section title="Change PIN">
                            <FieldLabel>Current PIN</FieldLabel>
                            <TextInput style={styles.input} value={currentPin}
                                onChangeText={setCurrentPin}
                                secureTextEntry keyboardType="number-pad" maxLength={6}
                                placeholder="••••" placeholderTextColor={Colors.muted} />
                            <FieldLabel>New PIN</FieldLabel>
                            <TextInput style={styles.input} value={newPin}
                                onChangeText={setNewPin}
                                secureTextEntry keyboardType="number-pad" maxLength={6}
                                placeholder="••••" placeholderTextColor={Colors.muted} />
                            <FieldLabel>Confirm New PIN</FieldLabel>
                            <TextInput style={styles.input} value={confirmPin}
                                onChangeText={setConfirmPin}
                                secureTextEntry keyboardType="number-pad" maxLength={6}
                                placeholder="••••" placeholderTextColor={Colors.muted} />
                            <TouchableOpacity style={[styles.saveBtn, { marginTop: 12, marginBottom: 0 }]} onPress={handleChangePin}>
                                <Text style={styles.saveBtnText}>Update PIN</Text>
                            </TouchableOpacity>
                        </Section>

                        <Section title="Extra Security Lock">
                            <Text style={styles.hint}>
                                Turn this on to require a second code when you log in. Makes your account much harder to break into.
                            </Text>
                            <TouchableOpacity style={styles.dataBtn} onPress={() => setCurrentScreen('2fa')}>
                                <Text style={styles.dataBtnText}>Set Up Extra Security Lock</Text>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* Team (Operations category) */}
                    {enableTeam && userRole === 'owner' && (
                        <CollapsibleSection title="Team" defaultOpen={false}>
                            <Section title="Team Management">
                                <Text style={styles.hint}>
                                    Invite team members to access your business data. Accountants see full financial reports and can export. Staff can log sales/expenses, send invoices, and manage inventory — full P&L, cash balance, and bank/loan details stay hidden from them.
                                </Text>
                                <TouchableOpacity style={styles.dataBtn} onPress={() => { setPendingCode(null); setInviteModal(true); }}>
                                    <Text style={styles.dataBtnText}>+ Invite Team Member</Text>
                                </TouchableOpacity>

                                {teamMembers.length > 0 && (
                                    <View style={{ marginTop: 14 }}>
                                        {teamMembers.map((m: any) => (
                                            <View key={m.id} style={styles.memberRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.memberEmail}>{m.memberEmail}</Text>
                                                    <View style={styles.memberMeta}>
                                                        <View style={[styles.roleBadge, { backgroundColor: m.role === 'accountant' ? Colors.primary + '22' : Colors.warning + '22' }]}>
                                                            <Text style={[styles.roleText, { color: m.role === 'accountant' ? Colors.primary : Colors.warning }]}>
                                                                {m.role.toUpperCase()}
                                                            </Text>
                                                        </View>
                                                        <View style={[styles.roleBadge, { backgroundColor: m.status === 'active' ? Colors.income + '22' : Colors.textMuted + '22' }]}>
                                                            <Text style={[styles.roleText, { color: m.status === 'active' ? Colors.income : Colors.textMuted }]}>
                                                                {m.status.toUpperCase()}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <TouchableOpacity onPress={() => handleRemoveMember(m.id, m.memberEmail)}>
                                                    <Text style={{ color: Colors.expense, fontSize: 12, fontWeight: '600' }}>Remove</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </Section>
                        </CollapsibleSection>
                    )}

                    {/* Help & Support */}
                    <CollapsibleSection title="Help & Support" defaultOpen={false}>
                        <Section title="Talk to a Human">
                            <Text style={styles.hint}>
                                {Config.SUPPORT_WHATSAPP_NUMBER
                                    ? "Have a question or stuck on something? Chat with the Quad360 team directly on WhatsApp."
                                    : "WhatsApp support isn't set up on this deployment yet — a support number needs to be configured before this can go live."}
                            </Text>
                            <TouchableOpacity
                                style={[styles.dataBtn, !Config.SUPPORT_WHATSAPP_NUMBER && { opacity: 0.5 }]}
                                disabled={!Config.SUPPORT_WHATSAPP_NUMBER}
                                onPress={() => openSupportChat(Config.SUPPORT_WHATSAPP_NUMBER)}
                            >
                                <View style={styles.btnIconRow}>
                                    <Icon name="message-circle" size={14} color={Colors.primary} />
                                    <Text style={styles.dataBtnText}>Chat on WhatsApp</Text>
                                </View>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* Danger Zone */}
                    <CollapsibleSection title="Danger Zone" defaultOpen={false}>
                        <Section title="Reset Business Data">
                            <Text style={styles.hint}>
                                Permanently deletes all transactions, invoices, goals, assets, loans, and inventory. Your account and settings are kept — use this to start fresh without creating a new account.
                            </Text>
                            <TouchableOpacity style={styles.dangerBtn} onPress={handleResetBusinessData}>
                                <Text style={styles.dangerBtnText}>Reset Business Data</Text>
                            </TouchableOpacity>
                        </Section>

                        <Section title="Sign Out">
                            <Text style={styles.hint}>
                                Signs you out and clears the local cache. Your data is safely stored in the cloud and will be restored when you sign back in.
                            </Text>
                            <TouchableOpacity style={styles.dangerBtn} onPress={handleClearData}>
                                <Text style={styles.dangerBtnText}>Sign Out & Clear Cache</Text>
                            </TouchableOpacity>
                        </Section>

                        <Section title="Delete Account">
                            <Text style={styles.hint}>
                                Permanently removes all your business data from the cloud. This cannot be undone.
                            </Text>
                            <TouchableOpacity style={[styles.dangerBtn, { borderColor: '#7f1d1d', backgroundColor: 'rgba(127,29,29,0.12)' }]} onPress={handleDeleteAccount}>
                                <Text style={[styles.dangerBtnText, { color: '#ef4444' }]}>Delete Account</Text>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* FINANCE */}
                    <SectionHeader icon="dollar-sign" title="FINANCIAL SETUP" />

                    {/* Profit Goals & Tax */}
                    <CollapsibleSection title="Profit Goals & Tax" defaultOpen={false}>
                        <Section title="Your Targets">
                            <FieldLabel>Minimum savings to keep at all times ({form.currency})</FieldLabel>
                            <Text style={styles.hint}>The app will warn you if your account drops below this amount.</Text>
                            <TextInput style={styles.input} value={form.minReserve}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, minReserve: v }))}
                                keyboardType="numeric" placeholder="5000" placeholderTextColor={Colors.muted} />

                            <FieldLabel>How much of each sale should be profit? (%)</FieldLabel>
                            <Text style={styles.hint}>Example: if you charge {form.currency}1,000 and your costs are {form.currency}400, your profit is 60%.</Text>
                            <TextInput style={styles.input} value={form.targetMargin}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, targetMargin: v }))}
                                keyboardType="numeric" placeholder="65" placeholderTextColor={Colors.muted} />
                        </Section>

                        <Section title="Tax Settings">
                            <FieldLabel>Default Tax Rate (%)</FieldLabel>
                            <Text style={styles.hint}>
                                Applied automatically to new transactions. Can be overridden per transaction.
                            </Text>
                            <TextInput style={styles.input} value={form.defaultTaxRate}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, defaultTaxRate: v }))}
                                keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />

                            <FieldLabel>Next Tax Filing Deadline</FieldLabel>
                            <Text style={styles.hint}>
                                Your next VAT return, Corporation Tax, or equivalent filing due date. Tax Filing Readiness uses this to warn you before it's close — missed deadlines are the single biggest reason SMEs get hit with penalties.
                            </Text>
                            <DateInput
                                value={form.nextTaxDeadline ?? ''}
                                onChange={v => setForm((f: typeof form) => ({ ...f, nextTaxDeadline: v }))}
                            />

                            <FieldLabel>Legal Structure</FieldLabel>
                            <Text style={styles.hint}>
                                Drives the compliance checklist on Tax Filing Readiness — e.g. an LLC has separate annual-return and corporate-tax obligations a sole proprietorship doesn't.
                            </Text>
                            <View style={styles.optRow}>
                                {LEGAL_ENTITY_TYPES.map(ent => (
                                    <Opt key={ent.value} label={ent.label} active={form.legalEntityType === ent.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, legalEntityType: ent.value }))} />
                                ))}
                            </View>
                        </Section>

                        <Section title="Money & Things You Had Before Using This App">
                            <Text style={styles.hint}>
                                If you already had money, equipment, or loans before you started using Quad360, enter them here so your numbers are accurate from day one.
                            </Text>
                            <FieldLabel>Value of things you already owned ({form.currency})</FieldLabel>
                            <TextInput style={styles.input} value={form.openingAssets}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, openingAssets: v }))}
                                keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />

                            <FieldLabel>Money you already owed to others ({form.currency})</FieldLabel>
                            <TextInput style={styles.input} value={form.openingLiabilities}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, openingLiabilities: v }))}
                                keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />
                        </Section>

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>Save Settings</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setCurrentScreen('dashboard')}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </CollapsibleSection>

                    {/* Payment Gateways */}
                    <CollapsibleSection title="Payment Gateways" defaultOpen={false}>
                        <Text style={styles.hint}>
                            Add your public API keys below, then tap "Create Payment Link" to charge customers by card, bank transfer, or USSD.
                        </Text>

                        <Section title="Paystack">
                            <Text style={styles.hint}>Get your public key from dashboard.paystack.com → Settings → API Keys</Text>
                            <TextInput
                                style={styles.input}
                                value={form.paystackPublicKey ?? ''}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, paystackPublicKey: v.trim() }))}
                                placeholder="pk_live_xxxxxxxxxxxxxxxxxx"
                                placeholderTextColor={Colors.muted}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </Section>

                        <Section title="Korapay">
                            <Text style={styles.hint}>Get your public key from merchant.korapay.com → Settings → API Keys</Text>
                            <TextInput
                                style={styles.input}
                                value={form.korapayPublicKey ?? ''}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, korapayPublicKey: v.trim() }))}
                                placeholder="pk_live_xxxxxxxxxxxxxxxxxx"
                                placeholderTextColor={Colors.muted}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </Section>

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSavePaymentKeys}>
                            <Text style={styles.saveBtnText}>Save Payment Keys</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.dataBtn, { marginTop: 8 }]}
                            onPress={() => {
                                const hasKey = (form.paystackPublicKey ?? '').trim() || (form.korapayPublicKey ?? '').trim();
                                if (!hasKey) {
                                    showAlert('No API Key', 'Add your Paystack or Korapay public key above and tap Save first.');
                                    return;
                                }
                                setCurrentScreen('payment-link');
                            }}
                        >
                            <View style={styles.btnIconRow}>
                                <Icon name="credit-card" size={14} color={Colors.primary} />
                                <Text style={styles.dataBtnText}>Create Payment Link →</Text>
                            </View>
                        </TouchableOpacity>
                    </CollapsibleSection>

                    {/* Bank & Mobile Money */}
                    <CollapsibleSection title="Bank & Mobile Money" defaultOpen={false}>
                        <Text style={styles.hint}>
                            Upload a bank statement file, or scan a photo of a statement/receipt, to import your transactions.
                        </Text>

                        {/* Auto-connect (Bank Aggregator / Connect Bank) removed from
                            navigation — that flow's real "connect" action is disabled
                            pending beta, so surfacing it here just offered a button
                            that doesn't do anything yet. */}
                        <TouchableOpacity style={styles.dataBtn} onPress={() => setCurrentScreen('import-transactions')}>
                            <View style={styles.btnIconRow}>
                                <Icon name="folder" size={14} color={Colors.primary} />
                                <Text style={styles.dataBtnText}>Import Bank Statement or Scan a Photo →</Text>
                            </View>
                        </TouchableOpacity>
                    </CollapsibleSection>

                    {/* ANALYTICS */}
                    <SectionHeader icon="upload" title="DATA & EXPORT" />

                    {/* Data & Backup */}
                    <CollapsibleSection title="Data & Backup" defaultOpen={false}>
                        <Section title="Export & Import">
                            <Text style={styles.hint}>
                                Export a full JSON backup of your account — transactions, invoices, assets, loans, budgets, inventory, staff, payroll, goals, settings, and activity history. Import to restore on a new device.
                            </Text>
                            <TouchableOpacity style={styles.dataBtn} onPress={handleExport}>
                                <View style={styles.btnIconRow}>
                                    <Icon name="package" size={14} color={Colors.primary} />
                                    <Text style={styles.dataBtnText}>Export All Data (JSON Backup)</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.dataBtn, { marginTop: 8, backgroundColor: '#10b981' }]} onPress={handleAccountantExport}>
                                <View style={styles.btnIconRow}>
                                    <Icon name="bar-chart-2" size={14} color={Colors.primary} />
                                    <Text style={styles.dataBtnText}>Export Accountant Report (CSV)</Text>
                                </View>
                            </TouchableOpacity>
                            <Text style={[styles.hint, { marginTop: 6 }]}>
                                Includes P&L, Balance Sheet, Cash Flow summary, and full transaction list — ready for your accountant or tax filing.
                            </Text>
                            <TouchableOpacity style={[styles.dataBtn, { marginTop: 8 }]} onPress={() => setImportModal(true)}>
                                <Text style={styles.dataBtnText}>Import Data</Text>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* Data Safety notice — shown only when user has transactions */}
                    {transactions.length > 0 && (
                        <View style={styles.dataSafetyCard}>
                            <View style={styles.btnIconRow}>
                                <Icon name="lock" size={14} color={Colors.textPrimary} />
                                <Text style={styles.dataSafetyTitle}>Your Data is Safe</Text>
                            </View>
                            <Text style={styles.dataSafetyBody}>
                                All your data is backed up to the cloud automatically. Even if you lose your phone, log in from any device to restore it.
                            </Text>
                            <Text style={styles.dataSafetyStatus}>Last backup: synced to cloud ✓</Text>
                        </View>
                    )}

                    {/* Role info for non-owners */}
                    {userRole !== 'owner' && (
                        <Section title="Your Access">
                            <Text style={styles.hint}>
                                {userRole === 'accountant'
                                    ? 'You have Accountant access — you can view all data and export reports, but cannot modify transactions or settings.'
                                    : 'You have Staff access — you can add transactions. Contact your business owner for full access.'}
                            </Text>
                        </Section>
                    )}

                    {/* Only ever visible to Quad360 admins (isFinancingAdmin) --
                        manages the real financing_products Supabase table that
                        FinancingMarketplaceScreen shows once it has listings. */}
                    {isFinancingAdmin(user?.email) && (
                        <Section title="Platform Admin">
                            <TouchableOpacity onPress={() => setCurrentScreen('financing-admin')} style={styles.saveBtn}>
                                <Text style={styles.saveBtnText}>Manage Financing Listings</Text>
                            </TouchableOpacity>
                        </Section>
                    )}
                </View>
            </ScrollView>
            <FooterNav />

            {/* Invite Modal */}
            <Modal visible={inviteModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, constrainSheetWidth && styles.modalCardWide]}>
                        <Text style={styles.modalTitle}>Invite Team Member</Text>
                        {pendingCode ? (
                            <>
                                <Text style={styles.hint}>Invite created! Share this code with your team member:</Text>
                                <View style={styles.codeBox}>
                                    <Text style={styles.codeText}>{pendingCode}</Text>
                                </View>
                                <Text style={[styles.hint, { marginTop: 8 }]}>
                                    They enter this code on the "Join a Team" screen in the app along with their email and a new PIN.
                                </Text>
                                <TouchableOpacity style={styles.saveBtn} onPress={async () => {
                                    const msg = `Your Quad360 invite code: ${pendingCode}`;
                                    if (Platform.OS === 'web') {
                                        if (navigator.share) { await navigator.share({ text: msg }); }
                                        else { await navigator.clipboard.writeText(msg); showAlert('Copied!', 'Invite code copied to clipboard.'); }
                                    } else {
                                        await Share.share({ message: msg });
                                    }
                                }}>
                                    <Text style={styles.saveBtnText}>Share Code</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setInviteModal(false); setPendingCode(null); }}>
                                    <Text style={styles.cancelBtnText}>Done</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.label}>Member Email</Text>
                                <TextInput style={styles.input} value={inviteEmail} onChangeText={setInviteEmail}
                                    placeholder="colleague@company.com" placeholderTextColor={Colors.muted}
                                    autoCapitalize="none" keyboardType="email-address" />
                                <Text style={styles.label}>Role</Text>
                                <View style={styles.optRow}>
                                    <Opt label="Accountant" active={inviteRole === 'accountant'} onPress={() => setInviteRole('accountant')} />
                                    <Opt label="Staff" active={inviteRole === 'staff'} onPress={() => setInviteRole('staff')} />
                                </View>
                                <Text style={[styles.hint, { marginTop: 10 }]}>
                                    {inviteRole === 'accountant'
                                        ? 'Accountant: can view all data and export reports.'
                                        : 'Staff: can add transactions only.'}
                                </Text>
                                <View style={[styles.modalBtns, { marginTop: 16 }]}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setInviteModal(false)}>
                                        <Text style={styles.cancelBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.saveBtn, { flex: 1, marginBottom: 0 }]} onPress={handleInvite}>
                                        <Text style={styles.saveBtnText}>Create Invite</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Import Modal */}
            <Modal visible={importModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, constrainSheetWidth && styles.modalCardWide]}>
                        <Text style={styles.modalTitle}>Import Backup</Text>
                        <Text style={styles.hint}>Paste your Quad360 JSON backup below.</Text>
                        <TextInput
                            style={[styles.input, styles.importArea]}
                            value={importJson}
                            onChangeText={setImportJson}
                            multiline
                            placeholder={'{"version": 1, ...}'}
                            placeholderTextColor={Colors.muted}
                            textAlignVertical="top"
                        />
                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setImportModal(false); setImportJson(''); }}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.saveBtn, { flex: 1, marginBottom: 0 }]} onPress={handleImport}>
                                <Text style={styles.saveBtnText}>Import</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Reset Business Data Modal */}
            <Modal visible={resetModal} animationType="slide" transparent onRequestClose={() => setResetModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, constrainSheetWidth && styles.modalCardWide]}>
                        <Text style={styles.modalTitle}>Reset Business Data</Text>
                        <Text style={[styles.hint, { marginBottom: 12 }]}>
                            This permanently deletes all transactions, invoices, goals, assets, loans, and inventory.
                            Your account and settings are kept. This cannot be undone.
                        </Text>
                        <Text style={styles.label}>Type RESET to confirm</Text>
                        <TextInput
                            style={[styles.input, { marginBottom: 16, letterSpacing: 2, fontWeight: '700' }]}
                            value={resetConfirmText}
                            onChangeText={v => setResetConfirmText(v.toUpperCase())}
                            placeholder="RESET"
                            placeholderTextColor={Colors.muted}
                            autoCapitalize="characters"
                        />
                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setResetModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, { flex: 1, marginBottom: 0, backgroundColor: resetConfirmText === 'RESET' ? Colors.expense : Colors.muted }]}
                                disabled={resetConfirmText !== 'RESET'}
                                onPress={() => { setResetModal(false); resetBusinessData(); }}
                            >
                                <Text style={styles.saveBtnText}>Delete All Records</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Account Modal */}
            <Modal visible={deleteModal} animationType="slide" transparent onRequestClose={() => setDeleteModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, constrainSheetWidth && styles.modalCardWide]}>
                        <Text style={styles.modalTitle}>Delete Account</Text>
                        <Text style={[styles.hint, { marginBottom: 12 }]}>
                            This permanently removes your account and ALL business data from the cloud.
                            This cannot be undone. You will need to create a new account to use Quad360 again.
                        </Text>
                        <Text style={styles.label}>Type DELETE to confirm</Text>
                        <TextInput
                            style={[styles.input, { marginBottom: 16, letterSpacing: 2, fontWeight: '700' }]}
                            value={deleteConfirmText}
                            onChangeText={v => setDeleteConfirmText(v.toUpperCase())}
                            placeholder="DELETE"
                            placeholderTextColor={Colors.muted}
                            autoCapitalize="characters"
                        />
                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, { flex: 1, marginBottom: 0, backgroundColor: deleteConfirmText === 'DELETE' ? '#7f1d1d' : Colors.muted }]}
                                disabled={deleteConfirmText !== 'DELETE'}
                                onPress={() => { setDeleteModal(false); deleteAccount(); }}
                            >
                                <Text style={styles.saveBtnText}>Delete My Account</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function SectionHeader({ icon, title }: { icon: IconName; title: string }) {
    return (
        <View style={styles.sectionHeaderMainRow}>
            <Icon name={icon} size={13} color={Colors.textPrimary} />
            <Text style={styles.sectionHeaderMain}>{title}</Text>
        </View>
    );
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <View style={styles.section}>
            <TouchableOpacity style={styles.sectionHeader} onPress={() => setOpen(v => !v)}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            {open && <View style={styles.sectionBody}>{children}</View>}
        </View>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>{title}</Text>
            {children}
        </View>
    );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Text style={styles.label}>{children}</Text>;
}
function Opt({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity style={[styles.opt, active && styles.optActive]} onPress={onPress}>
            <Text style={styles.optText}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:    { padding: Spacing.lg },
    title:  { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.xl },

    // Shared icon + label row used for section headers and icon-prefixed
    // buttons throughout this screen.
    btnIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    sectionHeaderMainRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm, marginTop: Spacing.lg },
    sectionHeaderMain: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.3 },

    section:        {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: Spacing.lg,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle:   { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    sectionBody:    { marginTop: Spacing.md },

    subsection:      { marginBottom: Spacing.lg },
    subsectionTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },

    hint:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: Spacing.sm },
    label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 10 },
    input: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    optRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    opt:       { paddingHorizontal: 14, paddingVertical: Spacing.sm, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText:   { color: Colors.textSecondary, fontSize: 13 },

    saveBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: Spacing.md },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    cancelBtn:   { paddingVertical: Spacing.md, alignItems: 'center' },
    cancelBtnText: { color: Colors.textMuted, fontSize: 14 },

    dataBtn:     { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.sm, alignItems: 'center' },
    dataBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },

    dangerBtn:     { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: Colors.expense, paddingVertical: Spacing.md, borderRadius: Radius.sm, alignItems: 'center' },
    dangerBtnText: { color: Colors.expense, fontWeight: '700', fontSize: 14 },

    dataSafetyCard:   { backgroundColor: 'rgba(0,102,204,0.08)', borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: Spacing.lg },
    dataSafetyTitle:  { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    dataSafetyBody:   { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm, marginTop: Spacing.xs },
    dataSafetyStatus: { fontSize: 12, color: Colors.income, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard:    { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xxl, paddingBottom: 36, ...Shadow.md },
    modalCardWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
    modalTitle:   { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.sm },
    importArea:   { height: 180, marginBottom: Spacing.lg },
    modalBtns:    { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },

    memberRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    memberEmail: { fontSize: 13, color: Colors.textPrimary, marginBottom: Spacing.xs },
    memberMeta:  { flexDirection: 'row', gap: 6 },
    roleBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    roleText:    { fontSize: 10, fontWeight: 'bold' },

    codeBox:  { backgroundColor: Colors.bg, borderRadius: 10, padding: Spacing.xl, alignItems: 'center', marginVertical: Spacing.md },
    codeText: { fontSize: 32, fontWeight: 'bold', color: Colors.primary, letterSpacing: 8 },
});
