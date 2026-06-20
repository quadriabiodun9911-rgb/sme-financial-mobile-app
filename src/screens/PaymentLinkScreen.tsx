import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Share, Alert, Linking, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

export default function PaymentLinkScreen() {
    const { settings, user, navigate, navParams } = useApp();
    const params = (navParams ?? {}) as { amount?: number; description?: string; customerName?: string; customerEmail?: string };

    const [amount, setAmount]             = useState(params.amount ? String(params.amount) : '');
    const [customerName, setCustomerName] = useState(params.customerName ?? '');
    const [customerEmail, setCustomerEmail] = useState(params.customerEmail ?? '');
    const [description, setDescription]   = useState(params.description ?? '');
    const [copied, setCopied]             = useState(false);

    const currency     = settings.currency || '₦';
    const currencyCode = (settings as any).currencyCode || 'NGN';
    const businessName = user?.businessName || 'My Business';
    const hasFlw       = !!((settings as any).flutterwavePublicKey?.trim());

    const buildMessage = () => {
        const amt = parseFloat(amount || '0').toLocaleString();
        const lines = [
            `💼 *Payment Request from ${businessName}*`,
            '',
            `📌 Amount: *${currency}${amt}*`,
            description ? `📝 For: ${description}` : '',
            customerName ? `👤 Customer: ${customerName}` : '',
            '',
            hasFlw
                ? '✅ We accept secure online payments via Flutterwave (cards, bank transfer, mobile money).'
                : '💳 Please contact us to arrange payment.',
            '',
            'Thank you for your business! 🙏',
        ].filter(Boolean);
        return lines.join('\n');
    };

    const validate = () => {
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            Alert.alert('Amount required', 'Please enter a valid amount.');
            return false;
        }
        return true;
    };

    const handleShare = async () => {
        if (!validate()) return;
        try {
            await Share.share({ message: buildMessage(), title: `Payment Request — ${businessName}` });
        } catch {
            Alert.alert('Error', 'Could not open share dialog.');
        }
    };

    const handleWhatsApp = () => {
        if (!validate()) return;
        // Use web URL on desktop browsers so it opens WhatsApp Web; native deep link on mobile
        const text = encodeURIComponent(buildMessage());
        const url = Platform.OS === 'web'
            ? `https://wa.me/?text=${text}`
            : `whatsapp://send?text=${text}`;
        Linking.openURL(url).catch(() =>
            Alert.alert('WhatsApp not found', 'Please install WhatsApp to use this feature.')
        );
    };

    const handleCopy = () => {
        if (!validate()) return;
        // Use Share as a clipboard fallback since Clipboard API varies across RN versions
        Share.share({ message: buildMessage() }).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    };

    const parsedAmount = parseFloat(amount) || 0;

    return (
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

            {/* Live preview card */}
            {parsedAmount > 0 && (
                <View style={styles.previewCard}>
                    <Text style={styles.previewLabel}>Payment Amount</Text>
                    <Text style={styles.previewAmount}>{currency}{parsedAmount.toLocaleString()}</Text>
                    {description ? <Text style={styles.previewDesc}>{description}</Text> : null}
                    {customerName ? <Text style={styles.previewCustomer}>👤 {customerName}</Text> : null}
                    {hasFlw && <Text style={styles.flwTag}>✓ Flutterwave enabled</Text>}
                </View>
            )}

            {/* Form */}
            <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Payment Details</Text>

                <Text style={styles.label}>Amount ({currency}) *</Text>
                <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.muted}
                    keyboardType="decimal-pad"
                />

                <Text style={styles.label}>What is this for?</Text>
                <TextInput
                    style={styles.input}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Invoice #001, Consulting fee"
                    placeholderTextColor={Colors.muted}
                />

                <Text style={styles.label}>Customer Name</Text>
                <TextInput
                    style={styles.input}
                    value={customerName}
                    onChangeText={setCustomerName}
                    placeholder="e.g. Amara Enterprises"
                    placeholderTextColor={Colors.muted}
                />

                <Text style={styles.label}>Customer Email (optional)</Text>
                <TextInput
                    style={styles.input}
                    value={customerEmail}
                    onChangeText={setCustomerEmail}
                    placeholder="customer@email.com"
                    placeholderTextColor={Colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
            </View>

            {/* Action buttons */}
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

            {!hasFlw && (
                <View style={styles.tipCard}>
                    <Text style={styles.tipTitle}>💡 Enable Flutterwave payments</Text>
                    <Text style={styles.tipBody}>
                        Add your Flutterwave Public Key in Settings → Payments to let customers pay online across Africa (cards, M-Pesa, MTN MoMo, bank transfer).
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
        backgroundColor: Colors.primary + '12',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.primary + '30',
    },
    previewLabel:    { fontSize: 11, color: Colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    previewAmount:   { fontSize: 40, fontWeight: '900', color: Colors.primary, marginBottom: 6 },
    previewDesc:     { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
    previewCustomer: { fontSize: 12, color: Colors.textMuted },
    flwTag:          { marginTop: 8, fontSize: 11, color: '#f97316', fontWeight: '700', backgroundColor: 'rgba(249,115,22,0.1)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },

    formCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
    label:        { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input:        {
        backgroundColor: Colors.bg,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.textPrimary,
        fontSize: 14,
    },

    actions: { gap: 10, marginBottom: 16 },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    whatsappBtn:     { backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    whatsappBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    copyBtn:     { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    copyBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 15 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#f97316' },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 10 },
    tipLink:  { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
