import React, { useState, useMemo } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TouchableOpacity,
    TextInput,
    SafeAreaView,
    StatusBar,
    Modal,
    Dimensions,
    Share
} from 'react-native';
import Svg, { Rect, Circle, Line, Path, G } from 'react-native-svg';

// Screen Types
type Screen = 'login' | 'register' | 'onboarding' | 'dashboard' | 'reports' | 'transactions' | 'insights' | 'team';
type ReportTab = 'balancesheet' | 'margins' | 'variance' | 'evm' | 'forecaster';

// Transaction Type
interface Transaction {
    id: string;
    date: string;
    description: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
}

export default function App() {
    // Navigation & Authentication states
    const [currentScreen, setCurrentScreen] = useState<Screen>('login');
    const [user, setUser] = useState<{ email: string; businessName: string; role: string } | null>(null);
    const [credentials, setLoginCredentials] = useState({ email: '', password: '', business: 'Acme Corp' });

    // App Onboarding Settings
    const [businessType, setBusinessType] = useState('both');
    const [currency, setCurrency] = useState('$');
    const [minReserve, setMinReserve] = useState('5000');
    const [targetMargin, setTargetMargin] = useState('65');

    // Interactive Ledger State (Pre-populated with baseline actual values totaling $185k Income / $120k Expense)
    const [transactions, setTransactions] = useState<Transaction[]>([
        { id: '1', date: '2026-05-10', description: 'Enterprise Software SLA License', type: 'income', category: 'Software sales', amount: 85000 },
        { id: '2', date: '2026-05-12', description: 'Consulting Advisory Services Retainer', type: 'income', category: 'Professional consulting', amount: 55000 },
        { id: '3', date: '2026-05-15', description: 'Product Coffee & Bakery Retail POS', type: 'income', category: 'Product retail', amount: 45000 },
        { id: '4', date: '2026-05-18', description: 'Monthly Core Engineering Payroll', type: 'expense', category: 'Personnel expenses', amount: 74400 },
        { id: '5', date: '2026-05-19', description: 'Google Cloud Platform & AWS Hosting', type: 'expense', category: 'Website hosting & Cloud', amount: 4800 },
        { id: '6', date: '2026-05-20', description: 'AdWords & Q2 Strategic Marketing Campaign', type: 'expense', category: 'Marketing & Public Events', amount: 18000 },
        { id: '7', date: '2026-05-22', description: 'Downtown HQ Rental Lease Agreement', type: 'expense', category: 'Office Lease / Rental', amount: 12000 },
        { id: '8', date: '2026-05-24', description: 'Executive Travel Lodging Re-imbursement', type: 'expense', category: 'Executive Travel & Lodging', amount: 7200 },
        { id: '9', date: '2026-05-26', description: 'Advanced UI/UX Engineering Workshops', type: 'expense', category: 'Professional Training', amount: 3600 },
    ]);

    // Transaction logging modal & form controllers
    const [isTxModalOpen, setIsTxModalOpen] = useState(false);
    const [newTx, setNewTx] = useState({ description: '', amount: '', type: 'expense' as 'income' | 'expense', category: 'Personnel expenses' });

    // Report tab manager
    const [activeReportTab, setActiveReportTab] = useState<ReportTab>('balancesheet');

    // "One Thing" recommendation trigger rules
    const oneThingInsight = useMemo(() => {
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const netProfit = totalIncome - totalExpense;
        const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

        if (parseFloat(minReserve) > (145000 - totalExpense)) {
            return {
                severity: 'critical',
                title: 'Capital Reserve Threshold Breached',
                action: `Your net liquid reserves are below your configured minimum buffer of ${currency}${minReserve}. Immediate cost-reallocation advised.`,
                tag: 'LIQUIDITY WARNING'
            };
        } else if (margin < parseFloat(targetMargin)) {
            return {
                severity: 'warning',
                title: 'Margins Are Dropping Below Target',
                action: `Current profit margin is ${margin.toFixed(1)}% vs your goal of ${targetMargin}%. Review top cost categories now.`,
                tag: 'MARGIN WARNING'
            };
        }
        return {
            severity: 'healthy',
            title: 'Everything Looks Healthy Today',
            action: 'Your core metrics are stable. Optional: review your top 3 highest-cost categories for optimization opportunities.',
            tag: 'HEALTHY'
        };
    }, [transactions, minReserve, targetMargin, currency]);

    // Combined Financial Aggregations based on Live Ledger State
    const finance = useMemo(() => {
        const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const profit = income - expense;
        const margin = income > 0 ? (profit / income) * 100 : 0;
        const assets = 145000 + (profit - 65000); // Dynamic assets tracking from baseline
        const liabilities = 45000;
        const equity = assets - liabilities;

        return {
            income,
            expense,
            profit,
            margin,
            assets,
            liabilities,
            equity
        };
    }, [transactions]);

    // Log in workflow
    const handleLogin = () => {
        if (credentials.email && credentials.password) {
            setUser({ email: credentials.email, businessName: credentials.business, role: 'Administrator' });
            setCurrentScreen('onboarding');
        }
    };

    // Log new transaction to local memory ledger
    const handleAddTransaction = () => {
        if (newTx.description && newTx.amount) {
            const amt = parseFloat(newTx.amount);
            if (!isNaN(amt)) {
                const item: Transaction = {
                    id: Math.random().toString(),
                    date: new Date().toISOString().split('T')[0],
                    description: newTx.description,
                    type: newTx.type,
                    category: newTx.category,
                    amount: amt
                };
                setTransactions([item, ...transactions]);
                setNewTx({ description: '', amount: '', type: 'expense', category: 'Personnel expenses' });
                setIsTxModalOpen(false);
            }
        }
    };

    const handleShareReport = async (title: string, content: string) => {
        try {
            await Share.share({
                message: `${title}\n\n${content}`,
            });
        } catch (e) {
            console.log('Share error', e);
        }
    };

    // Render Navbar / Header
    const renderHeader = () => (
        <View style={styles.header}>
            <View>
                <Text style={styles.headerTitle}>FinanceBook</Text>
                <Text style={styles.headerSubtitle}>{user?.businessName || 'Business Suite'}</Text>
            </View>
            <View style={styles.headerRight}>
                <Text style={styles.headerUser}>{user?.email.split('@')[0] || 'Admin'}</Text>
                <TouchableOpacity style={styles.signOutBtn} onPress={() => { setUser(null); setCurrentScreen('login'); }}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Render Sidebar / Bottom Navigation tab actions
    const renderFooterNav = () => (
        <View style={styles.footerNav}>
            <TouchableOpacity
                style={[styles.navItem, currentScreen === 'dashboard' && styles.navItemActive]}
                onPress={() => setCurrentScreen('dashboard')}
            >
                <Text style={[styles.navText, currentScreen === 'dashboard' && styles.navTextActive]}>Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.navItem, currentScreen === 'reports' && styles.navItemActive]}
                onPress={() => setCurrentScreen('reports')}
            >
                <Text style={[styles.navText, currentScreen === 'reports' && styles.navTextActive]}>Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.navItem, currentScreen === 'transactions' && styles.navItemActive]}
                onPress={() => setCurrentScreen('transactions')}
            >
                <Text style={[styles.navText, currentScreen === 'transactions' && styles.navTextActive]}>Ledger</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.navItem, currentScreen === 'insights' && styles.navItemActive]}
                onPress={() => setCurrentScreen('insights')}
            >
                <Text style={[styles.navText, currentScreen === 'insights' && styles.navTextActive]}>Insights</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

            {/* ----------------- SCREEN: LOGIN ----------------- */}
            {currentScreen === 'login' && (
                <ScrollView contentContainerStyle={styles.centerScroll}>
                    <View style={styles.cardContainer}>
                        <Text style={styles.mainTitle}>FinanceBook Mobile</Text>
                        <Text style={styles.subTitle}>SME Corporate Ledger Packaging</Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Business Entity Name</Text>
                            <TextInput
                                style={styles.input}
                                value={credentials.business}
                                onChangeText={(text) => setLoginCredentials({ ...credentials, business: text })}
                                placeholder="Acme Corp"
                                placeholderTextColor="#64748b"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Corporate Email Administrator</Text>
                            <TextInput
                                style={styles.input}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={credentials.email}
                                onChangeText={(text) => setLoginCredentials({ ...credentials, email: text })}
                                placeholder="admin@acme.com"
                                placeholderTextColor="#64748b"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Security Password</Text>
                            <TextInput
                                style={styles.input}
                                secureTextEntry
                                value={credentials.password}
                                onChangeText={(text) => setLoginCredentials({ ...credentials, password: text })}
                                placeholder="••••••••"
                                placeholderTextColor="#64748b"
                            />
                        </View>

                        <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
                            <Text style={styles.btnText}>Authenticate & Proceed</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.textLink} onPress={() => setCurrentScreen('register')}>
                            <Text style={styles.linkText}>Create a new Account</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}

            {/* ----------------- SCREEN: REGISTER ----------------- */}
            {currentScreen === 'register' && (
                <ScrollView contentContainerStyle={styles.centerScroll}>
                    <View style={styles.cardContainer}>
                        <Text style={styles.mainTitle}>Create Entity Account</Text>
                        <Text style={styles.subTitle}>Establish double-entry ledger vault</Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Company/Business Name</Text>
                            <TextInput style={styles.input} placeholder="Company Ltd" placeholderTextColor="#64748b" />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Full Administrator Name</Text>
                            <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#64748b" />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Business Email</Text>
                            <TextInput style={styles.input} keyboardType="email-address" placeholder="email@company.com" placeholderTextColor="#64748b" />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Passcode Vault Secret</Text>
                            <TextInput style={styles.input} secureTextEntry placeholder="••••••••" placeholderTextColor="#64748b" />
                        </View>

                        <TouchableOpacity style={styles.primaryBtn} onPress={() => setCurrentScreen('login')}>
                            <Text style={styles.btnText}>Register New Account</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.textLink} onPress={() => setCurrentScreen('login')}>
                            <Text style={styles.linkText}>Already registered? Login</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}

            {/* ----------------- SCREEN: ONBOARDING ----------------- */}
            {currentScreen === 'onboarding' && (
                <ScrollView contentContainerStyle={styles.centerScroll}>
                    <View style={styles.cardContainer}>
                        <Text style={styles.mainTitle}>Guided Setup</Text>
                        <Text style={styles.subTitle}>Configure local benchmarking formulas</Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Industry Operating Sector</Text>
                            <View style={styles.toggleRow}>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, businessType === 'product' && styles.toggleBtnActive]}
                                    onPress={() => setBusinessType('product')}
                                >
                                    <Text style={[styles.toggleText, businessType === 'product' && styles.toggleTextActive]}>Product</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, businessType === 'service' && styles.toggleBtnActive]}
                                    onPress={() => setBusinessType('service')}
                                >
                                    <Text style={[styles.toggleText, businessType === 'service' && styles.toggleTextActive]}>Service</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, businessType === 'both' && styles.toggleBtnActive]}
                                    onPress={() => setBusinessType('both')}
                                >
                                    <Text style={[styles.toggleText, businessType === 'both' && styles.toggleTextActive]}>Hybrid</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Reporting Currency Symbol</Text>
                            <TextInput
                                style={styles.input}
                                value={currency}
                                onChangeText={setCurrency}
                                placeholder="$"
                                placeholderTextColor="#64748b"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Target Gross Margin Percent (%)</Text>
                            <TextInput
                                style={styles.input}
                                value={targetMargin}
                                onChangeText={setTargetMargin}
                                keyboardType="numeric"
                                placeholder="65"
                                placeholderTextColor="#64748b"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Minimum Liquid Cash Reserve Limit</Text>
                            <TextInput
                                style={styles.input}
                                value={minReserve}
                                onChangeText={setMinReserve}
                                keyboardType="numeric"
                                placeholder="5000"
                                placeholderTextColor="#64748b"
                            />
                        </View>

                        <TouchableOpacity style={styles.primaryBtn} onPress={() => setCurrentScreen('dashboard')}>
                            <Text style={styles.btnText}>Complete Onboarding</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}

            {/* ----------------- SCREEN: DASHBOARD ----------------- */}
            {currentScreen === 'dashboard' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}
                    <ScrollView style={styles.contentScroll}>

                        {/* Daily "One Thing" Action Feed */}
                        <View style={[
                            styles.oneThingCard,
                            oneThingInsight.severity === 'critical' ? styles.borderRed :
                                oneThingInsight.severity === 'warning' ? styles.borderYellow : styles.borderGreen
                        ]}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.oneThingTitle}>One Thing For Today</Text>
                                <View style={[
                                    styles.badge,
                                    oneThingInsight.severity === 'critical' ? styles.bgRed :
                                        oneThingInsight.severity === 'warning' ? styles.bgYellow : styles.bgGreen
                                ]}>
                                    <Text style={styles.badgeText}>{oneThingInsight.tag}</Text>
                                </View>
                            </View>
                            <Text style={styles.oneThingAction}>{oneThingInsight.title}</Text>
                            <Text style={styles.oneThingHelp}>{oneThingInsight.action}</Text>
                        </View>

                        {/* Metric 1 & 2: Scoreboard 5-Number Feed */}
                        <Text style={styles.sectionHeader}>Business Scoreboard - Actuals</Text>

                        <View style={styles.scoreboardGrid}>
                            <View style={[styles.scoreItem, styles.borderGreen]}>
                                <Text style={styles.scoreLabel}>Gross Revenue</Text>
                                <Text style={styles.scoreVal}>{currency}{finance.income.toLocaleString()}</Text>
                                <Text style={styles.scoreChange}>↑ Stable Base Actuals</Text>
                            </View>

                            <View style={[styles.scoreItem, finance.margin >= parseFloat(targetMargin) ? styles.borderGreen : styles.borderYellow]}>
                                <Text style={styles.scoreLabel}>Gross Margin</Text>
                                <Text style={styles.scoreVal}>{finance.margin.toFixed(1)}%</Text>
                                <Text style={styles.scoreChange}>Goal: {targetMargin}%</Text>
                            </View>

                            <View style={[styles.scoreItem, finance.profit > 0 ? styles.borderGreen : styles.borderRed]}>
                                <Text style={styles.scoreLabel}>Net Profit</Text>
                                <Text style={styles.scoreVal}>{currency}{finance.profit.toLocaleString()}</Text>
                                <Text style={styles.scoreChange}>{finance.profit > 0 ? '🟢 Profit-Positive' : '🔴 Capital Loss'}</Text>
                            </View>

                            <View style={[styles.scoreItem, (finance.assets - finance.liabilities) >= parseFloat(minReserve) ? styles.borderGreen : styles.borderRed]}>
                                <Text style={styles.scoreLabel}>Cash Balance</Text>
                                <Text style={styles.scoreVal}>{currency}{(145000 - finance.expense).toLocaleString()}</Text>
                                <Text style={styles.scoreChange}>Buffer target: {currency}{minReserve}</Text>
                            </View>

                            <View style={[styles.scoreItem, styles.borderGreen]}>
                                <Text style={styles.scoreLabel}>OpEx Burn Rate</Text>
                                <Text style={styles.scoreVal}>{currency}{finance.expense.toLocaleString()}/mo</Text>
                                <Text style={styles.scoreChange}>Personnel weighted</Text>
                            </View>
                        </View>

                        {/* Quick Actions */}
                        <View style={styles.actionsBlock}>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setIsTxModalOpen(true)}>
                                <Text style={styles.actionBtnText}>+ Log Receipt or Expense</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, styles.bgSlate]} onPress={() => setCurrentScreen('reports')}>
                                <Text style={styles.actionBtnText}>Open Reporting Audit Logs</Text>
                            </TouchableOpacity>
                        </View>

                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}

            {/* ----------------- SCREEN: REPORTS ----------------- */}
            {currentScreen === 'reports' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}

                    <View style={styles.reportsTabsRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <TouchableOpacity
                                style={[styles.repTab, activeReportTab === 'balancesheet' && styles.repTabActive]}
                                onPress={() => setActiveReportTab('balancesheet')}
                            >
                                <Text style={[styles.repTabText, activeReportTab === 'balancesheet' && styles.repTabActiveText]}>BS Comparer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.repTab, activeReportTab === 'margins' && styles.repTabActive]}
                                onPress={() => setActiveReportTab('margins')}
                            >
                                <Text style={[styles.repTabText, activeReportTab === 'margins' && styles.repTabActiveText]}>Margins</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.repTab, activeReportTab === 'variance' && styles.repTabActive]}
                                onPress={() => setActiveReportTab('variance')}
                            >
                                <Text style={[styles.repTabText, activeReportTab === 'variance' && styles.repTabActiveText]}>Overhead Variance</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.repTab, activeReportTab === 'evm' && styles.repTabActive]}
                                onPress={() => setActiveReportTab('evm')}
                            >
                                <Text style={[styles.repTabText, activeReportTab === 'evm' && styles.repTabActiveText]}>EVM Projects</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.repTab, activeReportTab === 'forecaster' && styles.repTabActive]}
                                onPress={() => setActiveReportTab('forecaster')}
                            >
                                <Text style={[styles.repTabText, activeReportTab === 'forecaster' && styles.repTabActiveText]}>Cash Forecaster</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>

                    <ScrollView style={styles.contentScroll}>

                        {/* TAB 1: COMPARATIVE BALANCE SHEET */}
                        {activeReportTab === 'balancesheet' && (
                            <View style={styles.reportCard}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.reportTitle}>Double-Year Balance Sheet</Text>
                                    <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Balance Sheet Comparer", "Current Assets FY-2023: $85,400 | FY-2024: $145,000 | Variance: +$59,600")}>
                                        <Text style={styles.exportMinText}>Share</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.reportCap}>Asset, credits & owner capital dual fiscal comparative analysis.</Text>

                                {/* Table Header */}
                                <View style={[styles.tableRow, styles.bgSlateDark]}>
                                    <Text style={[styles.thCell, { flex: 2 }]}>Metric Line</Text>
                                    <Text style={styles.thCell}>FY-2023</Text>
                                    <Text style={styles.thCell}>FY-2024</Text>
                                    <Text style={styles.thCell}>Variance</Text>
                                </View>

                                {/* Rows assets */}
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold' }]}>Current Assets</Text>
                                    <Text style={styles.tdCell}>$85,400</Text>
                                    <Text style={styles.tdCell}>$84,100</Text>
                                    <Text style={[styles.tdCell, styles.textRed]}>-$1,300</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold' }]}>Fixed Assets</Text>
                                    <Text style={styles.tdCell}>$42,000</Text>
                                    <Text style={styles.tdCell}>$43,500</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>+$1,500</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold' }]}>Other Assets</Text>
                                    <Text style={styles.tdCell}>$12,000</Text>
                                    <Text style={styles.tdCell}>$17,400</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>+$5,400</Text>
                                </View>
                                <View style={[styles.tableRow, styles.bgSlate]}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold', color: '#fff' }]}>Total Assets</Text>
                                    <Text style={[styles.tdCell, { color: '#fff' }]}>$139,400</Text>
                                    <Text style={[styles.tdCell, { color: '#fff' }]}>$145,000</Text>
                                    <Text style={[styles.tdCell, styles.textGreen, { fontWeight: 'bold' }]}>+$5,600</Text>
                                </View>

                                {/* Rows Liabilities */}
                                <View style={[styles.tableRow, { marginTop: 15 }]}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold' }]}>Current Liabilities</Text>
                                    <Text style={styles.tdCell}>$28,500</Text>
                                    <Text style={styles.tdCell}>$30,000</Text>
                                    <Text style={[styles.tdCell, styles.textRed]}>+$1,500</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold' }]}>Long-Term Loans</Text>
                                    <Text style={styles.tdCell}>$15,000</Text>
                                    <Text style={styles.tdCell}>$15,000</Text>
                                    <Text style={styles.tdCell}>$0</Text>
                                </View>
                                <View style={[styles.tableRow, styles.bgSlate]}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold', color: '#fff' }]}>Total Liabilities</Text>
                                    <Text style={[styles.tdCell, { color: '#fff' }]}>$43,500</Text>
                                    <Text style={[styles.tdCell, { color: '#fff' }]}>$45,000</Text>
                                    <Text style={[styles.tdCell, styles.textRed, { fontWeight: 'bold' }]}>+$1,500</Text>
                                </View>

                                {/* Owner Equity */}
                                <View style={[styles.tableRow, { marginTop: 15 }]}>
                                    <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold' }]}>Owner's Equity</Text>
                                    <Text style={styles.tdCell}>$95,900</Text>
                                    <Text style={styles.tdCell}>$100,000</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>+$4,100</Text>
                                </View>
                            </View>
                        )}

                        {/* TAB 2: MARGINS & OVERHEAD BREAKDOWN */}
                        {activeReportTab === 'margins' && (
                            <View style={styles.reportCard}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.reportTitle}>Margins & Regional Shares</Text>
                                    <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Margins Summary", "Product Coffee: 85% Margins | Latte: 73% | Pastry: 20% Status: Warning")}>
                                        <Text style={styles.exportMinText}>Share</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.reportCap}>Product-line gross profit and performance benchmarks.</Text>

                                <View style={[styles.tableRow, styles.bgSlateDark]}>
                                    <Text style={[styles.thCell, { flex: 1.5 }]}>Product</Text>
                                    <Text style={styles.thCell}>Price</Text>
                                    <Text style={styles.thCell}>Cost</Text>
                                    <Text style={styles.thCell}>Margin</Text>
                                    <Text style={styles.thCell}>Status</Text>
                                </View>

                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Drip Coffee</Text>
                                    <Text style={styles.tdCell}>$3.00</Text>
                                    <Text style={styles.tdCell}>$0.45</Text>
                                    <Text style={styles.tdCell}>85%</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>🟢 Excl</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Latte</Text>
                                    <Text style={styles.tdCell}>$4.50</Text>
                                    <Text style={styles.tdCell}>$1.20</Text>
                                    <Text style={styles.tdCell}>73%</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>🟢 Good</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Baked Pastries</Text>
                                    <Text style={styles.tdCell}>$3.50</Text>
                                    <Text style={styles.tdCell}>$2.80</Text>
                                    <Text style={styles.tdCell}>20%</Text>
                                    <Text style={[styles.tdCell, styles.textRed]}>🔴 Poor</Text>
                                </View>

                                {/* SVG Margin charts */}
                                <Text style={styles.chartHeader}>Revenue Contribution by Channel</Text>
                                <View style={styles.center}>
                                    <Svg width="300" height="150" viewBox="0 0 300 150">
                                        {/* Northeast Region */}
                                        <Rect x="20" y="30" width="60" height="100" fill="#2563eb" rx="4" />
                                        <Text style={styles.svgText}>Regional (32%)</Text>
                                        {/* Central Region */}
                                        <Rect x="110" y="55" width="60" height="75" fill="#f59e0b" rx="4" />
                                        {/* West Region */}
                                        <Rect x="200" y="10" width="60" height="120" fill="#10b981" rx="4" />
                                    </Svg>
                                    <View style={styles.legendRow}>
                                        <Text style={[styles.legendDot, { color: '#2563eb' }]}>● Northeast (32%)</Text>
                                        <Text style={[styles.legendDot, { color: '#f59e0b' }]}>● Central (24%)</Text>
                                        <Text style={[styles.legendDot, { color: '#10b981' }]}>● West (44%)</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* TAB 3: OPERATING VARIANCE */}
                        {activeReportTab === 'variance' && (
                            <View style={styles.reportCard}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.reportTitle}>Operating Cost Variance</Text>
                                    <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Operating Variance", "Personnel expenses: Planned $75,000 | Actual: $74,400")}>
                                        <Text style={styles.exportMinText}>Share</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.reportCap}>Spreadsheet blueprints tracking personnel and SaaS overhead budgets.</Text>

                                <View style={[styles.tableRow, styles.bgSlateDark]}>
                                    <Text style={[styles.thCell, { flex: 2 }]}>Expense Head</Text>
                                    <Text style={styles.thCell}>Planned</Text>
                                    <Text style={styles.thCell}>Actual</Text>
                                    <Text style={styles.thCell}>Variance</Text>
                                </View>

                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2 }]}>Personnel Expenses</Text>
                                    <Text style={styles.tdCell}>$75,000</Text>
                                    <Text style={styles.tdCell}>$74,400</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>-$600</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2 }]}>Website & Cloud</Text>
                                    <Text style={styles.tdCell}>$4,800</Text>
                                    <Text style={styles.tdCell}>$4,800</Text>
                                    <Text style={styles.tdCell}>$0</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2 }]}>Marketing Campaigns</Text>
                                    <Text style={styles.tdCell}>$18,000</Text>
                                    <Text style={styles.tdCell}>$18,000</Text>
                                    <Text style={styles.tdCell}>$0</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 2 }]}>Downtown HQ Rent</Text>
                                    <Text style={styles.tdCell}>$12,000</Text>
                                    <Text style={styles.tdCell}>$12,000</Text>
                                    <Text style={styles.tdCell}>$0</Text>
                                </View>
                            </View>
                        )}

                        {/* TAB 4: EARNED VALUE MANAGEMENT (EVM) PERFORMANCE */}
                        {activeReportTab === 'evm' && (
                            <View style={styles.reportCard}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.reportTitle}>Earned Value Grid (CPI)</Text>
                                    <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("EVM Tracking", "Project Alpha: CPI 1.11 | Project Delta: CPI 0.55 Critical Leakage")}>
                                        <Text style={styles.exportMinText}>Share</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.reportCap}>Budget at Completion (BAC), Earned Value (EV), and Cost Indexes.</Text>

                                <View style={[styles.tableRow, styles.bgSlateDark]}>
                                    <Text style={[styles.thCell, { flex: 1.5 }]}>Project Name</Text>
                                    <Text style={styles.thCell}>B.A.C.</Text>
                                    <Text style={styles.thCell}>Actual Cost</Text>
                                    <Text style={styles.thCell}>Earned Val</Text>
                                    <Text style={styles.thCell}>CPI</Text>
                                </View>

                                {/* Project Alpha */}
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Proj. Alpha (Web)</Text>
                                    <Text style={styles.tdCell}>$45k</Text>
                                    <Text style={styles.tdCell}>$38k</Text>
                                    <Text style={styles.tdCell}>$42k</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>1.11 (🟢)</Text>
                                </View>
                                {/* Project Beta */}
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Proj. Beta (SaaS)</Text>
                                    <Text style={styles.tdCell}>$80k</Text>
                                    <Text style={styles.tdCell}>$74k</Text>
                                    <Text style={styles.tdCell}>$70k</Text>
                                    <Text style={[styles.tdCell, styles.textYellow]}>0.95 (🟡)</Text>
                                </View>
                                {/* Project Delta */}
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Proj. Delta (UX)</Text>
                                    <Text style={styles.tdCell}>$15k</Text>
                                    <Text style={styles.tdCell}>$11k</Text>
                                    <Text style={styles.tdCell}>$6k</Text>
                                    <Text style={[styles.tdCell, styles.textRed, { fontWeight: 'bold' }]}>0.55 (💀)</Text>
                                </View>

                                <View style={styles.infoAlert}>
                                    <Text style={styles.infoAlertText}>
                                        💡 A CPI &gt; 1.0 indicates cost-efficiency. A CPI &lt; 0.75 indicates critical capital leakage, suggesting immediate intervention.
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* TAB 5: CAPITAL CASH FORECASTER */}
                        {activeReportTab === 'forecaster' && (
                            <View style={styles.reportCard}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.reportTitle}>Capital Cash Forecaster</Text>
                                    <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Cash Forecast", "Starting Cash: $25,000 | Projected Outflow: $120,000")}>
                                        <Text style={styles.exportMinText}>Share</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.reportCap}>30-Day forecast analyzing burn rates vs reserve thresholds.</Text>

                                <View style={[styles.tableRow, styles.bgSlateDark]}>
                                    <Text style={[styles.thCell, { flex: 1.5 }]}>Category</Text>
                                    <Text style={styles.thCell}>Current Week</Text>
                                    <Text style={styles.thCell}>Week 2</Text>
                                    <Text style={styles.thCell}>Week 3</Text>
                                </View>

                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Inflow Receipts</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>+$2,500</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>+$3,000</Text>
                                    <Text style={[styles.tdCell, styles.textGreen]}>+$85,000</Text>
                                </View>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.tdCell, { flex: 1.5 }]}>Outflow OpEx</Text>
                                    <Text style={[styles.tdCell, styles.textRed]}>-$1,500</Text>
                                    <Text style={[styles.tdCell, styles.textRed]}>-$3,000</Text>
                                    <Text style={[styles.tdCell, styles.textRed]}>-$74,400</Text>
                                </View>
                                <View style={[styles.tableRow, styles.bgSlate]}>
                                    <Text style={[styles.tdCell, { flex: 1.5, color: '#fff', fontWeight: 'bold' }]}>Projected net</Text>
                                    <Text style={[styles.tdCell, styles.textGreen, { fontWeight: 'bold' }]}>+$1,000</Text>
                                    <Text style={[styles.tdCell, { color: '#fff' }]}>$0</Text>
                                    <Text style={[styles.tdCell, styles.textGreen, { fontWeight: 'bold' }]}>+$10,600</Text>
                                </View>
                            </View>
                        )}

                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}

            {/* ----------------- SCREEN: TRANSACTIONS ----------------- */}
            {currentScreen === 'transactions' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}
                    <View style={styles.rowBetweenCompact}>
                        <Text style={styles.sectionHeader}>Double-Entry Ledgers</Text>
                        <TouchableOpacity style={styles.logBtnCompact} onPress={() => setIsTxModalOpen(true)}>
                            <Text style={styles.logBtnCompactText}>+ Log Entry</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.contentScroll}>
                        {transactions.map((tx) => (
                            <View key={tx.id} style={styles.txRowCard}>
                                <View style={styles.rowBetween}>
                                    <View style={{ flex: 3 }}>
                                        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                        <Text style={styles.txMeta}>{tx.date} • {tx.category}</Text>
                                    </View>
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={[
                                            styles.txAmt,
                                            tx.type === 'income' ? styles.textGreen : styles.textRed
                                        ]}>
                                            {tx.type === 'income' ? '+' : '-'}{currency}{tx.amount.toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}

            {/* ----------------- SCREEN: INSIGHTS ----------------- */}
            {currentScreen === 'insights' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}
                    <Text style={styles.sectionHeader}>Rule-Based Financial Optimizer</Text>

                    <ScrollView style={styles.contentScroll}>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>⚠️ Baked Pastries Gross Margin Alert</Text>
                            <Text style={styles.insightDesc}>
                                Your Baked Pastries margin is currently at <Text style={styles.bold}>20%</Text>, which is significantly below your 65% target margin.
                            </Text>
                            <Text style={styles.insightAction}>
                                Action: Increase price from $3.50 to $4.50 or renegotiate supplier costs of $2.80 to capture margins.
                            </Text>
                        </View>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>⚡ Project Delta Resource Recovery</Text>
                            <Text style={styles.insightDesc}>
                                Cost Performance Index is currently at <Text style={styles.bold}>0.55</Text>, which denotes intense capital overruns.
                            </Text>
                            <Text style={styles.insightAction}>
                                Action: Reallocate Q2 developer hours or suspend non-critical graphic overhauls.
                            </Text>
                        </View>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>🟢 Net Operating Profitability</Text>
                            <Text style={styles.insightDesc}>
                                You are currently running with a positive net profit of <Text style={[styles.bold, styles.textGreen]}>{currency}{finance.profit.toLocaleString()}</Text>.
                            </Text>
                            <Text style={styles.insightAction}>
                                Action: Allocate 20% to cash reserve pots or pay down long-term liabilities.
                            </Text>
                        </View>

                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}

            {/* ----------------- MODAL: ADD TRANSACTION ----------------- */}
            <Modal visible={isTxModalOpen} animationType="slide" transparent>
                <View style={styles.modalBg}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Log Double-Entry Transaction</Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.modalLabel}>Description</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Product design contract, supplier delivery"
                                placeholderTextColor="#64748b"
                                value={newTx.description}
                                onChangeText={(text) => setNewTx({ ...newTx, description: text })}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.modalLabel}>Amount ({currency})</Text>
                            <TextInput
                                style={styles.modalInput}
                                keyboardType="numeric"
                                placeholder="5000"
                                placeholderTextColor="#64748b"
                                value={newTx.amount}
                                onChangeText={(text) => setNewTx({ ...newTx, amount: text })}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.modalLabel}>Transaction Type</Text>
                            <View style={styles.toggleRow}>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, newTx.type === 'expense' && styles.toggleBtnActive]}
                                    onPress={() => setNewTx({ ...newTx, type: 'expense' })}
                                >
                                    <Text style={[styles.toggleText, newTx.type === 'expense' && styles.toggleTextActive]}>Expense / Cost</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, newTx.type === 'income' && styles.toggleBtnActive]}
                                    onPress={() => setNewTx({ ...newTx, type: 'income' })}
                                >
                                    <Text style={[styles.toggleText, newTx.type === 'income' && styles.toggleTextActive]}>Inflow / Revenue</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.modalLabel}>Chart Category</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Personnel, Software sales, Professional consulting"
                                placeholderTextColor="#64748b"
                                value={newTx.category}
                                onChangeText={(text) => setNewTx({ ...newTx, category: text })}
                            />
                        </View>

                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: '#475569', marginRight: 10 }]} onPress={() => setIsTxModalOpen(false)}>
                                <Text style={styles.btnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: '#10b981' }]} onPress={handleAddTransaction}>
                                <Text style={styles.btnText}>Commit Ledger</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeContainer: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    centerScroll: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 20,
    },
    cardContainer: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    mainTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#f8fafc',
        textAlign: 'center',
    },
    subTitle: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 20,
    },
    formGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: '#cbd5e1',
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#f8fafc',
        fontSize: 14,
    },
    primaryBtn: {
        backgroundColor: '#2563eb',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    btnText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    textLink: {
        marginTop: 16,
        alignItems: 'center',
    },
    linkText: {
        color: '#3b82f6',
        fontSize: 14,
    },
    toggleRow: {
        flexDirection: 'row',
    },
    toggleBtn: {
        flex: 1,
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        paddingVertical: 10,
        alignItems: 'center',
    },
    toggleBtnActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    toggleText: {
        color: '#cbd5e1',
        fontSize: 13,
    },
    toggleTextActive: {
        color: '#ffffff',
        fontWeight: 'bold',
    },
    // Main Dashboard Styling
    mainWrapper: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
        backgroundColor: '#1e293b',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    headerSubtitle: {
        fontSize: 11,
        color: '#10b981',
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    headerUser: {
        color: '#cbd5e1',
        fontSize: 12,
    },
    signOutBtn: {
        marginTop: 2,
    },
    signOutText: {
        color: '#f43f5e',
        fontSize: 11,
    },
    footerNav: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
        backgroundColor: '#1e293b',
        paddingVertical: 8,
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 6,
    },
    navItemActive: {
        borderTopWidth: 2,
        borderTopColor: '#3b82f6',
    },
    navText: {
        fontSize: 12,
        color: '#94a3b8',
    },
    navTextActive: {
        color: '#3b82f6',
        fontWeight: 'bold',
    },
    contentScroll: {
        flex: 1,
        padding: 16,
    },
    // One Thing / Alerts
    oneThingCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderLeftWidth: 4,
    },
    borderRed: { borderLeftColor: '#ef4444' },
    borderYellow: { borderLeftColor: '#eab308' },
    borderGreen: { borderLeftColor: '#10b981' },
    bgRed: { backgroundColor: '#7f1d1d' },
    bgYellow: { backgroundColor: '#713f12' },
    bgGreen: { backgroundColor: '#064e3b' },
    oneThingTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#94a3b8',
        textTransform: 'uppercase',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: 'bold',
    },
    oneThingAction: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginTop: 8,
        marginBottom: 4,
    },
    oneThingHelp: {
        fontSize: 12,
        color: '#cbd5e1',
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
        textTransform: 'uppercase',
    },
    scoreboardGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    scoreItem: {
        width: '48%',
        backgroundColor: '#1e293b',
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
        borderWidth: 1,
    },
    scoreLabel: {
        fontSize: 11,
        color: '#94a3b8',
    },
    scoreVal: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginVertical: 4,
    },
    scoreChange: {
        fontSize: 9,
        color: '#cbd5e1',
    },
    actionsBlock: {
        marginVertical: 15,
    },
    actionBtn: {
        backgroundColor: '#10b981',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 10,
    },
    bgSlate: {
        backgroundColor: '#334155',
    },
    actionBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13,
    },
    // Reports Styles
    reportsTabsRow: {
        backgroundColor: '#1e293b',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    repTab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginRight: 8,
    },
    repTabActive: {
        backgroundColor: '#2563eb',
    },
    repTabText: {
        color: '#94a3b8',
        fontSize: 12,
    },
    repTabActiveText: {
        color: '#ffffff',
        fontWeight: 'bold',
    },
    reportCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
    },
    reportTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    reportCap: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 12,
    },
    exportMinBtn: {
        backgroundColor: '#334155',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
    },
    exportMinText: {
        color: '#cbd5e1',
        fontSize: 11,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    bgSlateDark: {
        backgroundColor: '#0f172a',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
    },
    thCell: {
        flex: 1,
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    tdCell: {
        flex: 1,
        color: '#cbd5e1',
        fontSize: 11,
        textAlign: 'center',
    },
    textGreen: { color: '#10b981' },
    textRed: { color: '#f43f5e' },
    textYellow: { color: '#fbbf24' },
    chartHeader: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#94a3b8',
        marginTop: 15,
        marginBottom: 10,
        textAlign: 'center',
    },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    svgText: {
        fontSize: 10,
        color: '#cbd5e1',
    },
    legendRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 8,
    },
    legendDot: {
        fontSize: 10,
        fontWeight: '600',
    },
    infoAlert: {
        backgroundColor: '#0f172a',
        padding: 10,
        borderRadius: 6,
        marginTop: 14,
    },
    infoAlertText: {
        fontSize: 11,
        color: '#94a3b8',
        lineHeight: 16,
    },
    // Ledger
    rowBetweenCompact: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        marginBottom: 4,
    },
    logBtnCompact: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    logBtnCompactText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    txRowCard: {
        backgroundColor: '#1e293b',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#334155',
    },
    txDesc: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    txMeta: {
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 2,
    },
    txAmt: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    // Insights
    insightBox: {
        backgroundColor: '#1e293b',
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        borderColor: '#334155',
        borderWidth: 1,
    },
    insightTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 6,
    },
    insightDesc: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 16,
    },
    insightAction: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 8,
        fontStyle: 'italic',
    },
    bold: {
        fontWeight: 'bold',
    },
    // Modal Style
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContainer: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 8,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalLabel: {
        fontSize: 12,
        color: '#cbd5e1',
        marginBottom: 4,
    },
    modalInput: {
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#f8fafc',
        fontSize: 14,
    },
    modalBtns: {
        flexDirection: 'row',
        marginTop: 20,
    },
});
