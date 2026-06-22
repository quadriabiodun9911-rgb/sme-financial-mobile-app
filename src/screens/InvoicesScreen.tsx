import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert, Modal, Share, Linking, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Invoice, InvoiceLineItem, InvoiceStatus } from '../types';
import { generateId } from '../utils/uuid';
import DateInput from '../components/DateInput';

const STATUS_COLOR: Record<InvoiceStatus, string> = {
    draft:   Colors.textMuted,
    sent:    Colors.primary,
    paid:    Colors.income,
    overdue: Colors.expense,
};

const EMPTY_LINE: InvoiceLineItem = { description: '', quantity: 1, unitPrice: 0, taxRate: 0 };

function buildInvoiceHtml(inv: Invoice, businessName: string, currency: string): string {
    const lineRows = (inv.lineItems ?? []).map(li => {
        const qty       = li.quantity ?? 0;
        const unitPrice = li.unitPrice ?? 0;
        const taxRate   = li.taxRate ?? 0;
        const lineTotal = qty * unitPrice;
        const lineTax   = lineTotal * (taxRate / 100);
        return `
        <tr>
            <td>${li.description ?? ''}</td>
            <td style="text-align:center">${qty}</td>
            <td style="text-align:right">${currency}${unitPrice.toFixed(2)}</td>
            <td style="text-align:center">${taxRate}%</td>
            <td style="text-align:right">${currency}${(lineTotal + lineTax).toFixed(2)}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; color: #1e293b; padding: 40px; font-size: 13px; }
  h1 { font-size: 28px; color: #2563eb; margin: 0; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .label { color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
  .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th { background: #f1f5f9; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
  td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
  .totals { margin-top: 16px; float: right; min-width: 260px; }
  .totals tr td { border: none; padding: 4px 10px; }
  .totals .grand { font-size: 16px; font-weight: bold; color: #2563eb; border-top: 2px solid #2563eb; }
  .notes { margin-top: 60px; color: #64748b; font-size: 11px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; background: #dcfce7; color: #16a34a; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${businessName}</h1>
    <div style="margin-top:8px"><span class="status">${inv.status.toUpperCase()}</span></div>
  </div>
  <div style="text-align:right">
    <div class="label">Invoice Number</div>
    <div class="value" style="font-size:18px">${inv.invoiceNumber}</div>
    <div class="label" style="margin-top:12px">Issue Date</div>
    <div class="value">${inv.issueDate}</div>
    <div class="label" style="margin-top:8px">Due Date</div>
    <div class="value">${inv.dueDate}</div>
  </div>
</div>

<div>
  <div class="label">Bill To</div>
  <div class="value" style="font-size:15px">${inv.clientName}</div>
  ${inv.clientEmail ? `<div>${inv.clientEmail}</div>` : ''}
  ${inv.clientAddress ? `<div style="color:#64748b">${inv.clientAddress}</div>` : ''}
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit Price</th>
      <th style="text-align:center">Tax</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>${lineRows}</tbody>
</table>

<table class="totals">
  <tr><td>Subtotal</td><td style="text-align:right">${currency}${(inv.subtotal ?? 0).toFixed(2)}</td></tr>
  <tr><td>Tax</td><td style="text-align:right">${currency}${(inv.taxTotal ?? 0).toFixed(2)}</td></tr>
  <tr class="grand"><td><b>Total Due</b></td><td style="text-align:right"><b>${currency}${(inv.total ?? 0).toFixed(2)}</b></td></tr>
</table>

${inv.notes ? `<div class="notes" style="clear:both;margin-top:60px"><b>Notes:</b><br/>${inv.notes}</div>` : ''}
<div style="clear:both;margin-top:80px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
  <strong style="color:#2563eb;font-size:13px">Powered by Quad360</strong><br/>
  Free financial management for small businesses &nbsp;·&nbsp; <span style="color:#2563eb">quad360.vercel.app</span>
</div>
</body>
</html>`;
}

export default function InvoicesScreen() {
    const { invoices, addInvoice, updateInvoice, deleteInvoice, markInvoiceStatus, settings, user, navigate } = useApp();
    const currency = settings.currency;

    const [filter, setFilter]       = useState<InvoiceStatus | 'all'>('all');
    const [showForm, setShowForm]   = useState(false);
    const [editId, setEditId]       = useState<string | null>(null);
    const [viewInv, setViewInv]     = useState<Invoice | null>(null);

    // Form state
    const [clientName, setClientName]       = useState('');
    const [clientEmail, setClientEmail]     = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [dueDate, setDueDate]             = useState('');
    const [issueDate, setIssueDate]         = useState('');
    const [notes, setNotes]                 = useState('');
    const [lineItems, setLineItems]         = useState<InvoiceLineItem[]>([{ ...EMPTY_LINE }]);

    const filtered = useMemo(() => {
        const list = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);
        return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [invoices, filter]);

    const totals = useMemo(() => {
        const items = lineItems ?? [];
        const subtotal = items.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
        const taxTotal = items.reduce((s, li) => s + li.quantity * li.unitPrice * (li.taxRate / 100), 0);
        return { subtotal, taxTotal, total: subtotal + taxTotal };
    }, [lineItems]);

    const resetForm = () => {
        setClientName(''); setClientEmail(''); setClientAddress('');
        setDueDate(''); setIssueDate(''); setNotes('');
        setLineItems([{ ...EMPTY_LINE }]);
        setEditId(null);
    };

    const openNew = () => { resetForm(); setShowForm(true); };

    const openEdit = (inv: Invoice) => {
        setClientName(inv.clientName ?? '');
        setClientEmail(inv.clientEmail ?? '');
        setClientAddress(inv.clientAddress ?? '');
        setDueDate(inv.dueDate ?? '');
        setIssueDate(inv.issueDate ?? '');
        setNotes(inv.notes ?? '');
        setLineItems(inv.lineItems?.length ? inv.lineItems : [{ ...EMPTY_LINE }]);
        setEditId(inv.id);
        setShowForm(true);
    };

    const nextInvoiceNumber = () => {
        const nums = invoices
            .map(i => parseInt(i.invoiceNumber.replace(/\D/g, ''), 10))
            .filter(n => !isNaN(n));
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        return `INV-${String(next).padStart(4, '0')}`;
    };

    const handleSave = (asDraft: boolean) => {
        if (!clientName.trim()) { Alert.alert('Required', 'Client name is required.'); return; }
        if (!dueDate.trim())    { Alert.alert('Required', 'Due date is required.'); return; }
        if (lineItems.some(li => !li.description.trim())) {
            Alert.alert('Required', 'All line items need a description.');
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const payload = {
            invoiceNumber: editId ? invoices.find(i => i.id === editId)!.invoiceNumber : nextInvoiceNumber(),
            clientName: clientName.trim(),
            clientEmail: clientEmail.trim(),
            clientAddress: clientAddress.trim(),
            issueDate: issueDate || today,
            dueDate,
            lineItems,
            notes,
            status: (asDraft ? 'draft' : 'sent') as InvoiceStatus,
            ...totals,
        };

        if (editId) {
            updateInvoice(editId, payload);
        } else {
            addInvoice(payload);
        }
        setShowForm(false);
        resetForm();
    };

    const handleShare = async (inv: Invoice) => {
        const msg = `Invoice ${inv.invoiceNumber} for ${inv.clientName}\nTotal: ${currency}${(inv.total ?? 0).toFixed(2)}\nDue: ${inv.dueDate}`;
        try {
            if (Platform.OS === 'web') {
                if (navigator.share) { await navigator.share({ title: `Invoice ${inv.invoiceNumber}`, text: msg }); }
                else { await navigator.clipboard.writeText(msg); Alert.alert('Copied!', 'Invoice details copied to clipboard.'); }
            } else {
                await Share.share({ message: msg, title: `Invoice ${inv.invoiceNumber}` });
            }
        } catch {
            Alert.alert('Error', 'Could not share invoice.');
        }
    };

    const handleWhatsApp = (inv: Invoice) => {
        const businessName = user?.businessName ?? 'My Business';
        const lineItemsText = (inv.lineItems ?? []).map(li => {
            const qty       = li.quantity ?? 0;
            const unitPrice = li.unitPrice ?? 0;
            const taxRate   = li.taxRate ?? 0;
            const lineTotal = (qty * unitPrice * (1 + taxRate / 100)).toFixed(2);
            return `- ${li.description ?? ''} x${qty} = ${currency}${lineTotal}`;
        }).join('\n');
        const message = `Hi ${inv.clientName},\n\nYour invoice ${inv.invoiceNumber} is ready.\n\nAmount due: ${currency}${(inv.total ?? 0).toFixed(2)}\nDue date: ${inv.dueDate}\n\nItems:\n${lineItemsText}\n\nThank you for your business!\n${businessName}`;
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        if (Platform.OS === 'web') {
            const win = window.open(url, '_blank');
            if (!win || win.closed) window.location.href = url;
        } else {
            Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open WhatsApp.'));
        }
    };

    const handleDelete = (inv: Invoice) => {
        Alert.alert('Delete Invoice', `Delete ${inv.invoiceNumber}? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteInvoice(inv.id) },
        ]);
    };

    const updateLine = (idx: number, patch: Partial<InvoiceLineItem>) => {
        setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, ...patch } : li));
    };

    const summary = useMemo(() => ({
        total:   invoices.length,
        sent:    invoices.filter(i => i.status === 'sent').length,
        paid:    invoices.filter(i => i.status === 'paid').length,
        overdue: invoices.filter(i => i.status === 'overdue').length,
        outstanding: invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
            .reduce((s, i) => s + i.total, 0),
    }), [invoices]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>Invoices</Text>
                        <TouchableOpacity style={styles.newBtn} onPress={openNew}>
                            <Text style={styles.newBtnText}>+ New Invoice</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Summary strip */}
                    <View style={styles.summaryRow}>
                        <SummaryCard label="Outstanding" value={`${currency}${summary.outstanding.toLocaleString()}`} color={Colors.warning} />
                        <SummaryCard label="Sent" value={String(summary.sent)} color={Colors.primary} />
                        <SummaryCard label="Paid" value={String(summary.paid)} color={Colors.income} />
                        <SummaryCard label="Overdue" value={String(summary.overdue)} color={Colors.expense} />
                    </View>

                    {/* Filter tabs */}
                    <View style={styles.filterRow}>
                        {(['all', 'draft', 'sent', 'paid', 'overdue'] as const).map(f => (
                            <TouchableOpacity
                                key={f}
                                style={[styles.filterTab, filter === f && styles.filterTabActive]}
                                onPress={() => setFilter(f)}
                            >
                                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Status color legend */}
                    <View style={styles.legendRow}>
                        <Text style={[styles.legendItem, { color: Colors.textMuted }]}>● Draft</Text>
                        <Text style={[styles.legendItem, { color: Colors.primary }]}>● Sent</Text>
                        <Text style={[styles.legendItem, { color: Colors.income }]}>● Paid</Text>
                        <Text style={[styles.legendItem, { color: Colors.expense }]}>● Overdue</Text>
                    </View>

                    {/* Invoice list */}
                    {filtered.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No invoices yet. Tap + New Invoice to create one.</Text>
                        </View>
                    ) : (
                        filtered.map(inv => (
                            <TouchableOpacity key={inv.id} style={styles.card} onPress={() => setViewInv(inv)}>
                                <View style={styles.cardTop}>
                                    <Text style={styles.invNum}>{inv.invoiceNumber}</Text>
                                    <View style={[styles.badge, { backgroundColor: STATUS_COLOR[inv.status] + '22' }]}>
                                        <Text style={[styles.badgeText, { color: STATUS_COLOR[inv.status] }]}>
                                            {inv.status.toUpperCase()}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.client}>{inv.clientName}</Text>
                                <View style={styles.cardBottom}>
                                    <Text style={styles.dueText}>Due {inv.dueDate}</Text>
                                    <Text style={styles.amount}>{currency}{inv.total.toLocaleString()}</Text>
                                </View>
                                <View style={styles.actions}>
                                    <ActionBtn label="Edit"   onPress={() => openEdit(inv)} color={Colors.primary} />
                                    <ActionBtn label="Share"  onPress={() => handleShare(inv)} color={Colors.income} />
                                    <TouchableOpacity style={styles.whatsappBtn} onPress={() => handleWhatsApp(inv)}>
                                        <Text style={styles.whatsappBtnText}>WhatsApp</Text>
                                    </TouchableOpacity>
                                    {inv.status !== 'paid' && (
                                        <>
                                            <ActionBtn label="Collect Payment" onPress={() => navigate('payment-link', {
                                                amount: inv.total,
                                                description: `Invoice ${inv.invoiceNumber}`,
                                                customerName: inv.clientName,
                                                customerEmail: inv.clientEmail || '',
                                                invoiceId: inv.id,
                                            })} color="#00C3F7" />
                                            <ActionBtn label="Mark Paid" onPress={() => markInvoiceStatus(inv.id, 'paid')} color={Colors.income} />
                                        </>
                                    )}
                                    {inv.status === 'draft' && (
                                        <ActionBtn label="Send" onPress={() => markInvoiceStatus(inv.id, 'sent')} color={Colors.warning} />
                                    )}
                                    <ActionBtn label="Delete" onPress={() => handleDelete(inv)} color={Colors.expense} />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>
            <FooterNav />

            {/* Create / Edit Invoice Modal */}
            <Modal visible={showForm} animationType="slide">
                <SafeAreaView style={styles.safe}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={styles.pad}>
                            <View style={styles.titleRow}>
                                <Text style={styles.title}>{editId ? 'Edit Invoice' : 'New Invoice'}</Text>
                                <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
                                    <Text style={{ color: Colors.textMuted, fontSize: 15 }}>Cancel</Text>
                                </TouchableOpacity>
                            </View>

                            <Section title="Client Details">
                                <FLabel>Client Name *</FLabel>
                                <FInput value={clientName} onChangeText={setClientName} placeholder="Acme Corp" />
                                <FLabel>Client Email</FLabel>
                                <FInput value={clientEmail} onChangeText={setClientEmail} placeholder="billing@acme.com" keyboard="email-address" />
                                <FLabel>Client Address</FLabel>
                                <FInput value={clientAddress} onChangeText={setClientAddress} placeholder="123 Main St, City" />
                            </Section>

                            <Section title="Invoice Details">
                                <FLabel>Due Date *</FLabel>
                                <DateInput value={dueDate} onChange={setDueDate} />
                                <FLabel>Notes</FLabel>
                                <FInput value={notes} onChangeText={setNotes} placeholder="Payment terms, bank details…" multiline />
                            </Section>

                            <Section title="Line Items">
                                {lineItems.map((li, idx) => (
                                    <View key={idx} style={styles.lineItem}>
                                        <View style={styles.lineHeader}>
                                            <Text style={styles.lineNum}>Item {idx + 1}</Text>
                                            {lineItems.length > 1 && (
                                                <TouchableOpacity onPress={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}>
                                                    <Text style={{ color: Colors.expense, fontSize: 12 }}>Remove</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <FLabel>Description *</FLabel>
                                        <FInput value={li.description} onChangeText={v => updateLine(idx, { description: v })} placeholder="Service or product description" />
                                        <View style={styles.lineRow}>
                                            <View style={{ flex: 1 }}>
                                                <FLabel>Qty</FLabel>
                                                <FInput value={String(li.quantity)} onChangeText={v => updateLine(idx, { quantity: parseFloat(v) || 0 })} keyboard="numeric" placeholder="1" />
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <FLabel>Unit Price ({currency})</FLabel>
                                                <FInput value={String(li.unitPrice)} onChangeText={v => updateLine(idx, { unitPrice: parseFloat(v) || 0 })} keyboard="numeric" placeholder="0" />
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <FLabel>Tax %</FLabel>
                                                <FInput value={String(li.taxRate)} onChangeText={v => updateLine(idx, { taxRate: parseFloat(v) || 0 })} keyboard="numeric" placeholder="0" />
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.addLineBtn} onPress={() => setLineItems(prev => [...prev, { ...EMPTY_LINE }])}>
                                    <Text style={styles.addLineBtnText}>+ Add Line Item</Text>
                                </TouchableOpacity>
                            </Section>

                            {/* Totals preview */}
                            <View style={styles.totalsCard}>
                                <TotalRow label="Subtotal" value={`${currency}${totals.subtotal.toFixed(2)}`} />
                                <TotalRow label="Tax" value={`${currency}${totals.taxTotal.toFixed(2)}`} />
                                <TotalRow label="Total" value={`${currency}${totals.total.toFixed(2)}`} bold />
                            </View>

                            <TouchableOpacity style={styles.saveBtn} onPress={() => handleSave(false)}>
                                <Text style={styles.saveBtnText}>Save & Mark as Sent</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.draftBtn} onPress={() => handleSave(true)}>
                                <Text style={styles.draftBtnText}>Save as Draft</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            {/* View Invoice Modal */}
            {viewInv && (
                <Modal visible animationType="slide">
                    <SafeAreaView style={styles.safe}>
                        <ScrollView>
                            <View style={styles.pad}>
                                <View style={styles.titleRow}>
                                    <Text style={styles.title}>{viewInv.invoiceNumber}</Text>
                                    <TouchableOpacity onPress={() => setViewInv(null)}>
                                        <Text style={{ color: Colors.textMuted, fontSize: 15 }}>Close</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.badge, { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: STATUS_COLOR[viewInv.status] + '22' }]}>
                                    <Text style={[styles.badgeText, { color: STATUS_COLOR[viewInv.status] }]}>{viewInv.status.toUpperCase()}</Text>
                                </View>

                                <Section title="Client">
                                    <DetailRow label="Name"    value={viewInv.clientName} />
                                    {viewInv.clientEmail   && <DetailRow label="Email"   value={viewInv.clientEmail} />}
                                    {viewInv.clientAddress && <DetailRow label="Address" value={viewInv.clientAddress} />}
                                </Section>

                                <Section title="Dates">
                                    <DetailRow label="Issued" value={viewInv.issueDate} />
                                    <DetailRow label="Due"    value={viewInv.dueDate} />
                                </Section>

                                <Section title="Line Items">
                                    {(viewInv.lineItems ?? []).map((li, i) => {
                                        const qty       = li.quantity ?? 0;
                                        const unitPrice = li.unitPrice ?? 0;
                                        const taxRate   = li.taxRate ?? 0;
                                        return (
                                        <View key={i} style={styles.viewLine}>
                                            <Text style={styles.viewLineDesc}>{li.description}</Text>
                                            <Text style={styles.viewLineSub}>
                                                {qty} × {currency}{unitPrice.toFixed(2)} + {taxRate}% tax
                                            </Text>
                                            <Text style={styles.viewLineTotal}>
                                                {currency}{(qty * unitPrice * (1 + taxRate / 100)).toFixed(2)}
                                            </Text>
                                        </View>
                                        );
                                    })}
                                    <View style={styles.totalsCard}>
                                        <TotalRow label="Subtotal" value={`${currency}${(viewInv.subtotal ?? 0).toFixed(2)}`} />
                                        <TotalRow label="Tax"      value={`${currency}${(viewInv.taxTotal ?? 0).toFixed(2)}`} />
                                        <TotalRow label="Total"    value={`${currency}${(viewInv.total ?? 0).toFixed(2)}`} bold />
                                    </View>
                                </Section>

                                {viewInv.notes ? (
                                    <Section title="Notes">
                                        <Text style={styles.notesText}>{viewInv.notes}</Text>
                                    </Section>
                                ) : null}

                                <TouchableOpacity style={styles.saveBtn} onPress={() => handleShare(viewInv)}>
                                    <Text style={styles.saveBtnText}>Share Invoice</Text>
                                </TouchableOpacity>
                                {viewInv.status !== 'paid' && (
                                    <>
                                        <TouchableOpacity style={[styles.draftBtn, { marginTop: 8, backgroundColor: '#00C3F7' }]}
                                            onPress={() => { setViewInv(null); navigate('payment-link', {
                                                amount: viewInv.total,
                                                description: `Invoice ${viewInv.invoiceNumber}`,
                                                customerName: viewInv.clientName,
                                                customerEmail: viewInv.clientEmail || '',
                                                invoiceId: viewInv.id,
                                            }); }}>
                                            <Text style={styles.draftBtnText}>💳 Collect Payment via Paystack</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.draftBtn, { marginTop: 8 }]}
                                            onPress={() => { markInvoiceStatus(viewInv.id, 'paid'); setViewInv(null); }}>
                                            <Text style={styles.draftBtnText}>Mark as Paid</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </ScrollView>
                    </SafeAreaView>
                </Modal>
            )}
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
function FLabel({ children }: { children: React.ReactNode }) {
    return <Text style={styles.flabel}>{children}</Text>;
}
function FInput({ value, onChangeText, placeholder, keyboard, multiline }: {
    value: string; onChangeText: (v: string) => void;
    placeholder?: string; keyboard?: any; multiline?: boolean;
}) {
    return (
        <TextInput
            style={[styles.finput, multiline && { height: 70, textAlignVertical: 'top' }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={Colors.muted}
            keyboardType={keyboard ?? 'default'}
            multiline={multiline}
        />
    );
}
function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}
function ActionBtn({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
    return (
        <TouchableOpacity style={[styles.actionBtn, { borderColor: color }]} onPress={onPress}>
            <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
        </TouchableOpacity>
    );
}
function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, bold && { color: Colors.textPrimary, fontWeight: 'bold' }]}>{label}</Text>
            <Text style={[styles.totalValue, bold && { color: Colors.primary, fontSize: 17 }]}>{value}</Text>
        </View>
    );
}
function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:    { padding: 16 },

    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title:    { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },

    newBtn:     { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    newBtnText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 13 },

    summaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
    summaryCard:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' },
    summaryLabel: { fontSize: 9, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    summaryValue: { fontSize: 13, fontWeight: 'bold' },

    filterRow:       { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
    filterTab:       { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: 20 },
    filterTabActive: { backgroundColor: Colors.primary },
    filterText:      { fontSize: 12, color: Colors.textMuted },
    filterTextActive:{ color: Colors.textPrimary, fontWeight: '600' },

    card:       { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
    cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    invNum:     { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText:  { fontSize: 10, fontWeight: 'bold' },
    client:     { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    dueText:    { fontSize: 12, color: Colors.textMuted },
    amount:     { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
    actions:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    actionBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderRadius: 6 },
    actionBtnText:  { fontSize: 11, fontWeight: '600' },
    whatsappBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#25D366' },
    whatsappBtnText:{ fontSize: 11, fontWeight: '600', color: '#fff' },

    legendRow:  { flexDirection: 'row', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
    legendItem: { fontSize: 11, fontWeight: '600' },

    empty:     { alignItems: 'center', paddingVertical: 60 },
    emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },

    section:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 14 },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },

    flabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4, marginTop: 8 },
    finput: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
        color: Colors.textPrimary, fontSize: 14,
    },

    lineItem:   { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 10 },
    lineHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    lineNum:    { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
    lineRow:    { flexDirection: 'row' },

    addLineBtn:     { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 10 },
    addLineBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },

    totalsCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginBottom: 14 },
    totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    totalLabel: { fontSize: 13, color: Colors.textMuted },
    totalValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

    saveBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
    saveBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
    draftBtn:    { borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    draftBtnText:{ color: Colors.textMuted, fontSize: 14 },

    viewLine:      { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    viewLineDesc:  { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', marginBottom: 2 },
    viewLineSub:   { fontSize: 11, color: Colors.textMuted },
    viewLineTotal: { fontSize: 13, color: Colors.income, fontWeight: 'bold', marginTop: 2 },

    notesText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

    detailRow:   { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    detailLabel: { fontSize: 12, color: Colors.textMuted, width: 80 },
    detailValue: { fontSize: 13, color: Colors.textPrimary, flex: 1 },
});
