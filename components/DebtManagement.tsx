import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput } from 'react-native';

interface DebtItem {
    id: string;
    type: string;
    lender: string;
    originalAmount: number;
    currentBalance: number;
    interestRate: number;
    monthlyPayment: number;
    nextDueDate: string;
    securedBy: string;
    daysPastDue?: number;
    category: 'payroll' | 'taxes' | 'suppliers' | 'aged_payables' | 'secured' | 'credit_card' | 'bank_loan' | 'owner_loan' | 'merchant_advance' | 'other';
    paymentFrequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'annually'; // Payment frequency
    lastPaymentDate?: string; // Last payment made
    maturityDate?: string; // When debt is fully paid off
    collateral?: string; // Assets securing the debt
    covenantRequirements?: string; // Any loan covenants
    earlyPaymentPenalty?: boolean; // Whether early payment penalty exists
    notes?: string; // Additional notes about the debt
}

interface DebtManagementProps {
    currency: string;
    finance: {
        assets: number;
        liabilities: number;
        equity: number;
    };
}

const DebtManagement: React.FC<DebtManagementProps> = ({ currency, finance }) => {
    // State for debt inventory - Initialize with empty array for real users
    const [debts, setDebts] = useState<DebtItem[]>([]);

    // Helper function to reset new debt form
    const resetNewDebtForm = () => {
        setNewDebt({
            type: '',
            lender: '',
            originalAmount: '',
            currentBalance: '',
            interestRate: '',
            monthlyPayment: '',
            nextDueDate: '',
            securedBy: '',
            paymentFrequency: 'monthly',
            lastPaymentDate: '',
            maturityDate: '',
            collateral: '',
            covenantRequirements: '',
            earlyPaymentPenalty: false,
            notes: ''
        });
    };

    // State for adding new debts
    const [newDebt, setNewDebt] = useState({
        type: '' as string,
        lender: '' as string,
        originalAmount: '' as string,
        currentBalance: '' as string,
        interestRate: '' as string,
        monthlyPayment: '' as string,
        nextDueDate: '' as string,
        securedBy: '' as string,
        paymentFrequency: 'monthly' as 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'annually',
        lastPaymentDate: '' as string,
        maturityDate: '' as string,
        collateral: '' as string,
        covenantRequirements: '' as string,
        earlyPaymentPenalty: false as boolean,
        notes: '' as string
    });

    // State for expanded sections
    const [expandedSections, setExpandedSections] = useState({
        assessment: true,
        prioritization: false,
        strategy: false,
        execution: false,
        monitoring: false
    });

    // State for 90-day payment schedule
    const [paymentSchedule, setPaymentSchedule] = useState<any[]>([]);

    // State for 13-week cash flow forecast
    const [cashFlowForecast, setCashFlowForecast] = useState<any[]>([]);

    // State for repayment method
    const [repaymentMethod, setRepaymentMethod] = useState<'avalanche' | 'snowball'>('avalanche');

    // Calculated values
    const totalDebt = debts.reduce((sum, debt) => sum + debt.currentBalance, 0);
    const debtToEquityRatio = finance.equity !== 0 ? (totalDebt / finance.equity) : 0;
    const workingCapitalShare = debts.length > 0 ? (totalDebt / (finance.assets - finance.liabilities)) * 100 : 0;

    // Calculate debt metrics for each debt item
    const debtsWithMetrics = debts.map(debt => {
        const daysPastDue = debt.daysPastDue || Math.max(0, Math.floor((new Date().getTime() - new Date(debt.nextDueDate).getTime()) / (1000 * 60 * 60 * 24)));
        const interestPerMonth = debt.currentBalance * (debt.interestRate / 100 / 12);
        const timeToPayoff = debt.monthlyPayment > 0 ? debt.currentBalance / debt.monthlyPayment : Infinity;
        const debtServiceCoverage = debt.monthlyPayment > 0 ? (finance.assets - finance.liabilities) / debt.monthlyPayment : 0;

        return {
            ...debt,
            daysPastDue,
            interestPerMonth,
            timeToPayoff,
            debtServiceCoverage
        };
    });

    // Calculate priority scores
    const debtsWithPriority = debtsWithMetrics.map(debt => {
        let score = 0;

        // P0 (Critical): Payroll, taxes, secured debt with asset at risk
        if (['payroll', 'taxes'].includes(debt.category)) score = 5;
        // P1 (Urgent): Supplier 60+ days past due, utilities, rent
        else if (debt.category === 'suppliers' && debt.daysPastDue && debt.daysPastDue > 60) score = 4;
        // P2 (High): Credit cards (high interest), equipment leases
        else if (debt.category === 'credit_card' || debt.category === 'secured') score = 3;
        // P3 (Medium): Bank term loans (current), supplier net 30 terms
        else if (debt.category === 'bank_loan' || debt.category === 'suppliers') score = 2;
        // P4 (Low): Owner loans, low-interest debt, long-term debt
        else score = 1;

        return {
            ...debt,
            priorityScore: score
        };
    }).sort((a, b) => b.priorityScore - a.priorityScore);

    // Debt service coverage ratio
    const totalMonthlyPayments = debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
    const debtServiceCoverageRatio = totalMonthlyPayments > 0 ? (finance.assets - finance.liabilities) / totalMonthlyPayments : 0;

    // Update repayment method based on debt service coverage ratio
    useEffect(() => {
        if (debtServiceCoverageRatio > 1.1) {
            setRepaymentMethod('avalanche');
        } else {
            setRepaymentMethod('snowball');
        }
    }, [debtServiceCoverageRatio]);

    // Toggle section expansion
    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    // Add a new debt
    const addDebt = () => {
        if (newDebt.type && newDebt.lender && newDebt.currentBalance) {
            const newDebtItem: DebtItem = {
                id: Date.now().toString(),
                type: newDebt.type,
                lender: newDebt.lender,
                originalAmount: parseFloat(newDebt.originalAmount) || parseFloat(newDebt.currentBalance) || 0,
                currentBalance: parseFloat(newDebt.currentBalance) || 0,
                interestRate: parseFloat(newDebt.interestRate) || 0,
                monthlyPayment: parseFloat(newDebt.monthlyPayment) || 0,
                nextDueDate: newDebt.nextDueDate || 'N/A',
                securedBy: newDebt.securedBy || 'Unsecured',
                category: 'other' as const,
                paymentFrequency: newDebt.paymentFrequency || 'monthly',
                lastPaymentDate: newDebt.lastPaymentDate || '',
                maturityDate: newDebt.maturityDate || '',
                collateral: newDebt.collateral || '',
                covenantRequirements: newDebt.covenantRequirements || '',
                earlyPaymentPenalty: newDebt.earlyPaymentPenalty || false,
                notes: newDebt.notes || ''
            };

            setDebts([...debts, newDebtItem]);

            // Reset form
            resetNewDebtForm();
        }
    };

    // Delete a debt
    const deleteDebt = (id: string) => {
        setDebts(debts.filter(debt => debt.id !== id));
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>SME Debt Management</Text>
            <Text style={styles.subtitle}>
                Using borrowed money as a strategic tool for growth, not as a burden that strangles cash flow
            </Text>

            {/* Stage 1: Assessment */}
            <View style={styles.stageCard}>
                <TouchableOpacity
                    style={styles.stageHeader}
                    onPress={() => toggleSection('assessment')}
                >
                    <Text style={styles.stageTitle}>📊 Stage 1: Assessment – Know What You Owe</Text>
                    <Text style={styles.expandIcon}>{expandedSections.assessment ? '−' : '+'}</Text>
                </TouchableOpacity>

                {expandedSections.assessment && (
                    <View style={styles.stageContent}>
                        <Text style={styles.sectionDescription}>
                            Objective: Create complete visibility of all business debts
                        </Text>

                        {/* Step 1.1: Gather All Debt Documents (Day 1) */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 1.1: Gather All Debt Documents (Day 1)</Text>
                            <Text style={styles.informationSubtitle}>Locate and organize these documents for every debt:</Text>

                            <View style={styles.informationTable}>
                                <View style={styles.informationTableHeader}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Debt Type</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Where to Find</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Documents Needed</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Bank loans</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Online banking, loan officers</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Promissory note, payment schedule, interest rate</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Credit cards</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Card statements</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Statement, APR, minimum payment</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Equipment leases</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Leasing company</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Lease agreement, buyout terms</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Supplier credit</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Accounts payable, vendor statements</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Invoice aging, payment terms</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Tax debt</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>IRS/ tax authority notices</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Balance due, penalty schedule</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Owner loans</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Personal records</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Loan agreement, repayment terms</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Merchant cash advances</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1 }]}>Advance agreements</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Factor rate, holdback percentage</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 1.2: Create Debt Inventory Spreadsheet (Day 2) */}
                        <View style={styles.spreadsheetSection}>
                            <Text style={styles.informationTitle}>Step 1.2: Create Debt Inventory Spreadsheet (Day 2)</Text>
                            <Text style={styles.informationSubtitle}>Use this exact template. Copy it into Excel or Google Sheets:</Text>

                            {/* Spreadsheet Template Table */}
                            <View style={styles.templateTableContainer}>
                                <View style={styles.templateTableHeader}>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>Debt Name</Text>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>Creditor</Text>
                                    <Text style={styles.templateTableCell}>Original Amount</Text>
                                    <Text style={styles.templateTableCell}>Current Balance</Text>
                                    <Text style={styles.templateTableCell}>Interest Rate</Text>
                                    <Text style={styles.templateTableCell}>Monthly Payment</Text>
                                    <Text style={styles.templateTableCell}>Next Due Date</Text>
                                    <Text style={styles.templateTableCell}>Secured By?</Text>
                                </View>

                                {/* Example rows */}
                                <View style={styles.templateTableRow}>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>Term Loan</Text>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>First Bank</Text>
                                    <Text style={styles.templateTableCell}>{currency}100,000</Text>
                                    <Text style={styles.templateTableCell}>{currency}72,000</Text>
                                    <Text style={styles.templateTableCell}>8.5%</Text>
                                    <Text style={styles.templateTableCell}>{currency}2,100</Text>
                                    <Text style={styles.templateTableCell}>6/15/2026</Text>
                                    <Text style={styles.templateTableCell}>Equipment</Text>
                                </View>

                                <View style={styles.templateTableRow}>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>Credit Card</Text>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>Chase</Text>
                                    <Text style={styles.templateTableCell}>{currency}15,000</Text>
                                    <Text style={styles.templateTableCell}>{currency}12,500</Text>
                                    <Text style={styles.templateTableCell}>22%</Text>
                                    <Text style={styles.templateTableCell}>{currency}375 (min)</Text>
                                    <Text style={styles.templateTableCell}>6/5/2026</Text>
                                    <Text style={styles.templateTableCell}>Unsecured</Text>
                                </View>

                                <View style={styles.templateTableRow}>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>Supplier</Text>
                                    <Text style={[styles.templateTableCell, { flex: 1 }]}>ABC Materials</Text>
                                    <Text style={styles.templateTableCell}>{currency}8,000</Text>
                                    <Text style={styles.templateTableCell}>{currency}8,000</Text>
                                    <Text style={styles.templateTableCell}>0% (net 30)</Text>
                                    <Text style={styles.templateTableCell}>{currency}8,000</Text>
                                    <Text style={styles.templateTableCell}>6/10/2026</Text>
                                    <Text style={styles.templateTableCell}>Unsecured</Text>
                                </View>
                            </View>

                            <Text style={styles.informationSubtitle}>Your digital debt inventory is shown below:</Text>

                            {/* Debt Inventory Table */}
                            <View style={styles.tableContainer}>
                                <View style={styles.tableHeader}>
                                    <Text style={[styles.tableCell, { flex: 1 }]}>Debt Name</Text>
                                    <Text style={[styles.tableCell, { flex: 1 }]}>Creditor</Text>
                                    <Text style={styles.tableCell}>Original Amount</Text>
                                    <Text style={styles.tableCell}>Current Balance</Text>
                                    <Text style={styles.tableCell}>Interest Rate</Text>
                                    <Text style={styles.tableCell}>Monthly Payment</Text>
                                    <Text style={styles.tableCell}>Next Due Date</Text>
                                    <Text style={styles.tableCell}>Frequency</Text>
                                    <Text style={styles.tableCell}>Secured By?</Text>
                                    <Text style={styles.tableCell}>Actions</Text>
                                </View>

                                {debtsWithMetrics.map((debt, index) => (
                                    <View key={debt.id} style={styles.tableRow}>
                                        <Text style={[styles.tableCell, { flex: 1 }]}>{debt.type}</Text>
                                        <Text style={[styles.tableCell, { flex: 1 }]}>{debt.lender}</Text>
                                        <Text style={styles.tableCell}>{currency}{debt.originalAmount.toLocaleString()}</Text>
                                        <Text style={styles.tableCell}>{currency}{debt.currentBalance.toLocaleString()}</Text>
                                        <Text style={styles.tableCell}>{debt.interestRate}%</Text>
                                        <Text style={styles.tableCell}>{currency}{debt.monthlyPayment.toLocaleString()}</Text>
                                        <Text style={styles.tableCell}>{debt.nextDueDate.split('-').reverse().join('-')}</Text>
                                        <Text style={styles.tableCell}>{debt.paymentFrequency}</Text>
                                        <Text style={styles.tableCell}>{debt.securedBy}</Text>
                                        <TouchableOpacity
                                            style={styles.deleteButton}
                                            onPress={() => deleteDebt(debt.id)}
                                        >
                                            <Text style={styles.deleteButtonText}>X</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}

                                <View style={[styles.tableRow, styles.totalRow]}>
                                    <Text style={[styles.tableCell, { flex: 2, fontWeight: 'bold' }]}>Total</Text>
                                    <Text style={[styles.tableCell, { fontWeight: 'bold' }]}></Text>
                                    <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{currency}{debts.reduce((sum, d) => sum + d.originalAmount, 0).toLocaleString()}</Text>
                                    <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{currency}{totalDebt.toLocaleString()}</Text>
                                    <Text style={styles.tableCell}></Text>
                                    <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{currency}{debts.reduce((sum, d) => sum + d.monthlyPayment, 0).toLocaleString()}</Text>
                                    <Text style={styles.tableCell}></Text>
                                    <Text style={styles.tableCell}></Text>
                                    <Text style={styles.tableCell}></Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 1.3: Calculate Key Metrics (Day 3) */}
                        <View style={styles.metricsSection}>
                            <Text style={styles.informationTitle}>Step 1.3: Calculate Key Metrics (Day 3)</Text>
                            <Text style={styles.informationSubtitle}>Add these calculated columns to your spreadsheet:</Text>

                            <View style={styles.metricsTable}>
                                <View style={styles.metricsTableHeader}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Calculated Metric</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>Formula</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>What It Tells You</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Days Past Due</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>Today - Due Date</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Urgency of payment</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Interest per Month</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>Balance × (Rate ÷ 12)</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Cost of carrying debt</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Time to Payoff</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>Balance ÷ Monthly Payment</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>How long this debt will remain</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Debt Service Coverage</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>Monthly Net Profit ÷ Total Monthly Payments</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.2 }]}>Can you afford all payments?</Text>
                                </View>
                            </View>

                            <Text style={styles.exampleTitle}>Example Calculation:</Text>
                            <View style={styles.exampleBox}>
                                <Text style={styles.exampleText}>Monthly Net Profit: {currency}{(finance.assets - finance.liabilities).toLocaleString()}</Text>
                                <Text style={styles.exampleText}>Total Monthly Payments: {currency}{totalMonthlyPayments.toLocaleString()}</Text>
                                <Text style={styles.exampleText}>Debt Service Coverage = {currency}{(finance.assets - finance.liabilities).toLocaleString()} ÷ {currency}{totalMonthlyPayments.toLocaleString()} = {debtServiceCoverageRatio.toFixed(2)}x</Text>

                                <Text style={styles.interpretationTitle}>Interpretation:</Text>
                                <Text style={styles.interpretationText}>• {'>'} 1.25x = Healthy</Text>
                                <Text style={styles.interpretationText}>• 1.0x - 1.25x = Warning zone (you're barely covering)</Text>
                                <Text style={styles.interpretationText}>• {'<'} 1.0x = Crisis (you cannot pay all debts)</Text>
                            </View>

                            {/* Actual calculated metrics */}
                            <View style={styles.calculatedMetricsContainer}>
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Debt-to-Equity Ratio</Text>
                                    <Text style={[
                                        styles.metricValue,
                                        debtToEquityRatio > 1 ? styles.ratioHigh : styles.ratioNormal
                                    ]}>
                                        {(debtToEquityRatio * 100).toFixed(1)}%
                                    </Text>
                                    <Text style={styles.metricDescription}>
                                        Formula: Total Debt ÷ Equity. Indicates leverage level.
                                    </Text>
                                </View>

                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Debt Service Coverage</Text>
                                    <Text style={[
                                        styles.metricValue,
                                        debtServiceCoverageRatio < 1.1 ? styles.ratioHigh : styles.ratioNormal
                                    ]}>
                                        {debtServiceCoverageRatio.toFixed(2)}x
                                    </Text>
                                    <Text style={styles.metricDescription}>
                                        Formula: Available Cash ÷ Total Monthly Payments. Shows ability to cover payments.
                                    </Text>
                                </View>

                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Avg. Interest Rate</Text>
                                    <Text style={styles.metricValue}>
                                        {((debts.reduce((sum, d) => sum + (d.interestRate * d.currentBalance), 0) / totalDebt) || 0).toFixed(1)}%
                                    </Text>
                                    <Text style={styles.metricDescription}>
                                        Weighted average of all interest rates.
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 1.4: Identify Red Flags */}
                        <View style={styles.redFlagsSection}>
                            <Text style={styles.informationTitle}>Step 1.4: Identify Red Flags</Text>

                            <View style={styles.redFlagsTable}>
                                <View style={styles.redFlagsTableHeader}>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Red Flag</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 0.7 }]}>Threshold</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Action Required</Text>
                                </View>

                                <View style={styles.redFlagsTableRow}>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Debt Service Coverage</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 0.7 }]}> {'<'} 1.1x</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Immediate strategy required (Stage 3)</Text>
                                </View>

                                <View style={styles.redFlagsTableRow}>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Any debt {'>'} 60 days past due</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 0.7 }]}>Yes</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Call creditor TODAY</Text>
                                </View>

                                <View style={styles.redFlagsTableRow}>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Interest rate {'>'} 15%</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 0.7 }]}>Yes</Text>
                                    <Text style={[styles.redFlagsTableCell, { flex: 1 }]}>Prioritize for refinancing or avalanche method</Text>
                                </View>
                            </View>

                            <View style={styles.redFlagContainer}>
                                <View style={[
                                    styles.redFlagItem,
                                    debtServiceCoverageRatio < 1.1 ? styles.redFlagWarning : styles.redFlagOk
                                ]}>
                                    <Text style={styles.redFlagText}>
                                        {debtServiceCoverageRatio < 1.1
                                            ? `⚠️ Debt Service Coverage: ${debtServiceCoverageRatio.toFixed(2)}x (Below threshold)`
                                            : `✓ Debt Service Coverage: ${debtServiceCoverageRatio.toFixed(2)}x (Above threshold)`}
                                    </Text>
                                </View>

                                <View style={[
                                    styles.redFlagItem,
                                    debts.some(d => d.daysPastDue && d.daysPastDue > 60) ? styles.redFlagWarning : styles.redFlagOk
                                ]}>
                                    <Text style={styles.redFlagText}>
                                        {debts.some(d => d.daysPastDue && d.daysPastDue > 60)
                                            ? `⚠️ Debts >60 days past due: ${debts.filter(d => d.daysPastDue && d.daysPastDue > 60).length}`
                                            : `✓ All debts current or less than 60 days past due`}
                                    </Text>
                                </View>

                                <View style={[
                                    styles.redFlagItem,
                                    debts.some(d => d.interestRate > 15) ? styles.redFlagWarning : styles.redFlagOk
                                ]}>
                                    <Text style={styles.redFlagText}>
                                        {debts.some(d => d.interestRate > 15)
                                            ? `⚠️ High interest debts >15%: ${debts.filter(d => d.interestRate > 15).length}`
                                            : `✓ No high interest debts >15%`}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 1.5: Output from Stage 1 */}
                        <View style={styles.outputSection}>
                            <Text style={styles.informationTitle}>Step 1.5: Output from Stage 1</Text>
                            <Text style={styles.informationSubtitle}>Deliverable: A completed Debt Inventory Spreadsheet with:</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>All debts listed</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Key metrics calculated</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Red flags identified</Text>
                                </View>
                            </View>
                        </View>

                        {/* Add New Debt Section */}
                        <View style={styles.addDebtForm}>
                            <Text style={styles.formTitle}>Add New Debt to Inventory</Text>

                            <View style={styles.formRow}>
                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Debt Type</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.type}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, type: text })}
                                        placeholder="e.g., Business Loan"
                                    />
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Lender</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.lender}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, lender: text })}
                                        placeholder="e.g., Local Bank"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Original Amount ({currency})</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.originalAmount}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, originalAmount: text })}
                                        placeholder="e.g., 100000"
                                        keyboardType="numeric"
                                    />
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Current Balance ({currency})</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.currentBalance}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, currentBalance: text })}
                                        placeholder="e.g., 72000"
                                        keyboardType="numeric"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Interest Rate (%)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.interestRate}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, interestRate: text })}
                                        placeholder="e.g., 8.5"
                                        keyboardType="numeric"
                                    />
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Monthly Payment</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.monthlyPayment}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, monthlyPayment: text })}
                                        placeholder="e.g., 2100"
                                        keyboardType="numeric"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Next Due Date</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.nextDueDate}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, nextDueDate: text })}
                                        placeholder="e.g., 2026-06-15"
                                    />
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Secured By</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.securedBy}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, securedBy: text })}
                                        placeholder="e.g., Equipment, Unsecured"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Payment Frequency</Text>
                                    <View style={styles.input}>
                                        <TextInput
                                            style={{ color: '#f8fafc', fontSize: 12 }}
                                            value={newDebt.paymentFrequency}
                                            onChangeText={(text) => setNewDebt({ ...newDebt, paymentFrequency: text as any })}
                                            placeholder="e.g., monthly"
                                        />
                                    </View>
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Last Payment Date</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.lastPaymentDate}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, lastPaymentDate: text })}
                                        placeholder="e.g., 2026-05-15"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Maturity Date</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.maturityDate}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, maturityDate: text })}
                                        placeholder="e.g., 2031-06-15"
                                    />
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Collateral</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.collateral}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, collateral: text })}
                                        placeholder="e.g., Equipment, Real Estate"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Covenant Requirements</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.covenantRequirements}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, covenantRequirements: text })}
                                        placeholder="e.g., Debt-to-equity ratio below 0.5"
                                    />
                                </View>

                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Notes</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={newDebt.notes}
                                        onChangeText={(text) => setNewDebt({ ...newDebt, notes: text })}
                                        placeholder="Additional details"
                                    />
                                </View>
                            </View>

                            <View style={styles.formRow}>
                                <View style={[styles.formGroup, styles.formGroupLastChild]}>
                                    <Text style={styles.label}>Early Payment Penalty</Text>
                                    <TouchableOpacity
                                        style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                        onPress={() => setNewDebt({ ...newDebt, earlyPaymentPenalty: !newDebt.earlyPaymentPenalty })}
                                    >
                                        <Text style={{ color: '#f8fafc', fontSize: 12 }}>
                                            {newDebt.earlyPaymentPenalty ? 'Yes' : 'No'}
                                        </Text>
                                        <View style={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: 10,
                                            backgroundColor: newDebt.earlyPaymentPenalty ? '#10b981' : '#64748b',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {newDebt.earlyPaymentPenalty && (
                                                <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: 'bold' }}>✓</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.addButton} onPress={addDebt}>
                                <Text style={styles.addButtonText}>Add Debt</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>

            {/* Stage 2: Prioritization */}
            <View style={styles.stageCard}>
                <TouchableOpacity
                    style={styles.stageHeader}
                    onPress={() => toggleSection('prioritization')}
                >
                    <Text style={styles.stageTitle}>🎯 Stage 2: Prioritization – Rank Debts in Order of Payment Urgency</Text>
                    <Text style={styles.expandIcon}>{expandedSections.prioritization ? '−' : '+'}</Text>
                </TouchableOpacity>

                {expandedSections.prioritization && (
                    <View style={styles.stageContent}>
                        <Text style={styles.sectionDescription}>
                            Objective: Rank debts in order of payment urgency
                        </Text>

                        {/* Step 2.1: Apply the SME Debt Priority Matrix */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 2.1: Apply the SME Debt Priority Matrix</Text>
                            <Text style={styles.informationSubtitle}>Score each debt using this system:</Text>

                            <View style={styles.priorityMatrixTable}>
                                <View style={styles.priorityMatrixTableHeader}>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.8 }]}>Priority Level</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.5 }]}>Score</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1.2 }]}>Debt Types</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1 }]}>Action</Text>
                                </View>

                                <View style={styles.priorityMatrixTableRow}>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.8 }]}>P0 (Critical)</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.5 }]}>5</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1.2 }]}>Payroll, taxes, secured debt with asset at risk</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1 }]}>Pay immediately — no exceptions</Text>
                                </View>

                                <View style={styles.priorityMatrixTableRow}>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.8 }]}>P1 (Urgent)</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.5 }]}>4</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1.2 }]}>Supplier 60+ days past due, utilities, rent</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1 }]}>Pay within 7 days</Text>
                                </View>

                                <View style={styles.priorityMatrixTableRow}>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.8 }]}>P2 (High)</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.5 }]}>3</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1.2 }]}>Credit cards (high interest), equipment leases</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1 }]}>Pay within 30 days, prioritize for avalanche</Text>
                                </View>

                                <View style={styles.priorityMatrixTableRow}>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.8 }]}>P3 (Medium)</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.5 }]}>2</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1.2 }]}>Bank term loans (current), supplier net 30 terms</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1 }]}>Pay on schedule</Text>
                                </View>

                                <View style={styles.priorityMatrixTableRow}>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.8 }]}>P4 (Low)</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 0.5 }]}>1</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1.2 }]}>Owner loans, low-interest debt, long-term debt</Text>
                                    <Text style={[styles.priorityMatrixTableCell, { flex: 1 }]}>Pay minimum, consider deferring</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 2.2: Rank Each Debt in Your Inventory */}
                        <View style={styles.spreadsheetSection}>
                            <Text style={styles.informationTitle}>Step 2.2: Rank Each Debt in Your Inventory</Text>
                            <Text style={styles.informationSubtitle}>Add a "Priority Score" column to your spreadsheet. Score each debt 1-5.</Text>

                            {/* Example table */}
                            <View style={styles.exampleTableContainer}>
                                <View style={styles.exampleTableHeader}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Debt</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Balance</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Interest Rate</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Past Due?</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>Priority Score</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>Rank</Text>
                                </View>

                                <View style={styles.exampleTableRow}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Payroll (weekly)</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>{currency}18,000</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>N/A</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Due tomorrow</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>5</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>1</Text>
                                </View>

                                <View style={styles.exampleTableRow}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Rent</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>{currency}5,000</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>N/A</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Due in 3 days</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>4</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>2</Text>
                                </View>

                                <View style={styles.exampleTableRow}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Supplier ABC (90 days)</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>{currency}8,000</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>0% (but frozen credit)</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>90 days</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>4</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>3</Text>
                                </View>

                                <View style={styles.exampleTableRow}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Credit Card</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>{currency}12,500</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>22%</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Current</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>3</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>4</Text>
                                </View>

                                <View style={styles.exampleTableRow}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Bank Term Loan</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>{currency}72,000</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>8.5%</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Current</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>2</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>5</Text>
                                </View>

                                <View style={styles.exampleTableRow}>
                                    <Text style={[styles.exampleTableCell, { flex: 1.2 }]}>Owner Loan</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>{currency}20,000</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>4%</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.8 }]}>Current</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>1</Text>
                                    <Text style={[styles.exampleTableCell, { flex: 0.6 }]}>6</Text>
                                </View>
                            </View>

                            {/* Actual debt prioritization */}
                            <Text style={styles.informationSubtitle}>Your debt prioritization:</Text>

                            {debtsWithPriority.map((debt, index) => (
                                <View key={debt.id} style={styles.debtPriorityItem}>
                                    <Text style={styles.debtPriorityText}>
                                        {index + 1}. {debt.type} - {currency}{debt.currentBalance.toLocaleString()}
                                        ({debt.interestRate}%) - Priority: {debt.priorityScore}/5
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* Step 2.3: Choose Repayment Method */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 2.3: Choose Repayment Method</Text>
                            <Text style={styles.informationSubtitle}>Based on your priorities, choose one of these two methods:</Text>

                            <View style={styles.methodComparisonTable}>
                                <View style={styles.methodComparisonTableHeader}>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Method</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1.5 }]}>How It Works</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Best For</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Example</Text>
                                </View>

                                <View style={styles.methodComparisonTableRow}>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Avalanche (Mathematical)</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1.5 }]}>Pay highest interest rate first</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Saving the most money on interest</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Pay credit card (22%) before term loan (8.5%)</Text>
                                </View>

                                <View style={styles.methodComparisonTableRow}>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Snowball (Psychological)</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1.5 }]}>Pay smallest balance first</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Building momentum and motivation</Text>
                                    <Text style={[styles.methodComparisonTableCell, { flex: 1 }]}>Pay {currency}8k supplier before {currency}72k term loan</Text>
                                </View>
                            </View>

                            <Text style={styles.methodDecisionRule}>
                                Decision rule:
                                {'\n'}If your debt service coverage {'>'} 1.1x → Use <Text style={styles.boldText}>Avalanche</Text> (you can afford to optimize)
                                {'\n'}If your debt service coverage {'<'} 1.1x → Use <Text style={styles.boldText}>Snowball</Text> (you need quick wins to free up cash flow)
                            </Text>

                            {/* Repayment Method Selection */}
                            <View style={styles.repaymentMethodContainer}>
                                <Text style={styles.toolTitle}>Your Recommended Repayment Method</Text>
                                <Text style={styles.toolDescription}>
                                    {debtServiceCoverageRatio > 1.1
                                        ? "Your debt service coverage ratio is healthy (>1.1x). Use the mathematical approach to save money on interest."
                                        : "Your debt service coverage ratio is tight (<1.1x). Use the psychological approach to build momentum."}
                                </Text>

                                <View style={styles.methodSelection}>
                                    <TouchableOpacity
                                        style={[
                                            styles.methodButton,
                                            repaymentMethod === 'avalanche' && styles.methodButtonSelected
                                        ]}
                                        onPress={() => setRepaymentMethod('avalanche')}
                                    >
                                        <Text style={[
                                            styles.methodButtonText,
                                            repaymentMethod === 'avalanche' && styles.methodButtonTextSelected
                                        ]}>Avalanche Method</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.methodButton,
                                            repaymentMethod === 'snowball' && styles.methodButtonSelected
                                        ]}
                                        onPress={() => setRepaymentMethod('snowball')}
                                    >
                                        <Text style={[
                                            styles.methodButtonText,
                                            repaymentMethod === 'snowball' && styles.methodButtonTextSelected
                                        ]}>Snowball Method</Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.methodExplanation}>
                                    {repaymentMethod === 'avalanche'
                                        ? "Pay highest interest rate debts first - saves the most money on interest"
                                        : "Pay smallest balance debts first - builds momentum and motivation"}
                                </Text>
                            </View>
                        </View>

                        {/* Step 2.4: Create Payment Schedule for Next 90 Days */}
                        <View style={styles.spreadsheetSection}>
                            <Text style={styles.informationTitle}>Step 2.4: Create Payment Schedule for Next 90 Days</Text>
                            <Text style={styles.informationSubtitle}>Map every payment due in the next 90 days:</Text>

                            <View style={styles.paymentScheduleTable}>
                                <View style={styles.paymentScheduleTableHeader}>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Week</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 1.2 }]}>Debt</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Payment Due</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Minimum Required</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Can You Pay More?</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.6 }]}>Priority Score</Text>
                                </View>

                                {debtsWithPriority.slice(0, 6).map((debt, index) => (
                                    <View key={`schedule-${debt.id}`} style={styles.paymentScheduleTableRow}>
                                        <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Week {index + 1}</Text>
                                        <Text style={[styles.paymentScheduleTableCell, { flex: 1.2 }]}>{debt.type}</Text>
                                        <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}{debt.monthlyPayment.toLocaleString()}</Text>
                                        <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}{debt.monthlyPayment.toLocaleString()}</Text>
                                        <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>No</Text>
                                        <Text style={[styles.paymentScheduleTableCell, { flex: 0.6 }]}>{debt.priorityScore}</Text>
                                    </View>
                                ))}

                                {/* Example entries to show the concept */}
                                <View style={styles.paymentScheduleTableRow}>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Week 1</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 1.2 }]}>Payroll</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}18,000</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}18,000</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>No</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.6 }]}>5</Text>
                                </View>
                                <View style={styles.paymentScheduleTableRow}>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Week 1</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 1.2 }]}>Rent</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}5,000</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}5,000</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>No</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.6 }]}>4</Text>
                                </View>
                                <View style={styles.paymentScheduleTableRow}>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Week 2</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 1.2 }]}>Credit Card</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}375</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>{currency}375</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.8 }]}>Yes (+{currency}500)</Text>
                                    <Text style={[styles.paymentScheduleTableCell, { flex: 0.6 }]}>3</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 2.5: Output from Stage 2 */}
                        <View style={styles.outputSection}>
                            <Text style={styles.informationTitle}>Step 2.5: Output from Stage 2</Text>
                            <Text style={styles.informationSubtitle}>Deliverables:</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Priority Score for each debt (1-5)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Selected repayment method (Avalanche or Snowball)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>90-day payment schedule</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
            </View>

            {/* Stage 3: Strategy */}
            <View style={styles.stageCard}>
                <TouchableOpacity
                    style={styles.stageHeader}
                    onPress={() => toggleSection('strategy')}
                >
                    <Text style={styles.stageTitle}>🛠️ Stage 3: Strategy – Choose a Path Forward</Text>
                    <Text style={styles.expandIcon}>{expandedSections.strategy ? '−' : '+'}</Text>
                </TouchableOpacity>

                {expandedSections.strategy && (
                    <View style={styles.stageContent}>
                        <Text style={styles.sectionDescription}>
                            Objective: Choose optimal approach for each debt based on your situation
                        </Text>

                        {/* Step 3.1: Diagnose Your Debt Situation */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 3.1: Diagnose Your Debt Situation</Text>
                            <Text style={styles.informationSubtitle}>Answer these 5 questions honestly:</Text>

                            <View style={styles.diagnosisTable}>
                                <View style={styles.diagnosisTableHeader}>
                                    <Text style={[styles.diagnosisTableCell, { flex: 2 }]}>Question</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>Yes</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>No</Text>
                                </View>

                                <View style={styles.diagnosisTableRow}>
                                    <Text style={[styles.diagnosisTableCell, { flex: 2 }]}>Can you make all minimum payments this month?</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                </View>

                                <View style={styles.diagnosisTableRow}>
                                    <Text style={[styles.diagnosisTableCell, { flex: 2 }]}>Is your debt service coverage {'>'} 1.1x?</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                </View>

                                <View style={styles.diagnosisTableRow}>
                                    <Text style={[styles.diagnosisTableCell, { flex: 2 }]}>Do you have any debt {'>'} 90 days past due?</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                </View>

                                <View style={styles.diagnosisTableRow}>
                                    <Text style={[styles.diagnosisTableCell, { flex: 2 }]}>Have any creditors called demanding payment?</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                </View>

                                <View style={styles.diagnosisTableRow}>
                                    <Text style={[styles.diagnosisTableCell, { flex: 2 }]}>Have you used personal funds to cover business debt?</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                    <Text style={[styles.diagnosisTableCell, { flex: 0.5, textAlign: 'center' }]}>☐</Text>
                                </View>
                            </View>

                            <Text style={styles.informationSubtitle}>Diagnosis based on answers:</Text>

                            <View style={styles.diagnosisPatternTable}>
                                <View style={styles.diagnosisPatternTableHeader}>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>Pattern</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>Diagnosis</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1.5 }]}>Recommended Strategy</Text>
                                </View>

                                <View style={styles.diagnosisPatternTableRow}>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>All "Yes", except past due</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>Healthy</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1.5 }]}>Refinance & Optimize</Text>
                                </View>

                                <View style={styles.diagnosisPatternTableRow}>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>3-4 "Yes", 1-2 "No"</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>Strained</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1.5 }]}>Restructure & Negotiate</Text>
                                </View>

                                <View style={styles.diagnosisPatternTableRow}>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>2 or fewer "Yes"</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1 }]}>Crisis</Text>
                                    <Text style={[styles.diagnosisPatternTableCell, { flex: 1.5 }]}>Formal intervention needed</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 3.2: Strategy A — Refinance & Optimize (Healthy Situation) */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 3.2: Strategy A — Refinance & Optimize (Healthy Situation)</Text>
                            <Text style={styles.goalText}>Goal: Lower interest rates and reduce monthly payments</Text>

                            <Text style={styles.subSectionTitle}>Action Plan:</Text>

                            <View style={styles.actionPlanTable}>
                                <View style={styles.actionPlanTableHeader}>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.3 }]}>Step</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1.2 }]}>Action</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.5 }]}>Time</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1 }]}>Expected Result</Text>
                                </View>

                                <View style={styles.actionPlanTableRow}>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.3 }]}>1</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1.2 }]}>Check credit score (business and personal)</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.5 }]}>1 day</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1 }]}>Know your position</Text>
                                </View>

                                <View style={styles.actionPlanTableRow}>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.3 }]}>2</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1.2 }]}>Contact 2-3 lenders for refinance quotes</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.5 }]}>2 days</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1 }]}>Compare offers</Text>
                                </View>

                                <View style={styles.actionPlanTableRow}>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.3 }]}>3</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1.2 }]}>Calculate break-even on refinance fees</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.5 }]}>1 day</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1 }]}>Ensure savings {'>'} fees</Text>
                                </View>

                                <View style={styles.actionPlanTableRow}>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.3 }]}>4</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1.2 }]}>Apply for best refinance option</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.5 }]}>3-5 days</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1 }]}>New loan with better terms</Text>
                                </View>

                                <View style={styles.actionPlanTableRow}>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.3 }]}>5</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1.2 }]}>Pay off high-interest debts with new loan</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 0.5 }]}>1 day</Text>
                                    <Text style={[styles.actionPlanTableCell, { flex: 1 }]}>Consolidated, lower rate</Text>
                                </View>
                            </View>

                            <Text style={styles.subSectionTitle}>Refinance Checklist:</Text>
                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Gather last 2 years of financial statements</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Prepare year-to-date P&L</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Have 3 months of bank statements ready</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Know your current credit score</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Prepare a 1-page business summary (revenue, profit, industry)</Text>
                                </View>
                            </View>

                            <Text style={styles.subSectionTitle}>Example Refinance Calculation:</Text>
                            <View style={styles.calculationComparisonTable}>
                                <View style={styles.calculationComparisonTableHeader}>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Before Refinance</Text>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>After Refinance</Text>
                                </View>

                                <View style={styles.calculationComparisonTableRow}>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Credit Card: {currency}15k @ 22% → {currency}275/mo interest</Text>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>New Loan: {currency}85k @ 9%</Text>
                                </View>

                                <View style={styles.calculationComparisonTableRow}>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Term Loan: {currency}50k @ 12% → {currency}500/mo interest</Text>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Monthly payment: {currency}1,500</Text>
                                </View>

                                <View style={styles.calculationComparisonTableRow}>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Equipment: {currency}20k @ 10% → {currency}167/mo interest</Text>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Interest saved: ~{currency}300/month</Text>
                                </View>

                                <View style={styles.calculationComparisonTableRow}>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Total monthly interest: {currency}942</Text>
                                    <Text style={[styles.calculationComparisonTableCell, { flex: 1 }]}>Net benefit: +{currency}300/month cash flow</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 3.3: Strategy B — Restructure & Negotiate (Strained Situation) */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 3.3: Strategy B — Restructure & Negotiate (Strained Situation)</Text>
                            <Text style={styles.goalText}>Goal: Reduce monthly payments and avoid default</Text>

                            <Text style={styles.subSectionTitle}>Action Plan by Debt Type:</Text>

                            <View style={styles.negotiationTacticsTable}>
                                <View style={styles.negotiationTacticsTableHeader}>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1 }]}>Debt Type</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Negotiation Tactic</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>What to Ask For</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 0.8 }]}>Success Rate</Text>
                                </View>

                                <View style={styles.negotiationTacticsTableRow}>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1 }]}>Bank loan</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Formal modification</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Extend term (5→7 years), lower rate, payment holiday</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 0.8 }]}>Medium (60%)</Text>
                                </View>

                                <View style={styles.negotiationTacticsTableRow}>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1 }]}>Credit card</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Call and ask</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Lower APR (22%→12%), waive late fees</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 0.8 }]}>High (80% if current)</Text>
                                </View>

                                <View style={styles.negotiationTacticsTableRow}>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1 }]}>Supplier/vendor</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Personal conversation</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>60-day extension, partial payment plan</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 0.8 }]}>High (if honest)</Text>
                                </View>

                                <View style={styles.negotiationTacticsTableRow}>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1 }]}>Equipment lease</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Request deferral</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>Skip 2 payments, add to end of term</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 0.8 }]}>Medium</Text>
                                </View>

                                <View style={styles.negotiationTacticsTableRow}>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1 }]}>Tax authority</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>File extension or payment plan</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 1.5 }]}>6-12 month installment agreement</Text>
                                    <Text style={[styles.negotiationTacticsTableCell, { flex: 0.8 }]}>High (by law)</Text>
                                </View>
                            </View>

                            <Text style={styles.subSectionTitle}>The Script for Negotiation (use exactly):</Text>
                            <View style={styles.scriptBox}>
                                <Text style={styles.scriptText}>
                                    "Hello [Name], this is [Your Name] from [Business Name]. We value our relationship with you.{'\n'}
                                    Here's the situation: Our revenue is currently [X%] below normal due to [specific reason]. We want to pay you in full, but we need temporary relief.{'\n'}
                                    <Text style={styles.boldText}>Specifically, we are requesting [specific request: e.g., extend payment by 60 days / reduce payment to $X for 3 months].</Text>{'\n'}
                                    We can provide financial statements to verify our situation. Can we make this work?"
                                </Text>
                            </View>

                            <Text style={styles.subSectionTitle}>Documentation to Prepare Before Calling:</Text>
                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Current P&L (last 3 months)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Cash flow forecast (next 13 weeks)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Debt inventory (to show full picture)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Specific payment proposal (e.g., "${currency}2,000 now, {currency}3,000 in 60 days")</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 3.4: Strategy C — Formal Intervention (Crisis Situation) */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 3.4: Strategy C — Formal Intervention (Crisis Situation)</Text>
                            <Text style={styles.warningText}>Warning signs that trigger this path:</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Creditors have filed lawsuits or liens</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>You cannot make payroll</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Debt service coverage {'<'} 0.8x for 2+ months</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Personal guarantees being called</Text>
                                </View>
                            </View>

                            <Text style={styles.subSectionTitle}>Action Plan:</Text>

                            <View style={styles.crisisActionPlanTable}>
                                <View style={styles.crisisActionPlanTableHeader}>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.3 }]}>Step</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 1.5 }]}>Action</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.5 }]}>Timeline</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.7 }]}>Cost</Text>
                                </View>

                                <View style={styles.crisisActionPlanTableRow}>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.3 }]}>1</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 1.5 }]}>Consult with a debt restructuring attorney</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.5 }]}>Day 1</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.7 }]}>${currency}300-500 for initial consult</Text>
                                </View>

                                <View style={styles.crisisActionPlanTableRow}>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.3 }]}>2</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 1.5 }]}>File for formal protection (Chapter 11 or equivalent)</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.5 }]}>Days 2-7</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.7 }]}>${currency}3,000-10,000</Text>
                                </View>

                                <View style={styles.crisisActionPlanTableRow}>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.3 }]}>3</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 1.5 }]}>Automatic stay halts all collection</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.5 }]}>Immediate upon filing</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.7 }]}>Included</Text>
                                </View>

                                <View style={styles.crisisActionPlanTableRow}>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.3 }]}>4</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 1.5 }]}>Develop reorganization plan (with attorney)</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.5 }]}>30-90 days</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.7 }]}>${currency}5,000-20,000</Text>
                                </View>

                                <View style={styles.crisisActionPlanTableRow}>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.3 }]}>5</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 1.5 }]}>Negotiate with creditors under court protection</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.5 }]}>60-120 days</Text>
                                    <Text style={[styles.crisisActionPlanTableCell, { flex: 0.7 }]}>Included</Text>
                                </View>
                            </View>

                            <Text style={styles.subSectionTitle}>Alternative to bankruptcy (if creditors agree):</Text>
                            <Text style={styles.informationText}>
                                <Text style={styles.boldText}>Assignment for the Benefit of Creditors (ABC)</Text> — A state-law alternative to bankruptcy that is often:
                            </Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Faster (30-60 days vs 6-12 months)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>Cheaper (${currency}5k-15k vs ${currency}15k-50k)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>•</Text>
                                    <Text style={styles.checklistText}>More private (not public record in some states)</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 3.5: Output from Stage 3 */}
                        <View style={styles.outputSection}>
                            <Text style={styles.informationTitle}>Step 3.5: Output from Stage 3</Text>
                            <Text style={styles.informationSubtitle}>Deliverables:</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Diagnosis of debt situation (Healthy / Strained / Crisis)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Selected strategy document with action steps</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Negotiation scripts prepared</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Lender/supplier contact list prioritized</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
            </View>

            {/* Stage 4: Execution */}
            <View style={styles.stageCard}>
                <TouchableOpacity
                    style={styles.stageHeader}
                    onPress={() => toggleSection('execution')}
                >
                    <Text style={styles.stageTitle}>🚀 Stage 4: Execution – Free Up Cash Flow</Text>
                    <Text style={styles.expandIcon}>{expandedSections.execution ? '−' : '+'}</Text>
                </TouchableOpacity>

                {expandedSections.execution && (
                    <View style={styles.stageContent}>
                        <Text style={styles.sectionDescription}>
                            Objective: Free up cash flow and implement repayment plan
                        </Text>

                        {/* Step 4.1: Create 13-Week Cash Flow Forecast */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 4.1: Create 13-Week Cash Flow Forecast</Text>
                            <Text style={styles.informationText}>This is the single most important tool for debt execution. Update it weekly.</Text>

                            <Text style={styles.subSectionTitle}>13-Week Cash Flow Forecast</Text>

                            <View style={styles.cashFlowForecastTable}>
                                <View style={styles.cashFlowForecastTableHeader}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Week Ending</Text>
                                    {Array.from({ length: 13 }, (_, i) => {
                                        const date = new Date();
                                        date.setDate(date.getDate() + (i + 1) * 7);
                                        return (
                                            <Text key={`header-${i}`} style={styles.cashFlowForecastTableCell}>
                                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </Text>
                                        );
                                    })}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Starting Cash</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`start-cash-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{(finance.assets - finance.liabilities + i * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableSectionHeader}>
                                    <Text style={[styles.cashFlowForecastTableSectionText, { flex: 1.2 }]}>Inflows</Text>
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Customer collections</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`collections-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round((finance.assets * 0.7) / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Other income</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`other-income-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round(finance.assets * 0.05 / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Total Inflows</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`inflows-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round((finance.assets * 0.75) / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableSectionHeader}>
                                    <Text style={[styles.cashFlowForecastTableSectionText, { flex: 1.2 }]}>Outflows</Text>
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Payroll</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`payroll-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round(finance.liabilities * 0.3 / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Rent</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`rent-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round(finance.liabilities * 0.1 / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Debt payments</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`debt-payments-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round(totalMonthlyPayments / 4).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Suppliers</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`suppliers-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round(finance.liabilities * 0.2 / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Other OpEx</Text>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <Text key={`opex-${i}`} style={styles.cashFlowForecastTableCell}>
                                            {currency}{Math.round(finance.liabilities * 0.15 / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Total Outflows</Text>
                                    {Array.from({ length: 13 }, (_, i) => {
                                        const weeklyOutflow = Math.round((finance.liabilities * 0.75) / 13 + totalMonthlyPayments / 4);
                                        return (
                                            <Text key={`outflows-${i}`} style={styles.cashFlowForecastTableCell}>
                                                {currency}{weeklyOutflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </Text>
                                        );
                                    })}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Net Cash Flow</Text>
                                    {Array.from({ length: 13 }, (_, i) => {
                                        const weeklyInflow = Math.round((finance.assets * 0.75) / 13);
                                        const weeklyOutflow = Math.round((finance.liabilities * 0.75) / 13 + totalMonthlyPayments / 4);
                                        const netFlow = weeklyInflow - weeklyOutflow;

                                        return (
                                            <Text
                                                key={`net-flow-${i}`}
                                                style={[
                                                    styles.cashFlowForecastTableCell,
                                                    { color: netFlow >= 0 ? '#10b981' : '#ef4444' }
                                                ]}
                                            >
                                                {netFlow >= 0 ? `${currency}${netFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `(${currency}${Math.abs(netFlow).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                            </Text>
                                        );
                                    })}
                                </View>

                                <View style={styles.cashFlowForecastTableRow}>
                                    <Text style={[styles.cashFlowForecastTableCell, { flex: 1.2 }]}>Ending Cash</Text>
                                    {Array.from({ length: 13 }, (_, i) => {
                                        const weeklyInflow = Math.round((finance.assets * 0.75) / 13);
                                        const weeklyOutflow = Math.round((finance.liabilities * 0.75) / 13 + totalMonthlyPayments / 4);
                                        const netFlow = weeklyInflow - weeklyOutflow;
                                        const endingCash = (finance.assets - finance.liabilities) + (i + 1) * netFlow;

                                        return (
                                            <Text
                                                key={`ending-cash-${i}`}
                                                style={[
                                                    styles.cashFlowForecastTableCell,
                                                    {
                                                        color: endingCash < 0 ? '#ef4444' :
                                                            endingCash < (finance.assets * 0.2) ? '#f59e0b' :
                                                                '#10b981'
                                                    }
                                                ]}
                                            >
                                                {currency}{endingCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </Text>
                                        );
                                    })}
                                </View>
                            </View>

                            <Text style={styles.informationText}>
                                <Text style={styles.boldText}>Critical rule:</Text> If Ending Cash ever drops below your safety threshold (e.g., 2 weeks of expenses), trigger immediate action.
                            </Text>
                        </View>

                        {/* Step 4.2: Implement Cash Acceleration Tactics */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 4.2: Implement Cash Acceleration Tactics</Text>

                            <View style={styles.tacticsTable}>
                                <View style={styles.tacticsTableHeader}>
                                    <Text style={[styles.tacticsTableCell, { flex: 1 }]}>Tactic</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 1.5 }]}>How to Execute</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.8 }]}>Expected Impact</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.7 }]}>Difficulty</Text>
                                </View>

                                <View style={styles.tacticsTableRow}>
                                    <Text style={[styles.tacticsTableCell, { flex: 1 }]}>Invoice factoring</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 1.5 }]}>Sell receivables at 2-5% discount for immediate cash</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.8 }]}>Get cash in 24-48 hours instead of 30-60 days</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.7 }]}>Low</Text>
                                </View>

                                <View style={styles.tacticsTableRow}>
                                    <Text style={[styles.tacticsTableCell, { flex: 1 }]}>Early payment discounts</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 1.5 }]}>Offer 2% discount for payment within 10 days</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.8 }]}>Accelerates collections by 15-20 days</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.7 }]}>Low</Text>
                                </View>

                                <View style={styles.tacticsTableRow}>
                                    <Text style={[styles.tacticsTableCell, { flex: 1 }]}>Deposit requirements</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 1.5 }]}>Require 50% deposit for large orders</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.8 }]}>Reduces working capital needs</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.7 }]}>Medium</Text>
                                </View>

                                <View style={styles.tacticsTableRow}>
                                    <Text style={[styles.tacticsTableCell, { flex: 1 }]}>Payment terms renegotiation</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 1.5 }]}>Extend supplier terms from net 30 to net 60</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.8 }]}>Frees up 30 days of cash flow</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.7 }]}>Medium</Text>
                                </View>

                                <View style={styles.tacticsTableRow}>
                                    <Text style={[styles.tacticsTableCell, { flex: 1 }]}>Inventory reduction</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 1.5 }]}>Run clearance sale on slow-moving stock</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.8 }]}>Converts inventory to cash</Text>
                                    <Text style={[styles.tacticsTableCell, { flex: 0.7 }]}>Low</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 4.3: Implement Cost Reduction Tactics */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 4.3: Implement Cost Reduction Tactics</Text>

                            <View style={styles.costReductionTable}>
                                <View style={styles.costReductionTableHeader}>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Category</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 1.2 }]}>Tactic</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Monthly Savings Potential</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.7 }]}>Time to Implement</Text>
                                </View>

                                <View style={styles.costReductionTableRow}>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Software</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 1.2 }]}>Cancel unused subscriptions (audit all)</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>{currency}500-2,000</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.7 }]}>2 hours</Text>
                                </View>

                                <View style={styles.costReductionTableRow}>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Rent</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 1.2 }]}>Renegotiate lease or sublease unused space</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>{currency}1,000-5,000</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.7 }]}>2-4 weeks</Text>
                                </View>

                                <View style={styles.costReductionTableRow}>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Supplies</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 1.2 }]}>Negotiate volume discounts or switch vendors</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>{currency}500-2,000</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.7 }]}>1 week</Text>
                                </View>

                                <View style={styles.costReductionTableRow}>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Marketing</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 1.2 }]}>Pause low-ROI channels, double down on high-ROI</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>{currency}1,000-10,000</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.7 }]}>1 day</Text>
                                </View>

                                <View style={styles.costReductionTableRow}>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>Insurance</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 1.2 }]}>Shop rates at renewal</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.8 }]}>{currency}500-2,000</Text>
                                    <Text style={[styles.costReductionTableCell, { flex: 0.7 }]}>2 weeks</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 4.4: Execute the Payment Plan */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 4.4: Execute the Payment Plan</Text>
                            <Text style={styles.informationText}>Based on your priority ranking from Stage 2, execute payments in this order each month:</Text>

                            <Text style={styles.subSectionTitle}>Weekly Payment Routine (every Friday, 30 minutes):</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Review 13-week cash flow forecast (update actuals)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Check which debts are due in next 7 days</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Ensure funds are available for those payments</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Make minimum payments on all P0-P2 debts</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>If extra cash exists, apply avalanche/snowball extra to top priority debt</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>☐</Text>
                                    <Text style={styles.checklistText}>Log all payments in debt inventory</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 4.5: Output from Stage 4 */}
                        <View style={styles.outputSection}>
                            <Text style={styles.informationTitle}>Step 4.5: Output from Stage 4</Text>
                            <Text style={styles.informationSubtitle}>Deliverables:</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>13-week cash flow forecast (updated weekly)</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>List of implemented cash acceleration tactics</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>List of implemented cost reductions</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Weekly payment log</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
            </View>

            {/* Stage 5: Monitoring */}
            <View style={styles.stageCard}>
                <TouchableOpacity
                    style={styles.stageHeader}
                    onPress={() => toggleSection('monitoring')}
                >
                    <Text style={styles.stageTitle}>📊 Stage 5: Monitoring – Stay on Track and Adjust</Text>
                    <Text style={styles.expandIcon}>{expandedSections.monitoring ? '−' : '+'}</Text>
                </TouchableOpacity>

                {expandedSections.monitoring && (
                    <View style={styles.stageContent}>
                        <Text style={styles.sectionDescription}>
                            Objective: Stay on track and adjust before problems arise
                        </Text>

                        {/* Step 5.1: Weekly Debt Health Check */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 5.1: Weekly Debt Health Check (30 minutes every Friday)</Text>

                            <View style={styles.metricsTable}>
                                <View style={styles.metricsTableHeader}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Metric</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.8 }]}>Target</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.7 }]}>Current</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>Status</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Action if Off-Target</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Debt Service Coverage</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.8 }]}>{'>'} 1.25x</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.7 }]}>___</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>🟢/🟡/🔴</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Renegotiate or accelerate cash</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Cash Runway (weeks)</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.8 }]}>{'>'} 4 weeks</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.7 }]}>___</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>🟢/🟡/🔴</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Cut expenses or collect receivables</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Past Due Balance</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.8 }]}>$0</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.7 }]}>___</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>🟢/🟡/🔴</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Call creditor immediately</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Interest Expense (monthly)</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.8 }]}>↓ month over month</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.7 }]}>___</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>🟢/🟡/🔴</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Refinance or avalanche extra payments</Text>
                                </View>

                                <View style={styles.metricsTableRow}>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Credit Score (business)</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.8 }]}>{'>'} 75 (if scored)</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 0.7 }]}>___</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1 }]}>🟢/🟡/ RED</Text>
                                    <Text style={[styles.metricsTableCell, { flex: 1.5 }]}>Pay down utilization</Text>
                                </View>
                            </View>

                            <Text style={styles.informationSubtitle}>Status definitions:</Text>
                            <Text style={styles.informationText}>🟢 Green = On target, no action needed</Text>
                            <Text style={styles.informationText}>🟡 Yellow = Warning zone, monitor closely, plan corrective action</Text>
                            <Text style={styles.informationText}>🔴 Red = Critical, take action within 7 days</Text>
                        </View>

                        {/* Step 5.2: Monthly Debt Review */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 5.2: Monthly Debt Review (First Friday of every month, 60 minutes)</Text>

                            <View style={styles.informationTable}>
                                <View style={styles.informationTableHeader}>
                                    <Text style={[styles.informationTableCell, { flex: 0.5 }]}>Time</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Activity</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 0.5 }]}>0-10 min</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Review last month's actual vs forecast cash flow</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 0.5 }]}>10-20 min</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Update debt inventory with new balances</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 0.5 }]}>20-30 min</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Recalculate all key metrics</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 0.5 }]}>30-45 min</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Identify any new debts or changed terms</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 0.5 }]}>45-60 min</Text>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Adjust next 4 weeks of payment plan</Text>
                                </View>
                            </View>
                        </View>

                        {/* Step 5.3: Quarterly Debt Strategy Review */}
                        <View style={styles.informationSection}>
                            <Text style={styles.informationTitle}>Step 5.3: Quarterly Debt Strategy Review (First week of each quarter, 2 hours)</Text>

                            <View style={styles.informationTable}>
                                <View style={styles.informationTableHeader}>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Section</Text>
                                    <Text style={[styles.informationTableCell, { flex: 2 }]}>Questions to Answer</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Progress</Text>
                                    <Text style={[styles.informationTableCell, { flex: 2 }]}>How much total debt has been reduced? How much interest saved?</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Refinance opportunities</Text>
                                    <Text style={[styles.informationTableCell, { flex: 2 }]}>Have interest rates dropped? Is credit score higher? Any new lenders?</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Restructure needs</Text>
                                    <Text style={[styles.informationTableCell, { flex: 2 }]}>Are any debts becoming unaffordable? Any new payment pressures?</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Growth alignment</Text>
                                    <Text style={[styles.informationTableCell, { flex: 2 }]}>Is current debt supporting growth or hindering it?</Text>
                                </View>

                                <View style={styles.informationTableRow}>
                                    <Text style={[styles.informationTableCell, { flex: 1.5 }]}>Next 90-day plan</Text>
                                    <Text style={[styles.informationTableCell, { flex: 2 }]}>What specific debt reduction targets for next quarter?</Text>
                                </View>
                            </View>
                        </View>

                        {/* Debt Health Dashboard */}
                        <View style={styles.toolContainer}>
                            <Text style={styles.toolTitle}>Debt Health Dashboard</Text>
                            <Text style={styles.toolDescription}>
                                Track key metrics weekly to ensure you're staying on course
                            </Text>

                            <View style={styles.dashboardMetrics}>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricValue}>{(totalDebt / finance.equity * 100).toFixed(1)}%</Text>
                                    <Text style={styles.metricLabel}>Debt-to-Equity</Text>
                                </View>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricValue}>{debtServiceCoverageRatio.toFixed(2)}x</Text>
                                    <Text style={styles.metricLabel}>Debt Service Coverage</Text>
                                </View>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricValue}>{debts.filter(d => d.daysPastDue && d.daysPastDue > 30).length}</Text>
                                    <Text style={styles.metricLabel}>Overdue Debts</Text>
                                </View>
                            </View>
                        </View>

                        {/* Progress Tracking */}
                        <View style={styles.progressTracking}>
                            <Text style={styles.toolTitle}>Progress Tracking</Text>
                            <View style={styles.progressItem}>
                                <Text style={styles.progressLabel}>Total Debt</Text>
                                <Text style={styles.progressValue}>{currency}{totalDebt.toLocaleString()}</Text>
                            </View>
                            <View style={styles.progressItem}>
                                <Text style={styles.progressLabel}>Debt Reduction Target</Text>
                                <Text style={styles.progressValue}>{currency}{(totalDebt * 0.1).toLocaleString()} (10% reduction)</Text>
                            </View>
                            <View style={styles.progressItem}>
                                <Text style={styles.progressLabel}>Debt Paid Off</Text>
                                <Text style={styles.progressValue}>{currency}{(totalDebt * 0.05).toLocaleString()} (5% reduction)</Text>
                            </View>
                            <View style={styles.progressItem}>
                                <Text style={styles.progressLabel}>Remaining to Target</Text>
                                <Text style={styles.progressValue}>{currency}{(totalDebt * 0.1 - totalDebt * 0.05).toLocaleString()}</Text>
                            </View>
                            <View style={styles.progressBarContainer}>
                                <View style={[styles.progressBar, { width: `${(0.05 / 0.1) * 100}%` }]}>
                                    <Text style={styles.progressText}>{Math.round((0.05 / 0.1) * 100)}%</Text>
                                </View>
                            </View>
                        </View>

                        {/* Debt Alerts */}
                        <View style={styles.alertsContainer}>
                            <Text style={styles.toolTitle}>Alerts & Notifications</Text>

                            {/* Generate dynamic alerts based on debt status */}
                            {debts.map(debt => {
                                const daysUntilDue = Math.ceil(
                                    (new Date(debt.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                                );

                                const alerts = [];

                                // Alert for upcoming payment
                                if (daysUntilDue <= 7 && daysUntilDue >= 0) {
                                    alerts.push(
                                        <View key={`alert-${debt.id}-due`} style={styles.alertItem}>
                                            <Text style={styles.alertText}>⚠️ Payment due for {debt.lender} in {daysUntilDue} days</Text>
                                        </View>
                                    );
                                }

                                // Alert for overdue payment
                                if (daysUntilDue < 0) {
                                    alerts.push(
                                        <View key={`alert-${debt.id}-overdue`} style={styles.alertItem}>
                                            <Text style={styles.alertText}>⚠️ Payment for {debt.lender} is {Math.abs(daysUntilDue)} days overdue</Text>
                                        </View>
                                    );
                                }

                                // Alert for critical debt
                                if (debt.category === 'payroll' || debt.category === 'taxes') {
                                    alerts.push(
                                        <View key={`alert-${debt.id}-critical`} style={styles.alertItem}>
                                            <Text style={styles.alertText}>🚨 CRITICAL: {debt.category.toUpperCase()} debt of {currency}{debt.currentBalance.toLocaleString()}</Text>
                                        </View>
                                    );
                                }

                                // Alert for high interest debt
                                if (debt.interestRate > 15) {
                                    alerts.push(
                                        <View key={`alert-${debt.id}-high-interest`} style={styles.alertItem}>
                                            <Text style={styles.alertText}>📈 HIGH INTEREST: {debt.lender} at {debt.interestRate}% - Consider refinancing</Text>
                                        </View>
                                    );
                                }

                                return alerts;
                            })}

                            {/* Show message if no alerts */}
                            {debts.length === 0 && (
                                <View style={styles.alertItem}>
                                    <Text style={styles.alertText}>✅ No debt alerts at this time. Add debts to get started.</Text>
                                </View>
                            )}
                        </View>

                        {/* Step 5.4: Output from Stage 5 */}
                        <View style={styles.outputSection}>
                            <Text style={styles.informationTitle}>Step 5.4: Output from Stage 5</Text>
                            <Text style={styles.informationSubtitle}>Deliverables:</Text>

                            <View style={styles.checklistContainer}>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Weekly Debt Health Dashboard</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Monthly debt update report</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Text style={styles.checkmark}>✓</Text>
                                    <Text style={styles.checklistText}>Quarterly strategy adjustment document</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
            </View>

            {/* Bottom Line Summary */}
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>✨ The Bottom Line</Text>
                <Text style={styles.summaryText}>
                    Effective SME debt management is a continuous loop of visibility, strategy, and discipline.
                    By knowing exactly what you owe, prioritizing payments to protect your core business,
                    choosing the right financial tools, and relentlessly optimizing cash flow,
                    you transform debt from a source of anxiety into a lever for sustainable growth.
                </Text>
            </View>
        </ScrollView >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#0f172a'
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#f8fafc',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 18,
    },
    stageCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    stageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#1e293b',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    stageTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        flex: 1,
    },
    expandIcon: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#94a3b8',
    },
    stageContent: {
        padding: 16,
    },
    sectionDescription: {
        fontSize: 14,
        color: '#94a3b8',
        marginBottom: 16,
        lineHeight: 18,
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 16,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    totalRow: {
        backgroundColor: '#0f172a',
    },
    tableCell: {
        flex: 1,
        textAlign: 'center',
        color: '#cbd5e1',
        fontSize: 11,
    },
    priorityMatrixTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    priorityMatrixTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    priorityMatrixTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    priorityMatrixTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    exampleTableContainer: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    exampleTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    exampleTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    exampleTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    methodComparisonTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    methodComparisonTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    methodComparisonTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    methodComparisonTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    methodDecisionRule: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 8,
        lineHeight: 16,
    },
    paymentScheduleTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    paymentScheduleTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    paymentScheduleTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    paymentScheduleTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    diagnosisTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    diagnosisTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    diagnosisTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    diagnosisTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    diagnosisPatternTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    diagnosisPatternTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    diagnosisPatternTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    diagnosisPatternTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    actionPlanTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    actionPlanTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    actionPlanTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    actionPlanTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    calculationComparisonTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    calculationComparisonTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    calculationComparisonTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    calculationComparisonTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    negotiationTacticsTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    negotiationTacticsTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    negotiationTacticsTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    negotiationTacticsTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    scriptBox: {
        backgroundColor: '#0f172a',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 12,
    },
    scriptText: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 16,
    },
    goalText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#10b981',
        marginBottom: 8,
    },
    subSectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginTop: 12,
        marginBottom: 8,
    },
    boldText: {
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    deleteButton: {
        backgroundColor: '#ef4444',
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButtonText: {
        color: '#f8fafc',
        fontSize: 10,
        fontWeight: 'bold',
    },
    addDebtForm: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    formTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
    },
    formRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    formGroup: {
        flex: 1,
        marginRight: 8,
    },
    formGroupLastChild: {
        marginRight: 0,
    },
    label: {
        fontSize: 11,
        color: '#94a3b8',
        marginBottom: 4,
    },
    input: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        color: '#f8fafc',
        fontSize: 12,
    },
    addButton: {
        backgroundColor: '#10b981',
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: 'center',
        marginTop: 8,
    },
    addButtonText: {
        color: '#f8fafc',
        fontWeight: 'bold',
        fontSize: 12,
    },
    ratiosContainer: {
        marginTop: 16,
    },
    ratiosTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
    },
    ratioItem: {
        marginBottom: 12,
    },
    ratioLabel: {
        fontSize: 12,
        color: '#94a3b8',
    },
    ratioValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    ratioHigh: {
        color: '#ef4444',
    },
    ratioNormal: {
        color: '#10b981',
    },
    ratioDescription: {
        fontSize: 11,
        color: '#94a3b8',
        fontStyle: 'italic',
    },
    priorityList: {
        marginBottom: 16,
    },
    priorityItem: {
        flexDirection: 'row',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    priorityNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#3b82f6',
        color: '#f8fafc',
        textAlign: 'center',
        lineHeight: 24,
        fontWeight: 'bold',
        marginRight: 12,
    },
    priorityContent: {
        flex: 1,
    },
    priorityTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 4,
    },
    priorityDesc: {
        fontSize: 12,
        color: '#94a3b8',
        lineHeight: 16,
    },
    payrollPriority: { backgroundColor: '#dc262620', borderColor: '#dc2626', borderWidth: 1 },
    supplierPriority: { backgroundColor: '#f59e0b20', borderColor: '#f59e0b', borderWidth: 1 },
    agedPriority: { backgroundColor: '#f9731620', borderColor: '#f97316', borderWidth: 1 },
    securedPriority: { backgroundColor: '#3b82f620', borderColor: '#3b82f6', borderWidth: 1 },
    creditCardPriority: { backgroundColor: '#8b5cf620', borderColor: '#8b5cf6', borderWidth: 1 },
    toolContainer: {
        backgroundColor: '#0f172a',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    toolTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 4,
    },
    toolDescription: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 8,
    },
    debtPriorityItem: {
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    debtPriorityText: {
        color: '#cbd5e1',
        fontSize: 12,
    },
    strategyContainer: {
        marginBottom: 16,
    },
    strategyOption: {
        marginBottom: 12,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    strategyTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
    },
    optionDetail: {
        marginBottom: 8,
    },
    optionSubTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#3b82f6',
        marginBottom: 4,
    },
    optionDesc: {
        fontSize: 11,
        color: '#94a3b8',
        lineHeight: 14,
    },
    recommendationCard: {
        backgroundColor: '#1e293b',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
    },
    recommendationText: {
        color: '#f8fafc',
        fontSize: 12,
        lineHeight: 16,
    },
    executionContainer: {
        marginBottom: 16,
    },
    executionItem: {
        marginBottom: 12,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    executionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 6,
    },
    executionSubTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#3b82f6',
        marginTop: 6,
    },
    executionDesc: {
        fontSize: 12,
        color: '#94a3b8',
        lineHeight: 16,
    },
    calculatorInput: {
        marginBottom: 12,
    },
    calculateButton: {
        backgroundColor: '#2563eb',
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: 'center',
    },
    calculateButtonText: {
        color: '#f8fafc',
        fontWeight: 'bold',
        fontSize: 12,
    },
    repaymentMethodContainer: {
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    methodSelection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 12,
    },
    methodButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        marginRight: 8,
        alignItems: 'center',
    },
    methodButtonSelected: {
        backgroundColor: '#2563eb',
        borderColor: '#3b82f6',
    },
    methodButtonText: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: 'bold',
    },
    methodButtonTextSelected: {
        color: '#f8fafc',
    },
    methodExplanation: {
        fontSize: 11,
        color: '#94a3b8',
        fontStyle: 'italic',
        textAlign: 'center',
    },
    scheduleTableContainer: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    scheduleTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    scheduleTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    forecastContainer: {
        marginTop: 12,
    },
    forecastWeeks: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    forecastWeek: {
        alignItems: 'center',
        padding: 8,
        backgroundColor: '#0f172a',
        borderRadius: 6,
        flex: 1,
        marginHorizontal: 2,
    },
    forecastWeekLabel: {
        fontSize: 10,
        color: '#94a3b8',
        marginBottom: 4,
    },
    forecastValue: {
        fontSize: 12,
        color: '#f8fafc',
        fontWeight: 'bold',
    },
    dashboardMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginHorizontal: 4,
    },
    metricValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 4,
    },
    metricLabel: {
        fontSize: 10,
        color: '#94a3b8',
        textAlign: 'center',
    },
    progressTracking: {
        marginTop: 16,
    },
    progressItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 12,
        color: '#94a3b8',
    },
    progressValue: {
        fontSize: 12,
        color: '#f8fafc',
        fontWeight: 'bold',
    },
    progressBarContainer: {
        height: 20,
        backgroundColor: '#0f172a',
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 8,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#10b981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressText: {
        color: '#f8fafc',
        fontSize: 10,
        fontWeight: 'bold',
    },
    informationSection: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    informationTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
    },
    informationText: {
        fontSize: 13,
        color: '#cbd5e1',
        marginBottom: 6,
        lineHeight: 20,
    },
    informationSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 12,
    },
    informationTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    informationTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    informationTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    informationTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    spreadsheetSection: {
        marginBottom: 16,
    },
    templateTableContainer: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 16,
    },
    templateTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    templateTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    templateTableCell: {
        flex: 1,
        textAlign: 'center',
        color: '#cbd5e1',
        fontSize: 11,
    },
    metricsSection: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    metricsTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    metricsTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    metricsTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    metricsTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    exampleTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginTop: 12,
        marginBottom: 6,
    },
    exampleBox: {
        backgroundColor: '#0f172a',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 12,
    },
    exampleText: {
        fontSize: 12,
        color: '#cbd5e1',
        marginBottom: 4,
    },
    interpretationTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginTop: 8,
        marginBottom: 4,
    },
    interpretationText: {
        fontSize: 11,
        color: '#94a3b8',
        marginBottom: 2,
    },
    calculatedMetricsContainer: {
        marginTop: 12,
    },
    metricItem: {
        marginBottom: 12,
    },
    metricsContainer: {
        marginTop: 12,
    },
    metricDescription: {
        fontSize: 11,
        color: '#94a3b8',
        fontStyle: 'italic',
    },
    redFlagsTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    redFlagsTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    redFlagsTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    redFlagsTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    outputSection: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    checklistContainer: {
        marginTop: 8,
    },
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    checkmark: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#10b981',
        color: '#f8fafc',
        textAlign: 'center',
        lineHeight: 20,
        fontWeight: 'bold',
        marginRight: 8,
    },
    checklistText: {
        color: '#f8fafc',
        fontSize: 12,
    },
    redFlagsSection: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    redFlagContainer: {
        marginTop: 12,
    },
    redFlagItem: {
        padding: 8,
        borderRadius: 6,
        marginBottom: 8,
    },
    redFlagWarning: {
        backgroundColor: '#dc262620',
        borderColor: '#dc2626',
        borderWidth: 1,
    },
    redFlagOk: {
        backgroundColor: '#10b98120',
        borderColor: '#10b981',
        borderWidth: 1,
    },
    redFlagText: {
        color: '#f8fafc',
        fontSize: 12,
    },
    summaryCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
        textAlign: 'center',
    },
    summaryText: {
        fontSize: 12,
        color: '#94a3b8',
        lineHeight: 16,
    },
    cashFlowForecastTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    cashFlowForecastTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    cashFlowForecastTableSectionHeader: {
        flexDirection: 'row',
        backgroundColor: '#1e293b',
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: '#334155',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    cashFlowForecastTableSectionText: {
        flex: 1,
        textAlign: 'center',
        color: '#f8fafc',
        fontWeight: 'bold',
        fontSize: 12,
    },
    cashFlowForecastTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 6,
    },
    cashFlowForecastTableCell: {
        flex: 1,
        textAlign: 'center',
        color: '#cbd5e1',
        fontSize: 10,
        paddingHorizontal: 2,
    },
    tacticsTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    tacticsTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    tacticsTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    tacticsTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    costReductionTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    costReductionTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    costReductionTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    costReductionTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    crisisActionPlanTable: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        marginBottom: 12,
    },
    crisisActionPlanTableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    crisisActionPlanTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingVertical: 8,
    },
    crisisActionPlanTableCell: {
        flex: 1,
        textAlign: 'left',
        color: '#cbd5e1',
        fontSize: 11,
        paddingHorizontal: 4,
    },
    warningText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#ef4444',
        marginBottom: 8,
    },
    alertsContainer: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#0f172a',
        borderRadius: 8,
    },
    alertItem: {
        padding: 8,
        backgroundColor: '#dc262620',
        borderColor: '#dc2626',
        borderWidth: 1,
        borderRadius: 6,
        marginBottom: 8,
    },
    alertText: {
        color: '#f8fafc',
        fontSize: 12,
    },
});

export default DebtManagement;