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
    { label: 'USD ($)',   value: '$'   },
    { label: 'EUR (€)',   value: '€'   },
    { label: 'GBP (£)',   value: '£'   },
    { label: 'NGN (₦)',   value: '₦'   },
    { label: 'CNY (¥)',   value: '¥'   },
    { label: 'CAD (CA$)', value: 'CA$' },
];

const BUSINESS_TYPES: { label: string; value: BusinessSettings['businessType'] }[] = [
    { label: 'Product', value: 'product' },
    { label: 'Service', value: 'service' },
    { label: 'Both',    value: 'both'    },
];

export default function SettingsScreen() {
    const {
        settings, updateSettings, setCurrentScreen,
        changePin, exportData, importData, clearData, deleteAccount, logout,
        userRole, teamMembers, inviteMember, removeMember, refreshTeam,
        language, setLanguage,
    } = useApp();

    const [form, setForm] = useState({ ...settings });

    // Change PIN
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin]         = useState('');
    const [confirmPin, setConfirmPin] = useState('');

    // Import modal
    const [importModal, setImportModal] = useState(false);
    const [importJson, setImportJson]   = useState('');

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

    const handleChangePin = () => {
        if (!/^\d{4}$/.test(newPin)) {
            Alert.alert('Invalid PIN', 'New PIN must be exactly 4 digits.');
            return;
        }
        if (newPin !== confirmPin) {
            Alert.alert('PIN mismatch', 'New PINs do not match.');
            return;
        }
        const ok = changePin(currentPin, newPin);
        if (!ok) {
            Alert.alert('Incorrect PIN', 'Current PIN is incorrect.');
            return;
        }
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
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
        Alert.alert(
            'Delete Account',
            'This permanently deletes ALL your data — transactions, invoices, goals, and settings — from the cloud. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete My Account',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            'Are you absolutely sure?',
                            'Your business data will be gone forever. Type DELETE to confirm.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Yes, Delete Everything', style: 'destructive', onPress: () => deleteAccount() },
                            ],
                        );
                    },
                },
            ],
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Settings</Text>

                    {/* Business Type */}
                    <Section title="Business Type">
                        <View style={styles.optRow}>
                            {BUSINESS_TYPES.map(bt => (
                                <Opt key={bt.value} label={bt.label} active={form.businessType === bt.value}
                                    onPress={() => setForm(f => ({ ...f, businessType: bt.value }))} />
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
                                    onPress={() => setForm(f => ({ ...f, currency: c.value }))} />
                            ))}
                        </View>
                    </Section>

                    {/* Financial thresholds */}
                    <Section title="Financial Thresholds">
                        <FieldLabel>Minimum Cash Reserve ({form.currency})</FieldLabel>
                        <TextInput style={styles.input} value={form.minReserve}
                            onChangeText={v => setForm(f => ({ ...f, minReserve: v }))}
                            keyboardType="numeric" placeholder="5000" placeholderTextColor={Colors.muted} />

                        <FieldLabel>Target Profit Margin (%)</FieldLabel>
                        <TextInput style={styles.input} value={form.targetMargin}
                            onChangeText={v => setForm(f => ({ ...f, targetMargin: v }))}
                            keyboardType="numeric" placeholder="65" placeholderTextColor={Colors.muted} />
                    </Section>

                    {/* Tax */}
                    <Section title="Tax Settings">
                        <FieldLabel>Default Tax Rate (%)</FieldLabel>
                        <Text style={styles.hint}>
                            Applied automatically to new transactions. Can be overridden per transaction.
                        </Text>
                        <TextInput style={styles.input} value={form.defaultTaxRate}
                            onChangeText={v => setForm(f => ({ ...f, defaultTaxRate: v }))}
                            keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />
                    </Section>

                    {/* Opening Balances */}
                    <Section title="Opening Balance Sheet">
                        <Text style={styles.hint}>
                            Enter pre-existing asset and liability balances. Added to cash position for correct balance sheet totals.
                        </Text>
                        <FieldLabel>Opening Assets ({form.currency})</FieldLabel>
                        <TextInput style={styles.input} value={form.openingAssets}
                            onChangeText={v => setForm(f => ({ ...f, openingAssets: v }))}
                            keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />

                        <FieldLabel>Opening Liabilities ({form.currency})</FieldLabel>
                        <TextInput style={styles.input} value={form.openingLiabilities}
                            onChangeText={v => setForm(f => ({ ...f, openingLiabilities: v }))}
                            keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />
                    </Section>

                    <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                        <Text style={styles.saveBtnText}>Save Settings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setCurrentScreen('dashboard')}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    {/* Change PIN */}
                    <Section title="Change PIN">
                        <FieldLabel>Current PIN</FieldLabel>
                        <TextInput style={styles.input} value={currentPin}
                            onChangeText={setCurrentPin}
                            secureTextEntry keyboardType="number-pad" maxLength={4}
                            placeholder="••••" placeholderTextColor={Colors.muted} />
                        <FieldLabel>New PIN</FieldLabel>
                        <TextInput style={styles.input} value={newPin}
                            onChangeText={setNewPin}
                            secureTextEntry keyboardType="number-pad" maxLength={4}
                            placeholder="••••" placeholderTextColor={Colors.muted} />
                        <FieldLabel>Confirm New PIN</FieldLabel>
                        <TextInput style={styles.input} value={confirmPin}
                            onChangeText={setConfirmPin}
                            secureTextEntry keyboardType="number-pad" maxLength={4}
                            placeholder="••••" placeholderTextColor={Colors.muted} />
                        <TouchableOpacity style={[styles.saveBtn, { marginTop: 12, marginBottom: 0 }]} onPress={handleChangePin}>
                            <Text style={styles.saveBtnText}>Update PIN</Text>
                        </TouchableOpacity>
                    </Section>

                    {/* Data Management */}
                    <Section title="Data Management">
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

                    {/* Danger Zone */}
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

                    {/* Team Management — owner only */}
                    {userRole === 'owner' && (
                        <Section title="Team Management">
                            <Text style={styles.hint}>
                                Invite team members to access your business data. Accountants can view and export. Staff can add transactions.
                            </Text>
                            <TouchableOpacity style={styles.dataBtn} onPress={() => { setPendingCode(null); setInviteModal(true); }}>
                                <Text style={styles.dataBtnText}>+ Invite Team Member</Text>
                            </TouchableOpacity>

                            {teamMembers.length > 0 && (
                                <View style={{ marginTop: 14 }}>
                                    {teamMembers.map(m => (
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
        </SafeAreaView>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
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

    section:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
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
