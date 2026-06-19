import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert, Modal, Share,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { BusinessSettings } from '../types';
import { t, LANGUAGES } from '../utils/i18n';

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

const BUSINESS_TYPES: { label: string; value: BusinessSettings['businessType'] }[] = [
    { label: 'Product', value: 'product' },
    { label: 'Service', value: 'service' },
    { label: 'Both',    value: 'both'    },
];

export default function SettingsScreen() {
    const {
        settings, updateSettings, setCurrentScreen,
        changePin, exportData, importData, clearData, resetBusinessData, deleteAccount, logout,
        userRole, teamMembers, inviteMember, removeMember, refreshTeam,
        language, setLanguage,
        transactions, user, updateProfile,
    } = useApp() as any;

    const [form, setForm]       = useState({ ...settings });
    const [phone, setPhone]     = useState(user?.phone || '');

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
        Alert.alert(t(language, 'success'), 'Settings updated successfully.', [
            { text: t(language, 'done'), onPress: () => setCurrentScreen('dashboard') },
        ]);
    };

    const handleSave = () => {
        if (isNaN(parseFloat(form.minReserve)) || parseFloat(form.minReserve) < 0) {
            Alert.alert('Invalid value', 'Minimum reserve must be a non-negative number.'); return;
        }
        if (isNaN(parseFloat(form.targetMargin)) || parseFloat(form.targetMargin) < 0 || parseFloat(form.targetMargin) > 100) {
            Alert.alert('Invalid value', 'Target margin must be between 0 and 100.'); return;
        }
        const taxRate = parseFloat(form.defaultTaxRate);
        if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
            Alert.alert('Invalid value', 'Default tax rate must be between 0 and 100.'); return;
        }
        // Warn if currency changed
        if (form.currency !== settings.currency) {
            if (typeof window !== 'undefined') {
                // On web, Alert.alert multi-button doesn't work — use window.confirm
                const ok = window.confirm(t(language, 'currencyChangeWarning'));
                if (ok) doSave();
                return;
            }
            Alert.alert(
                t(language, 'currencyChangeTitle'),
                t(language, 'currencyChangeWarning'),
                [
                    { text: t(language, 'cancel'), style: 'cancel' },
                    { text: t(language, 'confirm'), onPress: doSave },
                ],
            );
            return;
        }
        doSave();
    };

    const handleChangePin = async () => {
        if (!/^\d{6}$/.test(newPin)) {
            Alert.alert('Invalid PIN', 'New PIN must be exactly 6 digits.');
            return;
        }
        if (newPin !== confirmPin) {
            Alert.alert('PIN mismatch', 'New PINs do not match.');
            return;
        }
        const result = await changePin(currentPin, newPin);
        if (!result.ok) {
            if (result.lockedUntil) {
                const mins = Math.ceil((result.lockedUntil - Date.now()) / 60000);
                Alert.alert('Too Many Attempts', `PIN change locked for ${mins} minute${mins !== 1 ? 's' : ''}. Use "Forgot PIN?" if needed.`);
            } else {
                Alert.alert('Incorrect PIN', 'Current PIN is incorrect.');
            }
            return;
        }
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
        Alert.alert('Success', 'PIN changed successfully.');
    };

    const handleExport = async () => {
        try {
            const json = await exportData();
            await Share.share({ message: json, title: 'Quad360 Backup' });
        } catch {
            Alert.alert('Export failed', 'Could not export data. Please try again.');
        }
    };

    const handleImport = async () => {
        if (!importJson.trim()) {
            Alert.alert('Empty input', 'Please paste your backup JSON.');
            return;
        }
        try {
            await importData(importJson.trim());
            setImportModal(false);
            setImportJson('');
            Alert.alert('Imported', 'Data restored successfully.');
        } catch (e: any) {
            Alert.alert('Import failed', e?.message ?? 'Invalid backup file.');
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim()) { Alert.alert('Required', 'Please enter the member\'s email.'); return; }
        try {
            const code = await inviteMember(inviteEmail.trim(), inviteRole);
            setInviteEmail('');
            setPendingCode(code);
        } catch (e: any) {
            Alert.alert('Invite failed', e?.message ?? 'Could not create invite.');
        }
    };

    const handleRemoveMember = (id: string, email: string) => {
        Alert.alert('Remove member', `Remove ${email} from your team?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => removeMember(id) },
        ]);
    };

    const handleResetBusinessData = () => {
        setResetConfirmText('');
        setResetModal(true);
    };

    const handleClearData = () => {
        Alert.alert(
            'Sign Out & Clear Local Cache',
            'This signs you out and clears the local app cache. Your data stays safely in the cloud — sign back in any time to restore everything.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                        await clearData();
                        logout();
                    },
                },
            ],
        );
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

                    {/* 1. My Business — default open */}
                    <CollapsibleSection title="My Business" defaultOpen={true}>
                        {/* Business Type */}
                        <Section title="Business Type">
                            <View style={styles.optRow}>
                                {BUSINESS_TYPES.map(bt => (
                                    <Opt key={bt.value} label={bt.label} active={form.businessType === bt.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, businessType: bt.value }))} />
                                ))}
                            </View>
                        </Section>

                        {/* Language */}
                        <Section title={t(language, 'language')}>
                            <View style={styles.optRow}>
                                {LANGUAGES.map(l => (
                                    <Opt key={l.code} label={l.nativeLabel} active={language === l.code}
                                        onPress={() => setLanguage(l.code)} />
                                ))}
                            </View>
                        </Section>

                        {/* Currency */}
                        <Section title={t(language, 'currency')}>
                            <View style={styles.optRow}>
                                {CURRENCIES.map(c => (
                                    <Opt key={c.value} label={c.label} active={form.currency === c.value}
                                        onPress={() => setForm((f: typeof form) => ({ ...f, currency: c.value }))} />
                                ))}
                            </View>
                        </Section>

                        {/* Phone for Pngme */}
                        <Section title="Phone Number">
                            <Text style={styles.hint}>Used for Pngme Financial Health scoring. Include country code e.g. +2348012345678</Text>
                            <TextInput
                                style={styles.input}
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="+2348012345678"
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

                    {/* 2. Targets & Tax — default closed */}
                    <CollapsibleSection title="Profit Goals & Tax" defaultOpen={false}>
                        {/* Financial thresholds */}
                        <Section title="Your Targets">
                            <FieldLabel>Minimum savings to keep at all times ({form.currency})</FieldLabel>
                            <Text style={styles.hint}>The app will warn you if your account drops below this amount.</Text>
                            <TextInput style={styles.input} value={form.minReserve}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, minReserve: v }))}
                                keyboardType="numeric" placeholder="5000" placeholderTextColor={Colors.muted} />

                            <FieldLabel>How much of each sale should be profit? (%)</FieldLabel>
                            <Text style={styles.hint}>Example: if you charge ₦1,000 and your costs are ₦400, your profit is 60%.</Text>
                            <TextInput style={styles.input} value={form.targetMargin}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, targetMargin: v }))}
                                keyboardType="numeric" placeholder="65" placeholderTextColor={Colors.muted} />
                        </Section>

                        {/* Tax */}
                        <Section title="Tax Settings">
                            <FieldLabel>Default Tax Rate (%)</FieldLabel>
                            <Text style={styles.hint}>
                                Applied automatically to new transactions. Can be overridden per transaction.
                            </Text>
                            <TextInput style={styles.input} value={form.defaultTaxRate}
                                onChangeText={v => setForm((f: typeof form) => ({ ...f, defaultTaxRate: v }))}
                                keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />
                        </Section>

                        {/* Opening Balances */}
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

                    {/* 3. Security — default closed */}
                    <CollapsibleSection title="Security" defaultOpen={false}>
                        {/* Change PIN */}
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

                        {/* Two-Factor Authentication */}
                        <Section title="Extra Security Lock">
                            <Text style={styles.hint}>
                                Turn this on to require a second code when you log in. Makes your account much harder to break into.
                            </Text>
                            <TouchableOpacity style={styles.dataBtn} onPress={() => setCurrentScreen('2fa' as any)}>
                                <Text style={styles.dataBtnText}>Set Up Extra Security Lock</Text>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* 4. Data & Backup — default closed */}
                    {/* Bank / Mobile Money Connection */}
                    <CollapsibleSection title="🏦 Bank & Mobile Money" defaultOpen={false}>
                        <Text style={styles.hint}>
                            Connect your bank or mobile money to auto-import transactions. Quad360 automatically picks the best provider for your region.
                        </Text>
                        <TouchableOpacity style={styles.dataBtn} onPress={() => setCurrentScreen('bank-aggregator' as any)}>
                            <Text style={styles.dataBtnText}>🌍  Connect Bank (Mono · Lean · Plaid · Pngme)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.dataBtn, { marginTop: 8 }]} onPress={() => setCurrentScreen('connect-bank' as any)}>
                            <Text style={styles.dataBtnText}>📱  Mobile Money / SMS (Android)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.dataBtn, { marginTop: 8 }]} onPress={() => setCurrentScreen('import-transactions' as any)}>
                            <Text style={styles.dataBtnText}>📂  Import Bank Statement (CSV / Excel)</Text>
                        </TouchableOpacity>
                    </CollapsibleSection>

                    <CollapsibleSection title="Data & Backup" defaultOpen={false}>
                        <Section title="Export & Import">
                            <Text style={styles.hint}>
                                Export a full JSON backup of all your transactions, goals, and settings. Import to restore on a new device.
                            </Text>
                            <TouchableOpacity style={styles.dataBtn} onPress={handleExport}>
                                <Text style={styles.dataBtnText}>Export All Data</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.dataBtn, { marginTop: 8 }]} onPress={() => setImportModal(true)}>
                                <Text style={styles.dataBtnText}>Import Data</Text>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* Data Safety notice — shown only when user has transactions */}
                    {transactions.length > 0 && (
                        <View style={styles.dataSafetyCard}>
                            <Text style={styles.dataSafetyTitle}>🔒 Your Data is Safe</Text>
                            <Text style={styles.dataSafetyBody}>
                                All your data is backed up to the cloud automatically. Even if you lose your phone, log in from any device to restore it.
                            </Text>
                            <Text style={styles.dataSafetyStatus}>Last backup: synced to cloud ✓</Text>
                        </View>
                    )}

                    {/* 5. Danger Zone — default closed */}
                    <CollapsibleSection title="Danger Zone" defaultOpen={false}>
                        {/* Reset Business Data */}
                        <Section title="Reset Business Data">
                            <Text style={styles.hint}>
                                Permanently deletes all transactions, invoices, goals, assets, loans, and inventory. Your account and settings are kept — use this to start fresh without creating a new account.
                            </Text>
                            <TouchableOpacity style={styles.dangerBtn} onPress={handleResetBusinessData}>
                                <Text style={styles.dangerBtnText}>Reset Business Data</Text>
                            </TouchableOpacity>
                        </Section>

                        {/* Sign Out */}
                        <Section title="Sign Out">
                            <Text style={styles.hint}>
                                Signs you out and clears the local cache. Your data is safely stored in the cloud and will be restored when you sign back in.
                            </Text>
                            <TouchableOpacity style={styles.dangerBtn} onPress={handleClearData}>
                                <Text style={styles.dangerBtnText}>Sign Out & Clear Cache</Text>
                            </TouchableOpacity>
                        </Section>

                        {/* Delete Account */}
                        <Section title="Delete Account">
                            <Text style={styles.hint}>
                                Permanently removes all your business data from the cloud. This cannot be undone.
                            </Text>
                            <TouchableOpacity style={[styles.dangerBtn, { borderColor: '#7f1d1d', backgroundColor: 'rgba(127,29,29,0.12)' }]} onPress={handleDeleteAccount}>
                                <Text style={[styles.dangerBtnText, { color: '#ef4444' }]}>Delete Account</Text>
                            </TouchableOpacity>
                        </Section>
                    </CollapsibleSection>

                    {/* 6. Team — default open, owner only */}
                    {userRole === 'owner' && (
                        <CollapsibleSection title="Team" defaultOpen={true}>
                            <Section title="Team Management">
                                <Text style={styles.hint}>
                                    Invite team members to access your business data. Accountants can view and export. Staff can add transactions.
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
                </View>
            </ScrollView>
            <FooterNav />

            {/* Invite Modal */}
            <Modal visible={inviteModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
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
                                    await Share.share({ message: `Your Quad360 invite code: ${pendingCode}` });
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
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Import Backup</Text>
                        <Text style={styles.hint}>Paste your Quad360 JSON backup below.</Text>
                        <TextInput
                            style={[styles.input, styles.importArea]}
                            value={importJson}
                            onChangeText={setImportJson}
                            multiline
                            placeholder={'{ "version": 1, ... }'}
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
                    <View style={styles.modalCard}>
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
                    <View style={styles.modalCard}>
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

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <View style={styles.section}>
            <TouchableOpacity style={styles.sectionHeader} onPress={() => setOpen(v => !v)}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.sectionChevron}>{open ? '▾' : '▸'}</Text>
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
    pad:    { padding: 16 },
    title:  { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 20 },

    section:        { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle:   { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    sectionChevron: { fontSize: 16, color: Colors.textMuted },
    sectionBody:    { marginTop: 12 },

    subsection:      { marginBottom: 16 },
    subsectionTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

    hint:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 8 },
    label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 10 },
    input: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    optRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt:       { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText:   { color: Colors.textSecondary, fontSize: 13 },

    saveBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
    saveBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
    cancelBtn:   { paddingVertical: 12, alignItems: 'center' },
    cancelBtnText: { color: Colors.textMuted, fontSize: 14 },

    dataBtn:     { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    dataBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },

    dangerBtn:     { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: Colors.expense, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    dangerBtnText: { color: Colors.expense, fontWeight: '700', fontSize: 14 },

    dataSafetyCard:   { backgroundColor: 'rgba(0,102,204,0.08)', borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, padding: 16, marginBottom: 16 },
    dataSafetyTitle:  { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    dataSafetyBody:   { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 },
    dataSafetyStatus: { fontSize: 12, color: Colors.income, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard:    { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
    modalTitle:   { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    importArea:   { height: 180, marginBottom: 16 },
    modalBtns:    { flexDirection: 'row', gap: 12, alignItems: 'center' },

    memberRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    memberEmail: { fontSize: 13, color: Colors.textPrimary, marginBottom: 4 },
    memberMeta:  { flexDirection: 'row', gap: 6 },
    roleBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    roleText:    { fontSize: 10, fontWeight: 'bold' },

    codeBox:  { backgroundColor: Colors.bg, borderRadius: 10, padding: 20, alignItems: 'center', marginVertical: 12 },
    codeText: { fontSize: 32, fontWeight: 'bold', color: Colors.primary, letterSpacing: 8 },
});
