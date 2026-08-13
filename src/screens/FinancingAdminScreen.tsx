import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { showAlert, confirmAction } from '../utils/webAlert';
import { generateId } from '../utils/uuid';
import {
    isFinancingAdmin, loadAllFinancingProductsForAdmin, saveFinancingProduct, deleteFinancingProduct,
} from '../utils/financingAdmin';
import {
    createLenderOrganization, loadLenderOrganizations, inviteLenderMember, loadLenderMembersForOrg,
} from '../utils/lenderAuth';
import { FinancingProduct, FinancingProductType, LenderType, Industry, LenderOrganization, LenderMember, LenderOrgType } from '../types';

const LENDER_TYPES: { id: LenderType; label: string }[] = [
    { id: 'bank', label: 'Bank' },
    { id: 'fintech', label: 'Fintech' },
    { id: 'dfi', label: 'DFI' },
    { id: 'microfinance', label: 'Microfinance' },
];

const PRODUCT_TYPES: { id: FinancingProductType; label: string }[] = [
    { id: 'asset_financing', label: 'Asset Financing' },
    { id: 'working_capital', label: 'Working Capital' },
    { id: 'invoice_financing', label: 'Invoice Financing' },
    { id: 'trade_finance', label: 'Trade Finance' },
    { id: 'term_loan', label: 'Term Loan' },
    { id: 'overdraft', label: 'Overdraft' },
];

const INDUSTRIES: { id: Industry; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'retail', label: 'Retail' },
    { id: 'food-service', label: 'Food Service' },
    { id: 'manufacturing', label: 'Manufacturing' },
    { id: 'professional-services', label: 'Professional Services' },
];

function emptyForm(): FinancingProduct {
    return {
        id: '',
        lenderName: '',
        lenderType: 'bank',
        productType: 'working_capital',
        productName: '',
        description: '',
        minAmount: 0,
        maxAmount: 0,
        minTermMonths: 0,
        maxTermMonths: 0,
        interestRateMinPct: 0,
        interestRateMaxPct: 0,
        eligibility: {},
        status: 'active',
    };
}

// n() parses a form text field to a number, treating blank as undefined so
// optional eligibility criteria genuinely stay unset rather than becoming 0
// (a 0 minimum would silently mean "no requirement" in most of these
// fields, which is a real, different meaning from "not specified").
function n(text: string): number | undefined {
    const v = parseFloat(text.replace(/[^0-9.]/g, ''));
    return isNaN(v) ? undefined : v;
}

export default function FinancingAdminScreen() {
    const { user, navigate } = useApp();
    const admin = isFinancingAdmin(user?.email);

    const [tab, setTab] = useState<'listings' | 'lenders'>('listings');

    const [products, setProducts] = useState<FinancingProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FinancingProduct>(emptyForm());
    const [saving, setSaving] = useState(false);

    // ─── Lender Accounts (Phase 2 of the Lender Auth & Financing-Visibility
    // Flow) — admin-only onboarding, mirroring how listings above are
    // admin-managed: create an organization, invite its first member,
    // they join with the code on their own device.
    const [lenderOrgs, setLenderOrgs] = useState<LenderOrganization[]>([]);
    const [lenderOrgsLoading, setLenderOrgsLoading] = useState(false);
    const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
    const [orgMembers, setOrgMembers] = useState<Record<string, LenderMember[]>>({});
    const [newOrgName, setNewOrgName] = useState('');
    const [newOrgType, setNewOrgType] = useState<LenderOrgType>('bank');
    const [creatingOrg, setCreatingOrg] = useState(false);
    const [inviteEmailByOrg, setInviteEmailByOrg] = useState<Record<string, string>>({});
    const [invitingOrgId, setInvitingOrgId] = useState<string | null>(null);
    const [lastInviteCode, setLastInviteCode] = useState<{ orgId: string; code: string } | null>(null);

    const reloadLenderOrgs = async () => {
        setLenderOrgsLoading(true);
        setLenderOrgs(await loadLenderOrganizations());
        setLenderOrgsLoading(false);
    };

    useEffect(() => {
        if (admin && tab === 'lenders') reloadLenderOrgs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [admin, tab]);

    const toggleOrgExpanded = async (orgId: string) => {
        if (expandedOrgId === orgId) { setExpandedOrgId(null); return; }
        setExpandedOrgId(orgId);
        if (!orgMembers[orgId]) {
            const members = await loadLenderMembersForOrg(orgId);
            setOrgMembers(prev => ({ ...prev, [orgId]: members }));
        }
    };

    const handleCreateOrg = async () => {
        if (!newOrgName.trim()) { showAlert('Missing name', 'Give the organization a name first.'); return; }
        setCreatingOrg(true);
        const res = await createLenderOrganization(newOrgName, newOrgType);
        setCreatingOrg(false);
        if (!res.ok) { showAlert('Could not create organization', res.error || 'Unknown error'); return; }
        setNewOrgName('');
        await reloadLenderOrgs();
    };

    const handleInvite = async (orgId: string) => {
        const email = (inviteEmailByOrg[orgId] || '').trim();
        if (!email) { showAlert('Missing email', "Enter the lender contact's email first."); return; }
        setInvitingOrgId(orgId);
        const res = await inviteLenderMember(orgId, email, 'admin');
        setInvitingOrgId(null);
        if (!res.ok) { showAlert('Invite failed', res.error || 'Unknown error'); return; }
        setInviteEmailByOrg(prev => ({ ...prev, [orgId]: '' }));
        setLastInviteCode({ orgId, code: res.inviteCode! });
        const members = await loadLenderMembersForOrg(orgId);
        setOrgMembers(prev => ({ ...prev, [orgId]: members }));
    };

    const reload = async () => {
        setLoading(true);
        const rows = await loadAllFinancingProductsForAdmin();
        if (rows === null) {
            setLoadError("Couldn't reach the financing_products table — check it exists (see supabase/migrations/006_financing_products_table.sql) and that this device is online.");
            setProducts([]);
        } else {
            setLoadError(null);
            setProducts(rows);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (admin) reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [admin]);

    if (!admin) {
        return (
            <SafeAreaView style={s.safe}>
                <Header />
                <View style={s.restricted}>
                    <Icon name="lock" size={40} color={Colors.textMuted} />
                    <Text style={s.restrictedTitle}>Access Restricted</Text>
                    <Text style={s.restrictedText}>This screen manages live financing listings and is limited to Quad360 admins.</Text>
                    <TouchableOpacity onPress={() => navigate('dashboard')} style={s.restrictedBtn}>
                        <Text style={s.restrictedBtnText}>← Back to Dashboard</Text>
                    </TouchableOpacity>
                </View>
                <FooterNav />
            </SafeAreaView>
        );
    }

    const openNew = () => { setForm(emptyForm()); setShowForm(true); };
    const openEdit = (p: FinancingProduct) => { setForm(p); setShowForm(true); };

    const handleSave = async () => {
        if (!form.lenderName.trim() || !form.productName.trim()) {
            showAlert('Missing fields', 'Lender name and product name are required.');
            return;
        }
        setSaving(true);
        const toSave: FinancingProduct = { ...form, id: form.id || generateId() };
        const { error } = await saveFinancingProduct(toSave, user?.email || 'unknown');
        setSaving(false);
        if (error) {
            showAlert('Save failed', error);
            return;
        }
        setShowForm(false);
        await reload();
    };

    const handleToggleStatus = async (p: FinancingProduct) => {
        const { error } = await saveFinancingProduct({ ...p, status: p.status === 'active' ? 'inactive' : 'active' }, user?.email || 'unknown');
        if (error) { showAlert('Update failed', error); return; }
        await reload();
    };

    const handleDelete = (p: FinancingProduct) => {
        confirmAction(
            'Delete listing?',
            `This permanently removes "${p.productName}" (${p.lenderName}). This can't be undone.`,
            'Delete',
            async () => {
                const { error } = await deleteFinancingProduct(p.id);
                if (error) { showAlert('Delete failed', error); return; }
                await reload();
            },
        );
    };

    const toggleIndustry = (industry: Industry) => {
        setForm(f => {
            const current = f.eligibility.eligibleIndustries ?? [];
            const next = current.includes(industry) ? current.filter(i => i !== industry) : [...current, industry];
            return { ...f, eligibility: { ...f.eligibility, eligibleIndustries: next } };
        });
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>🏦 Financing (Admin)</Text>
                <Text style={s.subtitle}>
                    Manage the live product listings SMEs see, and the lender organizations that can view the opted-in pipeline. Only visible to Quad360 admins.
                </Text>

                <View style={s.tabRow}>
                    <TouchableOpacity onPress={() => setTab('listings')} style={[s.tabBtn, tab === 'listings' && s.tabBtnActive]}>
                        <Text style={[s.tabBtnText, tab === 'listings' && s.tabBtnTextActive]}>Listings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTab('lenders')} style={[s.tabBtn, tab === 'lenders' && s.tabBtnActive]}>
                        <Text style={[s.tabBtnText, tab === 'lenders' && s.tabBtnTextActive]}>Lender Accounts</Text>
                    </TouchableOpacity>
                </View>

                {tab === 'listings' && (
                    <>
                        <TouchableOpacity onPress={openNew} style={s.addBtn}>
                            <Text style={s.addBtnText}>+ Add Listing</Text>
                        </TouchableOpacity>

                        {loading && <Text style={s.stateText}>Loading listings…</Text>}
                        {!loading && loadError && <Text style={[s.stateText, { color: Colors.expense }]}>{loadError}</Text>}
                        {!loading && !loadError && products.length === 0 && (
                            <Text style={s.stateText}>No listings yet — the Marketplace is showing the illustrative sample list. Add a listing to make it real.</Text>
                        )}

                        {products.map(p => (
                            <View key={p.id} style={s.card}>
                                <View style={s.cardHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.cardTitle}>{p.productName}</Text>
                                        <Text style={s.cardSub}>{p.lenderName} · {p.lenderType} · {p.productType}</Text>
                                    </View>
                                    <View style={[s.statusBadge, { backgroundColor: (p.status === 'active' ? Colors.income : Colors.textMuted) + '22' }]}>
                                        <Text style={[s.statusBadgeText, { color: p.status === 'active' ? Colors.income : Colors.textMuted }]}>{p.status}</Text>
                                    </View>
                                </View>
                                <Text style={s.cardMeta}>{p.minAmount.toLocaleString()}–{p.maxAmount.toLocaleString()} · {p.minTermMonths}–{p.maxTermMonths}mo · {p.interestRateMinPct}–{p.interestRateMaxPct}%</Text>
                                <View style={s.cardActions}>
                                    <TouchableOpacity onPress={() => openEdit(p)} style={s.cardActionBtn}>
                                        <Text style={s.cardActionText}>Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleToggleStatus(p)} style={s.cardActionBtn}>
                                        <Text style={s.cardActionText}>{p.status === 'active' ? 'Deactivate' : 'Activate'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDelete(p)} style={s.cardActionBtn}>
                                        <Text style={[s.cardActionText, { color: Colors.expense }]}>Delete</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </>
                )}

                {tab === 'lenders' && (
                    <>
                        <Text style={s.stateText}>
                            A lender organization can see only the opted-in, active pipeline listings (financing_pipeline_listings) — never raw transactions, invoices, or exact revenue. Invite codes are shown once here for you to relay out of band (email/call); they aren't emailed automatically.
                        </Text>

                        <View style={s.card}>
                            <Text style={s.sectionTitle}>New organization</Text>
                            <Field label="Organization name">
                                <TextInput style={s.input} value={newOrgName} onChangeText={setNewOrgName} placeholder="e.g. First City Bank" placeholderTextColor={Colors.textMuted} />
                            </Field>
                            <Field label="Type">
                                <SegmentRow options={LENDER_TYPES} value={newOrgType as LenderType} onChange={v => setNewOrgType(v as LenderOrgType)} />
                            </Field>
                            <TouchableOpacity onPress={handleCreateOrg} disabled={creatingOrg} style={[s.addBtn, creatingOrg && { opacity: 0.6 }]}>
                                <Text style={s.addBtnText}>{creatingOrg ? 'Creating…' : '+ Create Organization'}</Text>
                            </TouchableOpacity>
                        </View>

                        {lenderOrgsLoading && <Text style={s.stateText}>Loading lender organizations…</Text>}
                        {!lenderOrgsLoading && lenderOrgs.length === 0 && (
                            <Text style={s.stateText}>No lender organizations yet — create one above to invite its first member.</Text>
                        )}

                        {lenderOrgs.map(org => {
                            const expanded = expandedOrgId === org.id;
                            const members = orgMembers[org.id] ?? [];
                            return (
                                <View key={org.id} style={s.card}>
                                    <TouchableOpacity onPress={() => toggleOrgExpanded(org.id)} style={s.cardHeader}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.cardTitle}>{org.name}</Text>
                                            <Text style={s.cardSub}>{org.orgType} · {members.length ? `${members.length} member${members.length === 1 ? '' : 's'}` : (expanded ? 'no members yet' : 'tap to view members')}</Text>
                                        </View>
                                        <View style={[s.statusBadge, { backgroundColor: (org.status === 'active' ? Colors.income : Colors.textMuted) + '22' }]}>
                                            <Text style={[s.statusBadgeText, { color: org.status === 'active' ? Colors.income : Colors.textMuted }]}>{org.status}</Text>
                                        </View>
                                    </TouchableOpacity>

                                    {expanded && (
                                        <View style={{ marginTop: 10 }}>
                                            {members.map(m => (
                                                <View key={m.id} style={s.memberRow}>
                                                    <Text style={s.memberEmail}>{m.memberEmail}</Text>
                                                    <Text style={s.memberMeta}>{m.role} · {m.status}</Text>
                                                </View>
                                            ))}

                                            {lastInviteCode?.orgId === org.id && (
                                                <View style={s.inviteCodeBox}>
                                                    <Text style={s.inviteCodeLabel}>Invite code — share this with the invitee, they'll enter it in "Join as Lender":</Text>
                                                    <Text style={s.inviteCodeText}>{lastInviteCode.code}</Text>
                                                </View>
                                            )}

                                            <Text style={s.numFieldLabel}>Invite a member by email</Text>
                                            <View style={s.row}>
                                                <TextInput
                                                    style={[s.input, { flex: 1 }]}
                                                    value={inviteEmailByOrg[org.id] ?? ''}
                                                    onChangeText={t => setInviteEmailByOrg(prev => ({ ...prev, [org.id]: t }))}
                                                    placeholder="name@lender.com"
                                                    placeholderTextColor={Colors.textMuted}
                                                    keyboardType="email-address"
                                                    autoCapitalize="none"
                                                />
                                                <TouchableOpacity
                                                    onPress={() => handleInvite(org.id)}
                                                    disabled={invitingOrgId === org.id}
                                                    style={[s.cardActionBtn, { flex: 0, paddingHorizontal: 16 }, invitingOrgId === org.id && { opacity: 0.6 }]}
                                                >
                                                    <Text style={s.cardActionText}>{invitingOrgId === org.id ? 'Inviting…' : 'Invite'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>
            <FooterNav />

            <Modal visible={showForm} animationType="slide" transparent>
                <View style={s.overlay}>
                    <View style={s.sheet}>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 60 }}>
                            <TouchableOpacity onPress={() => setShowForm(false)}>
                                <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>✕ Close</Text>
                            </TouchableOpacity>
                            <Text style={s.formTitle}>{form.id ? 'Edit Listing' : 'New Listing'}</Text>

                            <Field label="Lender Name">
                                <TextInput style={s.input} value={form.lenderName} onChangeText={t => setForm(f => ({ ...f, lenderName: t }))} placeholder="e.g. First City Bank" placeholderTextColor={Colors.textMuted} />
                            </Field>

                            <Field label="Lender Type">
                                <SegmentRow options={LENDER_TYPES} value={form.lenderType} onChange={v => setForm(f => ({ ...f, lenderType: v }))} />
                            </Field>

                            <Field label="Product Type">
                                <SegmentRow options={PRODUCT_TYPES} value={form.productType} onChange={v => setForm(f => ({ ...f, productType: v }))} />
                            </Field>

                            <Field label="Product Name">
                                <TextInput style={s.input} value={form.productName} onChangeText={t => setForm(f => ({ ...f, productName: t }))} placeholder="e.g. Equipment Financing" placeholderTextColor={Colors.textMuted} />
                            </Field>

                            <Field label="Description">
                                <TextInput style={[s.input, { height: 70 }]} value={form.description} onChangeText={t => setForm(f => ({ ...f, description: t }))} multiline placeholder="What this product is for, in one or two sentences" placeholderTextColor={Colors.textMuted} />
                            </Field>

                            <Text style={s.sectionLabel}>Amount range</Text>
                            <View style={s.row}>
                                <NumField label="Min" value={form.minAmount} onChange={v => setForm(f => ({ ...f, minAmount: v ?? 0 }))} />
                                <NumField label="Max" value={form.maxAmount} onChange={v => setForm(f => ({ ...f, maxAmount: v ?? 0 }))} />
                            </View>

                            <Text style={s.sectionLabel}>Term (months)</Text>
                            <View style={s.row}>
                                <NumField label="Min" value={form.minTermMonths} onChange={v => setForm(f => ({ ...f, minTermMonths: v ?? 0 }))} />
                                <NumField label="Max" value={form.maxTermMonths} onChange={v => setForm(f => ({ ...f, maxTermMonths: v ?? 0 }))} />
                            </View>

                            <Text style={s.sectionLabel}>Interest rate (% p.a.)</Text>
                            <View style={s.row}>
                                <NumField label="Min" value={form.interestRateMinPct} onChange={v => setForm(f => ({ ...f, interestRateMinPct: v ?? 0 }))} />
                                <NumField label="Max" value={form.interestRateMaxPct} onChange={v => setForm(f => ({ ...f, interestRateMaxPct: v ?? 0 }))} />
                            </View>

                            <Text style={s.sectionTitle}>Eligibility (all optional — leave blank for "no requirement")</Text>

                            <Field label="Min monthly revenue">
                                <TextInput style={s.input} keyboardType="numeric" value={form.eligibility.minMonthlyRevenue?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minMonthlyRevenue: n(t) } }))} placeholderTextColor={Colors.textMuted} />
                            </Field>
                            <Field label="Min business age (months)">
                                <TextInput style={s.input} keyboardType="numeric" value={form.eligibility.minBusinessAgeMonths?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minBusinessAgeMonths: n(t) } }))} placeholderTextColor={Colors.textMuted} />
                            </Field>
                            <Field label="Min DSCR (e.g. 1.25)">
                                <TextInput style={s.input} keyboardType="numeric" value={form.eligibility.minDSCR?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minDSCR: n(t) } }))} placeholderTextColor={Colors.textMuted} />
                            </Field>
                            <Field label="Min equity contribution %">
                                <TextInput style={s.input} keyboardType="numeric" value={form.eligibility.minEquityContributionPct?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minEquityContributionPct: n(t) } }))} placeholderTextColor={Colors.textMuted} />
                            </Field>
                            <Field label="Max debt-to-revenue ratio (e.g. 0.5)">
                                <TextInput style={s.input} keyboardType="numeric" value={form.eligibility.maxDebtToRevenueRatio?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, maxDebtToRevenueRatio: n(t) } }))} placeholderTextColor={Colors.textMuted} />
                            </Field>
                            <Field label="Min transaction history (months)">
                                <TextInput style={s.input} keyboardType="numeric" value={form.eligibility.minTransactionHistoryMonths?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minTransactionHistoryMonths: n(t) } }))} placeholderTextColor={Colors.textMuted} />
                            </Field>

                            <Field label="Eligible industries (none selected = open to all)">
                                <View style={s.chipRow}>
                                    {INDUSTRIES.map(ind => {
                                        const active = (form.eligibility.eligibleIndustries ?? []).includes(ind.id);
                                        return (
                                            <TouchableOpacity key={ind.id} onPress={() => toggleIndustry(ind.id)} style={[s.chip, active && s.chipActive]}>
                                                <Text style={[s.chipText, active && s.chipTextActive]}>{ind.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </Field>

                            <Field label="Status">
                                <SegmentRow
                                    options={[{ id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }]}
                                    value={form.status ?? 'active'}
                                    onChange={v => setForm(f => ({ ...f, status: v as any }))}
                                />
                            </Field>

                            <TouchableOpacity onPress={handleSave} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.6 }]}>
                                <Text style={s.saveBtnText}>{saving ? 'Saving…' : (form.id ? 'Save Changes' : 'Create Listing')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={s.fieldLabel}>{label}</Text>
            {children}
        </View>
    );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number | undefined) => void }) {
    return (
        <View style={{ flex: 1 }}>
            <Text style={s.numFieldLabel}>{label}</Text>
            <TextInput
                style={s.input}
                keyboardType="numeric"
                value={value ? value.toString() : ''}
                onChangeText={t => onChange(n(t))}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
            />
        </View>
    );
}

function SegmentRow<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <View style={s.chipRow}>
            {options.map(opt => (
                <TouchableOpacity key={opt.id} onPress={() => onChange(opt.id)} style={[s.chip, value === opt.id && s.chipActive]}>
                    <Text style={[s.chipText, value === opt.id && s.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 18 },

    restricted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    restrictedTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12, marginBottom: 6 },
    restrictedText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
    restrictedBtn: { backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
    restrictedBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },

    addBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 18 },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    stateText: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },

    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface },
    tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
    tabBtnTextActive: { color: '#fff' },

    memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    memberEmail: { fontSize: 12.5, color: Colors.textPrimary, fontWeight: '600' },
    memberMeta: { fontSize: 11, color: Colors.textMuted },
    inviteCodeBox: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.primary, padding: 10, marginVertical: 10 },
    inviteCodeLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
    inviteCodeText: { fontSize: 16, fontWeight: '700', color: Colors.primary, letterSpacing: 1 },

    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    cardTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
    cardSub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    statusBadgeText: { fontSize: 10, fontWeight: '700' },
    cardMeta: { fontSize: 11.5, color: Colors.textSecondary, marginBottom: 10 },
    cardActions: { flexDirection: 'row', gap: 8 },
    cardActionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    cardActionText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', ...Shadow.md },
    formTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
    fieldLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    numFieldLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 6, marginBottom: 12 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
    chipTextActive: { color: '#fff' },
    saveBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
