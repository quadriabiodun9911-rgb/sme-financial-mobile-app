import React, { useEffect } from 'react';
import { View, ActivityIndicator, Platform, BackHandler, Alert, useWindowDimensions, StyleSheet } from 'react-native';
import { Colors } from './src/theme/colors';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider, SettingsProvider, FinanceProvider, GoalProvider, InvoiceProvider, useAuth, useAppReady } from './src/contexts/OptimizedContexts';
import { trackScreenViewed, trackAppOpened } from './src/utils/analytics';
import { initSentry, setSentryUser } from './src/utils/sentry';
import ErrorBoundary from './src/components/ErrorBoundary';
import AlertHost from './src/components/AlertHost';
import LandingScreen from './src/screens/LandingScreen';
import ContactScreen from './src/screens/ContactScreen';
import BlogScreen from './src/screens/BlogScreen';
import BlogPostScreen from './src/screens/BlogPostScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import TransactionsScreen from './src/screens/TransactionsScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import InvoicesScreen from './src/screens/InvoicesScreen';
import AssetsScreen from './src/screens/AssetsScreen';
import LoansScreen from './src/screens/LoansScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import GrowthIntelligenceScreen from './src/screens/GrowthIntelligenceScreen';
import CFOScreen from './src/screens/CFOScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import FutureFinancialStatementsScreen from './src/screens/FutureFinancialStatementsScreen';
import TwoFactorSetupScreen from './src/screens/TwoFactorSetupScreen';
import TwoFactorVerifyScreen from './src/screens/TwoFactorVerifyScreen';
import PaymentLinkScreen from './src/screens/PaymentLinkScreen';
import PaymentCompleteScreen from './src/screens/PaymentCompleteScreen';
import ImportTransactionsScreen from './src/screens/ImportTransactionsScreen';
import CashFlowScreen from './src/screens/CashFlowScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import ReconciliationScreen from './src/screens/ReconciliationScreen';
import CreditWorthinessScreen from './src/screens/CreditWorthinessScreen';
import FinancialHealthScreen from './src/screens/FinancialHealthScreen';
import BusinessPassportScreen from './src/screens/BusinessPassportScreen';
import ScoreboardScreen from './src/screens/ScoreboardScreen';
import RiskManagementScreen from './src/screens/RiskManagementScreen';
import MacroAssumptionsScreen from './src/screens/MacroAssumptionsScreen';
import MacroShieldDetailScreen from './src/screens/MacroShieldDetailScreen';
import FutureEventsScreen from './src/screens/FutureEventsScreen';
import FinancialAssessmentScreen from './src/screens/FinancialAssessmentScreen';
import ActionTrackerScreen from './src/screens/ActionTrackerScreen';
import FinancingMarketplaceScreen from './src/screens/FinancingMarketplaceScreen';
import FinancingAdminScreen from './src/screens/FinancingAdminScreen';
import BeforeYouDecideScreen from './src/screens/BeforeYouDecideScreen';
import OnboardingChoiceScreen from './src/screens/OnboardingChoiceScreen';
import DataIntegrityScreen from './src/screens/DataIntegrityScreen';
import AuditLogScreen from './src/screens/AuditLogScreen';
import SecurityCenterScreen from './src/screens/SecurityCenterScreen';
import BusinessTimelineScreen from './src/screens/BusinessTimelineScreen';
import DataPermissionCentreScreen from './src/screens/DataPermissionCentreScreen';
import LenderPipelineScreen from './src/screens/LenderPipelineScreen';
import RestrictedAccessScreen from './src/screens/RestrictedAccessScreen';
import { isScreenAllowedForRole } from './src/utils/rolePermissions';
import { UserRole, Screen } from './src/types';

function NavigatorContent() {
    const { user, currentScreen, navParams, setCurrentScreen, goBack, isLenderSession } = useAuth();
    // Covers the whole boot, not just the auth/session check -- see
    // useAppReady's own comment for why a screen rendering before
    // Finance/Goal/Invoice/Settings finish their own async load matters
    // (most visible right after login, when each provider reloads for the
    // newly-signed-in identity).
    const isLoading = !useAppReady();
    const userRole = (user?.role === 'Accountant' ? 'accountant' : user?.role === 'Staff' ? 'staff' : 'owner') as UserRole;
    const { width: windowWidth } = useWindowDimensions();

    // Once per cold start, not tied to any account/demo state -- this fires
    // before either is known.
    useEffect(() => {
        trackAppOpened();
    }, []);

    useEffect(() => {
        if (!isLoading && currentScreen !== 'login') {
            trackScreenViewed(currentScreen);
        }
    }, [currentScreen, isLoading]);

    // Blog is the only part of this SPA with a real, bookmarkable URL (see
    // getInitialScreenFromUrl in OptimizedContexts.tsx) — keep the address
    // bar in sync as the user moves in and out of it. Every other screen is
    // unaffected: pure in-memory state, no URL change, exactly as before.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;
        if (currentScreen === 'blog') {
            if (window.location.pathname !== '/blog') window.history.replaceState(window.history.state, '', '/blog');
        } else if (currentScreen === 'blog-post') {
            const slug = navParams?.slug;
            const path = slug ? `/blog/${slug}` : '/blog';
            if (window.location.pathname !== path) window.history.replaceState(window.history.state, '', path);
        } else if (window.location.pathname.startsWith('/blog')) {
            window.history.replaceState(window.history.state, '', '/');
        }
    }, [currentScreen, navParams]);

    useEffect(() => {
        setSentryUser(user?.email ?? null);
    }, [user?.email]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (currentScreen === 'dashboard' || currentScreen === 'login' || currentScreen === 'landing') {
                Alert.alert('Exit App', 'Are you sure you want to exit?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
                ]);
                return true;
            }
            // Step back to wherever the user actually came from, not
            // straight to the dashboard, mirroring real back-button
            // behavior instead of collapsing the whole navigation stack.
            if (!goBack()) setCurrentScreen('dashboard');
            return true;
        });
        return () => handler.remove();
    }, [currentScreen, setCurrentScreen, goBack]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    // A lender session never shares a screen (or the role-gating logic
    // below, which is entirely about SME roles) with the SME app shell —
    // checked before anything else so there's no code path where SME
    // screens or the SME role check ever apply to a lender's session.
    if (isLenderSession) {
        return (
            <View style={{ flex: 1 }}>
                <LenderPipelineScreen />
            </View>
        );
    }

    // A staff account can be invited to run day-to-day operations while the
    // owner isn't around, but shouldn't see the full financial picture
    // (P&L, cash balance, bank details, loan terms). Checked here, once,
    // rather than in each screen, so a new screen defaults to restricted
    // instead of accidentally exposed — see rolePermissions.ts.
    if (!isScreenAllowedForRole(currentScreen, userRole)) {
        return (
            <View style={{ flex: 1 }}>
                <RestrictedAccessScreen />
            </View>
        );
    }

    // Every screen here is built mobile-first (single-column lists and
    // cards sized for a ~390-430px phone). Left unconstrained on a laptop
    // or desktop browser, a single invoice card or transaction row was
    // stretching edge-to-edge across a 1440px window -- technically fine,
    // but individual rows floated in huge empty space and read as broken
    // rather than "not yet designed for desktop." Landing/Contact/Blog/
    // Login already have their own wide-screen treatments (see each
    // screen's own isWide/isWideWebSetup checks) and manage their own
    // width, so they're excluded here rather than double-constrained.
    const UNCONSTRAINED_SCREENS = new Set<Screen>(['landing', 'contact', 'blog', 'blog-post', 'privacy-policy', 'login']);
    const constrainWidth = Platform.OS === 'web' && windowWidth >= 720 && !UNCONSTRAINED_SCREENS.has(currentScreen);

    return (
        <View style={[{ flex: 1 }, constrainWidth && styles.centeredAppColumn]}>
            {currentScreen === 'landing'      && <LandingScreen />}
            {currentScreen === 'contact'      && <ContactScreen />}
            {currentScreen === 'blog'         && <BlogScreen />}
            {currentScreen === 'blog-post'    && <BlogPostScreen />}
            {currentScreen === 'privacy-policy' && <PrivacyPolicyScreen />}
            {currentScreen === 'login'        && <LoginScreen />}
            {currentScreen === 'dashboard'    && <DashboardScreen />}
            {currentScreen === 'reports'      && <ReportsScreen />}
            {currentScreen === 'transactions' && <TransactionsScreen />}
            {currentScreen === 'insights'     && <InsightsScreen />}
            {currentScreen === 'settings'     && <SettingsScreen />}
            {currentScreen === 'goals'        && <GoalsScreen />}
            {currentScreen === 'invoices'     && <InvoicesScreen />}
            {currentScreen === 'assets'       && <AssetsScreen />}
            {currentScreen === 'loans'        && <LoansScreen />}
            {currentScreen === 'inventory'    && <InventoryScreen />}
            {currentScreen === 'growth'       && <GrowthIntelligenceScreen />}
            {currentScreen === 'cfo'          && <CFOScreen />}
            {currentScreen === 'budget'       && <BudgetScreen />}
            {currentScreen === 'analysis'     && <AnalysisScreen />}
            {currentScreen === 'future-statements' && <FutureFinancialStatementsScreen />}
            {currentScreen === '2fa'          && <TwoFactorSetupScreen />}
            {currentScreen === 'two-factor-verify' && <TwoFactorVerifyScreen />}
            {currentScreen === 'payment-link' && <PaymentLinkScreen />}
            {currentScreen === 'payment-complete' && <PaymentCompleteScreen />}
            {currentScreen === 'import-transactions'  && <ImportTransactionsScreen />}
            {currentScreen === 'cashflow'       && <CashFlowScreen />}
            {currentScreen === 'payroll'        && <PayrollScreen />}
            {currentScreen === 'reconciliation' && <ReconciliationScreen />}
            {currentScreen === 'credit-worthiness' && <CreditWorthinessScreen />}
            {currentScreen === 'financial-health' && <FinancialHealthScreen />}
            {currentScreen === 'business-passport' && <BusinessPassportScreen />}
            {currentScreen === 'scoreboard'    && <ScoreboardScreen />}
            {currentScreen === 'risk-management' && <RiskManagementScreen />}
            {currentScreen === 'macro-assumptions' && <MacroAssumptionsScreen />}
            {currentScreen === 'macroshield-detail' && <MacroShieldDetailScreen />}
            {currentScreen === 'future-events' && <FutureEventsScreen />}
            {currentScreen === 'financial-assessment' && <FinancialAssessmentScreen />}
            {currentScreen === 'action-tracker' && <ActionTrackerScreen />}
            {currentScreen === 'financing-marketplace' && <FinancingMarketplaceScreen />}
            {/* No entry point anywhere in the UI -- reached only by typing
                /admin/financing directly (see getInitialScreenFromUrl in
                OptimizedContexts.tsx). FinancingAdminScreen does its own
                isFinancingAdmin(user?.email) check internally and renders a
                proper "Access Restricted" page (with Header/FooterNav/back
                button) for anyone who fails it -- gating admin access is
                its job, not this switch's. An identical check used to sit
                here too, which meant a non-admin hitting the URL directly
                saw a completely blank screen (nothing else in this list
                matched, so the whole app rendered empty) instead of that
                restricted page, since the component never got to mount and
                run its own check. Both gates called the exact same
                function on the exact same value, so removing the outer one
                changes nothing about who can reach the real admin content
                -- only what a blocked visitor sees. */}
            {currentScreen === 'financing-admin' && <FinancingAdminScreen />}
            {currentScreen === 'onboarding-choice' && <OnboardingChoiceScreen />}
            {currentScreen === 'data-integrity' && <DataIntegrityScreen />}
            {currentScreen === 'audit-log' && <AuditLogScreen />}
            {currentScreen === 'security-center' && <SecurityCenterScreen />}
            {currentScreen === 'business-timeline' && <BusinessTimelineScreen />}
            {currentScreen === 'data-permission-centre' && <DataPermissionCentreScreen />}
            {currentScreen === 'before-you-decide' && <BeforeYouDecideScreen />}
        </View>
    );
}

const styles = StyleSheet.create({
    // Centers the mobile-first app screens into a readable column on wide
    // desktop viewports instead of letting single-column rows/cards stretch
    // edge-to-edge. backgroundColor matches Colors.bg so the flanking space
    // reads as intentional letterboxing, not an unstyled void, and stays
    // correct across both the dark and warm-paper themes.
    //
    // 1040, not the original 720 -- 720 read as wasted space on a real
    // 1440px+ laptop/desktop window (reported directly: "the app width for
    // desktop and laptop is not full"). This is the quick, low-risk half of
    // that fix -- shrinks the empty margins noticeably without touching any
    // individual screen's layout. A genuine desktop-optimized (e.g.
    // multi-column) layout for the densest screens is a separate, bigger
    // follow-up, not this change.
    centeredAppColumn: {
        width: '100%',
        maxWidth: 1040,
        alignSelf: 'center',
        backgroundColor: Colors.bg,
        // Screens have their own position:'absolute' FABs/pills anchored
        // with `right`/`bottom` offsets (e.g. Dashboard's quick-add button).
        // Without this, absolute descendants skip past this narrower column
        // and anchor to the full browser viewport instead, poking out past
        // the column's actual right edge on any viewport wider than 1040px.
        position: 'relative',
    },
});

function OtaUpdater() {
    useEffect(() => {
        // OTA updates only apply to native builds, not web or Expo Go dev mode
        if (Platform.OS === 'web') return;
        (async () => {
            try {
                if (__DEV__) return; // skip in development
                const update = await Updates.checkForUpdateAsync();
                if (update.isAvailable) {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                }
            } catch {
                // silently ignore — dev mode or network unavailable
            }
        })();
    }, []);
    return null;
}

initSentry();

export default function App() {
    return (
        <SafeAreaProvider>
            <ErrorBoundary>
                <ThemeProvider>
                    <AuthProvider>
                        <SettingsProvider>
                            <FinanceProvider>
                                <GoalProvider>
                                    <InvoiceProvider>
                                        <OtaUpdater />
                                        <ErrorBoundary>
                                            <NavigatorContent />
                                        </ErrorBoundary>
                                        <AlertHost />
                                    </InvoiceProvider>
                                </GoalProvider>
                            </FinanceProvider>
                        </SettingsProvider>
                    </AuthProvider>
                </ThemeProvider>
            </ErrorBoundary>
        </SafeAreaProvider>
    );
}
// Deploy: Wed Jul 15 00:45:47 UTC 2026
