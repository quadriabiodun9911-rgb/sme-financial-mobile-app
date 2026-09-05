import React, { useState, useMemo, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert, Modal, Share, Linking, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Invoice, InvoiceLineItem, InvoiceStatus } from '../types';
import { generateId } from '../utils/uuid';
import { localDateStr } from '../utils/localDate';
import DateInput from '../components/DateInput';
import { sendInvoiceReminderViaWhatsApp, sendPaymentRequestViaWhatsApp, isWhatsAppInstalled } from '../utils/whatsappIntegration';
import { getInvoicesDueForReminder, loadReminderState, markReminderSent, InvoiceReminderState, ReminderDue } from '../utils/invoiceReminders';
import NextStepLink from '../components/NextStepLink';
import ProjectProfitabilityCalculator from '../components/ProjectProfitabilityCalculator';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { t } from '../utils/i18n';
import { computeEarlyPaymentDiscount } from '../utils/earlyPaymentDiscount';
import { checkCustomerCreditLimit, findCreditLimit } from '../utils/customerCredit';
import { hasRecurringInvoiceSchedule, nextRecurringInvoiceDueDate, nextRecurringInvoiceDueDateStr, isRecurringInvoiceDue } from '../utils/recurringInvoices';
import { computeUnlinkedInvoicePayments } from '../utils/finance';
import { effectiveInvoiceStatus } from '../utils/overdueTransactions';
import { RecurringFrequency } from '../types';
import { parseInvoiceQuickAddText } from '../utils/invoiceQuickAddParser';

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
  <div class="value" style="font-size:15px">${inv.clientName || 'Customer'}</div>
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
  Free financial management for small businesses &nbsp;·&nbsp; <span style="color:#2563eb">quad360financial.com</span>
</div>
</body>
</html>`;
}


export default function InvoicesScreen() {
    const { invoices, addInvoice, updateInvoice, deleteInvoice, markInvoiceStatus, settings, updateSettings, user, navigate, language, transactions, updateTransaction, canViewFinancials } = useApp();
    const currency = settings.currency;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the full-page
    // form/view modals and the centered reminder dialog.
    const { width: windowWidth } = useWindowDimensions();
    const constrainModalWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [filter, setFilter]       = useState<InvoiceStatus | 'all'>('all');
    const [showForm, setShowForm]   = useState(false);
    const [editId, setEditId]       = useState<string | null>(null);
    const [viewInv, setViewInv]     = useState<Invoice | null>(null);
    const [whatsappAvailable, setWhatsappAvailable] = useState(false);

    // Which overdue-invoice reminders have already been sent, at which
    // day-overdue milestone -- persisted so the same invoice isn't nagged
    // again at the same milestone every time the screen is reopened.
    const [reminderState, setReminderState] = useState<InvoiceReminderState>({});
    const [reminderQueue, setReminderQueue] = useState<ReminderDue[] | null>(null);
    const [reminderIdx, setReminderIdx]     = useState(0);

    // Form state
    // Quick-add: one sentence ("Invoice Chidinma 45000 for rice due in 7
    // days") parsed live into the fields below -- a simplified single-line-
    // item alternative to the full form, same progressive-disclosure
    // pattern as Assets/Loans/Dashboard's Quick Add. Only shown for a brand
    // new invoice, not editing.
    const [qaText, setQaText] = useState('');

    const [clientName, setClientName]       = useState('');
    const [clientEmail, setClientEmail]     = useState('');
    const [clientPhone, setClientPhone]     = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [dueDate, setDueDate]             = useState('');
    const [issueDate, setIssueDate]         = useState('');
    const [notes, setNotes]                 = useState('');
    const [lineItems, setLineItems]         = useState<InvoiceLineItem[]>([{ ...EMPTY_LINE }]);
    const [earlyDiscountPct, setEarlyDiscountPct]   = useState('');
    const [earlyDiscountDays, setEarlyDiscountDays] = useState('');
    const [isRecurring, setIsRecurring]     = useState(false);
    const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('monthly');
    const [creditLimitInput, setCreditLimitInput] = useState('');

    const filtered = useMemo(() => {
        // Matched against the LIVE status (effectiveInvoiceStatus), not the
        // stored field -- nothing ever flips a real invoice's status to
        // 'overdue' on its own, so filtering on `i.status` directly meant
        // the Overdue tab stayed empty forever and a past-due invoice kept
        // showing under Sent. See overdueTransactions.ts for why.
        const list = filter === 'all' ? invoices : invoices.filter(i => effectiveInvoiceStatus(i) === filter);
        return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [invoices, filter]);

    const totals = useMemo(() => {
        const items = lineItems ?? [];
        const subtotal = items.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
        const taxTotal = items.reduce((s, li) => s + li.quantity * li.unitPrice * (li.taxRate / 100), 0);
        return { subtotal, taxTotal, total: subtotal + taxTotal };
    }, [lineItems]);

    useEffect(() => {
        isWhatsAppInstalled().then(setWhatsappAvailable);
    }, []);

    useEffect(() => {
        loadReminderState().then(setReminderState);
    }, []);

    const remindersDue = useMemo(
        () => getInvoicesDueForReminder(invoices, reminderState),
        [invoices, reminderState]
    );

    // A customer payment that settles an unpaid invoice can arrive as an
    // ordinary imported income transaction with no link back to the
    // invoice it pays -- see computeUnlinkedInvoicePayments. Linking it
    // reuses the exact mechanism TransactionsScreen's own "mark paid"
    // already relies on (reference === invoiceNumber), just applied the
    // other direction: from the invoice side instead of the transaction side.
    const unlinkedInvoicePayments = useMemo(
        () => computeUnlinkedInvoicePayments(invoices, transactions),
        [invoices, transactions]
    );
    const linkInvoicePayment = (invoiceId: string, invoiceNumber: string, transactionId: string) => {
        updateTransaction(transactionId, { reference: invoiceNumber });
        markInvoiceStatus(invoiceId, 'paid');
    };

    const startReminderRun = () => {
        setReminderQueue(remindersDue);
        setReminderIdx(0);
    };

    const sendCurrentReminder = async () => {
        const current = reminderQueue?.[reminderIdx];
        if (!current) return;
        await sendInvoiceReminderViaWhatsApp(current.invoice, user?.businessName ?? 'My Business', currency, current.invoice.clientPhone || '');
        const next = await markReminderSent(current.invoice.id, current.milestone);
        setReminderState(next);
        setReminderIdx(i => i + 1);
    };

    const resetForm = () => {
        setClientName(''); setClientEmail(''); setClientPhone(''); setClientAddress('');
        setDueDate(''); setIssueDate(''); setNotes('');
        setLineItems([{ ...EMPTY_LINE }]);
        setEarlyDiscountPct(''); setEarlyDiscountDays('');
        setIsRecurring(false); setRecurringFrequency('monthly');
        setCreditLimitInput('');
        setEditId(null);
        setQaText('');
    };

    const openNew = () => { resetForm(); setShowForm(true); };

    const handleQaTextChange = (text: string) => {
        setQaText(text);
        const parsed = parseInvoiceQuickAddText(text);
        setClientName(parsed.clientName);
        setLineItems([{
            description: parsed.description,
            quantity: 1,
            unitPrice: parsed.amount ?? 0,
            taxRate: 0,
        }]);
        setDueDate(parsed.dueInDays !== null ? localDateStr(new Date(Date.now() + parsed.dueInDays * 86400000)) : '');
    };

    const openEdit = (inv: Invoice) => {
        setClientName(inv.clientName ?? '');
        setClientEmail(inv.clientEmail ?? '');
        setClientPhone(inv.clientPhone ?? '');
        setClientAddress(inv.clientAddress ?? '');
        setDueDate(inv.dueDate ?? '');
        setIssueDate(inv.issueDate ?? '');
        setNotes(inv.notes ?? '');
        setLineItems(inv.lineItems?.length ? inv.lineItems : [{ ...EMPTY_LINE }]);
        setEarlyDiscountPct(inv.earlyPaymentDiscountPct ? String(inv.earlyPaymentDiscountPct) : '');
        setEarlyDiscountDays(inv.earlyPaymentDiscountDays ? String(inv.earlyPaymentDiscountDays) : '');
        setIsRecurring(!!inv.isRecurring);
        setRecurringFrequency(inv.recurringFrequency ?? 'monthly');
        const existingLimit = findCreditLimit(inv.clientName, settings.customerCreditLimits ?? []);
        setCreditLimitInput(existingLimit ? String(existingLimit.limit) : '');
        setEditId(inv.id);
        setShowForm(true);
    };

    // Upserts (or clears, when limitStr is blank/invalid) this customer's
    // credit limit in settings -- keyed by name, same as the rest of
    // customerCredit.ts, since there's no dedicated Customer entity.
    const persistCreditLimit = (customerName: string, limitStr: string) => {
        const trimmed = customerName.trim();
        if (!trimmed) return;
        const existing = settings.customerCreditLimits ?? [];
        const withoutThis = existing.filter(l => l.customerName.trim().toLowerCase() !== trimmed.toLowerCase());
        const parsed = parseFloat(limitStr);
        if (!limitStr.trim() || isNaN(parsed) || parsed <= 0) {
            if (withoutThis.length !== existing.length) updateSettings({ customerCreditLimits: withoutThis });
            return;
        }
        const existingEntry = existing.find(l => l.customerName.trim().toLowerCase() === trimmed.toLowerCase());
        updateSettings({
            customerCreditLimits: [...withoutThis, {
                id: existingEntry?.id ?? generateId(),
                customerName: trimmed,
                limit: parsed,
                createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
            }],
        });
    };

    // SME cash-flow checklist #2: warn before saving an invoice that would
    // push this client over their self-set credit limit (Settings >
    // Customer Credit Limits). Reads current unpaid exposure live from the
    // invoice list, excluding the invoice being edited so its own prior
    // amount isn't double-counted.
    const creditLimitCheck = useMemo(() => {
        if (!clientName.trim()) return null;
        return checkCustomerCreditLimit(clientName, totals.total, invoices, settings.customerCreditLimits ?? [], editId ?? undefined);
    }, [clientName, totals.total, invoices, settings.customerCreditLimits, editId]);

    const nextInvoiceNumber = () => {
        const nums = invoices
            .map(i => parseInt(i.invoiceNumber.replace(/\D/g, ''), 10))
            .filter(n => !isNaN(n));
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        return `INV-${String(next).padStart(4, '0')}`;
    };

    const handleSave = (asDraft: boolean) => {
        if (!clientName.trim()) { showAlert('Required', 'Client name is required.'); return; }
        if (!dueDate.trim())    { showAlert('Required', 'Due date is required.'); return; }
        if (lineItems.some(li => !li.description.trim())) {
            showAlert('Required', 'All line items need a description.');
            return;
        }
        if (lineItems.some(li => !(li.quantity > 0))) {
            showAlert('Invalid quantity', 'Every line item needs a quantity greater than zero.');
            return;
        }
        if (lineItems.some(li => li.unitPrice < 0)) {
            showAlert('Invalid price', 'Unit price can\'t be negative.');
            return;
        }
        if (lineItems.some(li => (li.taxRate ?? 0) < 0)) {
            showAlert('Invalid tax rate', 'Tax rate can\'t be negative.');
            return;
        }

        const today = localDateStr();
        const payload = {
            invoiceNumber: editId ? (invoices.find(i => i.id === editId)?.invoiceNumber ?? nextInvoiceNumber()) : nextInvoiceNumber(),
            clientName: clientName.trim(),
            clientEmail: clientEmail.trim(),
            clientPhone: clientPhone.trim(),
            clientAddress: clientAddress.trim(),
            issueDate: issueDate || today,
            dueDate,
            lineItems,
            notes,
            status: (asDraft ? 'draft' : 'sent') as InvoiceStatus,
            ...totals,
            earlyPaymentDiscountPct: parseFloat(earlyDiscountPct) || undefined,
            earlyPaymentDiscountDays: parseFloat(earlyDiscountDays) || undefined,
            isRecurring,
            recurringFrequency: isRecurring ? recurringFrequency : undefined,
        };

        if (editId) {
            updateInvoice(editId, payload);
        } else {
            addInvoice(payload);
        }
        persistCreditLimit(clientName, creditLimitInput);
        setShowForm(false);
        resetForm();
    };

    const handleShare = async (inv: Invoice) => {
        const msg = `Invoice ${inv.invoiceNumber} for ${inv.clientName || 'Customer'}\nTotal: ${currency}${(inv.total ?? 0).toFixed(2)}\nDue: ${inv.dueDate}`;
        try {
            if (Platform.OS === 'web') {
                if (navigator.share) { await navigator.share({ title: `Invoice ${inv.invoiceNumber}`, text: msg }); }
                else { await navigator.clipboard.writeText(msg); showAlert('Copied!', 'Invoice details copied to clipboard.'); }
            } else {
                await Share.share({ message: msg, title: `Invoice ${inv.invoiceNumber}` });
            }
        } catch {
            showAlert('Error', 'Could not share invoice.');
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
        const message = `Hi ${inv.clientName || 'there'},\n\nYour invoice ${inv.invoiceNumber} is ready.\n\nAmount due: ${currency}${(inv.total ?? 0).toFixed(2)}\nDue date: ${inv.dueDate}\n\nItems:\n${lineItemsText}\n\nThank you for your business!\n${businessName}`;
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        if (Platform.OS === 'web') {
            const win = window.open(url, '_blank');
            if (!win || win.closed) window.location.href = url;
        } else {
            Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open WhatsApp.'));
        }
    };

    const handleDelete = (inv: Invoice) => {
        confirmAction('Delete Invoice', `Delete ${inv.invoiceNumber}? This cannot be undone.`, 'Delete', () => deleteInvoice(inv.id));
    };

    // SME cash-flow checklist #9: no auto-generation engine (see
    // recurringInvoices.ts) -- this duplicates the invoice into the next
    // period as a new draft, shifting issue/due dates by the same anchor
    // math the "next due" date uses, and by the original issue-to-due gap
    // so payment terms (e.g. "Net 30") carry forward unchanged.
    const handleGenerateNext = (inv: Invoice) => {
        if (!hasRecurringInvoiceSchedule(inv)) return;
        const nextIssue = nextRecurringInvoiceDueDate(inv);
        const nextIssueStr = `${nextIssue.getFullYear()}-${String(nextIssue.getMonth() + 1).padStart(2, '0')}-${String(nextIssue.getDate()).padStart(2, '0')}`;
        const [oy, om, od] = inv.issueDate.split('-').map(Number);
        const [dy, dm, dd] = inv.dueDate.split('-').map(Number);
        const gapDays = Math.round((new Date(dy, dm - 1, dd).getTime() - new Date(oy, om - 1, od).getTime()) / (1000 * 60 * 60 * 24));
        const nextDue = new Date(nextIssue);
        nextDue.setDate(nextDue.getDate() + Math.max(0, gapDays));
        const nextDueStr = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`;

        addInvoice({
            invoiceNumber: nextInvoiceNumber(),
            clientName: inv.clientName,
            clientEmail: inv.clientEmail,
            clientPhone: inv.clientPhone,
            clientAddress: inv.clientAddress,
            issueDate: nextIssueStr,
            dueDate: nextDueStr,
            lineItems: inv.lineItems,
            notes: inv.notes,
            status: 'draft',
            subtotal: inv.subtotal,
            taxTotal: inv.taxTotal,
            total: inv.total,
            earlyPaymentDiscountPct: inv.earlyPaymentDiscountPct,
            earlyPaymentDiscountDays: inv.earlyPaymentDiscountDays,
            isRecurring: true,
            recurringFrequency: inv.recurringFrequency,
        });
        showAlert('Invoice Generated', `Created a draft invoice for the next ${inv.recurringFrequency} period, dated ${nextIssueStr}.`);
    };

    const updateLine = (idx: number, patch: Partial<InvoiceLineItem>) => {
        setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, ...patch } : li));
    };

    const summary = useMemo(() => ({
        total:   invoices.length,
        sent:    invoices.filter(i => effectiveInvoiceStatus(i) === 'sent').length,
        paid:    invoices.filter(i => i.status === 'paid').length,
        overdue: invoices.filter(i => effectiveInvoiceStatus(i) === 'overdue').length,
        overdueTotal: invoices.filter(i => effectiveInvoiceStatus(i) === 'overdue')
            .reduce((s, i) => s + (i.total ?? 0), 0),
        outstanding: invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
            .reduce((s, i) => s + (i.total ?? 0), 0),
    }), [invoices]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>{t(language, 'invoices')}</Text>
                        <TouchableOpacity style={styles.newBtn} onPress={openNew}>
                            <Text style={styles.newBtnText}>{t(language, 'newInvoice')}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Summary strip -- Outstanding is an aggregate ₦
                        receivables figure (a cash-position number), unlike
                        sent/paid/overdue below (invoice counts, not amounts)
                        -- 'staff' can open Invoices (STAFF_ALLOWED_SCREENS)
                        but is documented as having no visibility into the
                        business's aggregate financial position
                        (canViewFinancials's own comment). */}
                    <View style={styles.summaryRow}>
                        {canViewFinancials && (
                            <SummaryCard label={t(language, 'outstanding')} value={`${currency}${summary.outstanding.toLocaleString()}`} color={Colors.warning} />
                        )}
                        <SummaryCard label={t(language, 'sent')} value={String(summary.sent)} color={Colors.primary} />
                        <SummaryCard label={t(language, 'paid')} value={String(summary.paid)} color={Colors.income} />
                        <SummaryCard label={t(language, 'overdue')} value={String(summary.overdue)} color={Colors.expense} />
                    </View>

                    {summary.overdue > 0 && (
                        <NextStepLink
                            text={`${summary.overdue} invoice${summary.overdue > 1 ? 's' : ''} overdue (${currency}${summary.overdueTotal.toLocaleString()}) — review collections in Transactions`}
                            onPress={() => navigate('transactions', { filter: 'collect' })}
                        />
                    )}
                    {remindersDue.length > 0 && (
                        <NextStepLink
                            text={`${remindersDue.length} invoice${remindersDue.length > 1 ? 's' : ''} due for a follow-up reminder`}
                            onPress={startReminderRun}
                            emphasis="button"
                        />
                    )}
                    {summary.paid > 0 && (
                        <NextStepLink
                            text={t(language, 'seeHowPaidAffectsCashForecast')}
                            onPress={() => navigate('cashflow')}
                        />
                    )}

                    {/* A payment already sitting in your transactions that
                        matches an unpaid invoice by client name + amount --
                        see computeUnlinkedInvoicePayments. Linking it marks
                        the invoice paid using money that's already arrived,
                        instead of it sitting "overdue" forever. */}
                    {unlinkedInvoicePayments.length > 0 && (
                        <View style={styles.detectedAlert}>
                            <View style={styles.detectedAlertTextRow}>
                                <Icon name="upload" size={14} color={Colors.primary} />
                                <Text style={styles.detectedAlertText}>
                                    {unlinkedInvoicePayments.length} payment{unlinkedInvoicePayments.length > 1 ? 's' : ''} in your transactions match{unlinkedInvoicePayments.length > 1 ? '' : 'es'} an unpaid invoice.
                                </Text>
                            </View>
                            {unlinkedInvoicePayments.slice(0, 3).map(p => (
                                <View key={p.transactionId} style={styles.detectedRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.detectedName} numberOfLines={1}>{p.invoiceNumber} — {p.clientName}</Text>
                                        <Text style={styles.detectedMeta}>{p.transactionDate} · {currency}{p.amount.toLocaleString()}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => linkInvoicePayment(p.invoiceId, p.invoiceNumber, p.transactionId)}>
                                        <Text style={styles.detectedAdd}>Mark paid →</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Project/retainer profitability — Professional Services only,
                        same reasoning as Recipe Costing / Production Cost being
                        gated to their own industries. Professional services sell
                        time, not stock, so this lives here rather than Inventory. */}
                    {settings.industry === 'professional-services' && (
                        <ProjectProfitabilityCalculator currency={currency} />
                    )}

                    {/* Filter tabs */}
                    <View style={styles.filterRow}>
                        {(['all', 'draft', 'sent', 'paid', 'overdue'] as const).map(f => (
                            <TouchableOpacity
                                key={f}
                                style={[styles.filterTab, filter === f && styles.filterTabActive]}
                                onPress={() => setFilter(f)}
                            >
                                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                    {t(language, f)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Status color legend */}
                    <View style={styles.legendRow}>
                        <Text style={[styles.legendItem, { color: Colors.textMuted }]}>● {t(language, 'draft')}</Text>
                        <Text style={[styles.legendItem, { color: Colors.primary }]}>● {t(language, 'sent')}</Text>
                        <Text style={[styles.legendItem, { color: Colors.income }]}>● {t(language, 'paid')}</Text>
                        <Text style={[styles.legendItem, { color: Colors.expense }]}>● {t(language, 'overdue')}</Text>
                    </View>

                    {/* Invoice list */}
                    {filtered.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>{t(language, 'noInvoicesYet')}</Text>
                        </View>
                    ) : (
                        filtered.map(inv => (
                            <TouchableOpacity key={inv.id} style={styles.card} onPress={() => setViewInv(inv)}>
                                <View style={styles.cardTop}>
                                    <Text style={styles.invNum}>{inv.invoiceNumber}</Text>
                                    <View style={[styles.badge, { backgroundColor: STATUS_COLOR[effectiveInvoiceStatus(inv)] + '22' }]}>
                                        <Text style={[styles.badgeText, { color: STATUS_COLOR[effectiveInvoiceStatus(inv)] }]}>
                                            {t(language, effectiveInvoiceStatus(inv)).toUpperCase()}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.client}>{inv.clientName}</Text>
                                <View style={styles.cardBottom}>
                                    <Text style={styles.dueText}>{t(language, 'duePrefix')} {inv.dueDate}</Text>
                                    <Text style={styles.amount}>{currency}{(inv.total ?? 0).toLocaleString()}</Text>
                                </View>

                                {(() => {
                                    const discount = computeEarlyPaymentDiscount(inv);
                                    return discount?.eligible ? (
                                        <Text style={styles.discountNote}>
                                            💸 Pay by {discount.deadline} for {discount.discountPct}% off — {currency}{discount.discountedTotal.toLocaleString()}
                                        </Text>
                                    ) : null;
                                })()}

                                {hasRecurringInvoiceSchedule(inv) && (
                                    <Text style={styles.recurringNote}>
                                        🔁 Recurring {inv.recurringFrequency} · next due {nextRecurringInvoiceDueDateStr(inv)}
                                    </Text>
                                )}

                                <View style={styles.actions}>
                                    <ActionBtn label={t(language, 'edit')}   onPress={() => openEdit(inv)} color={Colors.primary} />
                                    <ActionBtn label={t(language, 'share')}  onPress={() => handleShare(inv)} color={Colors.income} />
                                    <TouchableOpacity style={styles.whatsappBtn} onPress={() => handleWhatsApp(inv)}>
                                        <Text style={styles.whatsappBtnText}>WhatsApp</Text>
                                    </TouchableOpacity>
                                    {inv.status !== 'paid' && (
                                        <>
                                            <ActionBtn label={t(language, 'collectPayment')} onPress={() => navigate('payment-link', {
                                                amount: inv.total,
                                                description: `Invoice ${inv.invoiceNumber}`,
                                                customerName: inv.clientName,
                                                customerEmail: inv.clientEmail || '',
                                                invoiceId: inv.id,
                                            })} color="#00C3F7" />
                                            <ActionBtn label={t(language, 'markPaid')} onPress={() => markInvoiceStatus(inv.id, 'paid')} color={Colors.income} />
                                        </>
                                    )}
                                    {inv.status === 'draft' && (
                                        <ActionBtn label={t(language, 'sendAction')} onPress={() => markInvoiceStatus(inv.id, 'sent')} color={Colors.warning} />
                                    )}
                                    {hasRecurringInvoiceSchedule(inv) && isRecurringInvoiceDue(inv) && (
                                        <ActionBtn label="Generate Next" onPress={() => handleGenerateNext(inv)} color={Colors.primary} />
                                    )}
                                    <ActionBtn label={t(language, 'delete')} onPress={() => handleDelete(inv)} color={Colors.expense} />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>
            <FooterNav />

            {/* Follow-up Reminder Run -- one invoice at a time, since WhatsApp's
                free deep-link API needs a manual tap to actually send each
                message; this just removes the "remember to check" part. */}
            {reminderQueue && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setReminderQueue(null)}>
                    <View style={styles.reminderOverlay}>
                        <View style={[styles.reminderCard, constrainModalWidth && styles.reminderCardWide]}>
                            {reminderIdx < reminderQueue.length ? (
                                <ReminderStep
                                    due={reminderQueue[reminderIdx]}
                                    step={reminderIdx + 1}
                                    total={reminderQueue.length}
                                    currency={currency}
                                    onSend={sendCurrentReminder}
                                    onSkip={() => setReminderIdx(i => i + 1)}
                                    onClose={() => setReminderQueue(null)}
                                />
                            ) : (
                                <>
                                    <Text style={styles.reminderTitle}>All caught up</Text>
                                    <Text style={styles.reminderDetail}>No more reminders to send right now.</Text>
                                    <TouchableOpacity style={styles.reminderSendBtn} onPress={() => setReminderQueue(null)}>
                                        <Text style={styles.reminderSendBtnText}>Close</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </Modal>
            )}

            {/* Create / Edit Invoice Modal */}
            <Modal visible={showForm} animationType="slide">
                <SafeAreaView style={styles.safe}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={[styles.pad, constrainModalWidth && styles.modalConstrainedColumn]}>
                            <View style={styles.titleRow}>
                                <Text style={styles.title}>{editId ? t(language, 'editInvoiceTitle') : t(language, 'newInvoiceTitle')}</Text>
                                <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
                                    <Text style={{ color: Colors.textMuted, fontSize: 15 }}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                            </View>

                            {!editId && (
                                <Section title="Quick add">
                                    <FInput
                                        value={qaText}
                                        onChangeText={handleQaTextChange}
                                        placeholder="e.g. Invoice Chidinma 45000 for rice due in 7 days"
                                        multiline
                                    />
                                </Section>
                            )}

                            {(!!editId || qaText.trim().length > 0) && (
                            <>
                            <Section title={t(language, 'clientDetailsSection')}>
                                <FLabel>{t(language, 'clientName')} *</FLabel>
                                <FInput value={clientName} onChangeText={setClientName} placeholder="Acme Corp" />
                                <FLabel>{t(language, 'clientEmail')}</FLabel>
                                <FInput value={clientEmail} onChangeText={setClientEmail} placeholder="billing@acme.com" keyboard="email-address" />
                                <FLabel>{t(language, 'clientPhoneLabel')}</FLabel>
                                <FInput value={clientPhone} onChangeText={setClientPhone} placeholder="+44 7700 900000" keyboard="phone-pad" />
                                <FLabel>{t(language, 'clientAddress')}</FLabel>
                                <FInput value={clientAddress} onChangeText={setClientAddress} placeholder="123 Main St, City" />
                                <FLabel>Credit Limit (optional)</FLabel>
                                <FInput value={creditLimitInput} onChangeText={setCreditLimitInput} keyboard="numeric" placeholder="e.g. 500000" />
                                <Text style={styles.fieldHint}>Warn me if {clientName.trim() || 'this client'}'s unpaid invoices would exceed this amount.</Text>
                            </Section>

                            {/* Credit limit warning -- only shown when this client has a
                                limit set (Settings > Customer Credit Limits) and this
                                invoice's total would push their unpaid exposure over it. */}
                            {creditLimitCheck?.overLimit && (
                                <View style={styles.creditWarnCard}>
                                    <Text style={styles.creditWarnTitle}>⚠️ Over credit limit</Text>
                                    <Text style={styles.creditWarnText}>
                                        {creditLimitCheck.customerName} would owe {currency}{creditLimitCheck.projectedExposure.toLocaleString()} across unpaid invoices
                                        {' '}(existing {currency}{creditLimitCheck.currentExposure.toLocaleString()} + this one), over their {currency}{creditLimitCheck.limit.toLocaleString()} limit
                                        {' '}by {currency}{Math.abs(creditLimitCheck.remaining).toLocaleString()}.
                                    </Text>
                                </View>
                            )}

                            <Section title={t(language, 'invoiceDetailsSection')}>
                                <FLabel>{t(language, 'dueDate')} *</FLabel>
                                <DateInput value={dueDate} onChange={setDueDate} />
                                <FLabel>{t(language, 'notes')}</FLabel>
                                <FInput value={notes} onChangeText={setNotes} placeholder="Payment terms, bank details…" multiline />

                                <FLabel>Early Payment Discount (optional)</FLabel>
                                <View style={styles.lineRow}>
                                    <View style={{ flex: 1 }}>
                                        <FInput value={earlyDiscountPct} onChangeText={setEarlyDiscountPct} keyboard="numeric" placeholder="Discount %" />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 8 }}>
                                        <FInput value={earlyDiscountDays} onChangeText={setEarlyDiscountDays} keyboard="numeric" placeholder="Within N days" />
                                    </View>
                                </View>
                                <Text style={styles.fieldHint}>e.g. 5% off if paid within 10 days of the issue date — leave blank for no discount.</Text>

                                <TouchableOpacity style={styles.recurringToggleRow} onPress={() => setIsRecurring(v => !v)}>
                                    <View style={[styles.checkbox, isRecurring && styles.checkboxChecked]}>
                                        {isRecurring && <Icon name="check" size={13} color="#fff" />}
                                    </View>
                                    <Text style={styles.recurringToggleText}>This is a recurring invoice</Text>
                                </TouchableOpacity>
                                {isRecurring && (
                                    <View style={styles.filterRow}>
                                        {(['weekly', 'monthly', 'quarterly', 'yearly'] as RecurringFrequency[]).map(f => (
                                            <TouchableOpacity
                                                key={f}
                                                style={[styles.filterTab, recurringFrequency === f && styles.filterTabActive]}
                                                onPress={() => setRecurringFrequency(f)}
                                            >
                                                <Text style={[styles.filterText, recurringFrequency === f && styles.filterTextActive]}>{f}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </Section>

                            <Section title={t(language, 'lineItems')}>
                                {lineItems.map((li, idx) => (
                                    <View key={idx} style={styles.lineItem}>
                                        <View style={styles.lineHeader}>
                                            <Text style={styles.lineNum}>{t(language, 'itemLabel')} {idx + 1}</Text>
                                            {lineItems.length > 1 && (
                                                <TouchableOpacity onPress={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}>
                                                    <Text style={{ color: Colors.expense, fontSize: 12 }}>{t(language, 'removeLabel')}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <FLabel>{t(language, 'descriptionLabel')}</FLabel>
                                        <FInput value={li.description} onChangeText={v => updateLine(idx, { description: v })} placeholder="Service or product description" />
                                        <View style={styles.lineRow}>
                                            <View style={{ flex: 1 }}>
                                                <FLabel>{t(language, 'qtyLabel')}</FLabel>
                                                <FInput value={String(li.quantity)} onChangeText={v => updateLine(idx, { quantity: parseFloat(v) || 0 })} keyboard="numeric" placeholder="1" />
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <FLabel>{t(language, 'unitPriceLabel')} ({currency})</FLabel>
                                                <FInput value={String(li.unitPrice)} onChangeText={v => updateLine(idx, { unitPrice: parseFloat(v) || 0 })} keyboard="numeric" placeholder="0" />
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <FLabel>{t(language, 'taxPercentLabel')}</FLabel>
                                                <FInput value={String(li.taxRate)} onChangeText={v => updateLine(idx, { taxRate: parseFloat(v) || 0 })} keyboard="numeric" placeholder="0" />
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.addLineBtn} onPress={() => setLineItems(prev => [...prev, { ...EMPTY_LINE }])}>
                                    <Text style={styles.addLineBtnText}>{t(language, 'addLineItemBtn')}</Text>
                                </TouchableOpacity>
                            </Section>

                            {/* Totals preview */}
                            <View style={styles.totalsCard}>
                                <TotalRow label={t(language, 'subtotalLabel')} value={`${currency}${totals.subtotal.toFixed(2)}`} />
                                <TotalRow label={t(language, 'taxSectionLabel')} value={`${currency}${totals.taxTotal.toFixed(2)}`} />
                                <TotalRow label={t(language, 'totalWord')} value={`${currency}${totals.total.toFixed(2)}`} bold />
                            </View>

                            <TouchableOpacity style={styles.saveBtn} onPress={() => handleSave(false)}>
                                <Text style={styles.saveBtnText}>{t(language, 'saveAndSend')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.draftBtn} onPress={() => handleSave(true)}>
                                <Text style={styles.draftBtnText}>{t(language, 'saveAsDraft')}</Text>
                            </TouchableOpacity>
                            </>
                            )}
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            {/* View Invoice Modal */}
            {viewInv && (
                <Modal visible animationType="slide">
                    <SafeAreaView style={styles.safe}>
                        <ScrollView>
                            <View style={[styles.pad, constrainModalWidth && styles.modalConstrainedColumn]}>
                                <View style={styles.titleRow}>
                                    <Text style={styles.title}>{viewInv.invoiceNumber}</Text>
                                    <TouchableOpacity onPress={() => setViewInv(null)}>
                                        <Text style={{ color: Colors.textMuted, fontSize: 15 }}>{t(language, 'close')}</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.badge, { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: STATUS_COLOR[effectiveInvoiceStatus(viewInv)] + '22' }]}>
                                    <Text style={[styles.badgeText, { color: STATUS_COLOR[effectiveInvoiceStatus(viewInv)] }]}>{t(language, effectiveInvoiceStatus(viewInv)).toUpperCase()}</Text>
                                </View>

                                <Section title={t(language, 'clientSection')}>
                                    <DetailRow label={t(language, 'nameLabel')}    value={viewInv.clientName} />
                                    {viewInv.clientEmail   && <DetailRow label={t(language, 'email')}   value={viewInv.clientEmail} />}
                                    {viewInv.clientAddress && <DetailRow label={t(language, 'addressLabel')} value={viewInv.clientAddress} />}
                                </Section>

                                <Section title={t(language, 'datesSection')}>
                                    <DetailRow label={t(language, 'issuedLabel')} value={viewInv.issueDate} />
                                    <DetailRow label={t(language, 'duePrefix')}    value={viewInv.dueDate} />
                                    {hasRecurringInvoiceSchedule(viewInv) && (
                                        <DetailRow label="Recurs" value={`${viewInv.recurringFrequency} · next ${nextRecurringInvoiceDueDateStr(viewInv)}`} />
                                    )}
                                </Section>

                                {(() => {
                                    const discount = computeEarlyPaymentDiscount(viewInv);
                                    if (!discount) return null;
                                    return (
                                        <Section title="Early Payment Discount">
                                            <DetailRow label="Offer" value={`${discount.discountPct}% off within ${discount.windowDays} days`} />
                                            <DetailRow label="Deadline" value={discount.deadline} />
                                            <DetailRow label="If paid early" value={`${currency}${discount.discountedTotal.toLocaleString()}`} />
                                            <DetailRow label="Status" value={discount.eligible ? `Eligible (${discount.daysLeft} day${discount.daysLeft === 1 ? '' : 's'} left)` : 'Window has passed'} />
                                        </Section>
                                    );
                                })()}

                                <Section title={t(language, 'lineItems')}>
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
                                        <TotalRow label={t(language, 'subtotalLabel')} value={`${currency}${(viewInv.subtotal ?? 0).toFixed(2)}`} />
                                        <TotalRow label={t(language, 'taxSectionLabel')}      value={`${currency}${(viewInv.taxTotal ?? 0).toFixed(2)}`} />
                                        <TotalRow label={t(language, 'totalWord')}    value={`${currency}${(viewInv.total ?? 0).toFixed(2)}`} bold />
                                    </View>
                                </Section>

                                {viewInv.notes ? (
                                    <Section title={t(language, 'notes')}>
                                        <Text style={styles.notesText}>{viewInv.notes}</Text>
                                    </Section>
                                ) : null}

                                <TouchableOpacity style={styles.saveBtn} onPress={() => handleShare(viewInv)}>
                                    <Text style={styles.saveBtnText}>{t(language, 'shareInvoice')}</Text>
                                </TouchableOpacity>

                                {whatsappAvailable && viewInv.status !== 'paid' && (
                                    <>
                                        <TouchableOpacity style={[styles.draftBtn, { marginTop: 8, backgroundColor: '#25D366' }]}
                                            onPress={() => sendInvoiceReminderViaWhatsApp(viewInv, user?.businessName || 'Business', currency, viewInv.clientPhone || '')}>
                                            <View style={styles.btnIconRow}>
                                                <Icon name="message-circle" size={14} color="#fff" />
                                                <Text style={styles.draftBtnText}>{t(language, 'sendReminderWhatsApp')}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.draftBtn, { marginTop: 8, backgroundColor: '#128C7E' }]}
                                            onPress={() => sendPaymentRequestViaWhatsApp(viewInv, user?.businessName || 'Business', currency, viewInv.clientPhone || '')}>
                                            <View style={styles.btnIconRow}>
                                                <Icon name="credit-card" size={14} color="#fff" />
                                                <Text style={styles.draftBtnText}>{t(language, 'requestPaymentWhatsApp')}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </>
                                )}

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
                                            <View style={styles.btnIconRow}>
                                                <Icon name="credit-card" size={14} color="#fff" />
                                                <Text style={styles.draftBtnText}>{t(language, 'collectPaymentPaystack')}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.draftBtn, { marginTop: 8 }]}
                                            onPress={() => { markInvoiceStatus(viewInv.id, 'paid'); setViewInv(null); }}>
                                            <Text style={styles.draftBtnText}>{t(language, 'markPaid')}</Text>
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

function ReminderStep({ due, step, total, currency, onSend, onSkip, onClose }: {
    due: ReminderDue; step: number; total: number; currency: string;
    onSend: () => void; onSkip: () => void; onClose: () => void;
}) {
    return (
        <>
            <View style={styles.reminderHeadRow}>
                <Text style={styles.reminderTitle}>Reminder {step} of {total}</Text>
                <TouchableOpacity onPress={onClose}><Text style={styles.reminderCloseText}>Close</Text></TouchableOpacity>
            </View>
            <Text style={styles.reminderClient}>{due.invoice.clientName}</Text>
            <Text style={styles.reminderDetail}>
                {due.invoice.invoiceNumber} · {currency}{(due.invoice.total ?? 0).toLocaleString()} · {due.daysOverdue} days overdue
            </Text>
            <TouchableOpacity style={styles.reminderSendBtn} onPress={onSend}>
                <Text style={styles.reminderSendBtnText}>Send via WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reminderSkipBtn} onPress={onSkip}>
                <Text style={styles.reminderSkipBtnText}>Skip for now</Text>
            </TouchableOpacity>
        </>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:    { padding: Spacing.lg },

    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
    title:    { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },

    newBtn:     { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: Spacing.sm, borderRadius: Radius.sm },
    newBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

    // Icon + label row shared by the WhatsApp/Paystack action buttons below.
    btnIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },

    summaryRow:   { flexDirection: 'row', gap: Spacing.sm, marginBottom: 14 },
    summaryCard:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' },
    summaryLabel: { fontSize: 9, color: Colors.textMuted, marginBottom: Spacing.xs, textAlign: 'center' },
    summaryValue: { fontSize: 13, fontWeight: 'bold' },

    detectedAlert: { backgroundColor: Colors.primary + '12', borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
    detectedAlertTextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    detectedAlertText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.primary, lineHeight: 18 },
    detectedRow: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.primary + '30', gap: Spacing.sm },
    detectedName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    detectedMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    detectedAdd: { fontSize: 11.5, color: Colors.primary, fontWeight: '700' },

    filterRow:       { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
    filterTab:       { paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: Radius.xl },
    filterTabActive: { backgroundColor: Colors.primary },
    filterText:      { fontSize: 12, color: Colors.textMuted },
    filterTextActive:{ color: '#fff', fontWeight: '600' },

    card:       { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
    invNum:     { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
    badgeText:  { fontSize: 10, fontWeight: 'bold' },
    client:     { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.sm },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    dueText:    { fontSize: 12, color: Colors.textMuted },
    amount:     { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
    actions:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    actionBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderRadius: 6 },
    actionBtnText:  { fontSize: 11, fontWeight: '600' },
    whatsappBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#25D366' },
    whatsappBtnText:{ fontSize: 11, fontWeight: '600', color: '#fff' },
    discountNote:  { fontSize: 11.5, color: Colors.income, fontWeight: '600', marginBottom: 8 },
    recurringNote: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 8 },

    legendRow:  { flexDirection: 'row', gap: Spacing.md, marginBottom: 10, flexWrap: 'wrap' },
    legendItem: { fontSize: 11, fontWeight: '600' },

    empty:     { alignItems: 'center', paddingVertical: 60 },
    emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },

    section:      { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },

    flabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: Spacing.xs, marginTop: Spacing.sm },
    finput: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 9,
        color: Colors.textPrimary, fontSize: 14,
    },
    fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },

    creditWarnCard:  { borderRadius: Radius.md, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.expense, backgroundColor: Colors.expense + '15', ...Shadow.sm },
    creditWarnTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, color: Colors.expense },
    creditWarnText:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

    recurringToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Spacing.md },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    recurringToggleText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },

    lineItem:   { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 10 },
    lineHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    lineNum:    { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
    lineRow:    { flexDirection: 'row' },

    addLineBtn:     { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, alignItems: 'center', marginTop: 10 },
    addLineBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },

    totalsCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: Spacing.md, marginBottom: 14 },
    totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    totalLabel: { fontSize: 13, color: Colors.textMuted },
    totalValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

    saveBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    draftBtn:    { borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, borderRadius: 10, alignItems: 'center' },
    draftBtnText:{ color: Colors.textMuted, fontSize: 14 },

    viewLine:      { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    viewLineDesc:  { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', marginBottom: 2 },
    viewLineSub:   { fontSize: 11, color: Colors.textMuted },
    viewLineTotal: { fontSize: 13, color: Colors.income, fontWeight: 'bold', marginTop: 2 },

    notesText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

    detailRow:   { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    detailLabel: { fontSize: 12, color: Colors.textMuted, width: 80 },
    detailValue: { fontSize: 13, color: Colors.textPrimary, flex: 1 },

    reminderOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Spacing.xl },
    reminderCard:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, ...Shadow.md },
    reminderCardWide: { maxWidth: 440, width: '100%', alignSelf: 'center' },
    // Matches App.tsx's centeredAppColumn width.
    modalConstrainedColumn: { maxWidth: 1040, alignSelf: 'center', width: '100%' },
    reminderHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    reminderTitle:   { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
    reminderCloseText: { fontSize: 13, color: Colors.textMuted },
    reminderClient:  { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    reminderDetail:  { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },
    reminderSendBtn: { backgroundColor: Colors.income, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
    reminderSendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    reminderSkipBtn: { paddingVertical: 10, alignItems: 'center' },
    reminderSkipBtnText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
});
