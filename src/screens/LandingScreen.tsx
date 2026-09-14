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
 *
 * Display type (Fraunces) and body type (Plus Jakarta Sans) are loaded via
 * useFonts scoped to this screen only, not App.tsx's root bootstrap — every
 * other screen keeps the system font untouched, and a visitor never waits
 * on a font-load gate: styles fall back to the system font instantly and
 * upgrade in place the moment the custom fonts finish loading (normal
 * FOUT behavior), so there's no blank-screen flash on the one screen SEO
 * and first impressions actually ride on.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, useWindowDimensions, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold, Fraunces_700Bold, Fraunces_600SemiBold_Italic } from '@expo-google-fonts/fraunces';
import {
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon, { IconName } from '../components/ui/Icon';
import QuickHealthCheckWidget from '../components/QuickHealthCheckWidget';

// Feather icons (via Icon.tsx), not emoji -- emoji renders inconsistently
// across OS/browser combinations and reads as an unpolished, hobbyist
// choice on a marketing page. Same icon set the rest of the app uses.
const JOURNEY_STEPS: { icon: IconName; title: string; desc: string; loopDesc: string }[] = [
    { icon: 'edit-3', title: 'Data', desc: 'Sales, expenses, invoices, payments, and cash flows — the everyday record of the business.', loopDesc: 'The everyday record of the business.' },
    { icon: 'search', title: 'Diagnose', desc: "What's actually driving a number — the real root cause, not just that it moved.", loopDesc: 'The real root cause, not just that it moved.' },
    { icon: 'activity', title: 'Understand', desc: "The true state of the business today — profit, cash flow, who owes you, what's slipping.", loopDesc: 'The true state of the business today.' },
    { icon: 'compass', title: 'Anticipate', desc: 'Where cash, risk, and growth are headed before they become a problem.', loopDesc: 'Where cash and risk are headed next.' },
    { icon: 'git-branch', title: 'Decide', desc: 'What to do next, and what happens if you do it — checked before you commit.', loopDesc: 'What happens if you do it — checked first.' },
    { icon: 'play', title: 'Act', desc: 'Put the decision into practice — a budget, a goal, a change to how the business runs.', loopDesc: 'Put the decision into practice.' },
    { icon: 'trending-up', title: 'Improve', desc: "Track whether it actually worked, and adjust the plan when it didn't.", loopDesc: 'Track whether it actually worked.' },
    { icon: 'dollar-sign', title: 'Fund', desc: 'Financing matched to what the business can now prove, not what it asks for.', loopDesc: 'Financing matched to what you can prove.' },
];

// One tool working off one shared ledger, not eight disconnected screens --
// a representative slice of what's actually in the app, not the full
// feature list (Goals/Insights/Advisor/Scoreboard etc. all left out
// deliberately so this stays scannable).
const FEATURE_ITEMS: { icon: IconName; title: string; desc: string }[] = [
    { icon: 'droplet', title: 'Cash Flow & Runway', desc: 'Real-time runway, a 13-week forecast, and stress-testing against inflation or FX shocks.' },
    { icon: 'package', title: 'Inventory', desc: 'FIFO costing, batch and expiry tracking, and reorder intelligence.' },
    { icon: 'file-text', title: 'Invoicing & Collections', desc: 'Automatic aging and a live who-owes-you dashboard.' },
    { icon: 'users', title: 'Payroll', desc: 'Scheduled runs, reminders, and labor-cost intelligence.' },
    { icon: 'sliders', title: 'Budgeting & Forecasting', desc: 'Rolling forecasts, a budget health score, and what-if scenarios.' },
    { icon: 'credit-card', title: 'Credit Worthiness', desc: "The Five C's of Credit, computed from real activity." },
    { icon: 'search', title: 'Financing Marketplace', desc: 'Matched to lenders who actually fit — not one blind application.' },
    { icon: 'smartphone', title: 'Quick Capture', desc: 'WhatsApp, voice notes, or a receipt photo — no typing required.' },
];

const LENDER_STEPS: { icon: IconName; title: string; desc: string }[] = [
    { icon: 'compass', title: 'Discover', desc: 'Publish your financing products directly — reach businesses actively seeking relevant capital.' },
    { icon: 'target', title: 'Match', desc: "Only see businesses that fit your criteria, not every applicant with every loan you don't offer." },
    { icon: 'bar-chart-2', title: 'Assess', desc: 'A structured readiness profile per business — revenue, DSCR, history — before you ever open a file.' },
    { icon: 'radio', title: 'Monitor', desc: "Ongoing status on what you've funded — a status, a trend, and what's flagged, for consenting borrowers." },
];

// What a funded loan actually gets once it's live, beyond the four
// discover/match/assess/monitor steps above -- the newest, most concrete
// answer to "then what happens" a lender asks after Monitor.
const POST_FINANCING_POINTS: string[] = [
    "Alerts when a funded business's risk status genuinely worsens — not silence until a missed payment",
    'Portfolio concentration by borrower and purpose, so no single business quietly becomes too much of the book',
    'Real economic-impact tracking — repayment outcomes and revenue growth since funding, across the portfolio',
];

const LOOP_RADIUS = 210;
const LOOP_SIZE = LOOP_RADIUS * 2 + 140;

export default function LandingScreen() {
    const { navigate, enterLenderDemo } = useApp();
    const { width } = useWindowDimensions();
    const isWide = Platform.OS === 'web' && width >= 900;
    // Logo + "Blog" + "Contact" + "Log In" + "Sign Up" don't all fit on a
    // phone-width nav row, and this row never wraps — "Sign Up" was getting
    // clipped off the right edge with no way to scroll to it. Blog/Contact
    // are already reachable from the footer, so drop them from the header
    // below this width instead of shrinking everything to illegibility.
    const isNarrow = width < 480;

    // Falls back to the system font instantly (fontsLoaded false on first
    // paint) and upgrades in place once these finish -- see this file's own
    // header comment for why there's no loading gate here.
    const [fontsLoaded] = useFonts({
        Fraunces_600SemiBold, Fraunces_700Bold, Fraunces_600SemiBold_Italic,
        PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
        PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
    });
    const display = (weight: 'semibold' | 'bold' | 'italic') => fontsLoaded
        ? { fontFamily: weight === 'bold' ? 'Fraunces_700Bold' : weight === 'italic' ? 'Fraunces_600SemiBold_Italic' : 'Fraunces_600SemiBold' }
        : undefined;
    const body = (weight: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold') => fontsLoaded
        ? { fontFamily: `PlusJakartaSans_${weight === 'regular' ? '400Regular' : weight === 'medium' ? '500Medium' : weight === 'semibold' ? '600SemiBold' : weight === 'bold' ? '700Bold' : '800ExtraBold'}` }
        : undefined;

    const goLogin = () => navigate('login', { mode: 'owner-login' });
    // seed carries the Quick Health Check widget's three typed numbers
    // through to signup (see LoginScreen's handleSetup + quickHealthCheck's
    // buildQuickCheckSeedTransactions) so that 60-second "aha" moment
    // doesn't reset to a blank account the instant someone signs up.
    const goSignup = (seed?: { lastMonthRevenue: number; monthlyExpenses: number; cashInBank: number }) =>
        navigate('login', { mode: 'owner-setup', quickCheckSeed: seed });
    const goDemo = () => navigate('login', { mode: 'demo-pick' });
    const goLender = () => navigate('login', { mode: 'join-lender' });
    const goLenderDemo = () => enterLenderDemo();
    const goContact = () => navigate('contact');
    const goBlog = () => navigate('blog');

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.nav}>
                    <View style={s.brandRow}>
                        <Image source={require('../../assets/icon.png')} style={s.navLogo} />
                        <Text style={[s.navBrand, display('bold')]}>Quad360</Text>
                    </View>
                    <View style={s.navActions}>
                        {!isNarrow && (
                            <>
                                <TouchableOpacity onPress={goBlog} style={s.navContactBtn}>
                                    <Text style={[s.navContactText, body('semibold')]}>Blog</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={goContact} style={s.navContactBtn}>
                                    <Text style={[s.navContactText, body('semibold')]}>Contact</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        <TouchableOpacity onPress={goLogin} style={s.navLoginBtn}>
                            <Text style={[s.navLoginText, body('semibold')]}>Log In</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => goSignup()} style={s.navSignupBtn}>
                            <Text style={[s.navSignupText, body('bold')]}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[s.hero, isWide && s.heroWide]}>
                    <Text style={[s.eyebrow, body('bold')]}>NO COMPLEX CONNECTIONS. NO ACCOUNTING JARGON.</Text>
                    <Text style={[s.headline, isWide && s.headlineWide, display('bold')]}>
                        Stop guessing.{'\n'}Start <Text style={[s.headlineAccent, display('italic')]}>understanding</Text> your business.
                    </Text>
                    <Text style={[s.subhead, isWide && s.subheadWide, body('regular')]}>
                        Know your cash runway, identify financial risks, and discover what you can improve — in 60 seconds.
                        Enter three numbers you already know and get an instant snapshot.
                    </Text>

                    <View style={s.widgetWrap}>
                        <QuickHealthCheckWidget onWantFullPicture={goSignup} onTryDemo={goDemo} isWide={isWide} />
                    </View>

                    <Text style={[s.northStar, isWide && s.northStarWide, body('bold')]}>
                        Quad360 helps businesses save time, save money, gain clarity, and turn that recovered capacity into profitable growth.
                    </Text>

                    <View style={s.ctaRow}>
                        <TouchableOpacity onPress={() => goSignup()} style={s.ctaBtn}>
                            <Text style={[s.ctaText, body('extrabold')]}>Get Started Free →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goDemo} style={s.demoBtn}>
                            <Text style={[s.demoText, body('bold')]}>Try Guest Mode (No sign-up needed)</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.trustRow}>
                        <View style={s.trustChip}><Text style={[s.trustChipText, body('semibold')]}>Built for SMEs across Africa & beyond</Text></View>
                        {/* Tappable, not just a claim -- "trust me" chips are
                            worth nothing to an owner deciding whether to hand
                            over real financial data; a one-tap link to the
                            actual privacy policy at the exact moment they're
                            weighing that decision is worth something. */}
                        <TouchableOpacity style={s.trustChip} onPress={() => navigate('privacy-policy')}>
                            <Text style={[s.trustChipText, body('semibold')]}>Your data stays private — see how →</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={s.bridgeSection}>
                    <View style={[s.bridgeInner, isWide && s.bridgeInnerWide]}>
                        <Text style={[s.bridgeProblem, display('semibold')]}>
                            SMEs generate financial activity every day — sales, expenses, payments, invoices and
                            cash flows — but that activity rarely becomes a clear, trusted picture of the health,
                            capacity and readiness of the business.
                        </Text>
                        <Text style={[s.sectionTitle, display('semibold')]}>Turn business activity into financial evidence</Text>
                        <View style={[s.bridgeFlow, isWide && s.bridgeFlowWide]}>
                            {['Recorded activity', 'Financial history', 'Financial health score', 'Financing readiness', 'Financing opportunities'].map((step, i, arr) => (
                                <React.Fragment key={step}>
                                    <View style={s.bridgeStep}><Text style={[s.bridgeStepText, body('bold')]}>{step}</Text></View>
                                    {i < arr.length - 1 && <Text style={s.bridgeArrow}>{isWide ? '→' : '↓'}</Text>}
                                </React.Fragment>
                            ))}
                        </View>
                        <Text style={[s.bridgeExplainer, body('regular')]}>
                            A business doesn't become financing-ready simply because it needs money. It becomes
                            financing-ready when it can demonstrate the financial capacity to support it — that's
                            what every step above builds toward.
                        </Text>
                    </View>
                </View>

                <View style={s.journeySection}>
                    <Text style={[s.sectionEyebrow, body('bold')]}>YOUR CORE JOURNEY</Text>
                    <Text style={[s.sectionTitle, display('semibold')]}>One continuous loop, not eight separate apps</Text>
                    <Text style={[s.sectionSubtitle, body('regular')]}>Most SME apps stop at recording what happened. Quad360 carries it all the way to capital — then folds what happens next back into the record.</Text>

                    {isWide ? (
                        <View style={s.loopWrap}>
                            <View style={s.loopRing}>
                                <View style={s.loopCenter}>
                                    <Image source={require('../../assets/icon.png')} style={s.loopCenterLogo} />
                                    <Text style={[s.loopCenterLabel, display('semibold')]}>The Loop</Text>
                                </View>
                                {JOURNEY_STEPS.map((step, i) => {
                                    const angle = -90 + i * 45;
                                    return (
                                        <View
                                            key={step.title}
                                            style={[
                                                s.loopNode,
                                                { transform: [{ rotate: `${angle}deg` }, { translateY: -LOOP_RADIUS }, { rotate: `${-angle}deg` }] },
                                            ]}
                                        >
                                            <View style={s.loopNodeDot}>
                                                <Icon name={step.icon} size={18} color={Colors.primary} />
                                            </View>
                                            <Text style={[s.loopNodeTitle, display('semibold')]}>{step.title}</Text>
                                            <Text style={[s.loopNodeDesc, body('regular')]}>{step.loopDesc}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    ) : (
                        <View style={s.journeyRow}>
                            {JOURNEY_STEPS.map(step => (
                                <View key={step.title} style={s.journeyCard}>
                                    <View style={s.stepIconBadge}>
                                        <Icon name={step.icon} size={20} color={Colors.primary} />
                                    </View>
                                    <Text style={[s.journeyTitle, display('semibold')]}>{step.title}</Text>
                                    <Text style={[s.journeyDesc, body('regular')]}>{step.desc}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={s.featureSection}>
                    <Text style={[s.sectionEyebrow, body('bold')]}>WHAT'S INSIDE</Text>
                    <Text style={[s.sectionTitle, display('semibold')]}>Built for how an SME actually runs</Text>
                    <Text style={[s.sectionSubtitle, body('regular')]}>Eight tools working off one shared ledger, not eight disconnected apps that each need their own login.</Text>
                    <View style={[s.featureGrid, isWide && s.featureGridWide]}>
                        {FEATURE_ITEMS.map(item => (
                            <View key={item.title} style={[s.featureCard, isWide && s.featureCardWide]}>
                                <View style={s.stepIconBadge}>
                                    <Icon name={item.icon} size={18} color={Colors.primary} />
                                </View>
                                <Text style={[s.featureTitle, display('semibold')]}>{item.title}</Text>
                                <Text style={[s.featureDesc, body('regular')]}>{item.desc}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={s.lenderSection}>
                    <View style={[s.lenderInner, isWide && s.lenderInnerWide]}>
                        <Text style={[s.lenderEyebrow, body('bold')]}>FOR BANKS · MFBS · FUNDS · DFIS</Text>
                        <Text style={[s.lenderHeadline, isWide && s.lenderHeadlineWide, display('semibold')]}>
                            Don't just receive SME loan applications. Understand the businesses behind them.
                        </Text>
                        <Text style={[s.lenderSubhead, body('regular')]}>
                            Quad360 helps financial institutions discover, match, assess, and monitor SMEs using
                            structured financial intelligence — a more informed pipeline from business activity to
                            financing, not a stack of blind applications.
                        </Text>

                        <View style={[s.lenderStepRow, isWide && s.lenderStepRowWide]}>
                            {LENDER_STEPS.map(step => (
                                <View key={step.title} style={[s.lenderStepCard, isWide && s.lenderStepCardWide]}>
                                    <View style={s.lenderStepIconBadge}>
                                        <Icon name={step.icon} size={20} color={Colors.secondary} />
                                    </View>
                                    <Text style={[s.journeyTitle, display('semibold')]}>{step.title}</Text>
                                    <Text style={[s.journeyDesc, body('regular')]}>{step.desc}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={[s.lenderCallout, isWide && s.lenderCalloutWide]}>
                            <Text style={[s.lenderCalloutTitle, display('semibold')]}>The relationship doesn't end at disbursement</Text>
                            {POST_FINANCING_POINTS.map(line => (
                                <View key={line} style={s.lenderCalloutRow}>
                                    <Icon name="check-circle" size={14} color={Colors.secondary} />
                                    <Text style={[s.lenderCalloutText, body('regular')]}>{line}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Real product screenshot of the lender pipeline
                            (captured from the "Preview as Lender" demo mode
                            below, same honesty standard as the SME hero
                            screenshot above) -- not a mockup. */}
                        <View style={s.lenderPreviewFrame}>
                            <Image
                                source={require('../../assets/landing-lender-preview.png')}
                                style={s.lenderPreviewImage}
                                resizeMode="cover"
                            />
                        </View>
                        <Text style={[s.lenderPreviewCaption, body('regular')]}>A real Quad360 lender view, shown with sample data.</Text>

                        <TouchableOpacity onPress={goLender} style={s.lenderCtaBtn}>
                            <Text style={[s.lenderCtaText, body('extrabold')]}>Join as Lender →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goLenderDemo}>
                            <Text style={[s.lenderDemoLink, body('bold')]}>Preview as Lender (Demo) →</Text>
                        </TouchableOpacity>
                        <Text style={[s.lenderDisclaimer, body('regular')]}>
                            Underwriting, credit policy, and approval decisions always remain entirely yours.
                        </Text>
                    </View>
                </View>

                <View style={s.footer}>
                    <Text style={[s.footerText, body('regular')]}>Quad360 — financial intelligence for SMEs and their lenders.</Text>
                    <View style={s.footerLinks}>
                        <TouchableOpacity onPress={goBlog} style={s.footerContactLink}>
                            <Icon name="file-text" size={13} color={Colors.primary} />
                            <Text style={[s.footerContactLinkText, body('bold')]}>Blog →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goContact} style={s.footerContactLink}>
                            <Icon name="message-circle" size={13} color={Colors.primary} />
                            <Text style={[s.footerContactLinkText, body('bold')]}>Contact Us →</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, paddingBottom: 48 },

    nav: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', rowGap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navLogo: { width: 32, height: 32, borderRadius: Radius.sm },
    navBrand: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
    navActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navContactBtn: { paddingHorizontal: 10, paddingVertical: 9 },
    navContactText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
    navLoginBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border },
    navLoginText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    navSignupBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: Colors.primary },
    navSignupText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    hero: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl, paddingBottom: Spacing.huge, alignItems: 'flex-start' },
    // Widened from the original 820 -- at that cap the hero column sat in
    // roughly the left third of a real desktop-width screen with a bare gap
    // to its right (reported as "narrow to one side"). Rather than filling
    // that gap with an image beside the text (tried and reverted -- read as
    // less professional), the headline/subhead themselves now stretch
    // further across so the copy occupies the space on its own.
    heroWide: { paddingHorizontal: 64, maxWidth: 1180 },
    eyebrow: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 14 },
    headline: { fontSize: 34, fontWeight: '700', color: Colors.textPrimary, lineHeight: 42, marginBottom: 18 },
    headlineWide: { fontSize: 48, lineHeight: 56 },
    headlineAccent: { color: Colors.primary },
    subhead: { fontSize: 15.5, color: Colors.textSecondary, lineHeight: 23, marginBottom: 20, maxWidth: 560 },
    // Widened along with heroWide/headlineWide -- at the original 560 cap
    // these two lines stayed narrow even after the headline above them grew,
    // so the block still read as lopsided rather than filling the column.
    subheadWide: { maxWidth: 760 },
    widgetWrap: { width: '100%', alignItems: 'flex-start', marginBottom: Spacing.xxl },
    northStar: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22, marginBottom: 28, maxWidth: 560 },
    northStarWide: { fontSize: 16.5, lineHeight: 24, maxWidth: 760 },

    ctaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, marginBottom: 24 },
    ctaBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingHorizontal: 26, paddingVertical: 15, ...Shadow.sm },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
    demoBtn: { paddingVertical: 15 },
    demoText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

    trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    trustChip: { backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
    trustChipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },

    bridgeSection: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge },
    bridgeInner: { alignItems: 'center' },
    bridgeInnerWide: { paddingHorizontal: 40 },
    bridgeProblem: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, lineHeight: 25, textAlign: 'center', maxWidth: 640, marginBottom: 26 },
    bridgeFlow: { alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 20 },
    bridgeFlowWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    bridgeStep: { backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: Colors.border },
    bridgeStepText: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    bridgeArrow: { fontSize: 14, color: Colors.textMuted, marginHorizontal: 2 },
    bridgeExplainer: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center', maxWidth: 560 },

    journeySection: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge },
    sectionEyebrow: { fontSize: 11.5, fontWeight: '700', color: Colors.primary, letterSpacing: 0.6, textAlign: 'center', marginBottom: 10 },
    sectionTitle: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    sectionSubtitle: { fontSize: 13.5, color: Colors.textMuted, textAlign: 'center', marginBottom: 30, maxWidth: 480, alignSelf: 'center', lineHeight: 19 },
    journeyRow: { gap: 14 },
    journeyCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    stepIconBadge: {
        width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primary + '18',
        alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    journeyTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    journeyDesc: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    // The Loop -- a literal circle, not a decorative flourish: Fund's own
    // description ("financing matched to what the business can now prove")
    // feeds back into Data, so an eight-item linear row would misstate the
    // one structural fact that matters here -- it doesn't end. Desktop only
    // (isWide) -- the same content renders as journeyRow's linear cards
    // below 900px, where a circle this size has no room to be legible.
    loopWrap: { width: '100%', alignItems: 'center' },
    loopRing: { width: LOOP_SIZE, height: LOOP_SIZE, alignItems: 'center', justifyContent: 'center' },
    loopCenter: {
        position: 'absolute', width: 148, height: 148, borderRadius: 74,
        backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
        alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    loopCenterLogo: { width: 30, height: 30, borderRadius: 8 },
    loopCenterLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    loopNode: {
        position: 'absolute', top: '50%', left: '50%', width: 128, marginLeft: -64, marginTop: -56,
        alignItems: 'center',
    },
    loopNodeDot: {
        width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center', marginBottom: 8, ...Shadow.sm,
    },
    loopNodeTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3, textAlign: 'center' },
    loopNodeDesc: { fontSize: 9.5, color: Colors.textMuted, lineHeight: 13, textAlign: 'center' },

    featureSection: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge },
    featureGrid: { gap: 14 },
    featureGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    featureCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    featureCardWide: { width: 260 },
    featureTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    featureDesc: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    lenderSection: { backgroundColor: Colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.huge, marginBottom: 32 },
    lenderInner: { paddingHorizontal: Spacing.xl, alignItems: 'flex-start' },
    lenderInnerWide: { paddingHorizontal: 64, alignItems: 'center' },
    lenderEyebrow: { fontSize: 11.5, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.6, marginBottom: 14 },
    lenderHeadline: { fontSize: 25, fontWeight: '700', color: Colors.textPrimary, lineHeight: 32, marginBottom: 14, maxWidth: 640 },
    lenderHeadlineWide: { fontSize: 32, lineHeight: 40, textAlign: 'center' },
    lenderSubhead: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: 28, maxWidth: 640 },

    lenderStepRow: { gap: 14, width: '100%', marginBottom: 22 },
    lenderStepRowWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    lenderStepCard: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 18, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    lenderStepCardWide: { width: 220 },
    lenderStepIconBadge: {
        width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.secondary + '18',
        alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },

    lenderCallout: {
        width: '100%', backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: 20, marginBottom: 26, gap: 10,
    },
    lenderCalloutWide: { maxWidth: 620 },
    lenderCalloutTitle: { fontSize: 15.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    lenderCalloutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    lenderCalloutText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    lenderPreviewFrame: {
        width: '100%', maxWidth: 720, aspectRatio: 1280 / 470,
        borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        overflow: 'hidden', backgroundColor: Colors.bg, ...Shadow.lg, marginBottom: 8,
    },
    lenderPreviewImage: { width: '100%', height: '100%' },
    lenderPreviewCaption: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 22, textAlign: 'center' },

    lenderCtaBtn: { backgroundColor: Colors.secondary, borderRadius: Radius.pill, paddingHorizontal: 28, paddingVertical: 15, ...Shadow.sm, marginBottom: 12 },
    lenderCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    lenderDemoLink: { color: Colors.secondary, fontWeight: '700', fontSize: 13, marginBottom: 14 },
    lenderDisclaimer: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', maxWidth: 420 },

    footer: {
        paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xxl, alignItems: 'center',
        borderTopWidth: 1, borderTopColor: Colors.border, gap: 10,
    },
    footerText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
    footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    footerContactLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerContactLinkText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
