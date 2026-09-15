/**
 * Vendor Bill intake -- collect, review and organize vendor invoices
 * reaching this business (AP-side), separate from the customer-facing
 * Invoices screen (AR-side). Deliberately intake/review only: no bill-pay
 * or payment scheduling here (see the Bill type's own comment). Two-thirds
 * capture mechanics (manual entry, or a photo read by the same AI scanner
 * DashboardScreen's receipt capture already uses), one-third the actual
 * value-add -- billIntelligence.ts's flags and cash-impact panel, so a
 * bill about to be approved shows what it actually does to runway before
 * it's recorded, not just what it says.
 */
import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import DateInput from '../components/DateInput';
import { showAlert, confirmAction } from '../utils/webAlert';
import { Bill, BillFlag } from '../types';
import { detectBillFlags, computeBillCashImpact } from '../utils/billIntelligence';
import { scanStatementImage, ScanMediaType, ScannedBillDetails } from '../utils/statementScan';

const FLAG_META: Record<BillFlag, { label: string; icon: IconName; color: string }> = {
    duplicate: { label: 'Possible duplicate', icon: 'copy', color: Colors.danger },
    above_threshold: { label: 'Above your threshold', icon: 'alert-triangle', color: Colors.warning },
    new_vendor: { label: 'New vendor', icon: 'user-plus', color: Colors.primary },
    missing_info: { label: 'Missing details', icon: 'help-circle', color: Colors.textMuted },
};

const RISK_META: Record<'low' | 'medium' | 'high', { label: string; color: string }> = {
    low: { label: 'Low cash impact', color: Colors.income },
    medium: { label: 'Watch cash impact', color: Colors.warning },
    high: { label: 'High cash impact', color: Colors.expense },
};

interface FormState {
    vendorName: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    subtotal: string;
    taxTotal: string;
    notes: string;
}

const EMPTY_FORM: FormState = { vendorName: '', invoiceNumber: '', invoiceDate: '', dueDate: '', subtotal: '', taxTotal: '', notes: '' };

function FlagRow({ flags }: { flags: BillFlag[] }) {
    if (flags.length === 0) return null;
    return (
        <View style={s.flagRow}>
            {flags.map(f => (
                <View key={f} style={[s.flagChip, { borderColor: FLAG_META[f].color }]}>
                    <Icon name={FLAG_META[f].icon} size={11} color={FLAG_META[f].color} />
                    <Text style={[s.flagChipText, { color: FLAG_META[f].color }]}>{FLAG_META[f].label}</Text>
                </View>
            ))}
        </View>
    );
}

export default function BillsScreen() {
    const {
        bills, addBill, updateBill, deleteBill, reviewBill,
        transactions, finance, settings,
    } = useApp() as ReturnType<typeof useApp>;

    const cur = settings.currency || '';
    // 0/blank means "no threshold set" -- billIntelligence.ts's own
    // discipline, never "flag every bill".
    const threshold = parseFloat(settings.billFlagThreshold || '0') || 0;

    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [fromScan, setFromScan] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);

    const subtotalNum = parseFloat(form.subtotal) || 0;
    const taxNum = parseFloat(form.taxTotal) || 0;
    const totalNum = subtotalNum + taxNum;

    const otherBills = useMemo(() => bills.filter(b => b.id !== editId), [bills, editId]);

    const draftBill: Bill = useMemo(() => ({
        id: editId || '__draft__',
        vendorName: form.vendorName.trim(),
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate || undefined,
        lineItems: [],
        notes: form.notes.trim() || undefined,
        status: 'needs_review',
        subtotal: subtotalNum,
        taxTotal: taxNum,
        total: totalNum,
        currency: cur,
        createdAt: new Date().toISOString(),
        source: fromScan ? 'scanned' : 'manual',
    }), [editId, form, subtotalNum, taxNum, totalNum, cur, fromScan]);

    const liveFlags = useMemo(
        () => (showForm && form.vendorName.trim()) ? detectBillFlags(draftBill, otherBills, { thresholdAmount: threshold }) : [],
        [showForm, draftBill, otherBills, threshold]
    );

    const liveCashImpact = useMemo(
        () => (showForm && totalNum > 0) ? computeBillCashImpact(draftBill, transactions, finance.cashBalance) : null,
        [showForm, draftBill, totalNum, transactions, finance.cashBalance]
    );

    const resetForm = () => { setForm(EMPTY_FORM); setEditId(null); setFromScan(false); setScanError(null); };

    const openManual = () => { resetForm(); setShowForm(true); };
    const closeForm = () => { setShowForm(false); resetForm(); };

    const applyScan = (details: ScannedBillDetails) => {
        setForm({
            vendorName: details.vendorName || '',
            invoiceNumber: details.invoiceNumber || '',
            invoiceDate: details.invoiceDate || '',
            dueDate: details.dueDate || '',
            subtotal: details.subtotal != null ? String(details.subtotal) : (details.total != null ? String(details.total) : ''),
            taxTotal: details.taxTotal != null ? String(details.taxTotal) : '',
            notes: '',
        });
        setFromScan(true);
        setEditId(null);
        setShowForm(true);
    };

    const runScan = async (base64: string, mediaType: ScanMediaType) => {
        setScanning(true);
        setScanError(null);
        try {
            const result = await scanStatementImage(base64, mediaType);
            if (!result.billDetails || (!result.billDetails.vendorName && result.billDetails.total == null)) {
                setScanError(result.warning || "Couldn't read a vendor bill from this photo -- make sure it's clearly a supplier invoice addressed to this business, or enter it by hand.");
                return;
            }
            applyScan(result.billDetails);
        } catch (e: any) {
            setScanError(e?.message || 'Could not scan this photo. Please try again.');
        } finally {
            setScanning(false);
        }
    };

    // Native (iOS/Android) camera + library -- same expo-image-picker
    // pattern DashboardScreen's receipt capture already uses.
    const handleNative = async (source: 'camera' | 'library') => {
        setScanError(null);
        try {
            const perm = source === 'camera'
                ? await ImagePicker.requestCameraPermissionsAsync()
                : await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                setScanError(source === 'camera' ? 'Camera permission is needed to photograph a bill.' : 'Photo library permission is needed to pick a photo.');
                return;
            }
            const pick = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
            const result = await pick({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
            if (result.canceled || !result.assets?.[0]?.base64) return;
            await runScan(result.assets[0].base64, 'image/jpeg');
        } catch (e: any) {
            setScanError(e?.message || 'Failed to open camera/gallery. Please try again.');
        }
    };

    // Web -- hidden file input, same pattern as DashboardScreen's receipt capture.
    const handleWeb = (useCamera: boolean) => {
        if (typeof document === 'undefined') return;
        setScanError(null);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (useCamera) input.setAttribute('capture', 'environment');
        input.onchange = async (e: any) => {
            const file: File = e.target?.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const idx = result.indexOf(',');
                const base64 = idx >= 0 ? result.slice(idx + 1) : result;
                const mediaType = (file.type || 'image/jpeg') as ScanMediaType;
                runScan(base64, mediaType);
            };
            reader.onerror = () => setScanError('Could not read that photo. Please try again.');
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const captureBill = (source: 'camera' | 'library') =>
        Platform.OS === 'web' ? handleWeb(source === 'camera') : handleNative(source);

    const handleSave = () => {
        if (!form.vendorName.trim()) { showAlert('Required', "Vendor name can't be blank."); return; }
        if (totalNum <= 0) { showAlert('Invalid amount', 'Enter a subtotal or tax amount greater than zero.'); return; }

        const payload = {
            vendorName: form.vendorName.trim(),
            invoiceNumber: form.invoiceNumber.trim() || undefined,
            invoiceDate: form.invoiceDate || undefined,
            dueDate: form.dueDate || undefined,
            lineItems: [],
            notes: form.notes.trim() || undefined,
            status: 'needs_review' as const,
            subtotal: subtotalNum,
            taxTotal: taxNum,
            total: totalNum,
            currency: cur,
            source: fromScan ? ('scanned' as const) : ('manual' as const),
        };

        if (editId) updateBill(editId, payload);
        else addBill(payload as Bill);
        closeForm();
    };

    const startEdit = (bill: Bill) => {
        setEditId(bill.id);
        setForm({
            vendorName: bill.vendorName,
            invoiceNumber: bill.invoiceNumber || '',
            invoiceDate: bill.invoiceDate || '',
            dueDate: bill.dueDate || '',
            subtotal: String(bill.subtotal || ''),
            taxTotal: String(bill.taxTotal || ''),
            notes: bill.notes || '',
        });
        setFromScan(bill.source === 'scanned');
        setShowForm(true);
    };

    const doRecord = (bill: Bill) => confirmAction(
        'Record as expense?',
        `This adds a ${cur}${bill.total.toLocaleString()} expense to your ledger (due ${bill.dueDate || 'no date set'}). You can review it any time in Transactions.`,
        'Record',
        () => reviewBill(bill.id, 'record'),
        false,
    );
    const doDismiss = (bill: Bill) => confirmAction(
        'Dismiss this bill?',
        'It stays on record as reviewed, but no expense is created.',
        'Dismiss',
        () => reviewBill(bill.id, 'dismiss'),
        false,
    );
    const doDelete = (bill: Bill) => confirmAction(
        'Delete this bill?',
        bill.linkedTransactionId ? 'This also removes the expense it created from Transactions.' : 'This cannot be undone.',
        'Delete',
        () => deleteBill(bill.id),
    );

    const needsReview = useMemo(() => bills.filter(b => b.status === 'needs_review').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [bills]);
    const resolved = useMemo(() => bills.filter(b => b.status !== 'needs_review').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).reverse(), [bills]);

    const renderBillCard = (bill: Bill, actionable: boolean) => {
        const flags = detectBillFlags(bill, bills, { thresholdAmount: threshold });
        const impact = computeBillCashImpact(bill, transactions, finance.cashBalance);
        return (
            <View key={bill.id} style={s.card}>
                <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardVendor}>{bill.vendorName || 'Unnamed vendor'}</Text>
                        <Text style={s.cardMeta}>
                            {bill.invoiceNumber ? `${bill.invoiceNumber} · ` : ''}{bill.invoiceDate || 'No date'}
                            {bill.dueDate ? ` · Due ${bill.dueDate}` : ''}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.cardAmount}>{bill.currency}{bill.total.toLocaleString()}</Text>
                        {bill.source === 'scanned' && (
                            <View style={s.scannedTag}><Icon name="camera" size={10} color={Colors.textMuted} /><Text style={s.scannedTagText}>AI-read</Text></View>
                        )}
                    </View>
                </View>

                <FlagRow flags={flags} />

                {actionable && (
                    <View style={s.impactRow}>
                        <View style={[s.riskDot, { backgroundColor: RISK_META[impact.risk].color }]} />
                        <Text style={s.impactText}>
                            {RISK_META[impact.risk].label} — runway {Number.isFinite(impact.before.runwayDays) ? `${Math.round(impact.before.runwayDays)}d` : '∞'} → {Number.isFinite(impact.after.runwayDays) ? `${Math.round(impact.after.runwayDays)}d` : '∞'} if paid now
                        </Text>
                    </View>
                )}

                {bill.status === 'recorded' && <Text style={s.statusNote}>Recorded as an expense</Text>}
                {bill.status === 'dismissed' && <Text style={s.statusNote}>Dismissed — no expense created</Text>}

                <View style={s.cardActions}>
                    {actionable && (
                        <>
                            <TouchableOpacity style={[s.actionBtn, s.actionBtnPrimary]} onPress={() => doRecord(bill)}>
                                <Icon name="check" size={13} color="#fff" /><Text style={s.actionBtnPrimaryText}>Record as expense</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.actionBtn} onPress={() => doDismiss(bill)}>
                                <Text style={s.actionBtnText}>Dismiss</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.actionBtn} onPress={() => startEdit(bill)}>
                                <Text style={s.actionBtnText}>Edit</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    <TouchableOpacity style={s.actionBtn} onPress={() => doDelete(bill)}>
                        <Icon name="trash-2" size={13} color={Colors.danger} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <View style={s.titleRow}>
                        <View>
                            <Text style={s.title}>Vendor Bills</Text>
                            <Text style={s.subtitle}>Collect, review, and turn supplier invoices into real expense data — not a payables system, just intake.</Text>
                        </View>
                    </View>

                    <View style={s.captureRow}>
                        <TouchableOpacity style={s.captureBtn} onPress={() => captureBill('camera')} disabled={scanning}>
                            {scanning ? <ActivityIndicator size="small" color={Colors.primary} /> : <Icon name="camera" size={16} color={Colors.primary} />}
                            <Text style={s.captureBtnText}>{scanning ? 'Reading…' : 'Photo a bill'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.captureBtn} onPress={() => captureBill('library')} disabled={scanning}>
                            <Icon name="upload" size={16} color={Colors.primary} />
                            <Text style={s.captureBtnText}>Upload</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.captureBtn, s.captureBtnGhost]} onPress={openManual}>
                            <Icon name="plus" size={16} color={Colors.textPrimary} />
                            <Text style={s.captureBtnGhostText}>Enter by hand</Text>
                        </TouchableOpacity>
                    </View>
                    {scanError && (
                        <View style={s.errorBox}><Icon name="alert-circle" size={14} color={Colors.danger} /><Text style={s.errorText}>{scanError}</Text></View>
                    )}

                    {showForm && (
                        <View style={s.formCard}>
                            <View style={s.formHead}>
                                <Text style={s.formTitle}>{editId ? 'Edit bill' : fromScan ? 'Confirm what was read' : 'New bill'}</Text>
                                <TouchableOpacity onPress={closeForm}><Icon name="x" size={18} color={Colors.textMuted} /></TouchableOpacity>
                            </View>
                            {fromScan && !editId && (
                                <Text style={s.formHint}>AI-read from the photo — please check every field before saving.</Text>
                            )}

                            <Text style={s.fieldLabel}>Vendor name</Text>
                            <TextInput style={s.input} value={form.vendorName} onChangeText={v => setForm(f => ({ ...f, vendorName: v }))} placeholder="e.g. Acme Supplies" placeholderTextColor={Colors.muted} />

                            <Text style={s.fieldLabel}>Vendor's invoice number</Text>
                            <TextInput style={s.input} value={form.invoiceNumber} onChangeText={v => setForm(f => ({ ...f, invoiceNumber: v }))} placeholder="e.g. INV-2451" placeholderTextColor={Colors.muted} />

                            <View style={s.row2}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.fieldLabel}>Invoice date</Text>
                                    <DateInput value={form.invoiceDate} onChange={v => setForm(f => ({ ...f, invoiceDate: v }))} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.fieldLabel}>Due date</Text>
                                    <DateInput value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} />
                                </View>
                            </View>

                            <View style={s.row2}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.fieldLabel}>Amount before tax ({cur})</Text>
                                    <TextInput style={s.input} value={form.subtotal} onChangeText={v => setForm(f => ({ ...f, subtotal: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.fieldLabel}>Tax ({cur})</Text>
                                    <TextInput style={s.input} value={form.taxTotal} onChangeText={v => setForm(f => ({ ...f, taxTotal: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.muted} />
                                </View>
                            </View>
                            <Text style={s.totalLine}>Total: {cur}{totalNum.toLocaleString()}</Text>

                            <Text style={s.fieldLabel}>Notes (optional)</Text>
                            <TextInput style={[s.input, s.inputMulti]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Anything worth remembering about this bill" placeholderTextColor={Colors.muted} multiline />

                            <FlagRow flags={liveFlags} />
                            {liveCashImpact && (
                                <View style={s.impactRow}>
                                    <View style={[s.riskDot, { backgroundColor: RISK_META[liveCashImpact.risk].color }]} />
                                    <Text style={s.impactText}>
                                        {RISK_META[liveCashImpact.risk].label} — runway {Number.isFinite(liveCashImpact.before.runwayDays) ? `${Math.round(liveCashImpact.before.runwayDays)}d` : '∞'} → {Number.isFinite(liveCashImpact.after.runwayDays) ? `${Math.round(liveCashImpact.after.runwayDays)}d` : '∞'} if paid now
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                                <Text style={s.saveBtnText}>{editId ? 'Save changes' : 'Save bill'}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={s.sectionHeading}>Needs review ({needsReview.length})</Text>
                    {needsReview.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Icon name="inbox" size={22} color={Colors.textMuted} />
                            <Text style={s.emptyText}>No bills waiting on review. Photograph or upload one to get started.</Text>
                        </View>
                    ) : needsReview.map(b => renderBillCard(b, true))}

                    {resolved.length > 0 && (
                        <>
                            <Text style={s.sectionHeading}>Reviewed</Text>
                            {resolved.map(b => renderBillCard(b, false))}
                        </>
                    )}
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },

    titleRow: { marginBottom: Spacing.md },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12.5, color: Colors.textMuted, lineHeight: 18, maxWidth: 480 },

    captureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    captureBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11,
        borderRadius: Radius.pill, backgroundColor: Colors.primary + '18',
    },
    captureBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
    captureBtnGhost: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    captureBtnGhostText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 13 },

    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.danger + '14', borderRadius: Radius.md, padding: 12, marginBottom: 14 },
    errorText: { color: Colors.danger, fontSize: 12.5, flex: 1 },

    formCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 18, marginBottom: 20, ...Shadow.sm },
    formHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    formTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.textPrimary },
    formHint: { fontSize: 12, color: Colors.warning, marginBottom: 10, fontWeight: '600' },
    fieldLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, marginTop: 12, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    inputMulti: { minHeight: 60, textAlignVertical: 'top' },
    row2: { flexDirection: 'row', gap: 12 },
    totalLine: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary, marginTop: 10 },

    flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    flagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
    flagChipText: { fontSize: 10.5, fontWeight: '700' },

    impactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    riskDot: { width: 8, height: 8, borderRadius: 4 },
    impactText: { fontSize: 11.5, color: Colors.textSecondary, flex: 1 },

    saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },

    sectionHeading: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8, marginBottom: 10 },
    emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 28, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
    emptyText: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', maxWidth: 280 },

    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12, ...Shadow.sm },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
    cardVendor: { fontSize: 14.5, fontWeight: '800', color: Colors.textPrimary },
    cardMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    cardAmount: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    scannedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    scannedTagText: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
    statusNote: { fontSize: 11.5, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic' },

    cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border },
    actionBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
    actionBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    actionBtnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
