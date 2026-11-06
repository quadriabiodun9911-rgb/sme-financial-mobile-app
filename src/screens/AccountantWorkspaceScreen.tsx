/**
 * Accountant Workspace -- a portfolio view of every client business this
 * login is an ACTIVE team member of in an advisory capacity (accountant /
 * external_accountant / manager / admin), the inverse of PortfolioScreen.tsx
 * (which combines businesses you OWN outright). Each client gets a
 * plain-language "financial position" and recommended "action" straight
 * from performFinancialDiagnosis -- the exact same engine the Dashboard and
 * Financial Assessment screen already run for that business, so this view
 * can never disagree with what the client sees on their own Dashboard.
 *
 * Also hosts the accountant-initiated invite flow (inviteBusinessAsAccountant
 * in storage.ts) -- the inverse of the owner-initiated "Invite Team Member"
 * flow in SettingsScreen.tsx: here the accountant creates a pending invite
 * naming themselves, and a business owner later claims it with the code
 * (SettingsScreen.tsx's "Enter an accountant's invite code" action).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Modal, Platform, Share } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import {
    getAuthUserId, loadMyTeamMemberships, loadSettingsForOwner, loadTransactionsForOwner,
    loadAssetsForOwner, loadInvoicesForOwner, loadLoansForOwner,
    inviteBusinessAsAccountant, listMySentBusinessInvites, cancelSentBusinessInvite,
    SentBusinessInvite, MyTeamMembership,
} from '../utils/storage';
import { computeFinance, getMonthlyExpenseAverage } from '../utils/finance';
import { performFinancialDiagnosis, RootCauseAnalysis } from '../utils/financialDiagnosisEngine';
import { showAlert } from '../utils/webAlert';

const ADVISORY_ROLES: MyTeamMembership['role'][] = ['accountant', 'external_accountant', 'manager', 'admin'];

interface ClientRow {
    ownerId: string;
    businessName: string;
    role: MyTeamMembership['role'];
    currency: string;
    hasEnoughData: boolean;
    topDiagnosis: RootCauseAnalysis | null;
    needsReview: boolean;
}

const SEVERITY_COLOR: Record<RootCauseAnalysis['severity'], string> = {
    critical: Colors.danger,
    warning: Colors.warning,
    info: Colors.textMuted,
};

function Opt({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity style={[s.opt, active && s.optActive]} onPress={onPress}>
            <Text style={[s.optText, active && s.optTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function AccountantWorkspaceScreen() {
    const { workspaceVersion, switchBusiness, setCurrentScreen } = useApp();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [clients, setClients] = useState<ClientRow[]>([]);
    const [switchingId, setSwitchingId] = useState<string | null>(null);

    const [sentInvites, setSentInvites] = useState<SentBusinessInvite[]>([]);
    const [inviteModal, setInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'accountant' | 'external_accountant'>('external_accountant');
    const [pendingCode, setPendingCode] = useState<string | null>(null);
    const [inviteSubmitting, setInviteSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [myId, memberships, invites] = await Promise.all([
                getAuthUserId(),
                loadMyTeamMemberships(),
                listMySentBusinessInvites(),
            ]);
            setSentInvites(invites);
            if (!myId) { setClients([]); return; }

            const advisory = memberships.filter(m => ADVISORY_ROLES.includes(m.role));

            const rows = await Promise.all(advisory.map(async (m): Promise<ClientRow | null> => {
                const [settings, transactions, assets, invoicesData, loans] = await Promise.all([
                    loadSettingsForOwner(m.ownerUserId),
                    loadTransactionsForOwner(m.ownerUserId),
                    loadAssetsForOwner(m.ownerUserId),
                    loadInvoicesForOwner(m.ownerUserId),
                    loadLoansForOwner(m.ownerUserId),
                ]);
                if (!settings) return null; // a genuine fetch failure, not just "no data yet" -- dropped rather than shown wrong

                const currency = settings.currency || '₦';
                const hasEnoughData = transactions.length >= 5;
                let topDiagnosis: RootCauseAnalysis | null = null;
                if (hasEnoughData) {
                    const finance = computeFinance(transactions, {
                        openingAssets: settings.openingAssets ?? '0',
                        openingLiabilities: settings.openingLiabilities ?? '0',
                        openingLoans: settings.openingLoans ?? '0',
                        openingOtherAssets: settings.openingOtherAssets ?? '0',
                    }, 0, assets);
                    const monthlyExpenseAverage = getMonthlyExpenseAverage(finance.expense, transactions);
                    const diagnosis = performFinancialDiagnosis(
                        transactions, invoicesData, finance.cashBalance, monthlyExpenseAverage,
                        currency, loans, [], assets, settings.industry as any,
                    );
                    topDiagnosis = diagnosis.diagnoses[0] ?? null;
                }
                const needsReview = !!topDiagnosis && (
                    topDiagnosis.severity === 'critical'
                    || topDiagnosis.severity === 'warning'
                    || topDiagnosis.id === 'under-recorded-expenses'
                    || topDiagnosis.id === 'implausible-margin'
                );

                return {
                    ownerId: m.ownerUserId,
                    businessName: m.ownerBusinessName,
                    role: m.role,
                    currency,
                    hasEnoughData,
                    topDiagnosis,
                    needsReview,
                };
            }));

            setClients(rows.filter((r): r is ClientRow => r !== null));
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceVersion]);

    useEffect(() => { load(); }, [load]);

    const needsReviewCount = clients.filter(c => c.needsReview).length;

    const openClient = async (ownerId: string) => {
        setSwitchingId(ownerId);
        try {
            await switchBusiness(ownerId);
            setCurrentScreen('dashboard');
        } catch {
            showAlert('Could not open business', 'Try again in a moment.');
        } finally {
            setSwitchingId(null);
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim()) { showAlert('Required', "Please enter the business's email."); return; }
        setInviteSubmitting(true);
        try {
            const code = await inviteBusinessAsAccountant(inviteEmail.trim(), inviteRole);
            setPendingCode(code);
            setInviteEmail('');
            const invites = await listMySentBusinessInvites();
            setSentInvites(invites);
        } catch (e: any) {
            showAlert('Invite failed', e?.message ?? 'Could not create invite.');
        } finally {
            setInviteSubmitting(false);
        }
    };

    const handleCancelInvite = async (id: string) => {
        await cancelSentBusinessInvite(id);
        setSentInvites(prev => prev.filter(i => i.id !== id));
    };

    const closeInviteModal = () => {
        setInviteModal(false);
        setPendingCode(null);
        setInviteEmail('');
    };

    const shareCode = async (code: string) => {
        const msg = `I'd like to manage your business's finances on Quad360. Enter this invite code under Settings → Team: ${code}`;
        if (Platform.OS === 'web') {
            if (navigator.share) { await navigator.share({ text: msg }); return; }
            try { await navigator.clipboard.writeText(msg); showAlert('Copied!', 'Invite message copied to clipboard.'); } catch { /* ignore */ }
        } else {
            await Share.share({ message: msg });
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <View style={s.titleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>Accountant Workspace</Text>
                            <Text style={s.subtitle}>Every client business you have advisory access to, with what needs your attention.</Text>
                        </View>
                    </View>

                    {!loading && !loadError && (
                        <View style={s.statRow}>
                            <View style={s.statTile}>
                                <Text style={s.statValue}>{clients.length}</Text>
                                <Text style={s.statLabel}>Client{clients.length === 1 ? '' : 'es'}</Text>
                            </View>
                            <View style={[s.statTile, needsReviewCount > 0 && s.statTileWarn]}>
                                <Text style={[s.statValue, needsReviewCount > 0 && s.statValueWarn]}>{needsReviewCount}</Text>
                                <Text style={s.statLabel}>Needing review</Text>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity style={s.inviteBtn} onPress={() => setInviteModal(true)} activeOpacity={0.85}>
                        <Icon name="user-plus" size={16} color="#fff" />
                        <Text style={s.inviteBtnText}>Invite a Business</Text>
                    </TouchableOpacity>

                    {sentInvites.length > 0 && (
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Pending Invites</Text>
                            <Text style={s.cardSubtitle}>Sent, waiting for the business to enter the code</Text>
                            {sentInvites.map(inv => (
                                <View key={inv.id} style={s.pendingRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.pendingEmail} numberOfLines={1}>{inv.businessEmail}</Text>
                                        <Text style={s.pendingCode}>Code: {inv.inviteCode}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleCancelInvite(inv.id)} style={s.cancelInviteBtn}>
                                        <Icon name="x" size={14} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {loading ? (
                        <View style={s.loadingBox}><ActivityIndicator size="small" color={Colors.primary} /></View>
                    ) : loadError ? (
                        <View style={s.warnBox}>
                            <Icon name="alert-triangle" size={16} color={Colors.warning} />
                            <View style={{ flex: 1 }}>
                                <Text style={s.warnText}>Couldn't load your client businesses just now — try again.</Text>
                                <TouchableOpacity onPress={load} style={s.retryBtn}><Text style={s.retryBtnText}>Retry</Text></TouchableOpacity>
                            </View>
                        </View>
                    ) : clients.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Icon name="briefcase" size={18} color={Colors.textMuted} />
                            <Text style={s.emptyText}>
                                You don't have advisory access to any client businesses yet. Invite one above, or ask a business owner to invite you from their own Settings → Team screen.
                            </Text>
                        </View>
                    ) : (
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Your Clients</Text>
                            {clients.map(c => (
                                <TouchableOpacity
                                    key={c.ownerId}
                                    style={s.clientRow}
                                    onPress={() => openClient(c.ownerId)}
                                    disabled={switchingId === c.ownerId}
                                    activeOpacity={0.75}
                                >
                                    <View style={{ flex: 1 }}>
                                        <View style={s.clientNameRow}>
                                            <Text style={s.clientName} numberOfLines={1}>{c.businessName}</Text>
                                            <View style={s.roleBadge}><Text style={s.roleBadgeText}>{c.role.replace('_', ' ')}</Text></View>
                                        </View>
                                        {!c.hasEnoughData ? (
                                            <Text style={s.clientMeta}>Not enough data yet</Text>
                                        ) : c.topDiagnosis ? (
                                            <>
                                                <View style={s.positionRow}>
                                                    <View style={[s.severityDot, { backgroundColor: SEVERITY_COLOR[c.topDiagnosis.severity] }]} />
                                                    <Text style={s.clientPosition} numberOfLines={2}>{c.topDiagnosis.problem}</Text>
                                                </View>
                                                <Text style={s.clientAction} numberOfLines={2}>→ {c.topDiagnosis.opportunity}</Text>
                                            </>
                                        ) : (
                                            <Text style={[s.clientMeta, { color: Colors.success }]}>No major concerns found</Text>
                                        )}
                                    </View>
                                    {switchingId === c.ownerId ? (
                                        <ActivityIndicator size="small" color={Colors.primary} />
                                    ) : (
                                        <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>
            <FooterNav />

            <Modal visible={inviteModal} transparent animationType="slide" onRequestClose={closeInviteModal}>
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>Invite a Business</Text>
                        {pendingCode ? (
                            <>
                                <Text style={s.hint}>Invite created! Send this code to the business owner:</Text>
                                <View style={s.codeBox}><Text style={s.codeText}>{pendingCode}</Text></View>
                                <Text style={[s.hint, { marginTop: 8 }]}>
                                    They enter it under Settings → Team → "Enter an accountant's invite code" in their own Quad360 app.
                                </Text>
                                <TouchableOpacity style={s.saveBtn} onPress={() => shareCode(pendingCode)}>
                                    <Text style={s.saveBtnText}>Share / Copy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.cancelBtn} onPress={closeInviteModal}>
                                    <Text style={s.cancelBtnText}>Done</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={s.label}>Business Email</Text>
                                <TextInput
                                    style={s.input}
                                    value={inviteEmail}
                                    onChangeText={setInviteEmail}
                                    placeholder="owner@theirbusiness.com"
                                    placeholderTextColor={Colors.textMuted}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                                <Text style={s.label}>Role</Text>
                                <View style={s.optRow}>
                                    <Opt label="External Accountant" active={inviteRole === 'external_accountant'} onPress={() => setInviteRole('external_accountant')} />
                                    <Opt label="Accountant" active={inviteRole === 'accountant'} onPress={() => setInviteRole('accountant')} />
                                </View>
                                <Text style={[s.hint, { marginTop: 10 }]}>
                                    {inviteRole === 'external_accountant'
                                        ? 'External Accountant: full read access to reports, reconciliation and analysis — no team, payment, or operational access.'
                                        : 'Accountant: full financial visibility, can record transactions, invoices and inventory, and export reports.'}
                                </Text>
                                <View style={s.modalBtns}>
                                    <TouchableOpacity style={s.cancelBtn} onPress={closeInviteModal}>
                                        <Text style={s.cancelBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.saveBtn, { flex: 1, marginBottom: 0 }]} onPress={handleInvite} disabled={inviteSubmitting}>
                                        <Text style={s.saveBtnText}>{inviteSubmitting ? 'Creating…' : 'Create Invite'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },
    statRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.md },
    statTile: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
    statTileWarn: { borderColor: Colors.warning + '55', backgroundColor: Colors.warning + '0d' },
    statValue: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
    statValueWarn: { color: Colors.warning },
    statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
    inviteBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, marginBottom: Spacing.md },
    inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.sm, lineHeight: 16 },
    pendingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    pendingEmail: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    pendingCode: { fontSize: 11, color: Colors.textMuted, marginTop: 1, fontVariant: ['tabular-nums'] },
    cancelInviteBtn: { padding: 6 },
    loadingBox: { paddingVertical: Spacing.xl, alignItems: 'center' },
    emptyBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
    emptyText: { flex: 1, fontSize: 12.5, color: Colors.textMuted, lineHeight: 17 },
    warnBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.warning + '15', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.warning + '33', padding: Spacing.md, marginBottom: Spacing.md },
    warnText: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, lineHeight: 17 },
    retryBtn: { marginTop: 8, alignSelf: 'flex-start' },
    retryBtnText: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },
    clientRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    clientNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    clientName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
    roleBadge: { backgroundColor: Colors.primary + '15', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
    roleBadgeText: { fontSize: 9.5, fontWeight: '700', color: Colors.primary, textTransform: 'capitalize' },
    clientMeta: { fontSize: 12, color: Colors.textMuted },
    positionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    severityDot: { width: 7, height: 7, borderRadius: 4, marginTop: 4, flexShrink: 0 },
    clientPosition: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, lineHeight: 17, fontWeight: '600' },
    clientAction: { fontSize: 12, color: Colors.textMuted, lineHeight: 16, marginTop: 3, marginLeft: 13 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg, paddingBottom: Spacing.xl },
    modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: { borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
    optTextActive: { color: '#fff' },
    hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
    codeBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, alignItems: 'center', marginVertical: 10 },
    codeText: { fontSize: 24, fontWeight: '800', color: Colors.primary, letterSpacing: 4 },
    modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
    saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    cancelBtn: { paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    cancelBtnText: { color: Colors.textMuted, fontWeight: '700', fontSize: 14 },
});
