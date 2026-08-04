import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { colors } from './src/theme/colors';
import BottomNav from './src/components/BottomNav';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TransactionsScreen from './src/screens/TransactionsScreen';
import CreditScoreScreen from './src/screens/CreditScoreScreen';
import LenderPortalScreen from './src/screens/LenderPortalScreen';
import ProjectAccountsScreen from './src/screens/ProjectAccountsScreen';

const AUTHENTICATED_SCREENS = ['dashboard', 'transactions', 'creditScore', 'lenderPortal', 'projectAccounts'];

function Root() {
    const { isAuthenticated, currentScreen, setCurrentScreen } = useApp();

    if (!isAuthenticated) {
        return currentScreen === 'login' ? <LoginScreen /> : <OnboardingScreen />;
    }

    return (
        <View style={styles.authedContainer}>
            <View style={styles.screenArea}>
                {currentScreen === 'dashboard' && <DashboardScreen />}
                {currentScreen === 'transactions' && <TransactionsScreen />}
                {currentScreen === 'creditScore' && <CreditScoreScreen />}
                {currentScreen === 'lenderPortal' && <LenderPortalScreen />}
                {currentScreen === 'projectAccounts' && <ProjectAccountsScreen />}
            </View>
            {AUTHENTICATED_SCREENS.includes(currentScreen) && (
                <BottomNav current={currentScreen} onSelect={setCurrentScreen} />
            )}
        </View>
    );
}

export default function App() {
    return (
        <SafeAreaProvider>
            <AppProvider>
                <View style={styles.container}>
                    <StatusBar style="light" />
                    <Root />
                </View>
            </AppProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    authedContainer: { flex: 1 },
    screenArea: { flex: 1 },
});
