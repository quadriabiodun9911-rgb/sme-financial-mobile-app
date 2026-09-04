import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    ScrollView, View, Text, TouchableOpacity,
    StyleSheet, TextInput, Modal, Platform, useWindowDimensions,
    Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { StaffMember, PayrollItem } from '../types';
import NextStepLink from '../components/NextStepLink';
import ProfitCashImpactCard from '../components/ProfitCashImpactCard';
import { computeProfitCashImpact } from '../utils/impactChain';
import PayrollProviderCard from '../components/PayrollProviderCard';
import { showAlert, confirmAction } from '../utils/webAlert';
import { getPayrollReminderStatus } from '../utils/payrollReminders';
import { computePayrollActivitySummary, describePayrollActivity, computeUnlinkedPayrollTransactions } from '../utils/payrollActivity';
import { localDateStr } from '../utils/localDate';

type Tab = 'staff' | 'run' | 'history';

const EMPTY_STAFF: Omit<StaffMember, 'id' | 'createdAt'> = {
    name: '', role: '', salary: 0, salaryType: 'monthly',
    startDate: localDateStr(),
    status: 'active', email: '', phone: '', bankName: '', accountNumber: '',
};

export default function PayrollScreen() {
    const { staff, addStaff, updateStaff, deleteStaff, payrollRuns, runPayroll, deletePayrollRun, settings, updateSettings, setCurrentScreen, finance, transactions } = useApp();

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. presentationStyle="pageSheet"
    // has no effect on web, so this still needs the constraint applied.
    const { width: windowWidth } = useWindowDimensions();
    const constrainModalWidth = Platform.OS === 'web' && windowWidth >= 720;

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
    const payrollStatus = useMemo(() => getPayrollReminderStatus(staff, payrollRuns), [staff, payrollRuns]);

    // Behavioral signal read straight from recorded/imported bank
    // transactions tagged "Payroll" -- when and roughly how much the
    // business actually pays staff, independent of whether a formal Run
    // Payroll was ever done in-app. Deliberately not a fabricated
    // per-staff PayrollRun (a lump bank line has no real per-staff split).
    const payrollActivity = useMemo(() => computePayrollActivitySummary(transactions), [transactions]);
    const payrollActivityDescription = useMemo(() => describePayrollActivity(payrollActivity, sym), [payrollActivity, sym]);

    // A "Payroll"-tagged transaction (import or manual entry) that no run
    // has claimed yet -- see computeUnlinkedPayrollTransactions. Applying
    // one uses the *current* active staff list to build the run's real
    // items (never invented from the bank line), then links the run to
    // this existing transaction instead of creating a duplicate expense.
    const unlinkedPayroll = useMemo(() => computeUnlinkedPayrollTransactions(transactions, payrollRuns), [transactions, payrollRuns]);
    const applyPayrollTransaction = (transactionId: string, period: string) => {
        if (activeStaff.length === 0) { showAlert('No active staff', 'Add staff before linking this payment to a payroll run.'); return; }
        if (payrollRuns.some(r => r.period === period)) { showAlert('Already run', `Payroll for ${period} already exists.`); return; }
        const rate = Math.max(0, parseFloat(deductRate) || 0) / 100;
        const items: PayrollItem[] = activeStaff.map(m => {
            const gross = m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22;
            const deductions = gross * rate;
            return { staffId: m.id, staffName: m.name, grossSalary: gross, deductions, netSalary: gross - deductions };
        });
        runPayroll(period, items, parseFloat(deductRate), transactionId);
    };
    const totalMonthlyPayroll = useMemo(() =>
        activeStaff.reduce((s, m) => s + (m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22), 0),
        [activeStaff]
    );

    const monthlyPayrollAnim = useRef(new Animated.Value(0)).current;
    const [animatedMonthlyPayroll, setAnimatedMonthlyPayroll] = useState(0);
    useEffect(() => {
        const id = monthlyPayrollAnim.addListener(({ value }) => setAnimatedMonthlyPayroll(value));
        Animated.timing(monthlyPayrollAnim, { toValue: totalMonthlyPayroll, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => monthlyPayrollAnim.removeListener(id);
    }, [totalMonthlyPayroll]);

    // Net payroll for the Run tab's live preview -- hoisted out of the JSX so
    // its own count-up animation (below) can react to it via useEffect;
    // recalculates whenever staff, salaries, or the typed deduction rate change.
    const totalNetPreview = useMemo(() => activeStaff.reduce((s, m) => {
        const g = m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22;
        return s + g * (1 - (Math.max(0, parseFloat(deductRate) || 0) / 100));
    }, 0), [activeStaff, deductRate]);

    const netPreviewAnim = useRef(new Animated.Value(0)).current;
    const [animatedNetPreview, setAnimatedNetPreview] = useState(0);
    useEffect(() => {
        const id = netPreviewAnim.addListener(({ value }) => setAnimatedNetPreview(value));
        Animated.timing(netPreviewAnim, { toValue: totalNetPreview, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => netPreviewAnim.removeListener(id);
    }, [totalNetPreview]);

    const openAdd = () => { setForm(EMPTY_STAFF); setEditingId(null); setStaffModal(true); };
    const openEdit = (s: StaffMember) => {
        setForm({ name: s.name, role: s.role, salary: s.salary, salaryType: s.salaryType, startDate: s.startDate, status: s.status, email: s.email || '', phone: s.phone || '', bankName: s.bankName || '', accountNumber: s.accountNumber || '' });
        setEditingId(s.id); setStaffModal(true);
    };
    const saveStaff = () => {
        if (!form.name.trim()) { showAlert('Name required'); return; }
        if (!form.salary || form.salary <= 0) { showAlert('Valid salary required'); return; }
        if (editingId) updateStaff(editingId, form);
        else addStaff(form);
        setStaffModal(false);
    };
    const confirmDelete = (id: string, name: string) => {
        confirmAction('Remove Staff', `Remove ${name}?`, 'Remove', () => deleteStaff(id));
    };

    const doRunPayroll = () => {
        if (activeStaff.length === 0) { showAlert('No active staff'); return; }
        const existing = payrollRuns.find(r => r.period === runPeriod);
        if (existing) { showAlert('Already run', `Payroll for ${runPeriod} already exists.`); return; }
        const parsedRate = parseFloat(deductRate);
        const rate = (isNaN(parsedRate) || parsedRate < 0) ? 0 : parsedRate / 100;
        const items: PayrollItem[] = activeStaff.map(m => {
            const gross = m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22;
            const deductions = gross * rate;
            return { staffId: m.id, staffName: m.name, grossSalary: gross, deductions, netSalary: gross - deductions };
        });
        confirmAction(
            'Run Payroll',
            `Pay ${activeStaff.length} staff for ${runPeriod}?\nTotal Net: ${fmt(items.reduce((s, i) => s + i.netSalary, 0))}`,
            'Run & Record',
            () => { runPayroll(runPeriod, items, parseFloat(deductRate)); setTab('history'); },
        );
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

            {payrollStatus.kind !== 'none' && (
                <TouchableOpacity
                    style={[styles.reminderBanner, payrollStatus.kind === 'overdue' && styles.reminderBannerOverdue]}
                    onPress={() => setTab('run')}
                    activeOpacity={0.8}
                >
                    <Icon name={payrollStatus.kind === 'overdue' ? 'alert-triangle' : 'alert-circle'} size={16} color={payrollStatus.kind === 'overdue' ? Colors.expense : Colors.warning} />
                    <Text style={styles.reminderBannerText}>
                        {payrollStatus.kind === 'overdue'
                            ? `No payroll run was recorded for ${payrollStatus.missedPeriod} — roughly ${fmt(totalMonthlyPayroll)} across ${activeStaff.length} active staff, based on today's payroll`
                            : `Payroll for ${payrollStatus.period} hasn't been run — ${payrollStatus.daysLeftInMonth} day${payrollStatus.daysLeftInMonth === 1 ? '' : 's'} left in the month (~${fmt(totalMonthlyPayroll)} due)`}
                    </Text>
                    <Text style={styles.reminderBannerCta}>Run →</Text>
                </TouchableOpacity>
            )}

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
                                <Text style={[styles.summaryValue, { color: Colors.expense }]}>{fmt(Math.round(animatedMonthlyPayroll))}</Text>
                                <Text style={styles.summaryLabel}>Monthly Total</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
                            <Text style={styles.addBtnText}>+ Add Staff Member</Text>
                        </TouchableOpacity>

                        {staff.length === 0 && (
                            <View style={styles.empty}>
                                <View style={styles.emptyIconWrap}>
                                    <Icon name="users" size={34} color={Colors.textMuted} />
                                </View>
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
                                            <Icon name="edit-2" size={15} color={Colors.textSecondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmDelete(s.id, s.name)} style={styles.iconBtn} activeOpacity={0.7}>
                                            <Icon name="trash-2" size={15} color={Colors.expense} />
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

                        {/* Only the net amount is ever recorded as a
                            transaction when payroll actually runs (see
                            runPayroll in OptimizedContexts.tsx — deductions
                            are withheld, not paid out through this expense).
                            The impact preview below has to use the same net
                            figure as "Total Net Payroll" above it, or the two
                            cards state two different dollar amounts for the
                            same run — it used to use gross (totalMonthlyPayroll),
                            so at any deduction rate above 0% the preview
                            promised a bigger profit/cash hit than would
                            actually happen once the run was recorded. */}
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
                                    <Text style={styles.previewTotalValue}>{fmt(Math.round(animatedNetPreview))}</Text>
                                </View>

                                <ProfitCashImpactCard
                                    impact={computeProfitCashImpact(finance?.profit ?? 0, finance?.cashBalance ?? 0, -totalNetPreview)}
                                    source="payroll"
                                    currency={sym}
                                    onSeeFullPicture={() => setCurrentScreen('business-passport')}
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
                        {/* What the bank statement itself already shows about
                            payroll -- when and how much the business pays
                            staff -- independent of whether a formal Run
                            Payroll was ever done in-app. Not a per-staff
                            breakdown (a lump bank line can't tell us that),
                            just the real pattern. */}
                        <View style={styles.activityCard}>
                            <Text style={styles.activityTitle}>Payroll Activity From Your Records</Text>
                            {payrollActivity.available ? (
                                <>
                                    <Text style={styles.activityDescription}>{payrollActivityDescription}</Text>
                                    {payrollActivity.entries.slice(0, 5).map((entry, i) => (
                                        <View key={i} style={styles.activityRow}>
                                            <Text style={styles.activityDate}>{entry.date}</Text>
                                            <Text style={styles.activityDesc} numberOfLines={1}>{entry.description}</Text>
                                            <Text style={styles.activityAmount}>{fmt(entry.amount)}</Text>
                                        </View>
                                    ))}
                                    {payrollActivity.entries.length > 5 && (
                                        <Text style={styles.activityMore}>+{payrollActivity.entries.length - 5} more recorded</Text>
                                    )}
                                </>
                            ) : (
                                <Text style={styles.activityDescription}>{payrollActivity.reason}</Text>
                            )}
                        </View>

                        {/* A payroll payment already sitting in your
                            transactions with no run to show for it --
                            linking it uses your current staff list for the
                            real per-person breakdown, and attaches this
                            existing payment instead of recording a second,
                            duplicate expense. */}
                        {unlinkedPayroll.length > 0 && (
                            <View style={styles.activityCard}>
                                <Text style={styles.activityTitle}>
                                    {unlinkedPayroll.length} payroll payment{unlinkedPayroll.length > 1 ? 's' : ''} {unlinkedPayroll.length > 1 ? "aren't" : "isn't"} linked to a run yet
                                </Text>
                                {unlinkedPayroll.slice(0, 3).map(p => (
                                    <View key={p.transactionId} style={styles.activityRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.activityDesc} numberOfLines={1}>{p.description}</Text>
                                            <Text style={[styles.activityDate, { width: undefined }]}>{p.date} · {fmt(p.amount)}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => applyPayrollTransaction(p.transactionId, p.period)}>
                                            <Text style={styles.linkAction}>Run Payroll for {p.period} →</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

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
                                        <TouchableOpacity onPress={() => confirmAction('Delete Run', `Delete payroll run for ${run.period}?`, 'Delete', () => deletePayrollRun(run.id))} activeOpacity={0.7}>
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
                  <View style={[{ flex: 1, width: '100%' }, constrainModalWidth && styles.modalConstrainedColumn]}>
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
                  </View>
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
    emptyIconWrap: { width: 64, height: 64, borderRadius: Radius.pill, backgroundColor: Colors.surfaceVariant, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
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

    activityCard: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 },
    activityTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    activityDescription: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: 10 },
    activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
    activityDate: { fontSize: 11, color: Colors.textMuted, width: 78 },
    activityDesc: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
    activityAmount: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    activityMore: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 6 },
    linkAction: { fontSize: 11.5, color: Colors.primary, fontWeight: '700' },

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
    // Matches App.tsx's centeredAppColumn width.
    modalConstrainedColumn: { maxWidth: 1040, alignSelf: 'center' },
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

    reminderBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: Spacing.md,
        borderRadius: Radius.md, borderWidth: 1,
        backgroundColor: 'rgba(245,158,11,0.1)', borderColor: Colors.warning,
    },
    reminderBannerOverdue: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: Colors.expense },
    reminderBannerText: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, fontWeight: '600' },
    reminderBannerCta: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },
});
