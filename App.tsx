import React, { useEffect } from 'react';
import { View, ActivityIndicator, Platform, BackHandler, Alert, useWindowDimensions, StyleSheet } from 'react-native';
import { Colors } from './src/theme/colors';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider, SettingsProvider, FinanceProvider, GoalProvider, InvoiceProvider, useAuth } from './src/contexts/OptimizedContexts';
import { trackScreenViewed, trackAppOpened } from './src/utils/analytics';
import { initSentry, setSentryUser } from './src/utils/sentry';
import ErrorBoundary from './src/components/ErrorBoundary';
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
import ImportTransactionsScreen from './src/screens/ImportTransactionsScreen';
import CashFlowScreen from './src/screens/CashFlowScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import ReconciliationScreen from './src/screens/ReconciliationScreen';
import CreditWorthinessScreen from './src/screens/CreditWorthinessScreen';
import FinancialHealthScreen from './src/screens/FinancialHealthScreen';
import BusinessPassportScreen from './src/screens/BusinessPassportScreen';
import ScoreboardScreen from './src/screens/ScoreboardScreen';
import MacroAssumptionsScreen from './src/screens/MacroAssumptionsScreen';
import FutureEventsScreen from './src/screens/FutureEventsScreen';
import FinancialAssessmentScreen from './src/screens/FinancialAssessmentScreen';
import ActionTrackerScreen from './src/screens/ActionTrackerScreen';
import FinancingMarketplaceScreen from './src/screens/FinancingMarketplaceScreen';
import FinancingAdminScreen from './src/screens/FinancingAdminScreen';
import OnboardingChoiceScreen from './src/screens/OnboardingChoiceScreen';
import DataIntegrityScreen from './src/screens/DataIntegrityScreen';
import LenderPipelineScreen from './src/screens/LenderPipelineScreen';
import RestrictedAccessScreen from './src/screens/RestrictedAccessScreen';
import { isScreenAllowedForRole } from './src/utils/rolePermissions';
import { UserRole, Screen } from './src/types';

function NavigatorContent() {
    const { user, isLoading, currentScreen, navParams, setCurrentScreen, goBack, isLenderSession } = useAuth();
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
    if (!isScreenAllowedForRole(currentScreen as Screen, userRole)) {
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
    const constrainWidth = Platform.OS === 'web' && windowWidth >= 720 && !UNCONSTRAINED_SCREENS.has(currentScreen as Screen);

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
            {currentScreen === 'import-transactions'  && <ImportTransactionsScreen />}
            {currentScreen === 'cashflow'       && <CashFlowScreen />}
            {currentScreen === 'payroll'        && <PayrollScreen />}
            {currentScreen === 'reconciliation' && <ReconciliationScreen />}
            {currentScreen === 'credit-worthiness' && <CreditWorthinessScreen />}
            {currentScreen === 'financial-health' && <FinancialHealthScreen />}
            {currentScreen === 'business-passport' && <BusinessPassportScreen />}
            {currentScreen === 'scoreboard'    && <ScoreboardScreen />}
            {currentScreen === 'macro-assumptions' && <MacroAssumptionsScreen />}
            {currentScreen === 'future-events' && <FutureEventsScreen />}
            {currentScreen === 'financial-assessment' && <FinancialAssessmentScreen />}
            {currentScreen === 'action-tracker' && <ActionTrackerScreen />}
            {currentScreen === 'financing-marketplace' && <FinancingMarketplaceScreen />}
            {currentScreen === 'financing-admin' && <FinancingAdminScreen />}
            {currentScreen === 'onboarding-choice' && <OnboardingChoiceScreen />}
            {currentScreen === 'data-integrity' && <DataIntegrityScreen />}
        </View>
    );
}

const styles = StyleSheet.create({
    // Centers the mobile-first app screens into a readable column on wide
    // desktop viewports instead of letting single-column rows/cards stretch
    // edge-to-edge. backgroundColor matches Colors.bg so the flanking space
    // reads as intentional letterboxing, not an unstyled void, and stays
    // correct across both the dark and warm-paper themes.
    centeredAppColumn: {
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        backgroundColor: Colors.bg,
        // Screens have their own position:'absolute' FABs/pills anchored
        // with `right`/`bottom` offsets (e.g. Dashboard's quick-add button).
        // Without this, absolute descendants skip past this narrower column
        // and anchor to the full browser viewport instead, poking out past
        // the column's actual right edge on any viewport wider than 720px.
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
