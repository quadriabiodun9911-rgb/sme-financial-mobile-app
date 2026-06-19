import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
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

function Navigator() {
    const { currentScreen, isLoading } = useApp();

    useEffect(() => {
        if (!isLoading && currentScreen !== 'login') {
            trackScreenViewed(currentScreen);
        }
    }, [currentScreen, isLoading]);

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
        </View>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <AppProvider>
                <ErrorBoundary>
                    <Navigator />
                </ErrorBoundary>
            </AppProvider>
        </ErrorBoundary>
    );
}
