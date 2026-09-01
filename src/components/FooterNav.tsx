import React, { useState, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Modal, ScrollView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon, { IconName } from './ui/Icon';
import { Screen } from '../types';
import { isScreenAllowedForRole } from '../utils/rolePermissions';

// ─── Icon accent colours per section ────────────────────────────────────────
// A closed loop, not a flat list: Understand where you stand -> Anticipate
// what's coming -> Decide what to do -> Act & see Results -> which feeds
// back into Understand (a completed tactic's before/after health score is
// the next thing you'd check on the Scoreboard). Fund sits outside the
// loop deliberately -- raising capital isn't a stage everyone passes
// through each cycle, it's an on-demand tool you reach for when the loop
// says you need it. Every Screen id below is unchanged, so no route, deep
// link, or existing screen is touched by this reorg -- only grouping,
// order, and the copy that explains the order.
//
// Assets and Loans moved here from Fund. Both are record-keeping screens a
// business owner needs regardless of whether they're currently raising
// capital -- what you own and its condition (Assets), what you owe and
// its repayment status (Loans) -- exactly the same role Inventory already
// plays here, and exactly the same role Invoices plays as a persistent
// bottom tab. All four ALSO feed the lending math on Credit-Worthiness
// behind the scenes (asset book value + inventory value = the Collateral
// pillar of the Five C's; loan history drives the DSCR/Capacity pillar;
// unpaid invoices are counted as a receivable asset in the leverage
// ratios) -- but that's Credit reading their data, not a reason to file
// the data-entry screens themselves under a capital-raising label. Fund
// now holds only the two screens whose entire job IS assessing or
// pursuing capital: Credit-Worthiness (reads Assets/Loans/Inventory to
// show what a lender would see) and the Financing Marketplace.
//
// Within each stage, item ORDER encodes the sequence a business owner
// would actually work through, not alphabetical or arbitrary placement:
//  - Understand: overall score first; then cash (the most liquid, most
//    urgent resource); then the things you hold -- stock (Inventory) and
//    equipment/property (Assets); then what you owe against them (Loans);
//    then your biggest recurring fixed cost (Payroll); and last a hygiene
//    check (Reconciliation) that verifies the numbers behind everything
//    above are actually correct -- worth doing once you know what you're
//    checking, not before.
//  - Anticipate: you can't usefully forecast or plan growth without
//    first knowing what could go wrong (risk), so risk leads; forecast
//    (what's likely) comes next; growth (what's possible) last, since
//    it builds on both.
//  - Decide: Insights surfaces what actually needs a decision; Advisor
//    is the fastest way to ask about it; Analysis & Decisions is where
//    you dig into why and model what-if scenarios; Before You Decide
//    pressure-tests one specific real decision against your numbers;
//    Goals sets the target that decision is aimed at; Budget turns that
//    target into a spending plan.
//  - Act & Results: one screen, two halves in a fixed order -- Action
//    Tracker shows what's worked before (Results) above the tactics you
//    can start or advance (Act), then links back to the Scoreboard so
//    a measured outcome closes the loop into Understand.
const UNDERSTAND_ITEMS: { label: string; icon: IconName; screen: Screen; color: string; desc: string }[] = [
    { label: 'Scoreboard',     icon: 'activity',      screen: 'scoreboard',     color: '#22d3ee', desc: 'Financial health at a glance' },
    { label: 'Cash Flow',      icon: 'droplet',       screen: 'cashflow',       color: '#3b82f6', desc: 'Runway & receivables risk' },
    { label: 'Inventory',      icon: 'package',       screen: 'inventory',      color: '#f59e0b', desc: 'Stock levels & margins' },
    { label: 'Assets',         icon: 'briefcase',     screen: 'assets',         color: '#0ea5e9', desc: 'What you own & what it\'s worth' },
    { label: 'Loans',          icon: 'percent',       screen: 'loans',          color: '#f97316', desc: 'What you owe & repayment status' },
    { label: 'Payroll',        icon: 'users',         screen: 'payroll',        color: '#10b981', desc: 'Staff & monthly pay runs' },
    { label: 'Reconciliation', icon: 'link-2',        screen: 'reconciliation', color: '#8b5cf6', desc: 'Confirm the numbers above match your bank' },
];

const ANTICIPATE_ITEMS: { label: string; icon: IconName; screen: Screen; color: string }[] = [
    { label: 'Risk',     icon: 'radio',          screen: 'risk-management', color: '#ef4444' },
    { label: 'Forecast', icon: 'compass',         screen: 'future-statements', color: '#a855f7' },
    { label: 'Growth',   icon: 'trending-up',     screen: 'growth',   color: '#10b981' },
];

const DECIDE_ITEMS: { label: string; icon: IconName; screen: Screen; color: string; desc: string; params?: { tab: string } }[] = [
    { label: 'Insights', icon: 'zap',             screen: 'insights', color: '#f59e0b', desc: 'What actually needs a decision right now' },
    // Advisor's own screen defaults to its 'pulse' tab when opened with no
    // params (a health-overview digest, not the Q&A) -- landing there would
    // contradict this item's own promise of "ask about it." Deep-link
    // straight to the Q&A tab so tapping Advisor does what it says.
    { label: 'Advisor',  icon: 'message-circle',  screen: 'cfo',      color: '#8b5cf6', desc: 'Ask about it — AI diagnosis, plain answers', params: { tab: 'questions' } },
    { label: 'Analysis & Decisions', icon: 'pie-chart', screen: 'analysis', color: '#14b8a6', desc: 'Why is this happening, and what if I...' },
    { label: 'Before You Decide', icon: 'help-circle', screen: 'before-you-decide', color: '#06b6d4', desc: 'Pressure-test a hire, purchase, discount, or loan' },
    { label: 'Goals',    icon: 'target',          screen: 'goals',    color: '#ef4444', desc: 'Set the target this decision is aimed at' },
    { label: 'Budget',   icon: 'dollar-sign',     screen: 'budget',   color: '#10b981', desc: 'Put a spending plan behind that target' },
];

const IMPROVE_ITEMS: { label: string; icon: IconName; screen: Screen; color: string; desc: string }[] = [
    { label: 'Action Tracker', icon: 'check-circle', screen: 'action-tracker', color: '#ef4444', desc: 'Act on it, then see if it worked' },
];

const FUND_ITEMS: { label: string; icon: IconName; screen: Screen; color: string }[] = [
    { label: 'Credit',      icon: 'credit-card',  screen: 'credit-worthiness', color: '#eab308' },
    { label: 'Financing',   icon: 'search',       screen: 'financing-marketplace', color: '#14b8a6' },
];

const ACCOUNT_ITEMS: { label: string; icon: IconName; screen: Screen; color: string; desc: string }[] = [
    { label: 'Settings', icon: 'settings', screen: 'settings', color: '#94a3b8', desc: 'Business, team & account' },
    { label: 'Export Data', icon: 'download', screen: 'settings', color: '#10b981', desc: 'Download reports & backups' },
];

// ─── Footer tabs ─────────────────────────────────────────────────────────────
const TABS: { label: string; screen: Screen; icon: IconName }[] = [
    { label: 'Home',      screen: 'dashboard',        icon: 'home' },
    { label: 'Passport',  screen: 'business-passport', icon: 'shield' },
    { label: 'Transactions', screen: 'transactions',   icon: 'list' },
    { label: 'Invoices',  screen: 'invoices',          icon: 'file-text' },
    { label: 'Reports',   screen: 'reports',           icon: 'bar-chart-2' },
];

export default function FooterNav() {
    const { currentScreen, setCurrentScreen, navigate, user, pendingSyncCount, transactions, goals, invoices, finance, userRole, canViewFinancials } = useApp();
    const [moreOpen, setMoreOpen] = useState(false);
    // Modal renders via a portal on web (react-native-web), completely
    // outside App.tsx's centeredAppColumn wrapper -- so unlike every
    // regular screen, this sheet was stretching full-bleed on desktop
    // instead of matching the rest of the app's width. Same threshold/
    // condition as App.tsx's own constrainWidth, applied locally since the
    // portal can't inherit it.
    const { width: windowWidth } = useWindowDimensions();
    const constrainMoreWidth = Platform.OS === 'web' && windowWidth >= 720;

    // Feature flags
    const enableReports = process.env.EXPO_PUBLIC_ENABLE_REPORTS !== 'false';
    const enableTeam = process.env.EXPO_PUBLIC_ENABLE_TEAM !== 'false';
    const enableFinancing = process.env.EXPO_PUBLIC_ENABLE_FINANCING !== 'false';

    const goTo = (screen: Screen, params?: { tab: string }) => {
        if (params) navigate(screen, params);
        else setCurrentScreen(screen);
        setMoreOpen(false);
    };

    const initials = useMemo(() =>
        (user?.businessName || 'Q')
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
        [user?.businessName]
    );

    const maskedEmail = user?.email
        ? user.email.replace(/(.{2}).+(@.+)/, '$1•••$2')
        : '';

    // Quick stats — memoized to avoid recomputing on every render
    const totalTx     = transactions.length;
    const activeGoals = useMemo(() => goals.filter(g => g.status !== 'achieved').length, [goals]);
    const unpaidInv   = useMemo(() => invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length, [invoices]);
    const profit      = finance?.profit ?? 0;

    // Filter tabs and menu items based on feature flags AND role — a staff
    // account only sees screens rolePermissions.ts allows it to open, so
    // the nav itself doesn't advertise destinations it'll immediately
    // bounce them out of via RestrictedAccessScreen.
    const visibleTabs = useMemo(() =>
        TABS.filter(tab => {
            if (tab.screen === 'reports' && !enableReports) return false;
            return isScreenAllowedForRole(tab.screen, userRole);
        }),
        [enableReports, userRole]
    );

    const visibleUnderstand = useMemo(() => UNDERSTAND_ITEMS.filter(i => isScreenAllowedForRole(i.screen, userRole)), [userRole]);
    const visibleAnticipate = useMemo(() => ANTICIPATE_ITEMS.filter(i => isScreenAllowedForRole(i.screen, userRole)), [userRole]);
    const visibleDecide = useMemo(() => DECIDE_ITEMS.filter(i => isScreenAllowedForRole(i.screen, userRole)), [userRole]);
    const visibleImprove = useMemo(() => IMPROVE_ITEMS.filter(i => isScreenAllowedForRole(i.screen, userRole)), [userRole]);
    const visibleFund = useMemo(() => FUND_ITEMS.filter(i => isScreenAllowedForRole(i.screen, userRole)), [userRole]);

    const visibleAccount = useMemo(() =>
        ACCOUNT_ITEMS.filter(item => isScreenAllowedForRole(item.screen, userRole)),
        [userRole]
    );

    return (
        <>
            {/* ── Bottom tab bar ─────────────────────────────────────────── */}
            <View style={styles.footer}>
                {visibleTabs.map(tab => {
                    const active = currentScreen === tab.screen;
                    return (
                        <TouchableOpacity
                            key={tab.screen}
                            style={styles.tabItem}
                            onPress={() => setCurrentScreen(tab.screen)}
                            activeOpacity={0.7}
                        >
                            <Icon name={tab.icon} size={18} color={active ? Colors.primary : Colors.textMuted} />
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                            {active && <View style={styles.tabIndicator} />}
                        </TouchableOpacity>
                    );
                })}

                {/* More tab */}
                <TouchableOpacity
                    style={styles.tabItem}
                    onPress={() => setMoreOpen(true)}
                    activeOpacity={0.7}
                >
                    <Icon name="more-horizontal" size={18} color={moreOpen ? Colors.primary : Colors.textMuted} />
                    <Text style={[styles.tabLabel, moreOpen && styles.tabLabelActive]}>More</Text>
                    {moreOpen && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
            </View>

            {/* ── Me full-screen modal ────────────────────────────────────── */}
            <Modal
                visible={moreOpen}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={() => setMoreOpen(false)}
            >
                <SafeAreaView style={styles.page}>
                    <StatusBar style="light" backgroundColor={Colors.bg} />

                    <View style={[{ flex: 1, width: '100%' }, constrainMoreWidth && styles.moreConstrainedColumn]}>

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>More</Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setMoreOpen(false)} activeOpacity={0.7}>
                            <Icon name="x" size={15} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                        {/* ── Profile card ──────────────────────────────── */}
                        <TouchableOpacity style={styles.profileCard} onPress={() => goTo('settings')} activeOpacity={0.85}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initials}</Text>
                            </View>
                            <View style={styles.profileInfo}>
                                <Text style={styles.profileName}>{user?.businessName || 'My Business'}</Text>
                                <Text style={styles.profileEmail}>{maskedEmail}</Text>
                                <View style={styles.syncRow}>
                                    {pendingSyncCount > 0 ? (
                                        <>
                                            <View style={[styles.syncDot, { backgroundColor: Colors.warning }]} />
                                            <Text style={styles.syncTextPending}>{pendingSyncCount} change{pendingSyncCount > 1 ? 's' : ''} pending sync</Text>
                                        </>
                                    ) : (
                                        <>
                                            <View style={[styles.syncDot, { backgroundColor: Colors.success }]} />
                                            <Text style={styles.syncTextOk}>All data synced</Text>
                                        </>
                                    )}
                                </View>
                            </View>
                            <Icon name="chevron-right" size={20} color={Colors.textMuted} />
                        </TouchableOpacity>

                        {/* ── Quick stats strip ─────────────────────────── */}
                        <View style={styles.statsRow}>
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('transactions')} activeOpacity={0.8}>
                                <Text style={styles.statValue}>{totalTx}</Text>
                                <Text style={styles.statLabel}>Transactions</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('goals')} activeOpacity={0.8}>
                                <Text style={styles.statValue}>{activeGoals}</Text>
                                <Text style={styles.statLabel}>Active Goals</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('invoices')} activeOpacity={0.8}>
                                <Text style={styles.statValue}>{unpaidInv}</Text>
                                <Text style={styles.statLabel}>Unpaid Inv.</Text>
                            </TouchableOpacity>
                            {canViewFinancials && (
                            <>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('dashboard')} activeOpacity={0.8}>
                                <Text style={[styles.statValue, { color: profit >= 0 ? Colors.income : Colors.expense }]}>
                                    {profit >= 0 ? '+' : ''}{Math.abs(profit) >= 1000 ? `${(profit / 1000).toFixed(0)}k` : profit.toFixed(0)}
                                </Text>
                                <Text style={styles.statLabel}>Profit</Text>
                            </TouchableOpacity>
                            </>
                            )}
                        </View>

                        {/* ── Understand ────────────────────────────────── */}
                        <Text style={styles.sectionHeader}>Understand</Text>
                        <Text style={styles.sectionSubtitle}>Where does my business stand?</Text>
                        <Text style={styles.flowHint}>Start with your score, then cash, stock and equipment, then what you owe and pay out — finish by confirming the numbers match your bank.</Text>
                        <View style={styles.listCard}>
                            {visibleUnderstand.map((item, i, arr) => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[styles.listRow, i < arr.length - 1 && styles.listRowBorder]}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.listIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Icon name={item.icon} size={16} color={item.color} />
                                    </View>
                                    <View style={styles.listTextCol}>
                                        <Text style={styles.listLabel}>{item.label}</Text>
                                        <Text style={styles.listDesc}>{item.desc}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Anticipate ────────────────────────────────── */}
                        <Text style={styles.sectionHeader}>Anticipate</Text>
                        <Text style={styles.sectionSubtitle}>What is likely to happen?</Text>
                        <Text style={styles.flowHint}>Know your risks first, then what's likely ahead, then where you could grow.</Text>
                        <View style={styles.gridCard}>
                            {visibleAnticipate.map(item => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={styles.gridItem}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.gridIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Icon name={item.icon} size={19} color={item.color} />
                                    </View>
                                    <Text style={styles.gridLabel}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Decide ────────────────────────────────────── */}
                        <Text style={styles.sectionHeader}>Decide</Text>
                        <Text style={styles.sectionSubtitle}>What should I do?</Text>
                        <Text style={styles.flowHint}>See what's flagged, ask about it, dig into why, test the decision — then set a target and budget for it.</Text>
                        <View style={styles.listCard}>
                            {visibleDecide.map((item, i, arr) => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[styles.listRow, i < arr.length - 1 && styles.listRowBorder]}
                                    onPress={() => goTo(item.screen, item.params)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.listIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Icon name={item.icon} size={16} color={item.color} />
                                    </View>
                                    <View style={styles.listTextCol}>
                                        <Text style={styles.listLabel}>{item.label}</Text>
                                        <Text style={styles.listDesc}>{item.desc}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Act & Results ─────────────────────────────── */}
                        <Text style={styles.sectionHeader}>Act & Results</Text>
                        <Text style={styles.sectionSubtitle}>Did I act on it? Did it work?</Text>
                        <Text style={styles.flowHint}>Track what you do, then see if it moved your score — closing the loop back to Understand.</Text>
                        <View style={styles.listCard}>
                            {visibleImprove.map((item, i, arr) => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[styles.listRow, i < arr.length - 1 && styles.listRowBorder]}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.listIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Icon name={item.icon} size={16} color={item.color} />
                                    </View>
                                    <View style={styles.listTextCol}>
                                        <Text style={styles.listLabel}>{item.label}</Text>
                                        <Text style={styles.listDesc}>{item.desc}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Fund ──────────────────────────────────────── */}
                        <Text style={styles.sectionHeader}>Fund</Text>
                        <Text style={styles.sectionSubtitle}>Am I ready for capital?</Text>
                        <Text style={styles.flowHint}>Not a stage in the loop — reads your Assets, Loans and Inventory to show what a lender would see, and where to look for capital.</Text>
                        <View style={styles.gridCard}>
                            {visibleFund.map(item => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={styles.gridItem}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.gridIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Icon name={item.icon} size={19} color={item.color} />
                                    </View>
                                    <Text style={styles.gridLabel}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Account ───────────────────────────────────── */}
                        <Text style={styles.sectionHeader}>Account</Text>
                        <View style={styles.listCard}>
                            {visibleAccount.map((item, i, arr) => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[styles.listRow, i < arr.length - 1 && styles.listRowBorder]}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.listIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Icon name={item.icon} size={16} color={item.color} />
                                    </View>
                                    <View style={styles.listTextCol}>
                                        <Text style={styles.listLabel}>{item.label}</Text>
                                        <Text style={styles.listDesc}>{item.desc}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── App version ───────────────────────────────── */}
                        <Text style={styles.versionText}>Quad360 · v1.0.0</Text>

                    </ScrollView>
                    </View>
                </SafeAreaView>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    // ── Footer tab bar ──────────────────────────────────────────────────────
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: Spacing.sm,
        paddingBottom: Spacing.md,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    tabItem:        { alignItems: 'center', flex: 1, paddingTop: 4, gap: 3 },
    tabLabel:       { color: Colors.textMuted, fontSize: 10, fontWeight: '500' },
    tabLabelActive: { color: Colors.primary, fontWeight: '700' },
    tabIndicator:   { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 2 },


    // ── Me page ─────────────────────────────────────────────────────────────
    page:   { flex: 1, backgroundColor: Colors.bg },
    // Matches App.tsx's centeredAppColumn (1040, not the original 720) --
    // see the comment where this is applied for why it's needed here too.
    moreConstrainedColumn: { maxWidth: 1040, alignSelf: 'center' },
    scroll: { paddingBottom: 40 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTitle:  { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
    closeBtn:     { width: 32, height: 32, borderRadius: Radius.pill, backgroundColor: Colors.surfaceVariant, alignItems: 'center', justifyContent: 'center' },

    // Profile card
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xl,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        gap: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    avatar:      { width: 54, height: 54, borderRadius: Radius.pill, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
    avatarText:  { color: '#fff', fontSize: 20, fontWeight: '800' },
    profileInfo: { flex: 1 },
    profileName:  { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    profileEmail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    syncRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
    syncDot:      { width: 7, height: 7, borderRadius: 4 },
    syncTextOk:   { fontSize: 11, color: Colors.success, fontWeight: '600' },
    syncTextPending: { fontSize: 11, color: Colors.warning, fontWeight: '600' },

    // Quick stats
    statsRow: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.md,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        ...Shadow.sm,
    },
    statBox:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
    statValue:   { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
    statLabel:   { fontSize: 10, color: Colors.textMuted, marginTop: 3, fontWeight: '500' },
    statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },

    sectionHeader: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 2,
        marginTop: Spacing.xl,
        marginLeft: Spacing.xl,
    },
    sectionSubtitle: {
        fontSize: 11.5,
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
        marginLeft: Spacing.xl,
    },
    flowHint: {
        fontSize: 10.5,
        color: Colors.textMuted,
        fontStyle: 'italic',
        marginTop: -Spacing.xs,
        marginBottom: Spacing.sm,
        marginLeft: Spacing.xl,
        marginRight: Spacing.xl,
        lineHeight: 14,
    },

    // Icon grid
    gridCard: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        marginHorizontal: Spacing.lg,
        borderRadius: Radius.lg,
        paddingVertical: Spacing.xl,
        borderWidth: 1,
        borderColor: Colors.border,
        justifyContent: 'space-around',
        ...Shadow.sm,
    },
    gridItem:    { alignItems: 'center', flex: 1 },
    gridIconBox: { width: 48, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
    gridLabel:   { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', textAlign: 'center' },

    // List card
    listCard:      { backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
    listRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg, gap: Spacing.md },
    listRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
    listIconBox:   { width: 38, height: 38, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center' },
    listTextCol:   { flex: 1 },
    listLabel:     { fontSize: 15, color: Colors.textPrimary, fontWeight: '700' },
    listDesc:      { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    // Footer
    versionText: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: Spacing.xxxl },
});
