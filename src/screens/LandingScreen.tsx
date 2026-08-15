/**
 * The marketing front door — shown to any visitor who hits the site with no
 * locally-saved account profile (see OptimizedContexts.tsx: currentScreen
 * starts here, but a restored session overrides it via routeAfterAuth()
 * before this ever renders, so a returning logged-in user never sees it).
 * Everything below routes into the existing LoginScreen — this screen owns
 * no auth logic of its own, only the pitch and the two doors into it
 * ("Log In" / "Sign Up"), plus a third into the lender join flow.
 *
 * Deliberately no fabricated trust logos ("Powered by X", partner/bureau
 * badges) — Quad360 has no such partners yet. The trust chips here are the
 * same honest ones LoginScreen's split-setup panel already uses.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, useWindowDimensions, Platform, Linking } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';

const JOURNEY_STEPS: { icon: string; title: string; desc: string }[] = [
    { icon: '🏃', title: 'Run', desc: 'Sales, expenses, invoices, payments — the everyday record of the business.' },
    { icon: '🔍', title: 'Understand', desc: "What's really happening — profit, cash flow, who owes you, what's slipping." },
    { icon: '📈', title: 'Improve', desc: 'What to fix first, ranked by financial impact, not guesswork.' },
    { icon: '✅', title: 'Qualify', desc: 'How financing-ready the business actually is, and exactly why.' },
    { icon: '🤝', title: 'Fund', desc: 'Financing matched to what the business can prove, not what it asks for.' },
];

const LENDER_STEPS: { icon: string; title: string; desc: string }[] = [
    { icon: '📋', title: 'Discover', desc: 'Publish your financing products directly — reach businesses actively seeking relevant capital.' },
    { icon: '🎯', title: 'Match', desc: "Only see businesses that fit your criteria, not every applicant with every loan you don't offer." },
    { icon: '📊', title: 'Assess', desc: 'A structured readiness profile per business — revenue, DSCR, history — before you ever open a file.' },
    { icon: '📡', title: 'Monitor', desc: "Ongoing status on what you've funded — a status, a trend, and what's flagged, for consenting borrowers." },
];

export default function LandingScreen() {
    const { navigate } = useApp();
    const { width } = useWindowDimensions();
    const isWide = Platform.OS === 'web' && width >= 900;

    const goLogin = () => navigate('login', { mode: 'owner-login' });
    const goSignup = () => navigate('login', { mode: 'owner-setup' });
    const goDemo = () => navigate('login', { mode: 'demo-pick' });
    const goLender = () => navigate('login', { mode: 'join-lender' });

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.nav}>
                    <View style={s.brandRow}>
                        <Image source={require('../../assets/icon.png')} style={s.navLogo} />
                        <Text style={s.navBrand}>Quad360</Text>
                    </View>
                    <View style={s.navActions}>
                        <TouchableOpacity onPress={goLogin} style={s.navLoginBtn}>
                            <Text style={s.navLoginText}>Log In</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goSignup} style={s.navSignupBtn}>
                            <Text style={s.navSignupText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[s.hero, isWide && s.heroWide]}>
                    <Text style={s.eyebrow}>THE FINANCIAL INTELLIGENCE LAYER BETWEEN AFRICAN BUSINESSES AND CAPITAL</Text>
                    <Text style={[s.headline, isWide && s.headlineWide]}>
                        From business data to better decisions to better capital.
                    </Text>
                    <Text style={s.subhead}>
                        Understand your business. Improve your financial health. Become financing-ready. Find the right capital.
                    </Text>

                    <View style={s.ctaRow}>
                        <TouchableOpacity onPress={goSignup} style={s.ctaBtn}>
                            <Text style={s.ctaText}>Get Started Free →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goDemo} style={s.demoBtn}>
                            <Text style={s.demoText}>Try Demo (No sign-up needed)</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.trustRow}>
                        <View style={s.trustChip}><Text style={s.trustChipText}>Built for SMEs across Africa & beyond</Text></View>
                        <View style={s.trustChip}><Text style={s.trustChipText}>Your data stays private</Text></View>
                    </View>
                </View>

                {/* Real product screenshot (demo data), not a mockup with
                    invented numbers -- shows what Quad360 actually looks
                    like within seconds instead of asking visitors to take
                    the pitch on faith. */}
                <View style={[s.previewWrap, isWide && s.previewWrapWide]}>
                    <View style={s.previewFrame}>
                        <Image
                            source={require('../../assets/landing-dashboard-preview.png')}
                            style={s.previewImage}
                            resizeMode="cover"
                        />
                    </View>
                    <Text style={s.previewCaption}>A real Quad360 dashboard, shown with sample data.</Text>
                </View>

                <View style={s.bridgeSection}>
                    <View style={[s.bridgeInner, isWide && s.bridgeInnerWide]}>
                        <Text style={s.sectionTitle}>Turn business activity into financial evidence</Text>
                        <View style={[s.bridgeFlow, isWide && s.bridgeFlowWide]}>
                            {['Recorded activity', 'Financial history', 'Financial health score', 'Financing readiness', 'Financing opportunities'].map((step, i, arr) => (
                                <React.Fragment key={step}>
                                    <View style={s.bridgeStep}><Text style={s.bridgeStepText}>{step}</Text></View>
                                    {i < arr.length - 1 && <Text style={s.bridgeArrow}>{isWide ? '→' : '↓'}</Text>}
                                </React.Fragment>
                            ))}
                        </View>
                        <Text style={s.bridgeExplainer}>
                            A business doesn't become financing-ready simply because it needs money. It becomes
                            financing-ready when it can demonstrate the financial capacity to support it — that's
                            what every step above builds toward.
                        </Text>
                    </View>
                </View>

                <View style={s.journeySection}>
                    <Text style={s.sectionTitle}>How Quad360 works</Text>
                    <Text style={s.sectionSubtitle}>Most SME apps just help you record what happened. Quad360 takes it further.</Text>
                    <View style={[s.journeyRow, isWide && s.journeyRowWide]}>
                        {JOURNEY_STEPS.map(step => (
                            <View key={step.title} style={[s.journeyCard, isWide && s.journeyCardWide]}>
                                <Text style={s.journeyIcon}>{step.icon}</Text>
                                <Text style={s.journeyTitle}>{step.title}</Text>
                                <Text style={s.journeyDesc}>{step.desc}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={s.lenderSection}>
                    <View style={[s.lenderInner, isWide && s.lenderInnerWide]}>
                        <Text style={s.lenderEyebrow}>FOR BANKS · MFBS · FUNDS · DFIS</Text>
                        <Text style={[s.lenderHeadline, isWide && s.lenderHeadlineWide]}>
                            Don't just receive SME loan applications. Understand the businesses behind them.
                        </Text>
                        <Text style={s.lenderSubhead}>
                            Quad360 helps financial institutions discover, match, assess, and monitor SMEs using
                            structured financial intelligence — a more informed pipeline from business activity to
                            financing, not a stack of blind applications.
                        </Text>

                        <View style={[s.lenderStepRow, isWide && s.lenderStepRowWide]}>
                            {LENDER_STEPS.map(step => (
                                <View key={step.title} style={[s.lenderStepCard, isWide && s.lenderStepCardWide]}>
                                    <Text style={s.journeyIcon}>{step.icon}</Text>
                                    <Text style={s.journeyTitle}>{step.title}</Text>
                                    <Text style={s.journeyDesc}>{step.desc}</Text>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity onPress={goLender} style={s.lenderCtaBtn}>
                            <Text style={s.lenderCtaText}>Join as Lender →</Text>
                        </TouchableOpacity>
                        <Text style={s.lenderDisclaimer}>
                            Underwriting, credit policy, and approval decisions always remain entirely yours.
                        </Text>
                    </View>
                </View>

                <Text style={s.footer}>Quad360 — free forever for SMEs. No credit card required.</Text>
                <TouchableOpacity onPress={() => Linking.openURL('mailto:hello@quad360financial.com')}>
                    <Text style={s.footerContact}>hello@quad360financial.com</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, paddingBottom: 48 },

    nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navLogo: { width: 32, height: 32, borderRadius: Radius.sm },
    navBrand: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    navActions: { flexDirection: 'row', gap: 10 },
    navLoginBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border },
    navLoginText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    navSignupBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: Colors.primary },
    navSignupText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    hero: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl, paddingBottom: Spacing.huge, alignItems: 'flex-start' },
    heroWide: { paddingHorizontal: 64, maxWidth: 820 },
    eyebrow: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 14 },
    headline: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, lineHeight: 40, marginBottom: 16 },
    headlineWide: { fontSize: 44, lineHeight: 52 },
    subhead: { fontSize: 15.5, color: Colors.textSecondary, lineHeight: 23, marginBottom: 28, maxWidth: 560 },

    ctaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, marginBottom: 24 },
    ctaBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingHorizontal: 26, paddingVertical: 15, ...Shadow.sm },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
    demoBtn: { paddingVertical: 15 },
    demoText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

    trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    trustChip: { backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
    trustChipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },

    previewWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.huge, alignItems: 'center' },
    previewWrapWide: { paddingHorizontal: 64 },
    previewFrame: {
        width: '100%', maxWidth: 960, aspectRatio: 1280 / 460,
        borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        overflow: 'hidden', backgroundColor: Colors.surface, ...Shadow.lg,
    },
    previewImage: { width: '100%', height: '100%' },
    previewCaption: { fontSize: 11.5, color: Colors.textMuted, marginTop: 10, textAlign: 'center' },

    bridgeSection: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge },
    bridgeInner: { alignItems: 'center' },
    bridgeInnerWide: { paddingHorizontal: 40 },
    bridgeFlow: { alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 20 },
    bridgeFlowWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    bridgeStep: { backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: Colors.border },
    bridgeStepText: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    bridgeArrow: { fontSize: 14, color: Colors.textMuted, marginHorizontal: 2 },
    bridgeExplainer: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center', maxWidth: 560 },

    journeySection: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge },
    sectionTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' },
    sectionSubtitle: { fontSize: 13.5, color: Colors.textMuted, textAlign: 'center', marginBottom: 28, maxWidth: 480, alignSelf: 'center' },
    journeyRow: { gap: 14 },
    journeyRowWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    journeyCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border },
    journeyCardWide: { width: 220 },
    journeyIcon: { fontSize: 26, marginBottom: 10 },
    journeyTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    journeyDesc: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    lenderSection: { backgroundColor: Colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.huge, marginBottom: 32 },
    lenderInner: { paddingHorizontal: Spacing.xl, alignItems: 'flex-start' },
    lenderInnerWide: { paddingHorizontal: 64, alignItems: 'center' },
    lenderEyebrow: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 14 },
    lenderHeadline: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, lineHeight: 31, marginBottom: 14, maxWidth: 640 },
    lenderHeadlineWide: { fontSize: 30, lineHeight: 38, textAlign: 'center' },
    lenderSubhead: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: 28, maxWidth: 640 },

    lenderStepRow: { gap: 14, width: '100%', marginBottom: 28 },
    lenderStepRowWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    lenderStepCard: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 18, borderWidth: 1, borderColor: Colors.border },
    lenderStepCardWide: { width: 220 },

    lenderCtaBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingHorizontal: 28, paddingVertical: 15, ...Shadow.sm, marginBottom: 12 },
    lenderCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    lenderDisclaimer: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', maxWidth: 420 },

    footer: { textAlign: 'center', fontSize: 11.5, color: Colors.textMuted },
    footerContact: { textAlign: 'center', fontSize: 11.5, color: Colors.primary, fontWeight: '600', marginTop: 6 },
});
