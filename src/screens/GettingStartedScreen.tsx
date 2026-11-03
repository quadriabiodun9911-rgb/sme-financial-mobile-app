import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon, { IconName } from '../components/ui/Icon';
import Header from '../components/Header';
import FooterNav, {
    DIAGNOSIS_ITEMS, UNDERSTAND_ITEMS, ANTICIPATE_ITEMS,
    DECIDE_ITEMS, IMPROVE_ITEMS, FUND_ITEMS, ADVANCED_ITEMS,
} from '../components/FooterNav';
import Collapsible from '../components/Collapsible';
import { Screen, NavParams } from '../types';
import { isScreenAllowedForRole } from '../utils/rolePermissions';
import { t } from '../utils/i18n';

const INDUSTRY_HINTS = [
    { label: '🏬 Retail / Wholesale', hint: 'Shops, boutiques, distributors, pharmacies, fresh produce' },
    { label: '🍽️ Food Service', hint: 'Restaurants, catering, food stalls' },
    { label: '🏭 Manufacturing', hint: 'Makers, assemblers, processors, construction contractors' },
    { label: '💼 Professional Services', hint: 'Consultants, agencies, law firms' },
    { label: '🏢 General / Other', hint: 'Anything else' },
];

const BUSINESS_TYPE_HINTS = [
    { label: 'I sell physical products', hint: 'Retail, food, manufacturing — anything with stock to track' },
    { label: 'I sell a service, no stock', hint: "Consulting, logistics, cleaning, salons — hides Inventory since there's nothing to track there" },
    { label: 'Both', hint: 'A mix, or not sure yet' },
];

// One feature-tour group per FooterNav section, reusing its exact arrays
// (via the exports added there) and its exact sectionX/subX copy -- so
// this guide can never describe a nav the app doesn't actually have.
type NavGroup = { label: string; icon: IconName; screen: Screen; color: string; desc?: string; params?: NavParams };
function useFeatureGroups(): { title: string; subtitle: string; items: NavGroup[] }[] {
    const { language, userRole } = useApp();
    return useMemo(() => {
        const build = (
            items: { label: any; icon: IconName; screen: Screen; color: string; desc?: any; params?: NavParams }[],
        ): NavGroup[] =>
            items
                .filter(i => isScreenAllowedForRole(i.screen, userRole))
                .map(i => ({ ...i, label: t(language, i.label), desc: i.desc ? t(language, i.desc) : undefined }));

        return [
            { title: t(language, 'sectionDiagnosis'), subtitle: t(language, 'subDiagnosis'), items: build(DIAGNOSIS_ITEMS) },
            { title: t(language, 'sectionUnderstand'), subtitle: t(language, 'subUnderstand'), items: build(UNDERSTAND_ITEMS) },
            { title: t(language, 'sectionAnticipate'), subtitle: t(language, 'subAnticipate'), items: build(ANTICIPATE_ITEMS) },
            { title: t(language, 'sectionDecide'), subtitle: t(language, 'subDecide'), items: build(DECIDE_ITEMS) },
            { title: t(language, 'sectionActResults'), subtitle: t(language, 'subActResults'), items: build(IMPROVE_ITEMS) },
            { title: t(language, 'sectionFund'), subtitle: t(language, 'subFund'), items: build(FUND_ITEMS) },
            { title: t(language, 'sectionAdvanced'), subtitle: t(language, 'subAdvanced'), items: build(ADVANCED_ITEMS) },
        ].filter(g => g.items.length > 0);
    }, [language, userRole]);
}

export default function GettingStartedScreen() {
    const { navigate, setCurrentScreen } = useApp();
    const featureGroups = useFeatureGroups();

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>

                <View style={s.heroIconWrap}>
                    <Icon name="compass" size={28} color={Colors.primary} />
                </View>
                <Text style={s.heroTitle}>Getting Started with Quad360</Text>
                <Text style={s.heroSubtitle}>
                    Everything you need to go from a brand-new account to a daily habit — in the order you'll
                    actually use it.
                </Text>

                {/* ── 1. Create your account ─────────────────────────────── */}
                <Collapsible title="1. Create your account" defaultOpen>
                    <Text style={s.body}>
                        Sign up with your email, verify the one-time code sent to you, then set a device PIN —
                        it only ever unlocks the app on this device, it's never sent anywhere as your real
                        credential. In a hurry to look around first? Tap "Try Guest Mode" on the welcome screen
                        instead — it drops you straight into a demo business with real sample data, no account
                        needed.
                    </Text>
                    <Text style={s.stepLabel}>During sign-up, you'll also choose:</Text>
                    <Text style={s.body}>Your business name and your currency (auto-detected, editable).</Text>
                    <Text style={s.stepLabel}>Your industry:</Text>
                    {INDUSTRY_HINTS.map(ind => (
                        <View key={ind.label} style={s.bulletRow}>
                            <Text style={s.bulletLabel}>{ind.label}</Text>
                            <Text style={s.bulletHint}>{ind.hint}</Text>
                        </View>
                    ))}
                    <Text style={s.stepLabel}>What you sell:</Text>
                    {BUSINESS_TYPE_HINTS.map(bt => (
                        <View key={bt.label} style={s.bulletRow}>
                            <Text style={s.bulletLabel}>{bt.label}</Text>
                            <Text style={s.bulletHint}>{bt.hint}</Text>
                        </View>
                    ))}
                    <Text style={s.note}>
                        Industry and product/service tune which tools the app shows you later — a service
                        business with no stock never sees an empty Inventory screen, for example. Both can be
                        changed anytime in Settings.
                    </Text>
                </Collapsible>

                {/* ── 2. Add your transactions ───────────────────────────── */}
                <Collapsible title="2. Add your transactions" defaultOpen>
                    <Text style={s.body}>
                        Quad360 can only diagnose what it can see — this is the one step everything else
                        depends on. Right after sign-up you're asked to choose how:
                    </Text>

                    <Text style={s.stepLabel}>Option A — Upload a bank statement (fastest if you have one)</Text>
                    <Text style={s.body}>
                        From "Upload My Bank Statement," pick a CSV, Excel (.xlsx/.xls), or PDF export from your
                        bank — or a scanned photo of a paper statement. Most banks export from Internet Banking
                        → Statement/History → Download/Export:
                    </Text>
                    {[
                        'GTBank: Accounts → Statement → Export → CSV',
                        'Access: History → Download → Excel',
                        'Zenith: Transactions → Export → CSV',
                        'UBA: Statements → Download',
                        'First Bank: Account → E-Statement → Download',
                        'Any other bank: Transaction History → Export/Download → CSV or Excel',
                    ].map(line => (
                        <Text key={line} style={s.bulletPlain}>•  {line}</Text>
                    ))}
                    <Text style={s.body}>
                        Quad360 auto-categorizes every row (Sales, Rent, Inventory, and so on) and shows you a
                        preview to review and correct before anything is saved — nothing is added silently.
                    </Text>

                    <Text style={s.stepLabel}>Option B — Add transactions manually</Text>
                    <Text style={s.body}>
                        From Transactions, tap "+" and fill in: income or expense, amount, date, a category
                        (pick from the list or type your own), and — this matters — who it's with. Naming the
                        customer or vendor is what lets the app later tell you how dependent your revenue is on
                        one customer, or your costs on one supplier.
                    </Text>
                    <Text style={s.body}>
                        If money hasn't actually changed hands yet (an invoice sent but not paid, a bill
                        received but not settled), mark it "pending" and set a due date — that's what the app
                        uses to track receivables, payables, and overdue alerts.
                    </Text>
                    <Text style={s.note}>
                        First time only, a quick 3-step prompt on the Dashboard ("what do you sell / money in
                        this week / money out this week") can seed your very first entries in under a minute —
                        you can skip any step and add the rest properly later.
                    </Text>
                </Collapsible>

                {/* ── 3. After you add data ──────────────────────────────── */}
                <Collapsible title="3. After you add transactions, do this">
                    {[
                        { icon: 'award' as IconName, text: 'Check the Scoreboard tab — your overall health score updates immediately from what you just entered.' },
                        { icon: 'clipboard' as IconName, text: 'Open Financial Health Score → Early Warning Signals to see if anything needs attention right away.' },
                        { icon: 'check-circle' as IconName, text: 'Skim the categories the import auto-assigned (or that you typed) — fixing a miscategorized entry now keeps every report built on it accurate.' },
                        { icon: 'users' as IconName, text: 'Make sure recurring customers and vendors are named consistently — "Adunola" and "Adunola Fashion Store" read as two different customers to the app.' },
                        { icon: 'zap' as IconName, text: 'Visit Insights and Analysis & Decisions — both read straight off what you just added, so the more real data is in, the sharper their "why" and "what if" get.' },
                    ].map(row => (
                        <View key={row.text} style={s.afterRow}>
                            <View style={s.afterIconBox}><Icon name={row.icon} size={14} color={Colors.primary} /></View>
                            <Text style={s.afterText}>{row.text}</Text>
                        </View>
                    ))}
                </Collapsible>

                {/* ── 4. Settings worth setting up now ───────────────────── */}
                <Collapsible title="4. Settings worth setting up now">
                    {[
                        { title: 'Strategy & Planning', desc: 'Set your target profit margin — several health checks compare your real margin against this.' },
                        { title: 'Security & Team', desc: 'Invite staff with a role (owner, manager, staff) so they see only what that role should.' },
                        { title: 'Profit Goals & Tax', desc: 'Your tax rate and next filing deadline, so the app can remind you ahead of time.' },
                        { title: 'Data & Backup', desc: 'Export a CSV/Excel backup, or restore from one — worth knowing where this is before you need it.' },
                    ].map(row => (
                        <View key={row.title} style={s.settingsRow}>
                            <Text style={s.settingsRowTitle}>{row.title}</Text>
                            <Text style={s.settingsRowDesc}>{row.desc}</Text>
                        </View>
                    ))}
                    <TouchableOpacity style={s.ctaBtn} onPress={() => setCurrentScreen('settings')} activeOpacity={0.85}>
                        <Text style={s.ctaBtnText}>Open Settings</Text>
                        <Icon name="chevron-right" size={16} color="#fff" />
                    </TouchableOpacity>
                </Collapsible>

                {/* ── 5. Explore every feature, grouped the way the app is ── */}
                <Text style={s.sectionDivider}>5. Explore every feature</Text>
                <Text style={s.sectionDividerSub}>
                    Tap anything below to jump straight to it. Grouped the same way the "More" menu is — a loop
                    you'll repeat: Understand where you stand → Anticipate what's coming → Decide what to do →
                    Act & see Results, with Fund and Advanced as tools you reach for on demand.
                </Text>
                {featureGroups.map(group => (
                    <Collapsible key={group.title} title={group.title}>
                        <Text style={s.groupSubtitle}>{group.subtitle}</Text>
                        {group.items.map((item, i, arr) => (
                            <TouchableOpacity
                                key={item.label}
                                style={[s.featureRow, i < arr.length - 1 && s.featureRowBorder]}
                                onPress={() => (item.params ? navigate(item.screen, item.params) : setCurrentScreen(item.screen))}
                                activeOpacity={0.75}
                            >
                                <View style={[s.featureIconBox, { backgroundColor: item.color + '22' }]}>
                                    <Icon name={item.icon} size={15} color={item.color} />
                                </View>
                                <View style={s.featureTextCol}>
                                    <Text style={s.featureLabel}>{item.label}</Text>
                                    {!!item.desc && <Text style={s.featureDesc}>{item.desc}</Text>}
                                </View>
                                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                            </TouchableOpacity>
                        ))}
                    </Collapsible>
                ))}

                {/* ── Your first week ─────────────────────────────────────── */}
                <Collapsible title="Your first week, in five steps">
                    {[
                        'Log every transaction daily (or import your statement weekly) — the health score is only as current as your data.',
                        'Go back and name any "Unknown" customer or vendor you can — concentration risk can\'t be assessed on unnamed revenue.',
                        'Check your Financial Health Score once, so you have a baseline to compare against next week.',
                        'Set a target profit margin in Settings if you haven\'t — several checks are meaningless without one.',
                        'Reconcile once at the end of the week, so next week starts from numbers you trust.',
                    ].map((text, i) => (
                        <View key={text} style={s.weekRow}>
                            <View style={s.weekNum}><Text style={s.weekNumText}>{i + 1}</Text></View>
                            <Text style={s.weekText}>{text}</Text>
                        </View>
                    ))}
                </Collapsible>

            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:    { padding: Spacing.xl, paddingBottom: 48 },

    heroIconWrap: {
        width: 56, height: 56, borderRadius: Radius.pill, backgroundColor: Colors.primary + '18',
        alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: Spacing.md,
    },
    heroTitle:    { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
    heroSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: Spacing.xl },

    body:      { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 8 },
    stepLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginTop: 10, marginBottom: 4 },
    note: {
        fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginTop: 8,
        backgroundColor: Colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.border,
    },

    bulletRow:   { marginBottom: 6, paddingLeft: 2 },
    bulletLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    bulletHint:  { fontSize: 11.5, color: Colors.textMuted, marginTop: 1, lineHeight: 15 },
    bulletPlain: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 2 },

    afterRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    afterIconBox:  { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    afterText:     { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    settingsRow:      { marginBottom: 10 },
    settingsRowTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    settingsRowDesc:  { fontSize: 11.5, color: Colors.textMuted, marginTop: 1, lineHeight: 15 },
    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 11, marginTop: 6,
    },
    ctaBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    sectionDivider:    { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: 4 },
    sectionDividerSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.md },
    groupSubtitle:     { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },

    featureRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    featureRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
    featureIconBox:   { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
    featureTextCol:   { flex: 1 },
    featureLabel:     { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    featureDesc:      { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

    weekRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    weekNum:     { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    weekNumText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    weekText:    { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
});
