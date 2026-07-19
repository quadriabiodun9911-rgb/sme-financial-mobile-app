import React, { useState, useMemo } from 'react';
import {
    ScrollView, View, Text, TouchableOpacity,
    StyleSheet, TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { StaffMember, PayrollItem } from '../types';
import NextStepLink from '../components/NextStepLink';
import ProfitCashImpactCard from '../components/ProfitCashImpactCard';
import { computeProfitCashImpact } from '../utils/impactChain';
import PayrollProviderCard from '../components/PayrollProviderCard';

type Tab = 'staff' | 'run' | 'history';

const EMPTY_STAFF: Omit<StaffMember, 'id' | 'createdAt'> = {
    name: '', role: '', salary: 0, salaryType: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    status: 'active', email: '', phone: '', bankName: '', accountNumber: '',
};

export default function PayrollScreen() {
    const { staff, addStaff, updateStaff, deleteStaff, payrollRuns, runPayroll, deletePayrollRun, settings, updateSettings, setCurrentScreen, finance } = useApp();
    const [tab, setTab] = useState<Tab>('staff');
    const [staffModal, setStaffModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_STAFF);
    const [deductRate, setDeductRate] = useState('5');
    const [runPeriod, setRunPeriod] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const sym = settings.currency || '₦';
    const fmt = (n: number) => `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const activeStaff = useMemo(() => staff.filter(s => s.status === 'active'), [staff]);
    const totalMonthlyPayroll = useMemo(() =>
        activeStaff.reduce((s, m) => s + (m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22), 0),
        [activeStaff]
    );

    const openAdd = () => { setForm(EMPTY_STAFF); setEditingId(null); setStaffModal(true); };
    const openEdit = (s: StaffMember) => {
        setForm({ name: s.name, role: s.role, salary: s.salary, salaryType: s.salaryType, startDate: s.startDate, status: s.status, email: s.email || '', phone: s.phone || '', bankName: s.bankName || '', accountNumber: s.accountNumber || '' });
        setEditingId(s.id); setStaffModal(true);
    };
    const saveStaff = () => {
        if (!form.name.trim()) { Alert.alert('Name required'); return; }
        if (!form.salary || form.salary <= 0) { Alert.alert('Valid salary required'); return; }
        if (editingId) updateStaff(editingId, form);
        else addStaff(form);
        setStaffModal(false);
    };
    const confirmDelete = (id: string, name: string) => {
        Alert.alert('Remove Staff', `Remove ${name}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => deleteStaff(id) },
        ]);
    };

    const doRunPayroll = () => {
        if (activeStaff.length === 0) { Alert.alert('No active staff'); return; }
        const existing = payrollRuns.find(r => r.period === runPeriod);
        if (existing) { Alert.alert('Already run', `Payroll for ${runPeriod} already exists.`); return; }
        const parsedRate = parseFloat(deductRate);
        const rate = (isNaN(parsedRate) || parsedRate < 0) ? 0 : parsedRate / 100;
        const items: PayrollItem[] = activeStaff.map(m => {
            const gross = m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22;
            const deductions = gross * rate;
            return { staffId: m.id, staffName: m.name, grossSalary: gross, deductions, netSalary: gross - deductions };
        });
        Alert.alert('Run Payroll', `Pay ${activeStaff.length} staff for ${runPeriod}?\nTotal Net: ${fmt(items.reduce((s, i) => s + i.netSalary, 0))}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Run & Record', onPress: () => { runPayroll(runPeriod, items, parseFloat(deductRate)); setTab('history'); } },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* Tab bar */}
            <View style={styles.tabs}>
                {(['staff', 'run', 'history'] as Tab[]).map(t => (
                    <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)} activeOpacity={0.75}>
                        <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                            {t === 'staff' ? 'Staff' : t === 'run' ? 'Run Payroll' : 'History'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <PayrollProviderCard
                providerId={settings.payrollProviderId || 'manual'}
                onChangeProvider={id => updateSettings({ payrollProviderId: id })}
            />

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                {/* ── Staff Tab ─────────────────────────────────────────── */}
                {tab === 'staff' && (
                    <>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryBox}>
                                <Text style={styles.summaryValue}>{staff.length}</Text>
                                <Text style={styles.summaryLabel}>Total Staff</Text>
                            </View>
                            <View style={styles.summaryBox}>
                                <Text style={styles.summaryValue}>{activeStaff.length}</Text>
                                <Text style={styles.summaryLabel}>Active</Text>
                            </View>
                            <View style={styles.summaryBox}>
                                <Text style={[styles.summaryValue, { color: Colors.expense }]}>{fmt(totalMonthlyPayroll)}</Text>
                                <Text style={styles.summaryLabel}>Monthly Total</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
                            <Text style={styles.addBtnText}>+ Add Staff Member</Text>
                        </TouchableOpacity>

                        {staff.length === 0 && (
                            <View style={styles.empty}>
                                <Text style={styles.emptyIcon}>👥</Text>
                                <Text style={styles.emptyText}>No staff added yet</Text>
                                <Text style={styles.emptySubtext}>Add your first team member above</Text>
                            </View>
                        )}

                        {staff.map(s => {
                            const monthly = s.salaryType === 'monthly' ? s.salary : s.salaryType === 'weekly' ? s.salary * 4.33 : s.salary * 22;
                            return (
                                <View key={s.id} style={styles.staffCard}>
                                    <View style={styles.staffAvatar}>
                                        <Text style={styles.staffAvatarText}>{s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.staffInfo}>
                                        <Text style={styles.staffName}>{s.name}</Text>
                                        <Text style={styles.staffRole}>{s.role}</Text>
                                        <Text style={styles.staffSalary}>{fmt(monthly)}/mo · <Text style={{ color: s.status === 'active' ? Colors.income : Colors.textMuted }}>{s.status}</Text></Text>
                                    </View>
                                    <View style={styles.staffActions}>
                                        <TouchableOpacity onPress={() => openEdit(s)} style={styles.iconBtn} activeOpacity={0.7}>
                                            <Text style={styles.iconBtnText}>✏️</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmDelete(s.id, s.name)} style={styles.iconBtn} activeOpacity={0.7}>
                                            <Text style={styles.iconBtnText}>🗑️</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}

                {/* ── Run Payroll Tab ───────────────────────────────────── */}
                {tab === 'run' && (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Payroll Period</Text>
                            <TextInput
                                style={styles.input}
                                value={runPeriod}
                                onChangeText={setRunPeriod}
                                placeholder="YYYY-MM"
                                placeholderTextColor={Colors.textMuted}
                            />
                        </View>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Deduction Rate (%)</Text>
                            <Text style={styles.cardSubtitle}>Tax, pension, and other statutory deductions</Text>
                            <TextInput
                                style={styles.input}
                                value={deductRate}
                                onChangeText={setDeductRate}
                                keyboardType="decimal-pad"
                                placeholder="e.g. 7.5"
                                placeholderTextColor={Colors.textMuted}
                            />
                        </View>

                        {activeStaff.length > 0 && (
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Preview</Text>
                                {activeStaff.map(s => {
                                    const gross = s.salaryType === 'monthly' ? s.salary : s.salaryType === 'weekly' ? s.salary * 4.33 : s.salary * 22;
                                    const deductions = gross * (Math.max(0, parseFloat(deductRate) || 0) / 100);
                                    const net = gross - deductions;
                                    return (
                                        <View key={s.id} style={styles.previewRow}>
                                            <Text style={styles.previewName}>{s.name}</Text>
                                            <View style={styles.previewAmounts}>
                                                <Text style={styles.previewGross}>{fmt(gross)}</Text>
                                                <Text style={styles.previewDeduct}>-{fmt(deductions)}</Text>
                                                <Text style={styles.previewNet}>{fmt(net)}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                                <View style={styles.previewTotal}>
                                    <Text style={styles.previewTotalLabel}>Total Net Payroll</Text>
                                    <Text style={styles.previewTotalValue}>
                                        {fmt(activeStaff.reduce((s, m) => {
                                            const g = m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22;
                                            return s + g * (1 - (Math.max(0, parseFloat(deductRate) || 0) / 100));
                                        }, 0))}
                                    </Text>
                                </View>

                                <ProfitCashImpactCard
                                    impact={computeProfitCashImpact(finance?.profit ?? 0, finance?.cashBalance ?? 0, -totalMonthlyPayroll)}
                                    source="payroll"
                                    currency={sym}
                                    onSeeFullPicture={() => setCurrentScreen('clarity')}
                                />
                            </View>
                        )}

                        <TouchableOpacity style={[styles.runBtn, activeStaff.length === 0 && styles.runBtnDisabled]} onPress={doRunPayroll} activeOpacity={0.8} disabled={activeStaff.length === 0}>
                            <Text style={styles.runBtnText}>Run Payroll for {runPeriod}</Text>
                        </TouchableOpacity>
                        {activeStaff.length === 0 && <Text style={styles.noStaffNote}>Add staff members first</Text>}
                    </>
                )}

                {/* ── History Tab ───────────────────────────────────────── */}
                {tab === 'history' && (
                    <>
                        {payrollRuns.length > 0 && (
                            <NextStepLink text="See the effect of payroll on your cash forecast" onPress={() => setCurrentScreen('cashflow')} />
                        )}
                        {payrollRuns.length === 0 && (
                            <View style={styles.empty}>
                                <Text style={styles.emptyIcon}>📋</Text>
                                <Text style={styles.emptyText}>No payroll runs yet</Text>
                                <Text style={styles.emptySubtext}>Run your first payroll from the Run tab</Text>
                            </View>
                        )}
                        {[...payrollRuns].sort((a, b) => b.period.localeCompare(a.period)).map(run => (
                            <View key={run.id} style={styles.runCard}>
                                <View style={styles.runCardHeader}>
                                    <View>
                                        <Text style={styles.runPeriod}>{run.period}</Text>
                                        <Text style={styles.runDate}>Processed {run.runDate.split('T')[0]}</Text>
                                    </View>
                                    <View style={styles.runRight}>
                                        <View style={[styles.runStatus, { backgroundColor: run.status === 'paid' ? Colors.income + '22' : Colors.warning + '22' }]}>
                                            <Text style={[styles.runStatusText, { color: run.status === 'paid' ? Colors.income : Colors.warning }]}>{run.status.toUpperCase()}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => Alert.alert('Delete Run', `Delete payroll run for ${run.period}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deletePayrollRun(run.id) }])} activeOpacity={0.7}>
                                            <Text style={styles.deleteIcon}>🗑️</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.runStats}>
                                    <View style={styles.runStat}>
                                        <Text style={styles.runStatValue}>{run.items.length}</Text>
                                        <Text style={styles.runStatLabel}>Staff</Text>
                                    </View>
                                    <View style={styles.runStat}>
                                        <Text style={styles.runStatValue}>{fmt(run.totalGross)}</Text>
                                        <Text style={styles.runStatLabel}>Gross</Text>
                                    </View>
                                    <View style={styles.runStat}>
                                        <Text style={[styles.runStatValue, { color: Colors.expense }]}>{fmt(run.totalNet)}</Text>
                                        <Text style={styles.runStatLabel}>Net Paid</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </>
                )}

            </ScrollView>

            {/* ── Add / Edit Staff Modal ─────────────────────────────────── */}
            <Modal visible={staffModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setStaffModal(false)}>
                <SafeAreaView style={styles.modalSafe}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{editingId ? 'Edit Staff' : 'Add Staff'}</Text>
                        <TouchableOpacity onPress={() => setStaffModal(false)} activeOpacity={0.7}>
                            <Text style={styles.modalClose}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalScroll} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                        {([
                            { label: 'Full Name *', key: 'name', placeholder: 'e.g. Ada Johnson' },
                            { label: 'Job Title *', key: 'role', placeholder: 'e.g. Sales Manager' },
                            { label: 'Email', key: 'email', placeholder: 'ada@company.com' },
                            { label: 'Phone', key: 'phone', placeholder: '+234 800 000 0000' },
                            { label: 'Bank Name', key: 'bankName', placeholder: 'e.g. GTBank' },
                            { label: 'Account Number', key: 'accountNumber', placeholder: '0123456789' },
                            { label: 'Start Date', key: 'startDate', placeholder: 'YYYY-MM-DD' },
                        ] as { label: string; key: keyof typeof EMPTY_STAFF; placeholder: string }[]).map(f => (
                            <View key={f.key} style={{ marginBottom: 14 }}>
                                <Text style={styles.fieldLabel}>{f.label}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={String(form[f.key] || '')}
                                    onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                                    placeholder={f.placeholder}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType={f.key === 'accountNumber' ? 'numeric' : 'default'}
                                />
                            </View>
                        ))}

                        <Text style={styles.fieldLabel}>Salary Amount *</Text>
                        <TextInput
                            style={styles.input}
                            value={form.salary ? String(form.salary) : ''}
                            onChangeText={v => setForm(p => ({ ...p, salary: parseFloat(v) || 0 }))}
                            placeholder="e.g. 150000"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="decimal-pad"
                        />

                        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Salary Type</Text>
                        <View style={styles.segmentRow}>
                            {(['monthly', 'weekly', 'daily'] as const).map(t => (
                                <TouchableOpacity key={t} style={[styles.segment, form.salaryType === t && styles.segmentActive]} onPress={() => setForm(p => ({ ...p, salaryType: t }))} activeOpacity={0.75}>
                                    <Text style={[styles.segmentText, form.salaryType === t && styles.segmentTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Status</Text>
                        <View style={styles.segmentRow}>
                            {(['active', 'inactive'] as const).map(s => (
                                <TouchableOpacity key={s} style={[styles.segment, form.status === s && styles.segmentActive]} onPress={() => setForm(p => ({ ...p, status: s }))} activeOpacity={0.75}>
                                    <Text style={[styles.segmentText, form.status === s && styles.segmentTextActive]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={[styles.runBtn, { marginTop: 24 }]} onPress={saveStaff} activeOpacity={0.8}>
                            <Text style={styles.runBtnText}>{editingId ? 'Save Changes' : 'Add Staff Member'}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:    { flex: 1, backgroundColor: Colors.bg },
    scroll:  { flex: 1 },
    content: { padding: 16, paddingBottom: 24 },

    tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tab:  { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    tabText:   { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
    tabTextActive: { color: Colors.primary, fontWeight: '800' },

    summaryRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16, overflow: 'hidden' },
    summaryBox: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    summaryValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },

    addBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    empty: { alignItems: 'center', paddingVertical: 48 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
    emptySubtext: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },

    staffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 12 },
    staffAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '22', justifyContent: 'center', alignItems: 'center' },
    staffAvatarText: { fontSize: 14, fontWeight: '800', color: Colors.primary },
    staffInfo: { flex: 1 },
    staffName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    staffRole: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    staffSalary: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
    staffActions: { flexDirection: 'row', gap: 4 },
    iconBtn: { padding: 6 },
    iconBtnText: { fontSize: 16 },

    card: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
    input: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },

    previewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    previewName: { flex: 1, fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    previewAmounts: { flexDirection: 'row', gap: 10 },
    previewGross: { fontSize: 12, color: Colors.textMuted },
    previewDeduct: { fontSize: 12, color: Colors.expense },
    previewNet: { fontSize: 13, fontWeight: '700', color: Colors.income },
    previewTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 },
    previewTotalLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    previewTotalValue: { fontSize: 15, fontWeight: '800', color: Colors.income },

    runBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    runBtnDisabled: { backgroundColor: Colors.textMuted },
    runBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    noStaffNote: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: 8 },

    runCard: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12 },
    runCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
    runPeriod: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    runDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    runRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    runStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    runStatusText: { fontSize: 11, fontWeight: '800' },
    deleteIcon: { fontSize: 16 },
    runStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
    runStat: { flex: 1, alignItems: 'center' },
    runStatValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    runStatLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    // Modal
    modalSafe: { flex: 1, backgroundColor: Colors.bg },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
    modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    modalClose: { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },
    modalScroll: { flex: 1 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },

    segmentRow: { flexDirection: 'row', gap: 8 },
    segment: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface },
    segmentActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
    segmentText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
    segmentTextActive: { color: Colors.primary, fontWeight: '800' },

});
