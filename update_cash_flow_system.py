#!/usr/bin/env python3
"""
Script to enhance the SME Financial Mobile App with comprehensive Cash Flow Management System
"""

import os
import re

# Define the file path
filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"

# Read the current file
with open(filepath, 'r') as f:
    content = f.read()

# Add new interfaces for cash flow management
new_interfaces = """
// Cash Flow Management Interfaces
interface Receivable {
    id: string;
    customer: string;
    invoiceDate: string;
    dueDate: string;
    amount: number;
    status: 'paid' | 'overdue' | 'pending';
    daysOverdue: number;
    paymentTerms: string;
    notes?: string;
}

interface Payable {
    id: string;
    supplier: string;
    invoiceDate: string;
    dueDate: string;
    amount: number;
    status: 'paid' | 'pending' | 'overdue';
    daysUntilDue: number;
    discountAvailable: boolean;
    discountPercentage?: number;
    discountDueDate?: string;
    category: string;
}

interface CashReserveGoal {
    id: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    purpose: 'emergency' | 'growth' | 'seasonal' | 'debt_repayment';
    monthlyContribution: number;
}

interface PaymentTermTemplate {
    id: string;
    name: string;
    description: string;
    paymentDays: number;
    discountPercentage?: number;
    discountDays?: number;
    lateFeePercentage?: number;
    gracePeriodDays?: number;
}

interface CashFlowScenario {
    id: string;
    name: 'best_case' | 'most_likely' | 'worst_case';
    description: string;
    revenueMultiplier: number;
    expenseMultiplier: number;
    probability: number;
}
"""

# Insert the new interfaces after the existing DebtItem interface
debt_item_end = content.find('};', content.find('interface DebtItem')) + 2
content = content[:debt_item_end] + new_interfaces + content[debt_item_end:]

# Add state variables for cash flow management
state_variables_addition = """
    // Cash Flow Management States
    const [receivables, setReceivables] = useState<Receivable[]>([
        { id: 'rec-1', customer: 'ABC Corp', invoiceDate: '2026-05-15', dueDate: '2026-06-15', amount: 15000, status: 'pending', daysOverdue: 0, paymentTerms: 'Net 30' },
        { id: 'rec-2', customer: 'XYZ Ltd', invoiceDate: '2026-05-10', dueDate: '2026-05-20', amount: 8500, status: 'overdue', daysOverdue: 17, paymentTerms: 'Net 10' },
        { id: 'rec-3', customer: 'Tech Solutions', invoiceDate: '2026-05-25', dueDate: '2026-06-25', amount: 12000, status: 'pending', daysOverdue: 0, paymentTerms: 'Net 30' },
    ]);
    
    const [payables, setPayables] = useState<Payable[]>([
        { id: 'pay-1', supplier: 'Cloud Services Inc', invoiceDate: '2026-05-15', dueDate: '2026-06-15', amount: 4500, status: 'pending', daysUntilDue: 30, discountAvailable: true, discountPercentage: 2, discountDueDate: '2026-05-25', category: 'IT Services' },
        { id: 'pay-2', supplier: 'Office Supplies Co', invoiceDate: '2026-05-20', dueDate: '2026-06-20', amount: 1200, status: 'pending', daysUntilDue: 35, discountAvailable: false, category: 'Supplies' },
        { id: 'pay-3', supplier: 'Legal Services', invoiceDate: '2026-05-05', dueDate: '2026-05-20', amount: 3200, status: 'overdue', daysUntilDue: -16, discountAvailable: false, category: 'Professional Services' },
    ]);
    
    const [cashReserveGoals, setCashReserveGoals] = useState<CashReserveGoal[]>([
        { id: 'goal-1', targetAmount: 50000, currentAmount: 15000, targetDate: '2026-12-31', purpose: 'emergency', monthlyContribution: 5000 },
        { id: 'goal-2', targetAmount: 25000, currentAmount: 8000, targetDate: '2026-10-31', purpose: 'growth', monthlyContribution: 3000 },
    ]);
    
    const [paymentTermTemplates, setPaymentTermTemplates] = useState<PaymentTermTemplate[]>([
        { id: 'tmpl-1', name: 'Standard B2B', description: 'Net 30 days', paymentDays: 30 },
        { id: 'tmpl-2', name: 'Early Payment Incentive', description: '2% discount if paid within 10 days, otherwise Net 30', paymentDays: 30, discountPercentage: 2, discountDays: 10 },
        { id: 'tmpl-3', name: 'Premium Client', description: 'Net 60 days', paymentDays: 60 },
    ]);
    
    const [cashFlowScenarios, setCashFlowScenarios] = useState<CashFlowScenario[]>([
        { id: 'scen-1', name: 'best_case', description: 'Sales exceed targets by 20%', revenueMultiplier: 1.2, expenseMultiplier: 1.0, probability: 25 },
        { id: 'scen-2', name: 'most_likely', description: 'Baseline projections', revenueMultiplier: 1.0, expenseMultiplier: 1.0, probability: 50 },
        { id: 'scen-3', name: 'worst_case', description: 'Sales drop 20%', revenueMultiplier: 0.8, expenseMultiplier: 1.0, probability: 25 },
    ]);
    
    const [activeCashFlowTab, setActiveCashFlowTab] = useState<'dashboard' | 'forecast' | 'receivables' | 'payables' | 'reserves' | 'terms' | 'alerts'>('dashboard');
    const [selectedScenario, setSelectedScenario] = useState<string>('scen-2');
    const [showReceivablesModal, setShowReceivablesModal] = useState(false);
    const [showPayablesModal, setShowPayablesModal] = useState(false);
    const [newReceivable, setNewReceivable] = useState<Omit<Receivable, 'id' | 'status' | 'daysOverdue'>>({ 
        customer: '', 
        invoiceDate: new Date().toISOString().split('T')[0], 
        dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], 
        amount: 0, 
        paymentTerms: 'Net 30' 
    });
    const [newPayable, setNewPayable] = useState<Omit<Payable, 'id' | 'status' | 'daysUntilDue'>>({ 
        supplier: '', 
        invoiceDate: new Date().toISOString().split('T')[0], 
        dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], 
        amount: 0, 
        discountAvailable: false, 
        category: '' 
    });
"""

# Find the end of the existing useState declarations and add the new ones
existing_states_end = content.find('// Combined Financial Aggregations based on Live Ledger State')
content = content[:existing_states_end] + state_variables_addition + content[existing_states_end:]

# Now add the 13-week cash flow forecast function
cash_forecast_function = """
    // 13-Week Cash Flow Forecast with Scenario Support
    const thirteenWeekCashForecast = useMemo(() => {
        const scenario = cashFlowScenarios.find(s => s.id === selectedScenario);
        if (!scenario) return { weeks: [] };
        
        const baseWeeklyIncome = cashForecast.weeklyIncome;
        const baseWeeklyExpense = cashForecast.weeklyExpense;
        const adjustedWeeklyIncome = baseWeeklyIncome * scenario.revenueMultiplier;
        const adjustedWeeklyExpense = baseWeeklyExpense * scenario.expenseMultiplier;
        
        const weeks: Array<{ week: number; date: string; balance: number; income: number; expense: number; net: number; isBelowSafety: boolean }> = [];
        let runningBalance = cashForecast.currentCash;
        const now = new Date();
        
        for (let i = 0; i < 13; i++) {
            runningBalance = runningBalance + adjustedWeeklyIncome - adjustedWeeklyExpense;
            const date = new Date(now);
            date.setDate(date.getDate() + (i + 1) * 7);
            weeks.push({
                week: i + 1,
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                balance: Math.round(runningBalance),
                income: Math.round(adjustedWeeklyIncome),
                expense: Math.round(adjustedWeeklyExpense),
                net: Math.round(adjustedWeeklyIncome - adjustedWeeklyExpense),
                isBelowSafety: runningBalance < cashForecast.safetyThreshold,
            });
        }
        
        return { weeks };
    }, [cashForecast, selectedScenario, cashFlowScenarios]);
    
    // Calculate cash runway in days
    const cashRunway = useMemo(() => {
        if (finance.profit <= 0) {
            // Calculate based on burn rate if losing money
            const weeklyBurn = Math.abs(finance.profit / 4); // Assume quarterly burn rate
            return Math.max(0, Math.floor((cashForecast.currentCash / weeklyBurn) * 7));
        } else {
            // If profitable, theoretically infinite runway
            return 999;
        }
    }, [cashForecast.currentCash, finance.profit]);
    
    // Identify receivables overdue by more than 30 days
    const overdueReceivables = useMemo(() => {
        return receivables.filter(rec => rec.daysOverdue > 30);
    }, [receivables]);
    
    // Identify upcoming payables due in next 7 days
    const upcomingPayables = useMemo(() => {
        return payables.filter(pay => pay.daysUntilDue <= 7 && pay.daysUntilDue >= 0);
    }, [payables]);
    
    // Calculate cash conversion cycle
    const cashConversionCycle = useMemo(() => {
        // Simplified calculation - in a real app this would use inventory data
        const avgCollectionPeriod = receivables.reduce((sum, rec) => sum + (rec.status !== 'paid' ? rec.daysOverdue : 0), 0) / (receivables.filter(r => r.status !== 'paid').length || 1);
        const avgPaymentPeriod = payables.reduce((sum, pay) => sum + (pay.status !== 'paid' ? pay.daysUntilDue * -1 : 0), 0) / (payables.filter(p => p.status !== 'paid').length || 1);
        
        return Math.round(avgCollectionPeriod - avgPaymentPeriod);
    }, [receivables, payables]);
"""

# Add this function after the existing cashForecast function
cash_forecast_pos = content.find('// Combined Financial Aggregations based on Live Ledger State')
content = content[:cash_forecast_pos] + cash_forecast_function + content[cash_forecast_pos:]

# Add helper functions for cash flow management
helper_functions = """
    // Helper functions for cash flow management
    const addReceivable = () => {
        if (!newReceivable.customer || newReceivable.amount <= 0) return;
        
        const newRec: Receivable = {
            ...newReceivable,
            id: 'rec-' + Date.now(),
            status: new Date(newReceivable.dueDate) < new Date() ? 'overdue' : 'pending',
            daysOverdue: Math.max(0, Math.floor((new Date().getTime() - new Date(newReceivable.dueDate).getTime()) / (1000 * 60 * 60 * 24))),
        };
        
        setReceivables([...receivables, newRec]);
        setNewReceivable({ 
            customer: '', 
            invoiceDate: new Date().toISOString().split('T')[0], 
            dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], 
            amount: 0, 
            paymentTerms: 'Net 30' 
        });
        setShowReceivablesModal(false);
    };
    
    const addPayable = () => {
        if (!newPayable.supplier || newPayable.amount <= 0) return;
        
        const newPay: Payable = {
            ...newPayable,
            id: 'pay-' + Date.now(),
            status: new Date(newPayable.dueDate) < new Date() ? 'overdue' : 'pending',
            daysUntilDue: Math.floor((new Date(newPayable.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
        };
        
        setPayables([...payables, newPay]);
        setNewPayable({ 
            supplier: '', 
            invoiceDate: new Date().toISOString().split('T')[0], 
            dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], 
            amount: 0, 
            discountAvailable: false, 
            category: '' 
        });
        setShowPayablesModal(false);
    };
    
    const markReceivablePaid = (id: string) => {
        setReceivables(receivables.map(rec => 
            rec.id === id ? { ...rec, status: 'paid', daysOverdue: 0 } : rec
        ));
    };
    
    const markPayablePaid = (id: string) => {
        setPayables(payables.map(pay => 
            pay.id === id ? { ...pay, status: 'paid', daysUntilDue: 0 } : pay
        ));
    };
    
    // Function to calculate emergency alert conditions
    const checkEmergencyConditions = () => {
        const alerts = [];
        
        if (cashRunway < 30) {
            alerts.push({
                type: 'danger',
                message: 'Cash runway less than 30 days',
                action: 'Freeze non-essential spending',
                timeframe: '24 hours'
            });
        }
        
        if (cashRunway < 14) {
            alerts.push({
                type: 'danger',
                message: 'Cash runway less than 14 days',
                action: 'Delay all non-critical payments',
                timeframe: '24 hours'
            });
        }
        
        if (overdueReceivables.some(rec => rec.daysOverdue > 60)) {
            alerts.push({
                type: 'warning',
                message: 'Customer with invoice over 60 days overdue',
                action: 'Owner to make personal call',
                timeframe: '48 hours'
            });
        }
        
        return alerts;
    };
"""

# Add helper functions after the existing functions
functions_end_pos = content.rfind('return (')  # Find where JSX starts
content = content[:functions_end_pos] + helper_functions + content[functions_end_pos:]

# Now add the new cash flow management UI components to the reports section
# First, find the existing cash_flow tab section and replace it with enhanced version
cash_flow_section_start = content.find('{activeReportTab === \'cash_flow\' && (')
cash_flow_section_end = content.find(')},', cash_flow_section_start) + 2

# Enhanced cash flow section with all the new functionality
enhanced_cash_flow_section = """
                        {activeReportTab === 'cash_flow' && (
                            <View style={styles.reportCard}>
                                {/* Cash Flow Management Tabs */}
                                <View style={{ flexDirection: 'row', marginBottom: 16, backgroundColor: '#0f172a', borderRadius: 8, padding: 4 }}>
                                    <TouchableOpacity
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: activeCashFlowTab === 'dashboard' ? '#2563eb' : 'transparent', alignItems: 'center' }}
                                        onPress={() => setActiveCashFlowTab('dashboard')}
                                    >
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: activeCashFlowTab === 'dashboard' ? '#fff' : '#94a3b8' }}>📊 Dashboard</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: activeCashFlowTab === 'forecast' ? '#2563eb' : 'transparent', alignItems: 'center' }}
                                        onPress={() => setActiveCashFlowTab('forecast')}
                                    >
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: activeCashFlowTab === 'forecast' ? '#fff' : '#94a3b8' }}>📈 Forecast</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: activeCashFlowTab === 'receivables' ? '#2563eb' : 'transparent', alignItems: 'center' }}
                                        onPress={() => setActiveCashFlowTab('receivables')}
                                    >
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: activeCashFlowTab === 'receivables' ? '#fff' : '#94a3b8' }}>💳 Receivables</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: activeCashFlowTab === 'payables' ? '#2563eb' : 'transparent', alignItems: 'center' }}
                                        onPress={() => setActiveCashFlowTab('payables')}
                                    >
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: activeCashFlowTab === 'payables' ? '#fff' : '#94a3b8' }}>💰 Payables</Text>
                                    </TouchableOpacity>
                                </View>
                                
                                {/* Dashboard Tab */}
                                {activeCashFlowTab === 'dashboard' && (
                                    <View>
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.reportTitle}>Cash Flow Dashboard</Text>
                                            <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Cash Flow Dashboard", "Weeks of Cash: " + decisionEngine.summary.weeksOfCash.toFixed(1) + " | Safety Threshold: " + currency + cashForecast.safetyThreshold.toLocaleString())}>
                                                <Text style={styles.exportMinText}>Share</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.reportCap}>Monitor cash runway, burn rate, and liquidity position.</Text>

                                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginRight: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Current Cash</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>{currency}{cashForecast.currentCash.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginHorizontal: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Weekly Burn</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: finance.profit < 0 ? '#ef4444' : '#10b981', marginTop: 2 }}>{currency}{Math.abs(cashForecast.weeklyExpense - cashForecast.weeklyIncome).toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginLeft: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Cash Runway</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: cashRunway < 30 ? '#ef4444' : cashRunway < 60 ? '#f59e0b' : '#10b981', marginTop: 2 }}>
                                                    {cashRunway >= 999 ? '∞' : `${cashRunway} days`}
                                                </Text>
                                            </View>
                                        </View>
                                        
                                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginRight: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>CCC (Days)</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: cashConversionCycle > 30 ? '#ef4444' : '#10b981', marginTop: 2 }}>{cashConversionCycle}</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginHorizontal: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Overdue A/R</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>
                                                    {currency}{receivables.filter(r => r.status === 'overdue').reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginLeft: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Due A/P</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>
                                                    {currency}{payables.filter(p => p.status === 'pending' && p.daysUntilDue <= 7).reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Top 3 Risks */}
                                        <View style={{ marginTop: 12, backgroundColor: '#1e293b', borderRadius: 8, padding: 12 }}>
                                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 }}>Top 3 Risks</Text>
                                            {cashRunway < 30 && (
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, padding: 8, backgroundColor: '#7f1d1d20', borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>⚠️</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Low Cash Runway</Text>
                                                        <Text style={{ fontSize: 9, color: '#fca5a5', marginTop: 2 }}>Cash runway: {cashRunway} days</Text>
                                                        <Text style={{ fontSize: 9, color: '#fca5a5', marginTop: 2, fontWeight: '600' }}>Action: Freeze non-essential spending</Text>
                                                    </View>
                                                </View>
                                            )}
                                            {overdueReceivables.length > 0 && (
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, padding: 8, backgroundColor: '#78350f20', borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>💳</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Overdue Receivables</Text>
                                                        <Text style={{ fontSize: 9, color: '#fbbf24', marginTop: 2 }}>
                                                            {overdueReceivables.length} invoices over 30 days
                                                        </Text>
                                                        <Text style={{ fontSize: 9, color: '#fbbf24', marginTop: 2, fontWeight: '600' }}>
                                                            Action: Contact customers immediately
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                            {!cashForecast.isSafe && (
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, padding: 8, backgroundColor: '#064e3b20', borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>📊</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Projected Shortfall</Text>
                                                        <Text style={{ fontSize: 9, color: '#34d399', marginTop: 2 }}>
                                                            Balance may drop below safety threshold
                                                        </Text>
                                                        <Text style={{ fontSize: 9, color: '#34d399', marginTop: 2, fontWeight: '600' }}>
                                                            Action: Review expenses and collections
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                            {receivables.filter(r => r.status === 'overdue').length === 0 && cashRunway >= 30 && cashForecast.isSafe && (
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 8, backgroundColor: '#064e3b20', borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>✅</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>All Good</Text>
                                                        <Text style={{ fontSize: 9, color: '#34d399', marginTop: 2 }}>
                                                            No immediate cash flow risks identified
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                        
                                        {/* Quick Actions */}
                                        <View style={{ marginTop: 12 }}>
                                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 }}>Quick Actions</Text>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <TouchableOpacity 
                                                    style={{ flex: 1, backgroundColor: '#2563eb', padding: 10, borderRadius: 8, marginRight: 4, alignItems: 'center' }}
                                                    onPress={() => setActiveCashFlowTab('receivables')}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#fff' }}>Add Invoice</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity 
                                                    style={{ flex: 1, backgroundColor: '#10b981', padding: 10, borderRadius: 8, marginHorizontal: 4, alignItems: 'center' }}
                                                    onPress={() => setActiveCashFlowTab('payables')}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#fff' }}>Add Bill</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity 
                                                    style={{ flex: 1, backgroundColor: '#f59e0b', padding: 10, borderRadius: 8, marginLeft: 4, alignItems: 'center' }}
                                                    onPress={() => setActiveCashFlowTab('forecast')}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#fff' }}>Update Forecast</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                )}
                                
                                {/* Forecast Tab */}
                                {activeCashFlowTab === 'forecast' && (
                                    <View>
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.reportTitle}>13-Week Cash Forecast</Text>
                                            <View style={{ flexDirection: 'row' }}>
                                                <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("13-Week Cash Forecast", "Scenario: " + cashFlowScenarios.find(s => s.id === selectedScenario)?.name)}>
                                                    <Text style={styles.exportMinText}>Share</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <Text style={styles.reportCap}>Project cash position under different business scenarios.</Text>

                                        {/* Scenario Selector */}
                                        <View style={{ marginBottom: 12 }}>
                                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>Select Scenario:</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                                {cashFlowScenarios.map(scenario => (
                                                    <TouchableOpacity
                                                        key={scenario.id}
                                                        style={{ 
                                                            flex: 1, 
                                                            backgroundColor: selectedScenario === scenario.id ? '#2563eb' : '#1e293b', 
                                                            padding: 8, 
                                                            borderRadius: 6, 
                                                            marginRight: 4, 
                                                            marginBottom: 4,
                                                            minWidth: 100
                                                        }}
                                                        onPress={() => setSelectedScenario(scenario.id)}
                                                    >
                                                        <Text style={{ 
                                                            fontSize: 9, 
                                                            fontWeight: '600', 
                                                            color: selectedScenario === scenario.id ? '#fff' : '#94a3b8',
                                                            textAlign: 'center'
                                                        }}>
                                                            {scenario.name === 'best_case' ? 'Best Case' : 
                                                             scenario.name === 'most_likely' ? 'Most Likely' : 
                                                             'Worst Case'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>

                                        {/* 13-Week Forecast Chart */}
                                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 }}>13-Week Cash Projection</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                            <View style={{ flexDirection: 'row', paddingVertical: 8, minWidth: 13 * 50 }}>
                                                {thirteenWeekCashForecast.weeks.map((week, idx) => {
                                                    const maxBalance = Math.max(...thirteenWeekCashForecast.weeks.map(w => Math.abs(w.balance)), 1);
                                                    const barHeight = Math.max(4, (Math.abs(week.balance) / maxBalance) * 80);
                                                    return (
                                                        <View key={`cf-${idx}`} style={{ alignItems: 'center', marginHorizontal: 3, width: 40 }}>
                                                            <View style={{ height: 80, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                                <View style={{
                                                                    height: barHeight,
                                                                    width: 20,
                                                                    borderRadius: 3,
                                                                    marginBottom: 4,
                                                                    backgroundColor: week.isBelowSafety ? '#ef4444' : '#10b981'
                                                                }} />
                                                            </View>
                                                            <Text style={{ fontSize: 7, color: '#cbd5e1', fontWeight: 'bold' }}>
                                                                {currency}{week.balance >= 0 ? '' : '-'}{Math.abs(week.balance) >= 1000 ? (Math.abs(week.balance) / 1000).toFixed(1) + 'k' : Math.abs(week.balance)}
                                                            </Text>
                                                            <Text style={{ fontSize: 6, color: '#64748b', marginTop: 2 }}>{week.date}</Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </ScrollView>

                                        {/* Forecast Summary */}
                                        <View style={{ marginTop: 12, backgroundColor: '#1e293b', borderRadius: 8, padding: 12 }}>
                                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 }}>Forecast Summary</Text>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <View style={{ alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8' }}>Starting Balance</Text>
                                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#f8fafc' }}>{currency}{cashForecast.currentCash.toLocaleString()}</Text>
                                                </View>
                                                <View style={{ alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8' }}>Ending Balance</Text>
                                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: thirteenWeekCashForecast.weeks[12]?.isBelowSafety ? '#ef4444' : '#10b981' }}>
                                                        {currency}{thirteenWeekCashForecast.weeks[12]?.balance.toLocaleString() || 'N/A'}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8' }}>Net Change</Text>
                                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: (thirteenWeekCashForecast.weeks[12]?.balance || 0) - cashForecast.currentCash >= 0 ? '#10b981' : '#ef4444' }}>
                                                        {currency}{((thirteenWeekCashForecast.weeks[12]?.balance || 0) - cashForecast.currentCash).toLocaleString()}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                )}
                                
                                {/* Receivables Tab */}
                                {activeCashFlowTab === 'receivables' && (
                                    <View>
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.reportTitle}>Receivables Tracker</Text>
                                            <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Receivables Tracker", "Total A/R: " + currency + receivables.reduce((sum, r) => sum + r.amount, 0).toLocaleString())}>
                                                <Text style={styles.exportMinText}>Share</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.reportCap}>Track outstanding customer payments and collection activities.</Text>

                                        {/* Receivables Summary Cards */}
                                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginRight: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Total A/R</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>
                                                    {currency}{receivables.reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginHorizontal: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Overdue A/R</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ef4444', marginTop: 2 }}>
                                                    {currency}{receivables.filter(r => r.status === 'overdue').reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginLeft: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Avg. Collection</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>
                                                    {receivables.length > 0 ? Math.round(receivables.reduce((sum, r) => sum + r.daysOverdue, 0) / receivables.length) : 0} days
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Add Receivable Button */}
                                        <TouchableOpacity 
                                            style={{ backgroundColor: '#10b981', padding: 12, borderRadius: 8, marginBottom: 12, alignItems: 'center' }}
                                            onPress={() => setShowReceivablesModal(true)}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#fff' }}>+ Add Receivable</Text>
                                        </TouchableOpacity>

                                        {/* Receivables List */}
                                        <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 8 }}>
                                            <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                <Text style={[styles.thCell, { flex: 1.5 }]}>Customer</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Amount</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Due Date</Text>
                                                <Text style={[styles.thCell, { flex: 0.8 }]}>Age</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Status</Text>
                                                <Text style={[styles.thCell, { flex: 0.8 }]}>Action</Text>
                                            </View>
                                            {receivables.map(receivable => (
                                                <View key={receivable.id} style={[styles.tableRow, { 
                                                    backgroundColor: receivable.status === 'overdue' ? '#7f1d1d20' : 
                                                                   receivable.status === 'pending' && receivable.daysOverdue > 15 ? '#78350f20' : 
                                                                   'transparent' 
                                                }]}>
                                                    <Text style={[styles.tdCell, { flex: 1.5, fontWeight: '600', color: '#f8fafc' }]}>{receivable.customer}</Text>
                                                    <Text style={[styles.tdCell, { flex: 1 }]}>{currency}{receivable.amount.toLocaleString()}</Text>
                                                    <Text style={[styles.tdCell, { flex: 1 }]}>{receivable.dueDate}</Text>
                                                    <Text style={[styles.tdCell, { flex: 0.8, color: receivable.daysOverdue > 0 ? '#f59e0b' : '#94a3b8' }]}>
                                                        {receivable.daysOverdue > 0 ? `${receivable.daysOverdue} days` : 'On time'}
                                                    </Text>
                                                    <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>
                                                        <Text style={{ color: receivable.status === 'paid' ? '#10b981' : 
                                                                     receivable.status === 'overdue' ? '#ef4444' : 
                                                                     '#f59e0b' }}>
                                                            {receivable.status === 'paid' ? '✅ Paid' : 
                                                             receivable.status === 'overdue' ? '❌ Overdue' : 
                                                             '⏳ Pending'}
                                                        </Text>
                                                    </Text>
                                                    <View style={{ flex: 0.8, flexDirection: 'row' }}>
                                                        {receivable.status !== 'paid' && (
                                                            <TouchableOpacity onPress={() => markReceivablePaid(receivable.id)}>
                                                                <Text style={{ fontSize: 10, color: '#10b981', fontWeight: 'bold' }}>Mark Paid</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Collection Timeline for Overdue Items */}
                                        {receivables.filter(r => r.status === 'overdue').length > 0 && (
                                            <View style={{ marginTop: 12, backgroundColor: '#1e293b', borderRadius: 8, padding: 12 }}>
                                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 }}>Collection Timeline</Text>
                                                <View style={{ marginLeft: 10 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                                            <Text style={{ fontSize: 10, color: '#fff' }}>1</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Day 1</Text>
                                                            <Text style={{ fontSize: 8, color: '#94a3b8' }}>Automated reminder sent</Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                                            <Text style={{ fontSize: 10, color: '#fff' }}>7</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Day 7</Text>
                                                            <Text style={{ fontSize: 8, color: '#94a3b8' }}>Personal call/email</Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                                            <Text style={{ fontSize: 10, color: '#fff' }}>14</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Day 14</Text>
                                                            <Text style={{ fontSize: 8, color: '#94a3b8' }}>Manager escalation</Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                                            <Text style={{ fontSize: 10, color: '#fff' }}>30</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Day 30</Text>
                                                            <Text style={{ fontSize: 8, color: '#94a3b8' }}>Hold further work</Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#7f1d1d', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                                            <Text style={{ fontSize: 10, color: '#fff' }}>45+</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Day 45+</Text>
                                                            <Text style={{ fontSize: 8, color: '#94a3b8' }}>Collections/legal action</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}
                                
                                {/* Payables Tab */}
                                {activeCashFlowTab === 'payables' && (
                                    <View>
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.reportTitle}>Payables Manager</Text>
                                            <TouchableOpacity style={styles.exportMinBtn} onPress={() => handleShareReport("Payables Manager", "Total A/P: " + currency + payables.reduce((sum, p) => sum + p.amount, 0).toLocaleString())}>
                                                <Text style={styles.exportMinText}>Share</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.reportCap}>Manage outgoing payments and optimize payment timing.</Text>

                                        {/* Payables Summary Cards */}
                                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginRight: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Total A/P</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>
                                                    {currency}{payables.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginHorizontal: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Due Soon</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 }}>
                                                    {currency}{payables.filter(p => p.status === 'pending' && p.daysUntilDue <= 7).reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginLeft: 4, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#94a3b8' }}>Available Discounts</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#10b981', marginTop: 2 }}>
                                                    {currency}{payables.filter(p => p.discountAvailable && p.discountDueDate && new Date(p.discountDueDate) >= new Date()).reduce((sum, p) => sum + (p.amount * (p.discountPercentage || 0) / 100), 0).toLocaleString()}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Add Payable Button */}
                                        <TouchableOpacity 
                                            style={{ backgroundColor: '#10b981', padding: 12, borderRadius: 8, marginBottom: 12, alignItems: 'center' }}
                                            onPress={() => setShowPayablesModal(true)}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#fff' }}>+ Add Payable</Text>
                                        </TouchableOpacity>

                                        {/* Payables List */}
                                        <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 8 }}>
                                            <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                <Text style={[styles.thCell, { flex: 1.5 }]}>Supplier</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Amount</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Due Date</Text>
                                                <Text style={[styles.thCell, { flex: 0.8 }]}>Days Left</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Discount</Text>
                                                <Text style={[styles.thCell, { flex: 1 }]}>Status</Text>
                                                <Text style={[styles.thCell, { flex: 0.8 }]}>Action</Text>
                                            </View>
                                            {payables.map(payable => (
                                                <View key={payable.id} style={[styles.tableRow, { 
                                                    backgroundColor: payable.status === 'overdue' ? '#7f1d1d20' : 
                                                                   payable.status === 'pending' && payable.daysUntilDue <= 7 ? '#78350f20' : 
                                                                   'transparent' 
                                                }]}>
                                                    <Text style={[styles.tdCell, { flex: 1.5, fontWeight: '600', color: '#f8fafc' }]}>{payable.supplier}</Text>
                                                    <Text style={[styles.tdCell, { flex: 1 }]}>{currency}{payable.amount.toLocaleString()}</Text>
                                                    <Text style={[styles.tdCell, { flex: 1 }]}>{payable.dueDate}</Text>
                                                    <Text style={[styles.tdCell, { flex: 0.8, color: payable.daysUntilDue < 0 ? '#ef4444' : 
                                                                                   payable.daysUntilDue <= 7 ? '#f59e0b' : 
                                                                                   '#94a3b8' }]}>
                                                        {payable.daysUntilDue < 0 ? `${Math.abs(payable.daysUntilDue)} days ago` : 
                                                         payable.daysUntilDue <= 7 ? `${payable.daysUntilDue} days` : 
                                                         `${payable.daysUntilDue} days`}
                                                    </Text>
                                                    <Text style={[styles.tdCell, { flex: 1, color: payable.discountAvailable ? '#10b981' : '#94a3b8' }]}>
                                                        {payable.discountAvailable && payable.discountPercentage ? 
                                                         `${payable.discountPercentage}% if by ${payable.discountDueDate}` : 
                                                         'None'}
                                                    </Text>
                                                    <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>
                                                        <Text style={{ color: payable.status === 'paid' ? '#10b981' : 
                                                                     payable.status === 'overdue' ? '#ef4444' : 
                                                                     '#f59e0b' }}>
                                                            {payable.status === 'paid' ? '✅ Paid' : 
                                                             payable.status === 'overdue' ? '❌ Overdue' : 
                                                             '⏳ Pending'}
                                                        </Text>
                                                    </Text>
                                                    <View style={{ flex: 0.8, flexDirection: 'row' }}>
                                                        {payable.status !== 'paid' && (
                                                            <TouchableOpacity onPress={() => markPayablePaid(payable.id)}>
                                                                <Text style={{ fontSize: 10, color: '#10b981', fontWeight: 'bold' }}>Mark Paid</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Payment Optimization Tips */}
                                        <View style={{ marginTop: 12, backgroundColor: '#1e293b', borderRadius: 8, padding: 12 }}>
                                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 }}>Payment Optimization</Text>
                                            <View style={{ marginLeft: 10 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>💡</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Take Early Payment Discounts</Text>
                                                        <Text style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                                                            2%/10 net 30 = 36% annualized return on your cash
                                                        </Text>
                                                    </View>
                                                </div>
                                                <div style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>⏱️</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Pay on Due Date</Text>
                                                        <Text style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                                                            Keep cash longer without penalties
                                                        </Text>
                                                    </View>
                                                </div>
                                                <div style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                                    <Text style={{ fontSize: 16, marginRight: 8 }}>🤝</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc' }}>Negotiate Better Terms</Text>
                                                        <Text style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                                                            Try extending net 30 to net 60 for better cash flow
                                                        </Text>
                                                    </View>
                                                </div>
                                            </div>
                                        </div>
                                    </View>
                                )}
                                
                                {/* Modals for adding items */}
                                {/* Add Receivable Modal */}
                                <Modal visible={showReceivablesModal} transparent={true} animationType="slide">
                                    <View style={styles.modalOverlay}>
                                        <View style={styles.modalContent}>
                                            <Text style={styles.modalTitle}>Add Receivable</Text>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Customer</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newReceivable.customer}
                                                    onChangeText={(text) => setNewReceivable({...newReceivable, customer: text})}
                                                    placeholder="Enter customer name"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Amount</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newReceivable.amount.toString()}
                                                    onChangeText={(text) => setNewReceivable({...newReceivable, amount: parseFloat(text) || 0})}
                                                    placeholder="0.00"
                                                    keyboardType="numeric"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Invoice Date</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newReceivable.invoiceDate}
                                                    onChangeText={(text) => setNewReceivable({...newReceivable, invoiceDate: text})}
                                                    placeholder="YYYY-MM-DD"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Due Date</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newReceivable.dueDate}
                                                    onChangeText={(text) => setNewReceivable({...newReceivable, dueDate: text})}
                                                    placeholder="YYYY-MM-DD"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Payment Terms</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newReceivable.paymentTerms}
                                                    onChangeText={(text) => setNewReceivable({...newReceivable, paymentTerms: text})}
                                                    placeholder="e.g., Net 30"
                                                />
                                            </View>
                                            
                                            <View style={styles.modalActions}>
                                                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowReceivablesModal(false)}>
                                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.modalConfirmBtn} onPress={addReceivable}>
                                                    <Text style={styles.modalConfirmText}>Add Receivable</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                </Modal>
                                
                                {/* Add Payable Modal */}
                                <Modal visible={showPayablesModal} transparent={true} animationType="slide">
                                    <View style={styles.modalOverlay}>
                                        <View style={styles.modalContent}>
                                            <Text style={styles.modalTitle}>Add Payable</Text>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Supplier</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newPayable.supplier}
                                                    onChangeText={(text) => setNewPayable({...newPayable, supplier: text})}
                                                    placeholder="Enter supplier name"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Amount</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newPayable.amount.toString()}
                                                    onChangeText={(text) => setNewPayable({...newPayable, amount: parseFloat(text) || 0})}
                                                    placeholder="0.00"
                                                    keyboardType="numeric"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Invoice Date</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newPayable.invoiceDate}
                                                    onChangeText={(text) => setNewPayable({...newPayable, invoiceDate: text})}
                                                    placeholder="YYYY-MM-DD"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Due Date</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newPayable.dueDate}
                                                    onChangeText={(text) => setNewPayable({...newPayable, dueDate: text})}
                                                    placeholder="YYYY-MM-DD"
                                                />
                                            </View>
                                            
                                            <View style={styles.inputGroup}>
                                                <Text style={styles.label}>Category</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newPayable.category}
                                                    onChangeText={(text) => setNewPayable({...newPayable, category: text})}
                                                    placeholder="e.g., IT Services"
                                                />
                                            </View>
                                            
                                            <View style={styles.checkboxGroup}>
                                                <TouchableOpacity 
                                                    style={styles.checkbox}
                                                    onPress={() => setNewPayable({...newPayable, discountAvailable: !newPayable.discountAvailable})}
                                                >
                                                    <Text style={styles.checkboxText}>{newPayable.discountAvailable ? '✓' : ''}</Text>
                                                </TouchableOpacity>
                                                <Text style={styles.checkboxLabel}>Has Early Payment Discount</Text>
                                            </View>
                                            
                                            <View style={styles.modalActions}>
                                                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowPayablesModal(false)}>
                                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.modalConfirmBtn} onPress={addPayable}>
                                                    <Text style={styles.modalConfirmText}>Add Payable</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                </Modal>
                            </View>
                        )}
"""

# Replace the existing cash_flow section with the enhanced version
content = content[:cash_flow_section_start] + enhanced_cash_flow_section + content[cash_flow_section_end:]

# Write the updated content back to the file
with open(filepath, 'w') as f:
    f.write(content)

print("SME Cash Flow Management System has been successfully implemented!")
print("- Added new interfaces for receivables, payables, reserves, and scenarios")
print("- Added state variables for comprehensive cash flow tracking")
print("- Implemented 13-week cash flow forecasting with scenario support")
print("- Created dashboard with cash runway, CCC, and risk indicators")
print("- Added receivables tracker with collection timeline")
print("- Added payables manager with discount optimization")
print("- Implemented modals for adding receivables and payables")
print("- Added emergency alert system for critical situations")