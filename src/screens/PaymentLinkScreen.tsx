import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Share, Alert, Linking, Platform, Modal, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { PaystackProvider, usePaystack } from 'react-native-paystack-webview';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Config } from '../config';

type Gateway = 'korapay' | null;

// Inner component — must be inside PaystackProvider to use usePaystack hook
function PaymentLinkInner() {
    const { settings, user, navigate, navParams, addTransaction } = useApp() as any;
    const params = (navParams ?? {}) as {
        amount?: number; description?: string;
        customerName?: string; customerEmail?: string;
    };

    const [amount, setAmount]               = useState(params.amount ? String(params.amount) : '');
    const [customerName, setCustomerName]   = useState(params.customerName ?? '');
    const [customerEmail, setCustomerEmail] = useState(params.customerEmail ?? '');
    const [description, setDescription]     = useState(params.description ?? '');
    const [copied, setCopied]               = useState(false);
    const [gateway, setGateway]             = useState<Gateway>(null);
    const [koraUrl, setKoraUrl]             = useState<string | null>(null);
    const [koraRef, setKoraRef]             = useState<string>('');
    const [verifying, setVerifying]         = useState(false);

    const { popup } = usePaystack();

    const currency     = settings.currency || '₦';
    const currencyCode = (settings as any).currencyCode || 'NGN';
    const businessName = user?.businessName || 'My Business';
    const paystackKey  = settings.paystackPublicKey?.trim() || '';
    const korapayKey   = settings.korapayPublicKey?.trim() || '';
    const hasPaystack  = !!paystackKey;
    const hasKorapay   = !!korapayKey;
    const hasFlw       = !!((settings as any).flutterwavePublicKey?.trim());
    const amountNum    = parseFloat(amount) || 0;
    const amountKobo   = Math.round(amountNum * 100);

    const validate = () => {
        if (!amount || amountNum <= 0) {
            Alert.alert('Amount required', 'Please enter a valid amount.');
            return false;
        }
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
            (hasPaystack || hasKorapay || hasFlw)
                ? '✅ We accept secure online payments (cards, bank transfer, USSD, mobile money).'
                : '💳 Please contact us to arrange payment.',
            '',
            'Thank you for your business! 🙏',
        ].filter(Boolean).join('\n');
    };

    const handleShare = async () => {
        if (!validate()) return;
        try { await Share.share({ message: buildMessage(), title: `Payment Request — ${businessName}` }); }
        catch { Alert.alert('Error', 'Could not open share dialog.'); }
    };

    const handleWhatsApp = () => {
        if (!validate()) return;
        const text = encodeURIComponent(buildMessage());
        const url  = Platform.OS === 'web' ? `https://wa.me/?text=${text}` : `whatsapp://send?text=${text}`;
        Linking.openURL(url).catch(() => Alert.alert('WhatsApp not found', 'Please install WhatsApp.'));
    };

    const handleCopy = () => {
        if (!validate()) return;
        Share.share({ message: buildMessage() }).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    };

    const verifyPaystack = async (reference: string) => {
        setVerifying(true);
        try {
            const resp = await fetch(`${Config.BACKEND_URL}/api/payments/paystack/verify`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference }),
            });
            const data = await resp.json();
            if (data.verified) {
                Alert.alert('Payment Confirmed ✅', `${currency}${data.amount?.toLocaleString()} received from ${customerName || customerEmail}`);
                if (addTransaction) {
                    addTransaction({
                        type: 'income', amount: data.amount,
                        description: description || 'Payment received',
                        category: 'Sales', date: new Date().toISOString().split('T')[0],
                        vendorCustomer: customerName, reference: data.reference,
                        paymentMethod: 'Paystack',
                    });
                }
                navigate('transactions');
            } else {
                Alert.alert('Verification failed', data.message || 'Could not confirm payment.');
            }
        } catch {
            Alert.alert('Network error', 'Payment may have succeeded — please check your Paystack dashboard.');
        } finally {
            setVerifying(false);
        }
    };

    // ── Paystack ────────────────────────────────────────────────────────────────
    const handlePaystack = () => {
        if (!validate()) return;
        if (!customerEmail) { Alert.alert('Email required', 'Please enter the customer email to use Paystack.'); return; }
        popup.checkout({
            email:   customerEmail,
            amount:  amountKobo,
            onSuccess: (res) => verifyPaystack(res.reference || res.trans || ''),
            onCancel:  () => {},
        });
    };

    // ── Korapay ─────────────────────────────────────────────────────────────────
    const handleKorapay = async () => {
        if (!validate()) return;
        if (!customerEmail) { Alert.alert('Email required', 'Please enter the customer email to use Korapay.'); return; }
        setVerifying(true);
        try {
            const ref  = `QD360-${Date.now()}`;
            const resp = await fetch(`${Config.BACKEND_URL}/api/payments/korapay/initialize`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amountNum, currency: currencyCode,
                    email: customerEmail, name: customerName,
                    reference: ref, narration: description || `Payment to ${businessName}`,
                }),
            });
            const data = await resp.json();
            if (!data.checkoutUrl) throw new Error(data.error || 'No checkout URL');
            setKoraRef(data.reference || ref);
            setKoraUrl(data.checkoutUrl);
            setGateway('korapay');
        } catch (e: any) {
            Alert.alert('Korapay error', e.message || 'Could not initialise payment.');
        } finally {
            setVerifying(false);
        }
    };

    const onKorapayMessage = async (event: any) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            const succeeded = msg?.event === 'korapay.payment.completed' || msg?.status === 'success';
            const failed    = msg?.event === 'korapay.payment.failed'    || msg?.status === 'failed';
            if (succeeded) {
                setKoraUrl(null); setGateway(null);
                setVerifying(true);
                try {
                    const resp = await fetch(`${Config.BACKEND_URL}/api/payments/korapay/verify`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reference: koraRef }),
                    });
                    const data = await resp.json();
                    if (data.verified) {
                        Alert.alert('Payment Confirmed ✅', `${currency}${data.amount?.toLocaleString()} received from ${customerName || customerEmail}`);
                        if (addTransaction) {
                            addTransaction({
                                type: 'income', amount: data.amount,
                                description: description || 'Payment received',
                                category: 'Sales', date: new Date().toISOString().split('T')[0],
                                vendorCustomer: customerName, reference: data.reference,
                                paymentMethod: 'Korapay',
                            });
                        }
                        navigate('transactions');
                    } else {
                        Alert.alert('Verification failed', data.message || 'Could not confirm payment.');
                    }
                } finally {
                    setVerifying(false);
                }
            } else if (failed) {
                setKoraUrl(null); setGateway(null);
                Alert.alert('Payment failed', 'The customer cancelled or the payment was declined.');
            }
        } catch { /* not a Korapay message */ }
    };

    return (
        <>
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigate('invoices')}>
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
                        {description   ? <Text style={styles.previewDesc}>{description}</Text>         : null}
                        {customerName  ? <Text style={styles.previewCustomer}>👤 {customerName}</Text> : null}
                        <View style={styles.gatewayBadges}>
                            {hasPaystack && <Text style={[styles.badge, { backgroundColor: '#00C3F722', color: '#00C3F7' }]}>✓ Paystack</Text>}
                            {hasKorapay  && <Text style={[styles.badge, { backgroundColor: '#5C2E9122', color: '#a78bfa'  }]}>✓ Korapay</Text>}
                            {hasFlw      && <Text style={[styles.badge, { backgroundColor: '#f9731618', color: '#f97316'  }]}>✓ Flutterwave</Text>}
                        </View>
                    </View>
                )}

                {/* Form */}
                <View style={styles.formCard}>
                    <Text style={styles.sectionTitle}>Payment Details</Text>
                    <Text style={styles.label}>Amount ({currency}) *</Text>
                    <TextInput style={styles.input} value={amount} onChangeText={setAmount}
                        placeholder="0.00" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
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
                            Customer pays instantly with card, bank transfer, USSD, or mobile money.
                        </Text>
                        {hasPaystack && (
                            <TouchableOpacity style={styles.paystackBtn} onPress={handlePaystack}>
                                <Text style={styles.paystackBtnText}>💳  Pay with Paystack</Text>
                                <Text style={styles.gatewaySubtitle}>Cards · Bank Transfer · USSD · MoMo</Text>
                            </TouchableOpacity>
                        )}
                        {hasKorapay && (
                            <TouchableOpacity style={[styles.korapayBtn, hasPaystack && { marginTop: 10 }]} onPress={handleKorapay}>
                                <Text style={styles.korapayBtnText}>💳  Pay with Korapay</Text>
                                <Text style={styles.gatewaySubtitle}>Cards · Bank Transfer · USSD · MoMo</Text>
                            </TouchableOpacity>
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
                {!hasPaystack && !hasKorapay && !hasFlw && (
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

            {/* Korapay WebView modal */}
            <Modal visible={gateway === 'korapay' && !!koraUrl} animationType="slide">
                <View style={styles.webViewContainer}>
                    <TouchableOpacity style={styles.webViewClose} onPress={() => { setKoraUrl(null); setGateway(null); }}>
                        <Text style={styles.webViewCloseText}>✕ Close</Text>
                    </TouchableOpacity>
                    {koraUrl && (
                        <WebView
                            source={{ uri: koraUrl }}
                            onMessage={onKorapayMessage}
                            injectedJavaScript={`
                                window.addEventListener('message', function(e) {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(
                                            typeof e.data === 'string' ? e.data : JSON.stringify(e.data)
                                        );
                                    }
                                });
                                true;
                            `}
                            style={{ flex: 1 }}
                        />
                    )}
                </View>
            </Modal>

            {/* Verifying overlay */}
            {verifying && (
                <View style={styles.verifyingOverlay}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.verifyingText}>Verifying payment…</Text>
                </View>
            )}
        </>
    );
}

// Outer component wraps with PaystackProvider so usePaystack hook is available inside
export default function PaymentLinkScreen() {
    const { settings } = useApp() as any;
    const paystackKey = settings?.paystackPublicKey?.trim() || '';

    // Only mount PaystackProvider when a real key exists — avoids SDK warnings with empty/placeholder key
    if (paystackKey) {
        return (
            <PaystackProvider publicKey={paystackKey} currency={(settings as any)?.currencyCode || 'NGN'}>
                <PaymentLinkInner />
            </PaystackProvider>
        );
    }
    return <PaymentLinkInner />;
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

    gatewayCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    gatewayHint:     { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 18 },
    gatewaySubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

    paystackBtn:     { backgroundColor: '#00C3F7', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    paystackBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    korapayBtn:     { backgroundColor: '#5C2E91', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    korapayBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

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

    webViewContainer: { flex: 1, backgroundColor: '#000' },
    webViewClose:     { backgroundColor: Colors.surface, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-end' },
    webViewCloseText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },

    verifyingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', gap: 12 },
    verifyingText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
});
