import React, { useEffect } from 'react';
import { View, ActivityIndicator, Platform, BackHandler, Alert } from 'react-native';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider, SettingsProvider, FinanceProvider, GoalProvider, InvoiceProvider, useAuth } from './src/contexts/OptimizedContexts';
import { trackScreenViewed } from './src/utils/analytics';
import { initSentry, setSentryUser } from './src/utils/sentry';
import ErrorBoundary from './src/components/ErrorBoundary';
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
import TwoFactorSetupScreen from './src/screens/TwoFactorSetupScreen';
import TwoFactorVerifyScreen from './src/screens/TwoFactorVerifyScreen';
import PaymentLinkScreen from './src/screens/PaymentLinkScreen';
import ImportTransactionsScreen from './src/screens/ImportTransactionsScreen';
import CashFlowScreen from './src/screens/CashFlowScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import ReconciliationScreen from './src/screens/ReconciliationScreen';
import TaxPlanningScreen from './src/screens/TaxPlanningScreen';
import CreditWorthinessScreen from './src/screens/CreditWorthinessScreen';
import LoanEligibilityScreen from './src/screens/LoanEligibilityScreen';
import FundingQualificationScreen from './src/screens/FundingQualificationScreen';
import FinancialAssessmentScreen from './src/screens/FinancialAssessmentScreen';
import ActionTrackerScreen from './src/screens/ActionTrackerScreen';
import GoalBridgeScreen from './src/screens/GoalBridgeScreen';
import OnboardingChoiceScreen from './src/screens/OnboardingChoiceScreen';
import ClarityScreen from './src/screens/ClarityScreen';
import TrendsScreen from './src/screens/TrendsScreen';
import WeeklyDashboardScreen from './src/screens/WeeklyDashboardScreen';
import TaxFilingReadinessScreen from './src/screens/TaxFilingReadinessScreen';
import RestrictedAccessScreen from './src/screens/RestrictedAccessScreen';
import { isScreenAllowedForRole } from './src/utils/rolePermissions';
import { UserRole, Screen } from './src/types';

function NavigatorContent() {
    const { user, isLoading, currentScreen, setCurrentScreen, goBack } = useAuth();
    const userRole = (user?.role === 'Accountant' ? 'accountant' : user?.role === 'Staff' ? 'staff' : 'owner') as UserRole;

    useEffect(() => {
        if (!isLoading && currentScreen !== 'login') {
            trackScreenViewed(currentScreen);
        }
    }, [currentScreen, isLoading]);

    useEffect(() => {
        setSentryUser(user?.email ?? null);
    }, [user?.email]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (currentScreen === 'dashboard' || currentScreen === 'login') {
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

    return (
        <View style={{ flex: 1 }}>
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
            {currentScreen === '2fa'          && <TwoFactorSetupScreen />}
            {currentScreen === 'two-factor-verify' && <TwoFactorVerifyScreen />}
            {currentScreen === 'payment-link' && <PaymentLinkScreen />}
            {currentScreen === 'import-transactions'  && <ImportTransactionsScreen />}
            {currentScreen === 'cashflow'       && <CashFlowScreen />}
            {currentScreen === 'payroll'        && <PayrollScreen />}
            {currentScreen === 'reconciliation' && <ReconciliationScreen />}
            {currentScreen === 'tax-planning'   && <TaxPlanningScreen />}
            {currentScreen === 'credit-worthiness' && <CreditWorthinessScreen />}
            {currentScreen === 'loan-eligibility'  && <LoanEligibilityScreen />}
            {currentScreen === 'funding-qualification' && <FundingQualificationScreen />}
            {currentScreen === 'financial-assessment' && <FinancialAssessmentScreen />}
            {currentScreen === 'action-tracker' && <ActionTrackerScreen />}
            {currentScreen === 'goal-bridge' && <GoalBridgeScreen />}
            {currentScreen === 'onboarding-choice' && <OnboardingChoiceScreen />}
            {currentScreen === 'clarity'            && <ClarityScreen />}
            {currentScreen === 'trends'              && <TrendsScreen />}
            {currentScreen === 'weekly-dashboard'    && <WeeklyDashboardScreen />}
            {currentScreen === 'tax-filing-readiness' && <TaxFilingReadinessScreen />}
        </View>
    );
}

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
