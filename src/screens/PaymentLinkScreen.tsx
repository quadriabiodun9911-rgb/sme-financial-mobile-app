import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Share, Alert, Linking, Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { supabase } from '../utils/supabase';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { getConnectedProviders } from '../utils/paymentSecrets';
import { getWorkspaceOwnerId } from '../utils/storage';
import { claimIncomingPayments } from '../utils/incomingPayments';
import { savePendingPayment, PendingPayment } from '../utils/pendingPayment';

// Same shape as aiAdvisor.ts's askAdvisor -- the edge function always
// replies with a JSON { error } body on failure, so surface that instead
// of a generic "Edge Function returned a non-2xx status code".
async function invokePaymentInit(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('payment-init', { body });
    if (error) {
        const errResponse = (error as { context?: Response }).context;
        const errBody = errResponse && typeof errResponse.json === 'function'
            ? await errResponse.json().catch(() => null)
            : null;
        throw new Error(errBody?.error || error.message || 'Could not start payment.');
    }
    return data;
}

export default function PaymentLinkScreen() {
    const { settings, user, navigate, goBack, navParams, addTransaction, markInvoiceStatus, transactions } = useApp() as any;
    const params = (navParams ?? {}) as {
        amount?: number; description?: string;
        customerName?: string; customerEmail?: string;
        invoiceId?: string;
    };

    const [amount, setAmount]               = useState(params.amount ? String(params.amount) : '');
    const [customerName, setCustomerName]   = useState(params.customerName ?? '');
    const [customerEmail, setCustomerEmail] = useState(params.customerEmail ?? '');
    const [customerPhone, setCustomerPhone] = useState('');
    const [description, setDescription]     = useState(params.description ?? '');
    const [copied, setCopied]               = useState(false);
    const [loading, setLoading]             = useState(false);
    const [loadingMsg, setLoadingMsg]       = useState('');
    const [amountError, setAmountError]     = useState('');
    // The real checkout link a generated QR code currently encodes -- kept
    // separate from the form fields so it can never silently go stale: a
    // customer scanning the code must always land on a checkout for exactly
    // the amount/description shown next to it, so any edit below clears
    // this and forces a fresh "Generate QR Code" tap rather than displaying
    // an old code next to new numbers.
    const [qrLink, setQrLink]               = useState<string | null>(null);

    const currency     = settings.currency || '₦';
    const currencyCode = (settings as any).currencyCode || 'NGN';
    const businessName = user?.businessName || 'My Business';
    const amountNum    = parseFloat(amount) || 0;

    // Which providers this business has actually connected its own account
    // for -- see paymentSecrets.ts. Starts all-false and fills in once the
    // has_payment_secret() checks land, rather than trusting anything
    // stored client-side (the old paystackPublicKey/etc. fields never
    // proved a working secret key existed server-side).
    const [connected, setConnected]         = useState({ paystack: false, korapay: false, flutterwave: false });
    const [connectedLoaded, setConnectedLoaded] = useState(false);
    const { paystack: hasPaystack, korapay: hasKorapay, flutterwave: hasFlutterwave } = connected;

    useEffect(() => {
        let cancelled = false;
        getConnectedProviders().then(result => {
            if (!cancelled) { setConnected(result); setConnectedLoaded(true); }
        });
        return () => { cancelled = true; };
    }, []);

    // Picks up any payment payment-webhook already confirmed as successful
    // while this screen was open -- e.g. the merchant came back here (Back
    // button) after a checkout that already got recorded automatically by
    // PaymentCompleteScreen on the way back from the provider. Checkout
    // itself is now a full-page redirect to the provider and back (see the
    // Pay-with-X handlers below), not a second tab, so there's no longer a
    // race to poll against here -- PaymentCompleteScreen is the one place
    // that actually waits for the automatic result; see its own polling.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const ownerUserId = await getWorkspaceOwnerId();
            if (!ownerUserId || cancelled) return;
            const existingRefs = new Set<string>((transactions || []).map((t: any) => t.reference).filter(Boolean));
            await claimIncomingPayments(ownerUserId, existingRefs, addTransaction, markInvoiceStatus);
        })();
        return () => { cancelled = true; };
    }, []);

    // Invalidate any already-generated QR the moment a field it was built
    // from changes -- see qrLink's own comment above.
    useEffect(() => { setQrLink(null); }, [amount, description, customerName, customerEmail]);

    const validate = () => {
        if (!amount || amountNum <= 0) {
            setAmountError('Please enter a valid amount first.');
            return false;
        }
        setAmountError('');
        return true;
    };

    const buildMessage = (link?: string | null) => {
        const amt = amountNum.toLocaleString();
        return [
            `💼 *Payment Request from ${businessName}*`,
            '',
            `📌 Amount: *${currency}${amt}*`,
            description  ? `📝 For: ${description}` : '',
            customerName ? `👤 Customer: ${customerName}` : '',
            '',
            link
                ? `👉 Pay securely here: ${link}`
                : (hasPaystack || hasKorapay || hasFlutterwave)
                    ? '✅ We accept secure online payments (cards, bank transfer, USSD, mobile money).'
                    : '💳 Please contact us to arrange payment.',
            '',
            'Thank you for your business! 🙏',
        ].filter(Boolean).join('\n');
    };

    // Best-effort: generates a real, ready-to-pay checkout link the same way
    // the "Pay with X" buttons do, but for embedding in a shared message
    // instead of opening it here. Needs a connected provider -- silently
    // returns null otherwise so callers fall back to buildMessage's
    // no-link copy rather than blocking the share entirely. Korapay is
    // skipped (still "Coming Soon" -- see the gateway card above).
    //
    // Does NOT require a customer email, even though Paystack/Flutterwave's
    // own APIs mandate one: payment-init (see its own body below) already
    // falls back to the merchant's own login email when none is passed, so
    // requiring one here on top of that was purely an overcautious client-
    // side guard, never a real backend constraint -- and it was the one
    // thing standing between "Scan & Pay In Person" and actually working
    // for a walk-up customer whose email nobody at the till would know.
    const getCheckoutLink = async (): Promise<string | null> => {
        if (!hasPaystack && !hasFlutterwave) return null;
        try {
            const ownerUserId = await getWorkspaceOwnerId();
            if (hasPaystack) {
                const data = await invokePaymentInit({
                    provider: 'paystack', ownerUserId,
                    amount: amountNum, email: customerEmail, name: customerName,
                    description: description || `Payment to ${businessName}`,
                    currency: currencyCode,
                });
                return data.authorization_url || data.data?.authorization_url || null;
            }
            const data = await invokePaymentInit({
                provider: 'flutterwave', ownerUserId,
                amount: amountNum, currency: currencyCode,
                email: customerEmail, name: customerName,
                reference: `QD360-${Date.now()}`, description: description || `Payment to ${businessName}`,
            });
            return data.checkoutUrl || null;
        } catch {
            return null;
        }
    };

    // Shared by every "send this to the customer" action below -- fetches a
    // real payment link (with a loading indicator, since it's a network
    // call) and folds it into the message before handing off to whichever
    // channel the user picked.
    const buildShareableMessage = async (): Promise<string> => {
        setLoading(true);
        setLoadingMsg('Preparing payment request…');
        try {
            return buildMessage(await getCheckoutLink());
        } finally {
            setLoading(false);
            setLoadingMsg('');
        }
    };

    const handleShare = async () => {
        if (!validate()) return;
        const msg = await buildShareableMessage();
        if (Platform.OS === 'web') {
            try {
                if (navigator.share) {
                    await navigator.share({ title: `Payment Request — ${businessName}`, text: msg });
                } else {
                    await navigator.clipboard.writeText(msg);
                    window.alert('Copied! Payment request copied to clipboard. Paste it to send to your customer.');
                }
            } catch { /* user cancelled */ }
        } else {
            try { await Share.share({ message: msg, title: `Payment Request — ${businessName}` }); }
            catch { Alert.alert('Error', 'Could not open share dialog.'); }
        }
    };

    const handleWhatsApp = async () => {
        if (!validate()) return;
        const text = encodeURIComponent(await buildShareableMessage());
        const url  = `https://wa.me/?text=${text}`;
        if (Platform.OS === 'web') {
            openWebUrl(url);
        } else {
            Linking.openURL(url).catch(() =>
                Alert.alert('WhatsApp not available', 'Please open WhatsApp manually and paste the payment request.')
            );
        }
    };

    // ── Email ── mailto: to the customer's own address, same pattern as
    // Settings' team-invite email share -- opens whatever mail app/client
    // is configured on this device, prefilled and ready to send.
    const handleEmailCustomer = async () => {
        if (!validate()) return;
        if (!customerEmail) {
            if (Platform.OS === 'web') window.alert('Customer email required. Enter the customer\'s email to send by email.');
            else Alert.alert('Email required', 'Enter the customer\'s email to send by email.');
            return;
        }
        const msg = await buildShareableMessage();
        const subject = encodeURIComponent(`Payment Request from ${businessName}`);
        const body    = encodeURIComponent(msg);
        const to      = encodeURIComponent(customerEmail);
        Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`).catch(() => {
            const errMsg = 'No email app is configured on this device.';
            if (Platform.OS === 'web') window.alert(errMsg);
            else Alert.alert('Could not open email', errMsg);
        });
    };

    // ── Text (SMS) ── to the customer's phone number.
    const handleTextCustomer = async () => {
        if (!validate()) return;
        if (!customerPhone) {
            if (Platform.OS === 'web') window.alert('Customer phone number required. Enter it above to send by text.');
            else Alert.alert('Phone number required', 'Enter the customer\'s phone number to send by text.');
            return;
        }
        const msg = await buildShareableMessage();
        const body      = encodeURIComponent(msg);
        const separator = Platform.OS === 'ios' ? '&' : '?';
        Linking.openURL(`sms:${customerPhone}${separator}body=${body}`).catch(() => {
            const errMsg = 'No messaging app is configured on this device.';
            if (Platform.OS === 'web') window.alert(errMsg);
            else Alert.alert('Could not open messages', errMsg);
        });
    };

    // Scan & Pay In Person -- a real checkout link (the same one Share/
    // WhatsApp/Email/SMS embed in text) rendered as a QR code instead, so a
    // customer standing in front of the seller can scan it and pay on the
    // spot with no typing, no waiting for a message to arrive, and no
    // manual entry on either side -- deliberately doesn't ask for a
    // customer email first (see getCheckoutLink's own comment): nobody at
    // a till knows a walk-up customer's email, and the backend doesn't
    // actually need one to open a working checkout session. Uses the exact
    // same getCheckoutLink() as every other channel here, so it inherits
    // the same payment-webhook-verified confirmation once paid -- this is
    // not a separate, lower-trust payment path.
    const handleShowQr = async () => {
        if (!validate()) return;
        if (!hasPaystack && !hasFlutterwave) {
            const msg = 'Connect Paystack or Flutterwave in Settings → Payment Gateways to generate a scan-to-pay QR code.';
            if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Connect a gateway first', msg);
            return;
        }
        setLoading(true);
        setLoadingMsg('Generating QR code…');
        try {
            const link = await getCheckoutLink();
            if (!link) throw new Error('Could not generate a payment link. Please try again.');
            setQrLink(link);
        } catch (e: any) {
            const msg = e.message || 'Could not generate a QR code.';
            if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
        } finally {
            setLoading(false);
            setLoadingMsg('');
        }
    };

    const handleCopy = async () => {
        if (!validate()) return;
        const msg = await buildShareableMessage();
        try {
            if (Platform.OS === 'web') {
                await navigator.clipboard.writeText(msg);
            } else {
                await Share.share({ message: msg });
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            if (Platform.OS === 'web') window.alert('Could not copy text.');
            else Alert.alert('Error', 'Could not copy text.');
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

    // Persists just enough of this checkout (see pendingPayment.ts) for
    // PaymentCompleteScreen to record it itself if payment-webhook doesn't
    // beat it to it, then navigates the whole tab to the provider's own
    // checkout page -- a real page redirect, not a second tab, so there's
    // only ever one copy of this workspace's transaction list in play at a
    // time. Native keeps opening the provider's page externally via
    // Linking, same as before.
    const goToCheckout = async (provider: PendingPayment['provider'], url: string, reference: string) => {
        await savePendingPayment({
            reference, provider, amount: amountNum,
            description: description || `Payment to ${businessName}`,
            customerName: customerName || undefined,
            invoiceId: params.invoiceId,
        });
        if (Platform.OS === 'web') window.location.href = url;
        else Linking.openURL(url);
    };

    // ── Paystack ── initialize via backend, redirect to authorization_url
    const handlePaystack = async () => {
        if (!validate()) return;
        if (!customerEmail) {
            if (Platform.OS === 'web') window.alert('Email required. Please enter the customer email to use Paystack.');
            else Alert.alert('Email required', 'Please enter the customer email to use Paystack.');
            return;
        }
        setLoading(true);
        setLoadingMsg('Opening Paystack… please wait');
        const wakeTimer = setTimeout(() => setLoadingMsg('Server starting up, please wait ~30s…'), 5000);
        try {
            const data = await invokePaymentInit({
                provider: 'paystack',
                ownerUserId: await getWorkspaceOwnerId(),
                amount: amountNum,
                email: customerEmail,
                name: customerName,
                description: description || `Payment to ${businessName}`,
                currency: currencyCode,
            });
            const authUrl = data.authorization_url || data.data?.authorization_url;
            if (!authUrl) throw new Error('No payment URL returned from server');
            await goToCheckout('paystack', authUrl, data.reference);
        } catch (e: any) {
            const serverDown = e.message?.includes('Server error') || e.message?.includes('fetch') || e.message?.includes('Network');
            const title = serverDown ? '🔌 Server unavailable' : 'Paystack error';
            const body = serverDown
                ? 'The payment server is offline or starting up. Please try again in 30 seconds, or use “Send Payment Request” to share a manual payment link.'
                : (e.message || 'Could not start payment.');
            if (Platform.OS === 'web') {
                window.alert(`${title}\n\n${body}`);
            } else {
                Alert.alert(title, body);
            }
        } finally {
            clearTimeout(wakeTimer);
            setLoading(false);
            setLoadingMsg('');
        }
    };

    // ── Korapay ── initialize via backend, redirect to checkout URL
    const handleKorapay = async () => {
        if (!validate()) return;
        if (!customerEmail) {
            if (Platform.OS === 'web') window.alert('Email required. Please enter the customer email to use Korapay.');
            else Alert.alert('Email required', 'Please enter the customer email to use Korapay.');
            return;
        }
        setLoading(true);
        setLoadingMsg('Opening Korapay… please wait');
        const wakeTimer = setTimeout(() => setLoadingMsg('Server starting up, please wait ~30s…'), 5000);
        try {
            const ref  = `QD360-${Date.now()}`;
            const data = await invokePaymentInit({
                provider: 'korapay',
                ownerUserId: await getWorkspaceOwnerId(),
                amount: amountNum, currency: currencyCode,
                email: customerEmail, name: customerName,
                reference: ref, narration: description || `Payment to ${businessName}`,
            });
            if (!data.checkoutUrl) throw new Error(data.error || 'No checkout URL returned');
            await goToCheckout('korapay', data.checkoutUrl, data.reference || ref);
        } catch (e: any) {
            const networkDown = e.message?.includes('fetch') || e.message?.includes('Network');
            const title = networkDown ? '🔌 Server unavailable' : 'Korapay error';
            const body = networkDown
                ? 'The payment server is offline or starting up. Please try again in 30 seconds.'
                : (e.message || 'Could not initialise payment.');
            if (Platform.OS === 'web') {
                window.alert(`${title}\n\n${body}`);
            } else {
                Alert.alert(title, body);
            }
        } finally {
            clearTimeout(wakeTimer);
            setLoading(false);
            setLoadingMsg('');
        }
    };

    // ── Flutterwave ── initialize via backend, redirect to checkout link
    const handleFlutterwave = async () => {
        if (!validate()) return;
        if (!customerEmail) {
            if (Platform.OS === 'web') window.alert('Email required. Please enter the customer email to use Flutterwave.');
            else Alert.alert('Email required', 'Please enter the customer email to use Flutterwave.');
            return;
        }
        setLoading(true);
        setLoadingMsg('Opening Flutterwave… please wait');
        const wakeTimer = setTimeout(() => setLoadingMsg('Server starting up, please wait ~30s…'), 5000);
        try {
            const ref  = `QD360-${Date.now()}`;
            const data = await invokePaymentInit({
                provider: 'flutterwave',
                ownerUserId: await getWorkspaceOwnerId(),
                amount: amountNum, currency: currencyCode,
                email: customerEmail, name: customerName,
                reference: ref, description: description || `Payment to ${businessName}`,
            });
            if (!data.checkoutUrl) throw new Error(data.error || 'No checkout URL returned');
            await goToCheckout('flutterwave', data.checkoutUrl, ref);
        } catch (e: any) {
            const networkDown = e.message?.includes('fetch') || e.message?.includes('Network');
            const title = networkDown ? '🔌 Server unavailable' : 'Flutterwave error';
            const body = networkDown
                ? 'The payment server is offline or starting up. Please try again in 30 seconds.'
                : (e.message || 'Could not initialise payment.');
            if (Platform.OS === 'web') {
                window.alert(`${title}\n\n${body}`);
            } else {
                Alert.alert(title, body);
            }
        } finally {
            clearTimeout(wakeTimer);
            setLoading(false);
            setLoadingMsg('');
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => { if (!goBack()) navigate('dashboard'); }}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View>
                    <View style={styles.titleRow}>
                        <Icon name="credit-card" size={17} color={Colors.textPrimary} />
                        <Text style={styles.title}>Collect Payment</Text>
                    </View>
                    <Text style={styles.subtitle}>{currencyCode} · {businessName}</Text>
                </View>
            </View>

            {/* Live preview */}
            {amountNum > 0 && (
                <View style={styles.previewCard}>
                    <Text style={styles.previewLabel}>Payment Amount</Text>
                    <Text style={styles.previewAmount}>{currency}{amountNum.toLocaleString()}</Text>
                    {description  ? <Text style={styles.previewDesc}>{description}</Text>         : null}
                    {customerName ? (
                        <View style={styles.previewCustomerRow}>
                            <Icon name="user" size={11} color={Colors.textMuted} />
                            <Text style={styles.previewCustomer}>{customerName}</Text>
                        </View>
                    ) : null}
                    <View style={styles.gatewayBadges}>
                        {hasPaystack && (
                            <View style={[styles.badge, { backgroundColor: '#00C3F722' }]}>
                                <Icon name="check" size={11} color="#00C3F7" />
                                <Text style={[styles.badgeText, { color: '#00C3F7' }]}>Paystack</Text>
                            </View>
                        )}
                        {hasKorapay && (
                            <View style={[styles.badge, { backgroundColor: '#5C2E9122' }]}>
                                <Icon name="check" size={11} color="#a78bfa" />
                                <Text style={[styles.badgeText, { color: '#a78bfa' }]}>Korapay</Text>
                            </View>
                        )}
                        {hasFlutterwave && (
                            <View style={[styles.badge, { backgroundColor: '#FF9500' + '22' }]}>
                                <Icon name="check" size={11} color="#FF9500" />
                                <Text style={[styles.badgeText, { color: '#FF9500' }]}>Flutterwave</Text>
                            </View>
                        )}
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
                <Text style={styles.label}>Customer Email {(hasPaystack || hasKorapay || hasFlutterwave) ? '*' : '(optional)'}</Text>
                <TextInput style={styles.input} value={customerEmail} onChangeText={setCustomerEmail}
                    placeholder="customer@email.com" placeholderTextColor={Colors.muted}
                    keyboardType="email-address" autoCapitalize="none" />
                <Text style={styles.label}>Customer Phone (optional)</Text>
                <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone}
                    placeholder="+234 801 234 5678" placeholderTextColor={Colors.muted}
                    keyboardType="phone-pad" />
            </View>

            {/* Online payment gateways */}
            {(hasPaystack || hasKorapay || hasFlutterwave) && (
                <View style={styles.gatewayCard}>
                    <Text style={styles.sectionTitle}>Collect Online Payment</Text>
                    <Text style={styles.gatewayHint}>
                        Opens a secure payment page in the browser. Customer pays with card, bank transfer, USSD, or mobile money.
                    </Text>
                    {!!loadingMsg && (
                        <View style={styles.loadingMsgRow}>
                            <Icon name="clock" size={12} color={Colors.primary} />
                            <Text style={styles.loadingMsg}>{loadingMsg}</Text>
                        </View>
                    )}
                    {hasPaystack && (
                        <TouchableOpacity
                            style={[styles.paystackBtn, loading && { opacity: 0.6 }]}
                            onPress={handlePaystack}
                            disabled={loading}
                        >
                            <View style={styles.btnIconRow}>
                                <Icon name={loading ? 'clock' : 'credit-card'} size={15} color="#fff" />
                                <Text style={styles.paystackBtnText}>
                                    {loading ? 'Please wait…' : 'Pay with Paystack'}
                                </Text>
                            </View>
                            <Text style={styles.gatewaySubtitle}>Cards · Bank Transfer · USSD · MoMo</Text>
                        </TouchableOpacity>
                    )}
                    {hasKorapay && (
                        <View style={[styles.korapayBtn, hasPaystack && { marginTop: 10 }, { opacity: 0.55 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={styles.btnIconRow}>
                                    <Icon name="credit-card" size={15} color="#fff" />
                                    <Text style={styles.korapayBtnText}>Pay with Korapay</Text>
                                </View>
                                <View style={styles.comingSoonBadge}>
                                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                                </View>
                            </View>
                            <Text style={styles.gatewaySubtitle}>KYC verification in progress</Text>
                        </View>
                    )}
                    {hasFlutterwave && (
                        <TouchableOpacity
                            style={[styles.flutterwaveBtn, (hasPaystack || hasKorapay) && { marginTop: 10 }, loading && { opacity: 0.6 }]}
                            onPress={handleFlutterwave}
                            disabled={loading}
                        >
                            <View style={styles.btnIconRow}>
                                <Icon name={loading ? 'clock' : 'credit-card'} size={15} color="#fff" />
                                <Text style={styles.flutterwaveBtnText}>
                                    {loading ? 'Please wait…' : 'Pay with Flutterwave'}
                                </Text>
                            </View>
                            <Text style={styles.gatewaySubtitle}>Cards · Bank Transfer · USSD · MoMo</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Scan & Pay In Person */}
            {(hasPaystack || hasFlutterwave) && (
                <View style={styles.gatewayCard}>
                    <Text style={styles.sectionTitle}>Scan & Pay In Person</Text>
                    <Text style={styles.gatewayHint}>
                        Show this to a customer standing in front of you — they scan it with their phone camera and pay immediately, no link to send, no typing on either side.
                    </Text>
                    {qrLink ? (
                        <View style={styles.qrBox}>
                            <View style={styles.qrWrap}>
                                <QRCode value={qrLink} size={176} backgroundColor="#ffffff" color="#000000" />
                            </View>
                            <Text style={styles.qrAmount}>{currency}{amountNum.toLocaleString()}</Text>
                            {!!description && <Text style={styles.qrDesc}>{description}</Text>}
                            <TouchableOpacity onPress={() => setQrLink(null)}>
                                <Text style={styles.qrResetLink}>Generate a new code →</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.qrGenerateBtn, loading && { opacity: 0.6 }]}
                            onPress={handleShowQr}
                            disabled={loading}
                        >
                            <View style={styles.btnIconRow}>
                                <Icon name={loading ? 'clock' : 'grid'} size={15} color="#fff" />
                                <Text style={styles.qrGenerateBtnText}>{loading ? 'Please wait…' : 'Generate QR Code'}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Share / WhatsApp / Copy */}
            <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleShare}>
                    <View style={styles.btnIconRow}>
                        <Icon name="send" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>Send Payment Request</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp}>
                    <View style={styles.btnIconRow}>
                        <Icon name="message-circle" size={15} color="#fff" />
                        <Text style={styles.whatsappBtnText}>Share via WhatsApp</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.emailBtn, !customerEmail && { opacity: 0.5 }]} onPress={handleEmailCustomer}>
                    <View style={styles.btnIconRow}>
                        <Icon name="mail" size={15} color="#fff" />
                        <Text style={styles.emailBtnText}>Email Customer</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smsBtn, !customerPhone && { opacity: 0.5 }]} onPress={handleTextCustomer}>
                    <View style={styles.btnIconRow}>
                        <Icon name="message-square" size={15} color="#fff" />
                        <Text style={styles.smsBtnText}>Text Customer</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                    <View style={styles.btnIconRow}>
                        <Icon name={copied ? 'check' : 'clipboard'} size={15} color={Colors.textSecondary} />
                        <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy to Clipboard'}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Setup tip */}
            {connectedLoaded && !hasPaystack && !hasKorapay && !hasFlutterwave && (
                <View style={styles.tipCard}>
                    <View style={[styles.titleRow, { marginBottom: 6 }]}>
                        <Icon name="zap" size={13} color={Colors.textPrimary} />
                        <Text style={styles.tipTitle}>Enable online payments</Text>
                    </View>
                    <Text style={styles.tipBody}>
                        Connect your Paystack, Korapay, or Flutterwave account in Settings → Payment Gateways to let customers pay online with cards, bank transfer, USSD, or mobile money.
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
    content:   { padding: Spacing.lg, paddingBottom: 60 },

    header:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: Spacing.xl },
    backBtn:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    title:    { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    previewCard: {
        backgroundColor: Colors.primary + '12', borderRadius: Radius.lg, padding: Spacing.xl,
        marginBottom: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '30',
        ...Shadow.sm,
    },
    previewLabel:    { fontSize: 11, color: Colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    previewAmount:   { fontSize: 40, fontWeight: '900', color: Colors.primary, marginBottom: 6 },
    previewDesc:     { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
    previewCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    previewCustomer: { fontSize: 12, color: Colors.textMuted },
    gatewayBadges:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
    badge:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.xl },
    badgeText:       { fontSize: 11, fontWeight: '700' },

    formCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
    label:        { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: 10 },
    input:        { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
    errorText:    { fontSize: 12, color: '#ef4444', marginTop: 4 },

    gatewayCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    gatewayHint:     { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 18 },
    gatewaySubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
    loadingMsgRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 10 },
    loadingMsg:      { fontSize: 12, color: Colors.primary, textAlign: 'center', fontWeight: '600' },

    btnIconRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

    paystackBtn:     { backgroundColor: '#00C3F7', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    paystackBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    korapayBtn:     { backgroundColor: '#5C2E91', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    korapayBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    comingSoonBadge: { backgroundColor: '#ffffff33', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
    comingSoonText:  { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    flutterwaveBtn:     { backgroundColor: '#FF9500', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    flutterwaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    qrGenerateBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    qrGenerateBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    qrBox:             { alignItems: 'center', paddingTop: 4 },
    qrWrap:            { backgroundColor: '#ffffff', padding: 14, borderRadius: Radius.md, ...Shadow.sm },
    qrAmount:          { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, marginTop: 14 },
    qrDesc:            { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
    qrResetLink:       { fontSize: 12.5, color: Colors.primary, fontWeight: '700', marginTop: 12 },

    actions:         { gap: 10, marginBottom: Spacing.lg },
    primaryBtn:      { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    primaryBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
    whatsappBtn:     { backgroundColor: '#25D366', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    whatsappBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    emailBtn:        { backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    emailBtnText:    { color: '#fff', fontWeight: '800', fontSize: 15 },
    smsBtn:          { backgroundColor: '#0891B2', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    smsBtnText:      { color: '#fff', fontWeight: '800', fontSize: 15 },
    copyBtn:         { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    copyBtnText:     { color: Colors.textSecondary, fontWeight: '600', fontSize: 15 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, borderLeftWidth: 3, borderLeftColor: '#f97316', ...Shadow.sm },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 10 },
    tipLink:  { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
