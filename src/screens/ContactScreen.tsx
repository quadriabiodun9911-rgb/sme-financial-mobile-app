/**
 * Standalone Contact page, reached via the "Contact" nav link on
 * LandingScreen (and its footer) rather than a scroll-to-bottom section on
 * the marketing page -- gives it its own place in the nav, the way a real
 * company site structures a Contact page, instead of only being visible if
 * a visitor happens to scroll all the way down.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, Image, Linking } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import { showAlert } from '../utils/webAlert';

export default function ContactScreen() {
    const { navigate } = useApp();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    const goLanding = () => navigate('landing');
    const goLogin = () => navigate('login', { mode: 'owner-login' });
    const goSignup = () => navigate('login', { mode: 'owner-setup' });

    // No backend to receive submissions -- this opens the visitor's own
    // mail client with the fields pre-filled, same as the plain mailto link
    // below, just personalized. Real functionality, not a fake "message
    // sent" confirmation for a form that goes nowhere.
    const sendMessage = () => {
        if (!name.trim() || !message.trim()) {
            showAlert('Missing info', 'Please add your name and a message before sending.');
            return;
        }
        const subject = encodeURIComponent(`Message from ${name.trim()}`);
        const bodyLines = [message.trim(), '', email.trim() ? `Reply to: ${email.trim()}` : ''].filter(Boolean);
        const body = encodeURIComponent(bodyLines.join('\n'));
        Linking.openURL(`mailto:hello@quad360financial.com?subject=${subject}&body=${body}`);
    };

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.nav}>
                    <TouchableOpacity onPress={goLanding} style={s.brandRow}>
                        <Image source={require('../../assets/icon.png')} style={s.navLogo} />
                        <Text style={s.navBrand}>Quad360</Text>
                    </TouchableOpacity>
                    <View style={s.navActions}>
                        <TouchableOpacity onPress={goLogin} style={s.navLoginBtn}>
                            <Text style={s.navLoginText}>Log In</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goSignup} style={s.navSignupBtn}>
                            <Text style={s.navSignupText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity onPress={goLanding} style={s.backLink}>
                    <Icon name="arrow-left" size={13} color={Colors.textMuted} />
                    <Text style={s.backLinkText}>Back to home</Text>
                </TouchableOpacity>

                <View style={s.hero}>
                    <View style={s.iconBadge}>
                        <Icon name="message-circle" size={26} color={Colors.primary} />
                    </View>
                    <Text style={s.heading}>Contact Us</Text>
                    <Text style={s.subtext}>
                        Questions about Quad360 — as an SME or a lender? Reach us directly and we'll respond by email.
                    </Text>
                    <Text style={s.northStar}>
                        Quad360 helps businesses save time, save money, gain clarity, and turn that recovered capacity into profitable growth.
                    </Text>
                    <TouchableOpacity onPress={() => Linking.openURL('mailto:hello@quad360financial.com')} style={s.emailBtn}>
                        <Icon name="mail" size={15} color={Colors.primary} />
                        <Text style={s.emailText}>hello@quad360financial.com</Text>
                    </TouchableOpacity>
                </View>

                <View style={s.formCard}>
                    <Text style={s.formTitle}>Send a Message</Text>
                    <Text style={s.formSubtitle}>
                        Fill in the form below — it opens in your email app with everything pre-filled, ready to send.
                    </Text>

                    <Text style={s.formLabel}>Name</Text>
                    <TextInput
                        style={s.formInput}
                        value={name}
                        onChangeText={setName}
                        placeholder="Your name"
                        placeholderTextColor={Colors.textMuted}
                    />

                    <Text style={s.formLabel}>Email (optional)</Text>
                    <TextInput
                        style={s.formInput}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@company.com"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <Text style={s.formLabel}>Message</Text>
                    <TextInput
                        style={[s.formInput, s.formTextarea]}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="How can we help?"
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={5}
                    />

                    <TouchableOpacity onPress={sendMessage} style={s.submitBtn}>
                        <Text style={s.submitText}>Send Message →</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, paddingBottom: 60 },

    nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navLogo: { width: 32, height: 32, borderRadius: Radius.sm },
    navBrand: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    navActions: { flexDirection: 'row', gap: 10 },
    navLoginBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border },
    navLoginText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    navSignupBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: Colors.primary },
    navSignupText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.xl, marginTop: 6, marginBottom: 10 },
    backLinkText: { fontSize: 12.5, color: Colors.textMuted, fontWeight: '600' },

    hero: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xxl, alignItems: 'center' },
    iconBadge: {
        width: 56, height: 56, borderRadius: Radius.lg, backgroundColor: Colors.primary + '18',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    heading: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    subtext: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', maxWidth: 480, lineHeight: 20, marginBottom: 12 },
    northStar: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', maxWidth: 480, lineHeight: 20, marginBottom: 18 },
    emailBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    emailText: { fontSize: 15, color: Colors.primary, fontWeight: '700' },

    formCard: {
        width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg,
        borderWidth: 1, borderColor: Colors.border, padding: 24, ...Shadow.sm,
    },
    formTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    formSubtitle: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginBottom: 6 },
    formLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 14, marginBottom: 6 },
    formInput: {
        borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12,
        paddingVertical: 10, fontSize: 13.5, color: Colors.textPrimary, backgroundColor: Colors.bg,
    },
    formTextarea: { minHeight: 110, textAlignVertical: 'top' },
    submitBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingVertical: 13, alignItems: 'center', marginTop: 22 },
    submitText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
