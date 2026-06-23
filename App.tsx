import React, { useEffect } from 'react';
import { View, ActivityIndicator, Platform, BackHandler, Alert } from 'react-native';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/contexts/AppContext';
import { trackScreenViewed } from './src/utils/analytics';
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
import PaymentLinkScreen from './src/screens/PaymentLinkScreen';
import ConnectBankScreen from './src/screens/ConnectBankScreen';
import FinancialHealthScreen from './src/screens/FinancialHealthScreen';
import BankAggregatorScreen from './src/screens/BankAggregatorScreen';
import ImportTransactionsScreen from './src/screens/ImportTransactionsScreen';
import CashFlowScreen from './src/screens/CashFlowScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import ReconciliationScreen from './src/screens/ReconciliationScreen';

function Navigator() {
    const { currentScreen, isLoading, setCurrentScreen } = useApp();

    useEffect(() => {
        if (!isLoading && currentScreen !== 'login') {
            trackScreenViewed(currentScreen);
        }
    }, [currentScreen, isLoading]);

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
            setCurrentScreen('dashboard');
            return true;
        });
        return () => handler.remove();
    }, [currentScreen, setCurrentScreen]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
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
            {currentScreen === 'payment-link' && <PaymentLinkScreen />}
            {currentScreen === 'connect-bank'     && <ConnectBankScreen />}
            {currentScreen === 'financial-health' && <FinancialHealthScreen />}
            {currentScreen === 'bank-aggregator'       && <BankAggregatorScreen />}
            {currentScreen === 'import-transactions'  && <ImportTransactionsScreen />}
            {currentScreen === 'cashflow'       && <CashFlowScreen />}
            {currentScreen === 'payroll'        && <PayrollScreen />}
            {currentScreen === 'reconciliation' && <ReconciliationScreen />}
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

export default function App() {
    return (
        <SafeAreaProvider>
            <ErrorBoundary>
                <AppProvider>
                    <OtaUpdater />
                    <ErrorBoundary>
                        <Navigator />
                    </ErrorBoundary>
                </AppProvider>
            </ErrorBoundary>
        </SafeAreaProvider>
    );
}
