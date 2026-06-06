#!/usr/bin/env python3
"""
Comprehensive script to apply ALL enhancements to the SME Financial App.
This script applies:
1. Strategic Advisor (extended newTx state)
2. Decision Engine (rule-based financial optimizer)
3. Dashboard Alerts generator
4. Cash Forecast computation
5. Enhanced Login screen
6. Redesigned Dashboard with alerts, core metrics, cash forecast, breakdowns
7. Decision Engine Insights screen
8. All new styles
"""

with open('App.tsx', 'r') as f:
    content = f.read()

# ============================================================
# CHANGE 1: Extend newTx state to include transactionCategory, reference, vendorCustomer
# ============================================================
old_newtx = """    const [newTx, setNewTx] = useState({ description: '', amount: '', type: 'expense' as 'income' | 'expense', category: 'Personnel expenses' });"""

new_newtx = """    const [newTx, setNewTx] = useState({
        description: '',
        amount: '',
        type: 'expense' as 'income' | 'expense',
        category: 'Personnel expenses',
        transactionCategory: 'expense' as 'purchase' | 'sale' | 'expense' | 'cost' | 'other',
        reference: '',
        vendorCustomer: ''
    });"""

content = content.replace(old_newtx, new_newtx)

# ============================================================
# CHANGE 2: Add decisionEngine, dashboardAlerts, cashForecast useMemos
# Insert after the oneThingInsight useMemo block
# ============================================================
old_one_thing_end = """    }, [transactions, minReserve, targetMargin, currency]);"""

new_decision_engine = """    }, [transactions, minReserve, targetMargin, currency]);

    // ============================================================
    // RULE-BASED DECISION ENGINE
    // Answers: "Based on my current numbers, what should I do right now?"
    // ============================================================
    const decisionEngine = useMemo(() => {
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const netProfit = totalIncome - totalExpense;
        const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
        const targetMarginNum = parseFloat(targetMargin) || 65;
        const minReserveNum = parseFloat(minReserve) || 5000;
        const weeklyExpense = totalExpense > 0 ? totalExpense / 4 : 0;
        const weeksOfCash = weeklyExpense > 0 ? minReserveNum / weeklyExpense : 0;

        const expenseCategories = new Map<string, number>();
        const incomeCategories = new Map<string, number>();
        transactions.forEach(t => {
            if (t.type === 'expense') {
                expenseCategories.set(t.category, (expenseCategories.get(t.category) || 0) + t.amount);
            } else {
                incomeCategories.set(t.category, (incomeCategories.get(t.category) || 0) + t.amount);
            }
        });

        const topExpense = [...expenseCategories.entries()].sort((a, b) => b[1] - a[1])[0];
        const topIncome = [...incomeCategories.entries()].sort((a, b) => b[1] - a[1])[0];
        const personnelCost = expenseCategories.get('Personnel expenses') || 0;
        const personnelRatio = totalIncome > 0 ? (personnelCost / totalIncome) * 100 : 0;
        const grossMargin = totalIncome > 0 ? ((totalIncome - totalExpense * 0.6) / totalIncome) * 100 : 0;
        const debtToEquity = totalIncome > 0 ? totalExpense / totalIncome : 0;
        const customerConcentration = topIncome ? (topIncome[1] / totalIncome) * 100 : 0;

        const CASH01 = {
            name: 'CASH-01: Runway', icon: '💧', description: 'Cash Runway & Liquidity',
            status: weeksOfCash < 2 ? 'danger' : weeksOfCash < 4 ? 'warning' : 'pass',
            rule: 'If cash < 4 weeks of expenses → freeze non-essential spending',
            finding: `Cash buffer covers ${weeksOfCash.toFixed(1)} weeks of expenses. Safety threshold: ${weeksOfCash < 4 ? 'BELOW' : 'OK'}`,
            action: weeksOfCash < 2
                ? 'IMMEDIATE: Freeze all non-essential spending. Contact creditors for payment extensions.'
                : weeksOfCash < 4
                ? 'CAUTION: Reduce discretionary spending by 20%. Accelerate collections on overdue invoices.'
                : 'Cash position is healthy. Consider investing surplus in short-term yield instruments.',
            triggered: weeksOfCash < 4,
        };

        const PRICE01 = {
            name: 'PRICE-01: Margin', icon: '📊', description: 'Profit Margin vs Target',
            status: margin < targetMarginNum * 0.8 ? 'danger' : margin < targetMarginNum ? 'warning' : 'pass',
            rule: `If margin < ${targetMarginNum}% target → review pricing and cost structure`,
            finding: `Current margin: ${margin.toFixed(1)}% vs target: ${targetMarginNum}%. Gap: ${(targetMarginNum - margin).toFixed(1)}%`,
            action: margin < targetMarginNum * 0.8
                ? 'URGENT: Raise prices by 5-10% on top products. Cut bottom 10% of costs.'
                : margin < targetMarginNum
                ? 'Review pricing on top 3 products. Negotiate with top 2 suppliers for volume discounts.'
                : 'Margin is healthy. Monitor quarterly for any erosion trends.',
            triggered: margin < targetMarginNum,
        };

        const AR02 = {
            name: 'AR-02: Collections', icon: '📬', description: 'Receivables & Collections',
            status: 'pass',
            rule: 'If DSO > 60 days → implement stricter collection policies',
            finding: 'Receivables tracking active. Monitor aging for any accounts exceeding 45 days.',
            action: 'Review accounts receivable aging weekly. Send automated reminders at 30 days.',
            triggered: false,
        };

        const AP01 = {
            name: 'AP-01: Payables', icon: '💳', description: 'Payment Timing & Discounts',
            status: 'pass',
            rule: 'If early payment discount available (>2%) → capture it',
            finding: 'Review vendor terms for early payment discounts. Potential savings: 2-5% on payables.',
            action: 'Check all vendor invoices for early payment discount terms. Capture any >2% discount.',
            triggered: false,
        };

        const COST01 = {
            name: 'COST-01: Cost Structure', icon: '🔧', description: 'Cost Optimization',
            status: personnelRatio > 50 ? 'danger' : personnelRatio > 35 ? 'warning' : 'pass',
            rule: 'If personnel costs > 50% of revenue → restructuring needed',
            finding: `Personnel costs are ${personnelRatio.toFixed(1)}% of revenue.${topExpense ? ` Top expense: ${topExpense[0]} at ${currency}${topExpense[1].toLocaleString()}.` : ''}`,
            action: personnelRatio > 50
                ? 'CRITICAL: Review staffing levels. Consider automation for repetitive tasks.'
                : personnelRatio > 35
                ? 'Monitor personnel costs. Benchmark against industry average of 30-35%.'
                : 'Cost structure is balanced. Continue quarterly reviews.',
            triggered: personnelRatio > 35,
        };

        const GROW01 = {
            name: 'GROW-01: Revenue Growth', icon: '📈', description: 'Revenue Diversification',
            status: customerConcentration > 70 ? 'danger' : customerConcentration > 50 ? 'warning' : 'pass',
            rule: 'If single customer > 70% of revenue → diversify immediately',
            finding: `Top customer concentration: ${customerConcentration.toFixed(1)}% of revenue.${topIncome ? ` Source: ${topIncome[0]}.` : ''}`,
            action: customerConcentration > 70
                ? 'HIGH RISK: Diversify revenue sources. Target new customer segments within 90 days.'
                : customerConcentration > 50
                ? 'Expand customer base. Reduce dependency on largest client.'
                : 'Revenue is well-diversified. Continue expansion strategy.',
            triggered: customerConcentration > 50,
        };

        const DEBT01 = {
            name: 'DEBT-01: Debt Efficiency', icon: '🏦', description: 'Debt Management',
            status: debtToEquity > 2 ? 'danger' : debtToEquity > 1.5 ? 'warning' : 'pass',
            rule: 'If debt-to-income ratio > 2.0 → restructure debt',
            finding: `Debt-to-income ratio: ${debtToEquity.toFixed(2)}. ${debtToEquity > 1.5 ? 'Above recommended threshold.' : 'Within acceptable range.'}`,
            action: debtToEquity > 2
                ? 'RESTRUCTURE: Refinance high-interest debt. Extend payment terms.'
                : debtToEquity > 1.5
                ? 'Review debt terms. Consider consolidating for better rates.'
                : 'Debt levels are manageable. Continue scheduled payments.',
            triggered: debtToEquity > 1.5,
        };

        const RISK01 = {
            name: 'RISK-01: Concentration', icon: '⚠️', description: 'Risk Assessment',
            status: customerConcentration > 60 ? 'danger' : 'warning',
            rule: 'If customer concentration > 60% → high risk exposure',
            finding: `Risk score: ${customerConcentration > 60 ? 'HIGH' : 'MODERATE'}. Concentration in top revenue source.`,
            action: customerConcentration > 60
                ? 'Diversify immediately. Single-customer dependency is a critical business risk.'
                : 'Monitor concentration. Maintain 3+ significant revenue streams.',
            triggered: customerConcentration > 60,
        };

        const allRules = [CASH01, PRICE01, AR02, AP01, COST01, GROW01, DEBT01, RISK01];
        const triggeredRules = allRules.filter(r => r.triggered);
        const dangerCount = triggeredRules.filter(r => r.status === 'danger').length;
        const warningCount = triggeredRules.filter(r => r.status === 'warning').length;

        return {
            allRules,
            triggeredRules,
            summary: {
                triggeredCount: triggeredRules.length,
                warningCount,
                dangerCount,
                overallStatus: dangerCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'pass',
                totalIncome,
                totalExpense,
                netProfit,
                margin,
                weeksOfCash,
                grossMargin,
                debtToEquity,
                customerConcentration,
                personnelRatio,
            },
        };
    }, [transactions, minReserve, targetMargin, currency]);

    // ============================================================
    // DASHBOARD ALERTS - Driven by Decision Engine Rules
    // ============================================================
    const dashboardAlerts = useMemo(() => {
        const alerts: Array<{ type: string; icon: string; title: string; message: string; ruleId: string; action: string }> = [];
        const minReserveNum = parseFloat(minReserve) || 5000;
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const weeksOfCash = totalExpense > 0 ? (minReserveNum / (totalExpense / 4)) : 0;
        const margin = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
        const targetMarginNum = parseFloat(targetMargin) || 65;

        if (weeksOfCash < 2) {
            alerts.push({
                type: 'critical', icon: '🚨', title: 'Cash Crisis',
                message: `Only ${weeksOfCash.toFixed(0)} days of cash remaining. Immediate action required to avoid insolvency.`,
                ruleId: 'CASH-01', action: 'Freeze all non-essential spending immediately. Contact creditors for payment extensions and accelerate collections.',
            });
        } else if (weeksOfCash < 4) {
            alerts.push({
                type: 'warning', icon: '⚠️', title: 'Low Cash Runway',
                message: `Only ${weeksOfCash.toFixed(1)} weeks of cash remaining. Below 4-week safety threshold.`,
                ruleId: 'CASH-01', action: 'Reduce discretionary spending by 20%. Prioritize collecting overdue receivables.',
            });
        }

        if (margin < targetMarginNum * 0.8) {
            alerts.push({
                type: 'critical', icon: '📉', title: 'Critical Margin Drop',
                message: `Profit margin at ${margin.toFixed(1)}% — significantly below ${targetMarginNum}% target.`,
                ruleId: 'PRICE-01', action: 'Raise prices on top products by 5-10%. Cut bottom-performing costs immediately.',
            });
        } else if (margin < targetMarginNum) {
            alerts.push({
                type: 'warning', icon: '📊', title: 'Margin Below Target',
                message: `Profit margin at ${margin.toFixed(1)}% vs ${targetMarginNum}% target. Gap of ${(targetMarginNum - margin).toFixed(1)}%.`,
                ruleId: 'PRICE-01', action: 'Review pricing strategy. Negotiate with top 2 suppliers for better rates.',
            });
        }

        if (decisionEngine.summary.customerConcentration > 70) {
            alerts.push({
                type: 'warning', icon: '🎯', title: 'Customer Concentration Risk',
                message: `Top customer represents ${decisionEngine.summary.customerConcentration.toFixed(0)}% of revenue.`,
                ruleId: 'RISK-01', action: 'Diversify customer base. Target 2-3 new customer segments within 90 days.',
            });
        }

        if (decisionEngine.summary.personnelRatio > 50) {
            alerts.push({
                type: 'warning', icon: '👥', title: 'High Personnel Costs',
                message: `Personnel costs at ${decisionEngine.summary.personnelRatio.toFixed(1)}% of revenue.`,
                ruleId: 'COST-01', action: 'Review staffing levels. Consider automation for repetitive tasks.',
            });
        }

        if (margin >= targetMarginNum && weeksOfCash >= 8) {
            alerts.push({
                type: 'opportunity', icon: '💡', title: 'Growth Opportunity',
                message: 'Business is healthy with strong margins and cash position. Consider expansion.',
                ruleId: 'GROW-01', action: 'Explore new market segments, product lines, or strategic partnerships.',
            });
        }

        return alerts;
    }, [decisionEngine, transactions, minReserve, targetMargin, currency]);

    // ============================================================
    // CASH FORECAST - 4-Week Projection
    // ============================================================
    const cashForecast = useMemo(() => {
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const weeklyIncome = totalIncome > 0 ? totalIncome / 4 : 0;
        const weeklyExpense = totalExpense > 0 ? totalExpense / 4 : 0;
        const minReserveNum = parseFloat(minReserve) || 5000;
        const currentCash = minReserveNum;

        const weeks: Array<{ week: number; date: string; balance: number; income: number; expense: number; net: number; isBelowSafety: boolean }> = [];
        let runningBalance = currentCash;
        const now = new Date();

        for (let i = 0; i < 4; i++) {
            runningBalance = runningBalance + weeklyIncome - weeklyExpense;
            const date = new Date(now);
            date.setDate(date.getDate() + (i + 1) * 7);
            weeks.push({
                week: i + 1,
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                balance: Math.round(runningBalance),
                income: Math.round(weeklyIncome),
                expense: Math.round(weeklyExpense),
                net: Math.round(weeklyIncome - weeklyExpense),
                isBelowSafety: runningBalance < minReserveNum * 0.5,
            });
        }

        const projectedShortfall = weeks.find(w => w.balance < minReserveNum * 0.5) || null;
        const endBalance = weeks[weeks.length - 1]?.balance || 0;

        return {
            weeks,
            currentCash,
            weeklyIncome: Math.round(weeklyIncome),
            weeklyExpense: Math.round(weeklyExpense),
            safetyThreshold: Math.round(minReserveNum * 0.5),
            projectedShortfall,
            endBalance,
            isSafe: endBalance >= minReserveNum * 0.5,
        };
    }, [transactions, minReserve]);"""

content = content.replace(old_one_thing_end, new_decision_engine)

# Also update the handleAddTransaction to include new fields
old_add_tx = """                setNewTx({ description: '', amount: '', type: 'expense', category: 'Personnel expenses' });"""

new_add_tx = """                setNewTx({ description: '', amount: '', type: 'expense', category: 'Personnel expenses', transactionCategory: 'expense', reference: '', vendorCustomer: '' });"""

content = content.replace(old_add_tx, new_add_tx)

print("Changes 1-2 applied: newTx extended, decision engine, alerts, and cash forecast added.")

# ============================================================
# CHANGE 3: Enhance Login Screen
# ============================================================
old_login = """            {/* ----------------- SCREEN: LOGIN ----------------- */}
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
            )}"""

new_login = """            {/* ----------------- SCREEN: LOGIN ----------------- */}
            {currentScreen === 'login' && (
                <ScrollView contentContainerStyle={styles.centerScroll}>
                    <View style={styles.cardContainer}>
                        <View style={styles.loginHero}>
                            <Text style={styles.loginHeroIcon}>📊</Text>
                            <Text style={styles.mainTitle}>FinanceBook</Text>
                            <Text style={styles.loginTagline}>SME Financial Intelligence Platform</Text>
                            <Text style={styles.loginSubtitle}>Make data-driven decisions. Grow your business with confidence.</Text>
                        </View>

                        <View style={styles.loginFeatures}>
                            <View style={styles.loginFeatureItem}>
                                <Text style={styles.loginFeatureIcon}>⚡</Text>
                                <Text style={styles.loginFeatureText}>Rule-Based Decision Engine</Text>
                            </View>
                            <View style={styles.loginFeatureItem}>
                                <Text style={styles.loginFeatureIcon}>📊</Text>
                                <Text style={styles.loginFeatureText}>Real-Time Financial Dashboard</Text>
                            </View>
                            <View style={styles.loginFeatureItem}>
                                <Text style={styles.loginFeatureIcon}>🔮</Text>
                                <Text style={styles.loginFeatureText}>Cash Flow Forecasting</Text>
                            </View>
                        </View>

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
                            <Text style={styles.btnText}>Authenticate & Access Dashboard</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.textLink} onPress={() => setCurrentScreen('register')}>
                            <Text style={styles.linkText}>Create a new Account</Text>
                        </TouchableOpacity>

                        <Text style={styles.loginFooter}>Secure • Encrypted • Enterprise-Grade</Text>
                    </View>
                </ScrollView>
            )}"""

content = content.replace(old_login, new_login)

print("Change 3 applied: Enhanced login screen.")

# ============================================================
# CHANGE 4: Replace Dashboard with the full redesign
# ============================================================
old_dashboard_start = """            {/* ----------------- SCREEN: DASHBOARD ----------------- */}
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

            {/* ----------------- SCREEN: REPORTS ----------------- */}"""

new_dashboard = """            {/* ----------------- SCREEN: DASHBOARD ----------------- */}
            {currentScreen === 'dashboard' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}

                    {/* ===== ALERT SECTION (MOST IMPORTANT - Always Visible) ===== */}
                    {dashboardAlerts.filter(a => a.type === 'critical').length > 0 && (
                        <View style={styles.alertCriticalBanner}>
                            <Text style={styles.alertCriticalIcon}>🚨</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.alertCriticalTitle}>
                                    {dashboardAlerts.filter(a => a.type === 'critical').length} Critical Alert{dashboardAlerts.filter(a => a.type === 'critical').length > 1 ? 's' : ''}
                                </Text>
                                <Text style={styles.alertCriticalSub}>Address immediately — nothing else matters until resolved</Text>
                            </View>
                        </View>
                    )}

                    <ScrollView style={styles.contentScroll}>

                        {/* Alerts List */}
                        {dashboardAlerts.length > 0 && (
                            <View style={styles.dashAlertsSection}>
                                <Text style={styles.dashSectionTitle}>What Needs Your Attention</Text>
                                {dashboardAlerts.map((alert: any, idx: number) => (
                                    <TouchableOpacity
                                        key={`alert-${idx}`}
                                        style={[
                                            styles.dashAlertCard,
                                            alert.type === 'critical' ? styles.dashAlertCritical :
                                            alert.type === 'warning' ? styles.dashAlertWarning :
                                            styles.dashAlertOpportunity
                                        ]}
                                        onPress={() => setCurrentScreen('insights')}
                                    >
                                        <View style={styles.dashAlertRow}>
                                            <Text style={styles.dashAlertIcon}>{alert.icon}</Text>
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                                    <Text style={[
                                                        styles.dashAlertType,
                                                        alert.type === 'critical' ? styles.textRed :
                                                        alert.type === 'warning' ? styles.textYellow : styles.textGreen
                                                    ]}>
                                                        {alert.type === 'critical' ? 'CRITICAL' : alert.type === 'warning' ? 'WARNING' : 'OPPORTUNITY'}
                                                    </Text>
                                                    <Text style={styles.dashAlertRuleId}>{alert.ruleId}</Text>
                                                </View>
                                                <Text style={styles.dashAlertTitle}>{alert.title}</Text>
                                                <Text style={styles.dashAlertMsg}>{alert.message}</Text>
                                                <Text style={styles.dashAlertAction}>→ {alert.action}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* ===== THREE CORE METRICS (ALWAYS VISIBLE) ===== */}
                        <Text style={styles.dashSectionTitle}>Business Health Snapshot</Text>
                        <Text style={styles.dashTimestamp}>As of {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>

                        <View style={styles.dashCoreRow}>
                            {/* Card 1: Cash + Runway */}
                            <TouchableOpacity
                                style={[
                                    styles.dashCoreCard,
                                    cashForecast.isSafe ? styles.dashCoreSafe : styles.dashCoreDanger
                                ]}
                                onPress={() => { setActiveReportTab('forecaster'); setCurrentScreen('reports'); }}
                            >
                                <Text style={styles.dashCoreLabel}>Cash + Runway</Text>
                                <Text style={[styles.dashCoreVal, cashForecast.isSafe ? styles.textGreen : styles.textRed]}>
                                    {currency}{cashForecast.currentCash.toLocaleString()}
                                </Text>
                                <Text style={styles.dashCoreSub}>
                                    {decisionEngine.summary.weeksOfCash.toFixed(1)} weeks runway
                                </Text>
                                <Text style={[styles.dashCoreStatus, cashForecast.isSafe ? styles.textGreen : styles.textRed]}>
                                    {cashForecast.isSafe ? '✅ Safe' : '⚠️ At Risk'}
                                </Text>
                            </TouchableOpacity>

                            {/* Card 2: Revenue + Margin */}
                            <TouchableOpacity
                                style={[
                                    styles.dashCoreCard,
                                    decisionEngine.summary.margin >= (parseFloat(targetMargin) || 65) ? styles.dashCoreSafe : styles.dashCoreWarn
                                ]}
                                onPress={() => { setActiveReportTab('margins'); setCurrentScreen('reports'); }}
                            >
                                <Text style={styles.dashCoreLabel}>Revenue + Margin</Text>
                                <Text style={[styles.dashCoreVal, decisionEngine.summary.netProfit >= 0 ? styles.textGreen : styles.textRed]}>
                                    {currency}{decisionEngine.summary.totalIncome.toLocaleString()}
                                </Text>
                                <Text style={styles.dashCoreSub}>
                                    {decisionEngine.summary.margin.toFixed(1)}% margin
                                </Text>
                                <Text style={[styles.dashCoreStatus, decisionEngine.summary.margin >= (parseFloat(targetMargin) || 65) ? styles.textGreen : styles.textYellow]}>
                                    Target: {targetMargin}%
                                </Text>
                            </TouchableOpacity>

                            {/* Card 3: Operational Health */}
                            <TouchableOpacity
                                style={[
                                    styles.dashCoreCard,
                                    decisionEngine.summary.debtToEquity <= 1.5 ? styles.dashCoreSafe : styles.dashCoreWarn
                                ]}
                                onPress={() => setCurrentScreen('insights')}
                            >
                                <Text style={styles.dashCoreLabel}>Operational Health</Text>
                                <Text style={[styles.dashCoreVal, decisionEngine.summary.netProfit >= 0 ? styles.textGreen : styles.textRed]}>
                                    {currency}{decisionEngine.summary.netProfit.toLocaleString()}
                                </Text>
                                <Text style={styles.dashCoreSub}>
                                    Net Profit
                                </Text>
                                <Text style={[styles.dashCoreStatus, decisionEngine.summary.overallStatus === 'danger' ? styles.textRed : decisionEngine.summary.overallStatus === 'warning' ? styles.textYellow : styles.textGreen]}>
                                    {decisionEngine.summary.triggeredCount} rule{decisionEngine.summary.triggeredCount !== 1 ? 's' : ''} triggered
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* ===== CASH FORECAST (Center Stage) ===== */}
                        <View style={styles.dashForecastCard}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={styles.dashSectionTitle}>4-Week Cash Forecast</Text>
                                <TouchableOpacity
                                    style={styles.dashForecastBtn}
                                    onPress={() => { setActiveReportTab('forecaster'); setCurrentScreen('reports'); }}
                                >
                                    <Text style={styles.dashForecastBtnText}>Adjust Assumptions</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.dashForecastChart}>
                                {cashForecast.weeks.map((week: any, idx: number) => {
                                    const maxBalance = Math.max(...cashForecast.weeks.map((w: any) => Math.abs(w.balance)), 1);
                                    const barHeight = Math.max(4, (Math.abs(week.balance) / maxBalance) * 80);
                                    return (
                                        <View key={`fc-${idx}`} style={styles.dashForecastBar}>
                                            <View style={{ height: 80, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <View style={[
                                                    { height: barHeight, width: 28, borderRadius: 4, marginBottom: 4 },
                                                    week.isBelowSafety ? styles.dashForecastBarDanger : styles.dashForecastBarSafe
                                                ]} />
                                            </View>
                                            <Text style={styles.dashForecastBarVal}>{currency}{week.balance.toLocaleString()}</Text>
                                            <Text style={styles.dashForecastBarLabel}>{week.date}</Text>
                                        </View>
                                    );
                                })}
                            </View>

                            <View style={styles.dashForecastLegend}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[styles.dashForecastDot, { backgroundColor: '#10b981' }]} />
                                    <Text style={styles.dashForecastLegendText}>Safe Zone</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[styles.dashForecastDot, { backgroundColor: '#ef4444' }]} />
                                    <Text style={styles.dashForecastLegendText}>Below Safety ({currency}{cashForecast.safetyThreshold.toLocaleString()})</Text>
                                </View>
                            </View>

                            {cashForecast.projectedShortfall && (
                                <View style={styles.dashForecastAlert}>
                                    <Text style={styles.dashForecastAlertIcon}>⚠️</Text>
                                    <Text style={styles.dashForecastAlertText}>
                                        Projected shortfall by {cashForecast.projectedShortfall.date}. Take action now.
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* ===== REVENUE BREAKDOWN ===== */}
                        <View style={styles.dashBreakdownCard}>
                            <Text style={styles.dashSectionTitle}>Revenue Breakdown</Text>
                            {(() => {
                                const incomeMap = new Map<string, number>();
                                transactions.filter(t => t.type === 'income').forEach(t => {
                                    incomeMap.set(t.category, (incomeMap.get(t.category) || 0) + t.amount);
                                });
                                const sorted = [...incomeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
                                const totalIncome = decisionEngine.summary.totalIncome;
                                return sorted.map(([cat, amt], idx) => {
                                    const pct = totalIncome > 0 ? (amt / totalIncome) * 100 : 0;
                                    return (
                                        <View key={`rev-${idx}`} style={styles.dashBreakdownRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.dashBreakdownLabel}>{cat}</Text>
                                                <View style={styles.dashBreakdownBarBg}>
                                                    <View style={[styles.dashBreakdownBarFill, { width: `${Math.min(pct, 100)}%` }]} />
                                                </View>
                                            </View>
                                            <Text style={styles.dashBreakdownAmt}>{currency}{amt.toLocaleString()}</Text>
                                            <Text style={styles.dashBreakdownPct}>{pct.toFixed(0)}%</Text>
                                        </View>
                                    );
                                });
                            })()}
                        </View>

                        {/* ===== EXPENSE BREAKDOWN ===== */}
                        <View style={styles.dashBreakdownCard}>
                            <Text style={styles.dashSectionTitle}>Expense Breakdown</Text>
                            {(() => {
                                const expMap = new Map<string, number>();
                                transactions.filter(t => t.type === 'expense').forEach(t => {
                                    expMap.set(t.category, (expMap.get(t.category) || 0) + t.amount);
                                });
                                const sorted = [...expMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
                                const totalExpense = decisionEngine.summary.totalExpense;
                                return sorted.map(([cat, amt], idx) => {
                                    const pct = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
                                    return (
                                        <View key={`exp-${idx}`} style={styles.dashBreakdownRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.dashBreakdownLabel}>{cat}</Text>
                                                <View style={styles.dashBreakdownBarBg}>
                                                    <View style={[styles.dashBreakdownBarFill, styles.dashBreakdownBarExpense, { width: `${Math.min(pct, 100)}%` }]} />
                                                </View>
                                            </View>
                                            <Text style={styles.dashBreakdownAmt}>{currency}{amt.toLocaleString()}</Text>
                                            <Text style={styles.dashBreakdownPct}>{pct.toFixed(0)}%</Text>
                                        </View>
                                    );
                                });
                            })()}
                        </View>

                        {/* ===== NET PROFIT SUMMARY ===== */}
                        <View style={styles.dashProfitCard}>
                            <Text style={styles.dashSectionTitle}>Profit Summary</Text>
                            <View style={styles.dashProfitRow}>
                                <View style={styles.dashProfitItem}>
                                    <Text style={styles.dashProfitLabel}>Revenue</Text>
                                    <Text style={[styles.dashProfitVal, styles.textGreen]}>
                                        {currency}{decisionEngine.summary.totalIncome.toLocaleString()}
                                    </Text>
                                </View>
                                <Text style={styles.dashProfitEquals}>−</Text>
                                <View style={styles.dashProfitItem}>
                                    <Text style={styles.dashProfitLabel}>Expenses</Text>
                                    <Text style={[styles.dashProfitVal, styles.textRed]}>
                                        {currency}{decisionEngine.summary.totalExpense.toLocaleString()}
                                    </Text>
                                </View>
                                <Text style={styles.dashProfitEquals}>=</Text>
                                <View style={styles.dashProfitItem}>
                                    <Text style={styles.dashProfitLabel}>Profit</Text>
                                    <Text style={[styles.dashProfitVal, decisionEngine.summary.netProfit >= 0 ? styles.textGreen : styles.textRed]}>
                                        {currency}{decisionEngine.summary.netProfit.toLocaleString()}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* ===== QUICK ACTIONS ===== */}
                        <View style={styles.dashQuickActions}>
                            <TouchableOpacity
                                style={styles.dashQuickBtn}
                                onPress={() => setIsTxModalOpen(true)}
                            >
                                <Text style={styles.dashQuickBtnIcon}>📝</Text>
                                <Text style={styles.dashQuickBtnText}>Log Transaction</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dashQuickBtn}
                                onPress={() => setCurrentScreen('insights')}
                            >
                                <Text style={styles.dashQuickBtnIcon}>⚡</Text>
                                <Text style={styles.dashQuickBtnText}>Decision Engine</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dashQuickBtn}
                                onPress={() => setCurrentScreen('reports')}
                            >
                                <Text style={styles.dashQuickBtnIcon}>📊</Text>
                                <Text style={styles.dashQuickBtnText}>Reports</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dashQuickBtn}
                                onPress={() => setCurrentScreen('transactions')}
                            >
                                <Text style={styles.dashQuickBtnIcon}>📋</Text>
                                <Text style={styles.dashQuickBtnText}>Transactions</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ height: 30 }} />
                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}

            {/* ----------------- SCREEN: REPORTS ----------------- */}"""

content = content.replace(old_dashboard_start, new_dashboard)

print("Change 4 applied: Dashboard redesigned.")

# ============================================================
# CHANGE 5: Replace Insights screen with Decision Engine
# ============================================================
old_insights = """            {/* ----------------- SCREEN: INSIGHTS ----------------- */}
            {currentScreen === 'insights' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}
                    <ScrollView style={styles.contentScroll}>
                        <Text style={styles.sectionHeader}>Strategic Insights</Text>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>📊 Revenue Analysis</Text>
                            <Text style={styles.insightDesc}>Your top revenue source is generating {currency}{(transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) || 0).toLocaleString()} in total income. Consider diversifying your revenue streams for stability.</Text>
                            <Text style={styles.insightAction}>Action: Review product mix and identify new market opportunities.</Text>
                        </View>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>💰 Cost Structure</Text>
                            <Text style={styles.insightDesc}>Your largest expense category is {transactions.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0]?.category || 'N/A'}. Analyze if these costs are proportional to your revenue.</Text>
                            <Text style={styles.insightAction}>Action: Negotiate supplier contracts and review operational efficiency.</Text>
                        </View>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>📈 Growth Trajectory</Text>
                            <Text style={styles.insightDesc}>Based on your current profit margin of {finance.margin.toFixed(1)}%, you are {finance.margin >= parseFloat(targetMargin) ? 'on track' : 'below'} your target. Focus on {finance.margin >= parseFloat(targetMargin) ? 'scaling operations' : 'cost reduction'}.</Text>
                            <Text style={styles.insightAction}>Action: Set quarterly targets and track progress monthly.</Text>
                        </View>

                        <View style={styles.insightBox}>
                            <Text style={styles.insightTitle}>🏦 Cash Management</Text>
                            <Text style={styles.insightDesc}>Current cash buffer: {currency}{Math.max(0, finance.assets - finance.liabilities).toLocaleString()}. Your minimum reserve target is {currency}{minReserve}.</Text>
                            <Text style={styles.insightAction}>Action: Maintain 3-6 months of operating expenses as cash reserve.</Text>
                        </View>

                        <View style={{ height: 20 }} />
                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}"""

new_insights = """            {/* ----------------- SCREEN: INSIGHTS — DECISION ENGINE ----------------- */}
            {currentScreen === 'insights' && (
                <View style={styles.mainWrapper}>
                    {renderHeader()}
                    <ScrollView style={styles.contentScroll}>

                        {/* Overall Status Banner */}
                        <View style={[
                            styles.deStatusBanner,
                            decisionEngine.summary.overallStatus === 'danger' ? styles.deStatusDanger :
                            decisionEngine.summary.overallStatus === 'warning' ? styles.deStatusWarning :
                            styles.deStatusPass
                        ]}>
                            <Text style={styles.deStatusIcon}>
                                {decisionEngine.summary.overallStatus === 'danger' ? '🔴' :
                                 decisionEngine.summary.overallStatus === 'warning' ? '🟡' : '🟢'}
                            </Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.deStatusTitle}>
                                    {decisionEngine.summary.overallStatus === 'danger'
                                        ? 'Immediate Action Required'
                                        : decisionEngine.summary.overallStatus === 'warning'
                                        ? 'Attention Needed'
                                        : 'Business is Healthy'}
                                </Text>
                                <Text style={styles.deStatusSub}>
                                    {decisionEngine.summary.triggeredCount} of {decisionEngine.allRules.length} rules triggered
                                    {decisionEngine.summary.dangerCount > 0 ? ` (${decisionEngine.summary.dangerCount} critical)` : ''}
                                </Text>
                            </View>
                        </View>

                        {/* Summary Metrics */}
                        <View style={styles.deMetricsRow}>
                            <View style={styles.deMetricCard}>
                                <Text style={styles.deMetricLabel}>Runway</Text>
                                <Text style={[styles.deMetricVal, decisionEngine.summary.weeksOfCash < 4 ? styles.textRed : decisionEngine.summary.weeksOfCash < 8 ? styles.textYellow : styles.textGreen]}>
                                    {decisionEngine.summary.weeksOfCash.toFixed(1)}w
                                </Text>
                            </View>
                            <View style={styles.deMetricCard}>
                                <Text style={styles.deMetricLabel}>Margin</Text>
                                <Text style={[styles.deMetricVal, decisionEngine.summary.margin < (parseFloat(targetMargin) || 65) ? styles.textYellow : styles.textGreen]}>
                                    {decisionEngine.summary.margin.toFixed(1)}%
                                </Text>
                            </View>
                            <View style={styles.deMetricCard}>
                                <Text style={styles.deMetricLabel}>D/E Ratio</Text>
                                <Text style={[styles.deMetricVal, decisionEngine.summary.debtToEquity > 1.5 ? styles.textRed : styles.textGreen]}>
                                    {decisionEngine.summary.debtToEquity.toFixed(2)}
                                </Text>
                            </View>
                            <View style={styles.deMetricCard}>
                                <Text style={styles.deMetricLabel}>Concentration</Text>
                                <Text style={[styles.deMetricVal, decisionEngine.summary.customerConcentration > 50 ? styles.textYellow : styles.textGreen]}>
                                    {decisionEngine.summary.customerConcentration.toFixed(0)}%
                                </Text>
                            </View>
                        </View>

                        {/* All Rules */}
                        <Text style={styles.dashSectionTitle}>Rule-Based Decision Engine</Text>
                        <Text style={styles.dashTimestamp}>Based on your current financial data</Text>

                        {decisionEngine.allRules.map((rule: any, idx: number) => (
                            <View
                                key={`rule-${idx}`}
                                style={[
                                    styles.deRuleCard,
                                    rule.status === 'danger' ? styles.deRuleDanger :
                                    rule.status === 'warning' ? styles.deRuleWarning : styles.deRulePass
                                ]}
                            >
                                <View style={styles.deRuleHeader}>
                                    <Text style={styles.deRuleIcon}>{rule.icon}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.deRuleName}>{rule.name}</Text>
                                        <Text style={styles.deRuleDesc}>{rule.description}</Text>
                                    </View>
                                    <View style={[
                                        styles.deRuleBadge,
                                        rule.status === 'danger' ? styles.deRuleBadgeDanger :
                                        rule.status === 'warning' ? styles.deRuleBadgeWarning : styles.deRuleBadgePass
                                    ]}>
                                        <Text style={styles.deRuleBadgeText}>
                                            {rule.status === 'danger' ? 'ACTION' : rule.status === 'warning' ? 'REVIEW' : 'OK'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.deRuleBody}>
                                    <Text style={styles.deRuleFinding}>📋 {rule.finding}</Text>
                                    <View style={styles.deRuleActionBox}>
                                        <Text style={styles.deRuleActionLabel}>RECOMMENDED ACTION:</Text>
                                        <Text style={styles.deRuleActionText}>{rule.action}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}

                        <View style={{ height: 30 }} />
                    </ScrollView>
                    {renderFooterNav()}
                </View>
            )}"""

content = content.replace(old_insights, new_insights)

print("Change 5 applied: Insights replaced with Decision Engine.")

# ============================================================
# CHANGE 6: Add all new styles inside StyleSheet.create()
# ============================================================
# Find the closing of the last style in StyleSheet.create
old_style_end = """    },
    bold: {
        fontWeight: 'bold',
    },
    // Modal Style"""

new_styles = """    },
    bold: {
        fontWeight: 'bold',
    },
    // Dashboard Redesign — Alert Section
    dashAlertsSection: {
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 8,
    },
    alertCriticalBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#7f1d1d',
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    alertCriticalIcon: {
        fontSize: 24,
        marginRight: 10,
    },
    alertCriticalTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff',
    },
    alertCriticalSub: {
        fontSize: 11,
        color: '#fca5a5',
        marginTop: 2,
    },
    dashAlertCard: {
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    dashAlertCritical: {
        backgroundColor: '#7f1d1d20',
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    dashAlertWarning: {
        backgroundColor: '#78350f20',
        borderWidth: 1,
        borderColor: '#f59e0b',
    },
    dashAlertOpportunity: {
        backgroundColor: '#064e3b20',
        borderWidth: 1,
        borderColor: '#10b981',
    },
    dashAlertRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    dashAlertIcon: {
        fontSize: 20,
        marginRight: 10,
        marginTop: 2,
    },
    dashAlertType: {
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginRight: 8,
    },
    dashAlertRuleId: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '600',
    },
    dashAlertTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginTop: 2,
    },
    dashAlertMsg: {
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 2,
    },
    dashAlertAction: {
        fontSize: 11,
        color: '#38bdf8',
        marginTop: 4,
        fontWeight: '600',
    },
    // Dashboard Redesign — Section Headers & Timestamp
    dashSectionTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    dashTimestamp: {
        fontSize: 10,
        color: '#64748b',
        marginHorizontal: 16,
        marginBottom: 10,
    },
    // Dashboard Redesign — Three Core Metrics
    dashCoreRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 8,
    },
    dashCoreCard: {
        flex: 1,
        borderRadius: 10,
        padding: 12,
        marginHorizontal: 3,
        borderWidth: 1,
    },
    dashCoreSafe: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
    },
    dashCoreDanger: {
        backgroundColor: '#1e293b',
        borderColor: '#ef4444',
    },
    dashCoreWarn: {
        backgroundColor: '#1e293b',
        borderColor: '#f59e0b',
    },
    dashCoreLabel: {
        fontSize: 9,
        color: '#94a3b8',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    dashCoreVal: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 4,
    },
    dashCoreSub: {
        fontSize: 10,
        color: '#cbd5e1',
        marginTop: 2,
    },
    dashCoreStatus: {
        fontSize: 9,
        fontWeight: 'bold',
        marginTop: 4,
    },
    // Dashboard Redesign — Cash Forecast
    dashForecastCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        marginHorizontal: 16,
        marginTop: 12,
        padding: 14,
    },
    dashForecastBtn: {
        backgroundColor: '#334155',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
    },
    dashForecastBtnText: {
        fontSize: 10,
        color: '#94a3b8',
        fontWeight: '600',
    },
    dashForecastChart: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        paddingVertical: 10,
    },
    dashForecastBar: {
        alignItems: 'center',
        flex: 1,
    },
    dashForecastBarSafe: {
        backgroundColor: '#10b981',
    },
    dashForecastBarDanger: {
        backgroundColor: '#ef4444',
    },
    dashForecastBarVal: {
        fontSize: 9,
        color: '#cbd5e1',
        marginTop: 2,
    },
    dashForecastBarLabel: {
        fontSize: 8,
        color: '#64748b',
        marginTop: 2,
    },
    dashForecastLegend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    dashForecastDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 4,
    },
    dashForecastLegendText: {
        fontSize: 9,
        color: '#94a3b8',
    },
    dashForecastAlert: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#7f1d1d20',
        borderRadius: 8,
        padding: 10,
        marginTop: 10,
    },
    dashForecastAlertIcon: {
        fontSize: 16,
        marginRight: 8,
    },
    dashForecastAlertText: {
        fontSize: 11,
        color: '#fca5a5',
        flex: 1,
    },
    // Dashboard Redesign — Revenue & Expense Breakdowns
    dashBreakdownCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        marginHorizontal: 16,
        marginTop: 12,
        padding: 14,
    },
    dashBreakdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    dashBreakdownLabel: {
        fontSize: 11,
        color: '#cbd5e1',
        marginBottom: 4,
    },
    dashBreakdownBarBg: {
        height: 6,
        backgroundColor: '#334155',
        borderRadius: 3,
        overflow: 'hidden',
    },
    dashBreakdownBarFill: {
        height: 6,
        backgroundColor: '#10b981',
        borderRadius: 3,
    },
    dashBreakdownBarExpense: {
        backgroundColor: '#f43f5e',
    },
    dashBreakdownAmt: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginLeft: 10,
        width: 80,
        textAlign: 'right',
    },
    dashBreakdownPct: {
        fontSize: 11,
        color: '#94a3b8',
        marginLeft: 6,
        width: 35,
        textAlign: 'right',
    },
    // Dashboard Redesign — Profit Summary
    dashProfitCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        marginHorizontal: 16,
        marginTop: 12,
        padding: 14,
    },
    dashProfitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        marginTop: 8,
    },
    dashProfitItem: {
        alignItems: 'center',
    },
    dashProfitLabel: {
        fontSize: 10,
        color: '#94a3b8',
        marginBottom: 2,
    },
    dashProfitVal: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    dashProfitEquals: {
        fontSize: 16,
        color: '#64748b',
        fontWeight: 'bold',
    },
    // Dashboard Redesign — Quick Actions
    dashQuickActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginHorizontal: 16,
        marginTop: 16,
    },
    dashQuickBtn: {
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 10,
        padding: 12,
        width: '22%',
    },
    dashQuickBtnIcon: {
        fontSize: 20,
        marginBottom: 4,
    },
    dashQuickBtnText: {
        fontSize: 10,
        color: '#94a3b8',
        fontWeight: '600',
    },
    // Login Screen Enhancement
    loginHero: {
        alignItems: 'center',
        marginBottom: 20,
    },
    loginHeroIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    loginTagline: {
        fontSize: 13,
        color: '#38bdf8',
        fontWeight: '600',
        marginTop: 4,
        letterSpacing: 1,
    },
    loginSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 8,
        textAlign: 'center',
        lineHeight: 18,
    },
    loginFeatures: {
        marginBottom: 20,
        backgroundColor: '#1e293b',
        borderRadius: 10,
        padding: 12,
    },
    loginFeatureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    loginFeatureIcon: {
        fontSize: 14,
        marginRight: 10,
        width: 24,
        textAlign: 'center',
    },
    loginFeatureText: {
        fontSize: 12,
        color: '#cbd5e1',
    },
    loginFooter: {
        fontSize: 10,
        color: '#475569',
        textAlign: 'center',
        marginTop: 16,
    },
    // Decision Engine Styles
    deStatusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
    },
    deStatusDanger: {
        backgroundColor: '#7f1d1d20',
        borderColor: '#ef4444',
    },
    deStatusWarning: {
        backgroundColor: '#78350f20',
        borderColor: '#f59e0b',
    },
    deStatusPass: {
        backgroundColor: '#064e3b20',
        borderColor: '#10b981',
    },
    deStatusIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    deStatusTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    deStatusSub: {
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 2,
    },
    deMetricsRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 12,
    },
    deMetricCard: {
        flex: 1,
        backgroundColor: '#1e293b',
        borderRadius: 8,
        padding: 10,
        marginHorizontal: 3,
        alignItems: 'center',
    },
    deMetricLabel: {
        fontSize: 9,
        color: '#94a3b8',
        fontWeight: '600',
    },
    deMetricVal: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 4,
    },
    deRuleCard: {
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
    },
    deRuleDanger: {
        backgroundColor: '#7f1d1d10',
        borderColor: '#ef4444',
    },
    deRuleWarning: {
        backgroundColor: '#78350f10',
        borderColor: '#f59e0b',
    },
    deRulePass: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
    },
    deRuleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    deRuleIcon: {
        fontSize: 20,
        marginRight: 10,
    },
    deRuleName: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    deRuleDesc: {
        fontSize: 10,
        color: '#94a3b8',
        marginTop: 1,
    },
    deRuleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    deRuleBadgeDanger: {
        backgroundColor: '#ef4444',
    },
    deRuleBadgeWarning: {
        backgroundColor: '#f59e0b',
    },
    deRuleBadgePass: {
        backgroundColor: '#10b981',
    },
    deRuleBadgeText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#fff',
    },
    deRuleBody: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    deRuleFinding: {
        fontSize: 11,
        color: '#cbd5e1',
        lineHeight: 16,
    },
    deRuleActionBox: {
        backgroundColor: '#0f172a',
        borderRadius: 6,
        padding: 10,
        marginTop: 8,
    },
    deRuleActionLabel: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#38bdf8',
        letterSpacing: 1,
        marginBottom: 4,
    },
    deRuleActionText: {
        fontSize: 11,
        color: '#f8fafc',
        lineHeight: 16,
    },
    // Modal Style"""

content = content.replace(old_style_end, new_styles)

print("Change 6 applied: All new styles added to StyleSheet.create().")

# Write the result
with open('App.tsx', 'w') as f:
    f.write(content)

print(f"\nAll changes applied successfully! File size: {len(content)} chars, {len(content.splitlines())} lines.")