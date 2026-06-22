import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Share, Alert, Linking, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { apiFetch } from '../utils/api';

export default function PaymentLinkScreen() {
    const { settings, user, navigate, navParams, addTransaction, markInvoiceStatus } = useApp() as any;
    const params = (navParams ?? {}) as {
        amount?: number; description?: string;
        customerName?: string; customerEmail?: string;
        invoiceId?: string;
    };

    const [amount, setAmount]               = useState(params.amount ? String(params.amount) : '');
    const [customerName, setCustomerName]   = useState(params.customerName ?? '');
    const [customerEmail, setCustomerEmail] = useState(params.customerEmail ?? '');
    const [description, setDescription]     = useState(params.description ?? '');
    const [copied, setCopied]               = useState(false);
    const [loading, setLoading]             = useState(false);
    const [loadingMsg, setLoadingMsg]       = useState('');
    const [amountError, setAmountError]     = useState('');

    const currency     = settings.currency || '₦';
    const currencyCode = (settings as any).currencyCode || 'NGN';
    const businessName = user?.businessName || 'My Business';
    const paystackKey  = settings.paystackPublicKey?.trim() || '';
    const korapayKey   = settings.korapayPublicKey?.trim() || '';
    const hasPaystack  = !!paystackKey;
    const hasKorapay   = !!korapayKey;
    const amountNum    = parseFloat(amount) || 0;

    const validate = () => {
        if (!amount || amountNum <= 0) {
            setAmountError('Please enter a valid amount first.');
            return false;
        }
        setAmountError('');
        return true;
    };

    const buildMessage = () => {
        const amt = amountNum.toLocaleString();
        return [
            `💼 *Payment Request from ${businessName}*`,
            '',
            `📌 Amount: *${currency}${amt}*`,
            description  ? `📝 For: ${description}` : '',
            customerName ? `👤 Customer: ${customerName}` : '',
            '',
            (hasPaystack || hasKorapay)
                ? '✅ We accept secure online payments (cards, bank transfer, USSD, mobile money).'
                : '💳 Please contact us to arrange payment.',
            '',
            'Thank you for your business! 🙏',
        ].filter(Boolean).join('\n');
    };

    const handleShare = async () => {
        if (!validate()) return;
        const msg = buildMessage();
        if (Platform.OS === 'web') {
            try {
                if (navigator.share) {
                    await navigator.share({ title: `Payment Request — ${businessName}`, text: msg });
                } else {
                    await navigator.clipboard.writeText(msg);
                    Alert.alert('Copied!', 'Payment request copied to clipboard. Paste it to send to your customer.');
                }
            } catch { /* user cancelled */ }
        } else {
            try { await Share.share({ message: msg, title: `Payment Request — ${businessName}` }); }
            catch { Alert.alert('Error', 'Could not open share dialog.'); }
        }
    };

    const handleWhatsApp = () => {
        if (!validate()) return;
        const text = encodeURIComponent(buildMessage());
        const url  = `https://wa.me/?text=${text}`;
        if (Platform.OS === 'web') {
            openWebUrl(url);
        } else {
            Linking.openURL(url).catch(() =>
                Alert.alert('WhatsApp not available', 'Please open WhatsApp manually and paste the payment request.')
            );
        }
    };

    const handleCopy = async () => {
        if (!validate()) return;
        const msg = buildMessage();
        try {
            if (Platform.OS === 'web') {
                await navigator.clipboard.writeText(msg);
            } else {
                await Share.share({ message: msg });
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            Alert.alert('Error', 'Could not copy text.');
        }
    };

    // Opens a URL on web without popup blocking: try new tab, fall back to same tab
    const openWebUrl = (url: string) => {
        if (Platform.OS !== 'web') { Linking.openURL(url); return; }
        const win = window.open(url, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
            // Popup blocked (common on mobile browsers) — navigate in same tab
            window.location.href = url;
        }
    };

    // ── Paystack ── initialize via backend, open authorization_url in browser
    const handlePaystack = async () => {
        if (!validate()) return;
        if (!customerEmail) {
            Alert.alert('Email required', 'Please enter the customer email to use Paystack.');
            return;
        }
        // Open a blank window NOW (synchronous, in the tap handler) so iOS Safari
        // won't block it as a popup when we set its URL after the async fetch.
        const payWin = Platform.OS === 'web' ? window.open('', '_blank') : null;
        setLoading(true);
        setLoadingMsg('Opening Paystack… please wait');
        const wakeTimer = setTimeout(() => setLoadingMsg('Server starting up, please wait ~30s…'), 5000);
        try {
            const data = await apiFetch('/api/payments/paystack/initialize', {
                method: 'POST',
                body: JSON.stringify({
                    amount: amountNum,
                    email: customerEmail,
                    name: customerName,
                    description: description || `Payment to ${businessName}`,
                    currency: currencyCode,
                }),
            });
            const authUrl = data.authorization_url || data.data?.authorization_url;
            if (!authUrl) throw new Error('No payment URL returned from server');
            if (payWin && !payWin.closed) {
                payWin.location.href = authUrl;
            } else {
                openWebUrl(authUrl);
            }
            Alert.alert(
                'Payment page opened',
                'Complete the payment in your browser. Come back here once done to confirm.',
                [{ text: 'Mark as Paid', onPress: () => recordManualPayment('Paystack') }]
            );
        } catch (e: any) {
            if (payWin && !payWin.closed) payWin.close();
            if (e.message?.includes('Server error') || e.message?.includes('fetch') || e.message?.includes('Network')) {
                Alert.alert(
                    '🔌 Server unavailable',
                    'The payment server is offline or starting up. Please try again in 30 seconds, or use “Send Payment Request” to share a manual payment link.'
                );
            } else {
                Alert.alert('Paystack error', e.message || 'Could not start payment.');
            }
        } finally {
            clearTimeout(wakeTimer);
            setLoading(false);
            setLoadingMsg('');
        }
    };

    // ── Korapay ── initialize via backend, open checkout URL in browser
    const handleKorapay = async () => {
        if (!validate()) return;
        if (!customerEmail) {
            Alert.alert('Email required', 'Please enter the customer email to use Korapay.');
            return;
        }
        const payWin = Platform.OS === 'web' ? window.open('', '_blank') : null;
        setLoading(true);
        setLoadingMsg('Opening Korapay… please wait');
        const wakeTimer = setTimeout(() => setLoadingMsg('Server starting up, please wait ~30s…'), 5000);
        try {
            const ref  = `QD360-${Date.now()}`;
            const data = await apiFetch('/api/payments/korapay/initialize', {
                method: 'POST',
                body: JSON.stringify({
                    amount: amountNum, currency: currencyCode,
                    email: customerEmail, name: customerName,
                    reference: ref, narration: description || `Payment to ${businessName}`,
                }),
            });
            if (!data.checkoutUrl) throw new Error(data.error || 'No checkout URL returned');
            if (payWin && !payWin.closed) {
                payWin.location.href = data.checkoutUrl;
            } else {
                openWebUrl(data.checkoutUrl);
            }
            Alert.alert(
                'Payment page opened',
                'Complete the payment in your browser. Come back here once done to confirm.',
                [{ text: 'Mark as Paid', onPress: () => recordManualPayment('Korapay') }]
            );
        } catch (e: any) {
            if (payWin && !payWin.closed) payWin.close();
            if (e.message?.includes('fetch') || e.message?.includes('Network')) {
                Alert.alert(
                    '🔌 Server unavailable',
                    'The payment server is offline or starting up. Please try again in 30 seconds.'
                );
            } else {
                Alert.alert('Korapay error', e.message || 'Could not initialise payment.');
            }
        } finally {
            clearTimeout(wakeTimer);
            setLoading(false);
            setLoadingMsg('');
        }
    };

    const recordManualPayment = (method: string) => {
        if (!addTransaction) return;
        addTransaction({
            type: 'income', amount: amountNum,
            description: description || `Payment via ${method}`,
            category: 'Sales', date: new Date().toISOString().split('T')[0],
            vendorCustomer: customerName,
            status: 'paid',
        });
        // If this payment came from an invoice, mark that invoice as paid too
        if (params.invoiceId && markInvoiceStatus) {
            markInvoiceStatus(params.invoiceId, 'paid');
        }
        Alert.alert('✅ Recorded', 'Payment saved to your transactions.' + (params.invoiceId ? ' Invoice marked as paid.' : ''));
        navigate('transactions');
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigate('settings')}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>💳 Collect Payment</Text>
                    <Text style={styles.subtitle}>{currencyCode} · {businessName}</Text>
                </View>
            </View>

            {/* Live preview */}
            {amountNum > 0 && (
                <View style={styles.previewCard}>
                    <Text style={styles.previewLabel}>Payment Amount</Text>
                    <Text style={styles.previewAmount}>{currency}{amountNum.toLocaleString()}</Text>
                    {description  ? <Text style={styles.previewDesc}>{description}</Text>         : null}
                    {customerName ? <Text style={styles.previewCustomer}>👤 {customerName}</Text> : null}
                    <View style={styles.gatewayBadges}>
                        {hasPaystack && <Text style={[styles.badge, { backgroundColor: '#00C3F722', color: '#00C3F7' }]}>✓ Paystack</Text>}
                        {hasKorapay  && <Text style={[styles.badge, { backgroundColor: '#5C2E9122', color: '#a78bfa' }]}>✓ Korapay</Text>}
                    </View>
                </View>
            )}

            {/* Form */}
            <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Payment Details</Text>
                <Text style={styles.label}>Amount ({currency}) *</Text>
                <TextInput
                    style={[styles.input, amountError ? { borderColor: '#ef4444' } : null]}
                    value={amount}
                    onChangeText={v => { setAmount(v); if (amountError) setAmountError(''); }}
                    placeholder="0.00" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
                {!!amountError && <Text style={styles.errorText}>{amountError}</Text>}
                <Text style={styles.label}>What is this for?</Text>
                <TextInput style={styles.input} value={description} onChangeText={setDescription}
                    placeholder="e.g. Invoice #001, Consulting fee" placeholderTextColor={Colors.muted} />
                <Text style={styles.label}>Customer Name</Text>
                <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName}
                    placeholder="e.g. Amara Enterprises" placeholderTextColor={Colors.muted} />
                <Text style={styles.label}>Customer Email {(hasPaystack || hasKorapay) ? '*' : '(optional)'}</Text>
                <TextInput style={styles.input} value={customerEmail} onChangeText={setCustomerEmail}
                    placeholder="customer@email.com" placeholderTextColor={Colors.muted}
                    keyboardType="email-address" autoCapitalize="none" />
            </View>

            {/* Online payment gateways */}
            {(hasPaystack || hasKorapay) && (
                <View style={styles.gatewayCard}>
                    <Text style={styles.sectionTitle}>Collect Online Payment</Text>
                    <Text style={styles.gatewayHint}>
                        Opens a secure payment page in the browser. Customer pays with card, bank transfer, USSD, or mobile money.
                    </Text>
                    {!!loadingMsg && (
                        <Text style={styles.loadingMsg}>⏳ {loadingMsg}</Text>
                    )}
                    {hasPaystack && (
                        <TouchableOpacity
                            style={[styles.paystackBtn, loading && { opacity: 0.6 }]}
                            onPress={handlePaystack}
                            disabled={loading}
                        >
                            <Text style={styles.paystackBtnText}>
                                {loading ? '⏳  Please wait…' : '💳  Pay with Paystack'}
                            </Text>
                            <Text style={styles.gatewaySubtitle}>Cards · Bank Transfer · USSD · MoMo</Text>
                        </TouchableOpacity>
                    )}
                    {hasKorapay && (
                        <View style={[styles.korapayBtn, hasPaystack && { marginTop: 10 }, { opacity: 0.55 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.korapayBtnText}>💳  Pay with Korapay</Text>
                                <View style={styles.comingSoonBadge}>
                                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                                </View>
                            </View>
                            <Text style={styles.gatewaySubtitle}>KYC verification in progress</Text>
                        </View>
                    )}
                </View>
            )}

            {/* Share / WhatsApp / Copy */}
            <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleShare}>
                    <Text style={styles.primaryBtnText}>📤  Send Payment Request</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp}>
                    <Text style={styles.whatsappBtnText}>💬  Share via WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                    <Text style={styles.copyBtnText}>{copied ? '✓ Copied!' : '📋  Copy to Clipboard'}</Text>
                </TouchableOpacity>
            </View>

            {/* Setup tip */}
            {!hasPaystack && !hasKorapay && (
                <View style={styles.tipCard}>
                    <Text style={styles.tipTitle}>💡 Enable online payments</Text>
                    <Text style={styles.tipBody}>
                        Add your Paystack or Korapay public key in Settings → Payment Gateways to let customers pay online with cards, bank transfer, USSD, or mobile money.
                    </Text>
                    <TouchableOpacity onPress={() => navigate('settings')}>
                        <Text style={styles.tipLink}>Go to Settings →</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content:   { padding: 16, paddingBottom: 60 },

    header:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    backBtn:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    title:    { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    previewCard: {
        backgroundColor: Colors.primary + '12', borderRadius: 16, padding: 20,
        marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '30',
    },
    previewLabel:    { fontSize: 11, color: Colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    previewAmount:   { fontSize: 40, fontWeight: '900', color: Colors.primary, marginBottom: 6 },
    previewDesc:     { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
    previewCustomer: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
    gatewayBadges:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
    badge:           { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },

    formCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
    label:        { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input:        { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
    errorText:    { fontSize: 12, color: '#ef4444', marginTop: 4 },

    gatewayCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    gatewayHint:     { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 18 },
    gatewaySubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
    loadingMsg:      { fontSize: 12, color: Colors.primary, textAlign: 'center', marginBottom: 10, fontWeight: '600' },

    paystackBtn:     { backgroundColor: '#00C3F7', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    paystackBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    korapayBtn:     { backgroundColor: '#5C2E91', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    korapayBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    comingSoonBadge: { backgroundColor: '#ffffff33', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
    comingSoonText:  { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    actions:         { gap: 10, marginBottom: 16 },
    primaryBtn:      { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    primaryBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
    whatsappBtn:     { backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    whatsappBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    copyBtn:         { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    copyBtnText:     { color: Colors.textSecondary, fontWeight: '600', fontSize: 15 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#f97316' },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 10 },
    tipLink:  { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
