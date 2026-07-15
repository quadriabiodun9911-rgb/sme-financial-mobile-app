import React, { useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet,
    Modal, TextInput, Alert, Platform, Share,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function TaxPlanningScreen() {
    const { transactions, settings, navigate, finance, user } = useApp();
    const { currency } = settings;
    const [showDeductionModal, setShowDeductionModal] = useState(false);
    const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(1);
    const [deductionName, setDeductionName] = useState('');
    const [deductionAmount, setDeductionAmount] = useState('');
    const [deductions, setDeductions] = useState<Array<{ name: string; amount: number; quarter: number }>>([]);

    // Calculate quarterly metrics
    const quarterlyData = useMemo(() => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const quarters = [
            { q: 1, months: [1, 2, 3], label: 'Q1 (Jan-Mar)' },
            { q: 2, months: [4, 5, 6], label: 'Q2 (Apr-Jun)' },
            { q: 3, months: [7, 8, 9], label: 'Q3 (Jul-Sep)' },
            { q: 4, months: [10, 11, 12], label: 'Q4 (Oct-Dec)' },
        ];

        return quarters.map(quarter => {
            const income = transactions
                .filter(tx => {
                    const txYear = parseInt(tx.date.split('-')[0], 10);
                    const txMonth = parseInt(tx.date.split('-')[1], 10);
                    return txYear === currentYear && quarter.months.includes(txMonth) && tx.type === 'income';
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            const expenses = transactions
                .filter(tx => {
                    const txYear = parseInt(tx.date.split('-')[0], 10);
                    const txMonth = parseInt(tx.date.split('-')[1], 10);
                    return txYear === currentYear && quarter.months.includes(txMonth) && tx.type === 'expense';
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            const profit = income - expenses;
            const quarterDeductions = deductions
                .filter(d => d.quarter === quarter.q)
                .reduce((sum, d) => sum + d.amount, 0);

            // Estimated tax (assuming 20% effective tax rate for SMEs in Nigeria)
            const taxableIncome = Math.max(0, profit - quarterDeductions);
            const estimatedTax = taxableIncome * 0.2;

            return {
                quarter: quarter.q,
                label: quarter.label,
                income,
                expenses,
                profit,
                deductions: quarterDeductions,
                taxableIncome,
                estimatedTax,
            };
        });
    }, [transactions, deductions]);

    const annualData = useMemo(() => {
        const totalIncome = quarterlyData.reduce((sum, q) => sum + q.income, 0);
        const totalExpenses = quarterlyData.reduce((sum, q) => sum + q.expenses, 0);
        const totalProfit = quarterlyData.reduce((sum, q) => sum + q.profit, 0);
        const totalDeductions = quarterlyData.reduce((sum, q) => sum + q.deductions, 0);
        const totalTaxableIncome = quarterlyData.reduce((sum, q) => sum + q.taxableIncome, 0);
        const totalEstimatedTax = quarterlyData.reduce((sum, q) => sum + q.estimatedTax, 0);

        return {
            totalIncome,
            totalExpenses,
            totalProfit,
            totalDeductions,
            totalTaxableIncome,
            totalEstimatedTax,
            avgQuarterlyTax: totalEstimatedTax / 4,
        };
    }, [quarterlyData]);

    const handleAddDeduction = () => {
        if (!deductionName.trim()) {
            Alert.alert('Error', 'Please enter deduction name');
            return;
        }
        const amount = parseFloat(deductionAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Error', 'Please enter a valid amount');
            return;
        }
        setDeductions([...deductions, { name: deductionName, amount, quarter: selectedQuarter }]);
        setDeductionName('');
        setDeductionAmount('');
        setShowDeductionModal(false);
    };

    const handleExportTaxReport = async () => {
        try {
            const report = `
TAX PLANNING REPORT
Generated: ${new Date().toLocaleDateString()}
Business: ${user?.businessName ?? 'My Business'}

ANNUAL SUMMARY
==============
Total Income: ${currency}${annualData.totalIncome.toLocaleString()}
Total Expenses: ${currency}${annualData.totalExpenses.toLocaleString()}
Gross Profit: ${currency}${annualData.totalProfit.toLocaleString()}
Total Deductions: ${currency}${annualData.totalDeductions.toLocaleString()}
Taxable Income: ${currency}${annualData.totalTaxableIncome.toLocaleString()}
Estimated Annual Tax (20%): ${currency}${annualData.totalEstimatedTax.toLocaleString()}
Average Quarterly Payment: ${currency}${annualData.avgQuarterlyTax.toLocaleString()}

QUARTERLY BREAKDOWN
===================
${quarterlyData.map(q => `
${q.label}
Income: ${currency}${q.income.toLocaleString()}
Expenses: ${currency}${q.expenses.toLocaleString()}
Profit: ${currency}${q.profit.toLocaleString()}
Deductions: ${currency}${q.deductions.toLocaleString()}
Taxable Income: ${currency}${q.taxableIncome.toLocaleString()}
Estimated Tax: ${currency}${q.estimatedTax.toLocaleString()}
`).join('\n')}

TAX FILING CHECKLIST
====================
☐ Gather all receipts and invoices
☐ Verify all income entries
☐ Document all business deductions
☐ Reconcile bank statements
☐ Calculate quarterly tax payments
☐ File Form (depends on jurisdiction)
☐ Submit tax payment
☐ Keep records for 7 years

NOTES
=====
- This is an estimate. Actual tax liability may vary.
- Consult with a tax professional before filing.
- Some deductions may not be tax-deductible.
- Tax rate assumed: 20% (adjust based on actual rate)
`;

            if (Platform.OS === 'web') {
                // For web, create a download
                const element = document.createElement('a');
                const file = new Blob([report], { type: 'text/plain' });
                element.href = URL.createObjectURL(file);
                element.download = 'tax-report.txt';
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
            } else {
                // For mobile, share
                await Share.share({
                    message: report,
                    title: 'Tax Planning Report',
                });
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to export report');
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>📋 Tax Planning</Text>
                <Text style={s.subtitle}>Track deductions and estimate quarterly tax liability</Text>

                {/* Annual Summary */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>Annual Summary</Text>
                    <View style={s.summaryGrid}>
                        <SummaryCard
                            label="Gross Income"
                            value={`${currency}${annualData.totalIncome.toLocaleString()}`}
                            color={Colors.income}
                        />
                        <SummaryCard
                            label="Total Expenses"
                            value={`${currency}${annualData.totalExpenses.toLocaleString()}`}
                            color={Colors.expense}
                        />
                        <SummaryCard
                            label="Gross Profit"
                            value={`${currency}${annualData.totalProfit.toLocaleString()}`}
                            color={Colors.primary}
                        />
                        <SummaryCard
                            label="Est. Tax (20%)"
                            value={`${currency}${annualData.totalEstimatedTax.toLocaleString()}`}
                            color={Colors.warning}
                        />
                    </View>
                </View>

                {/* Quarterly Breakdown */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>Quarterly Breakdown</Text>
                    {quarterlyData.map(quarter => (
                        <QuarterlyCard key={quarter.quarter} quarter={quarter} currency={currency} />
                    ))}
                </View>

                {/* Deductions */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>Tax Deductions</Text>
                        <TouchableOpacity
                            style={s.addBtn}
                            onPress={() => setShowDeductionModal(true)}
                        >
                            <Text style={s.addBtnText}>+ Add</Text>
                        </TouchableOpacity>
                    </View>
                    {deductions.length === 0 ? (
                        <Text style={s.emptyText}>No deductions added yet. Tap + to add business deductions.</Text>
                    ) : (
                        deductions.map((ded, idx) => (
                            <View key={idx} style={s.deductionItem}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.deductionName}>{ded.name}</Text>
                                    <Text style={s.deductionQuarter}>{quarterlyData.find(q => q.quarter === ded.quarter)?.label}</Text>
                                </View>
                                <Text style={s.deductionAmount}>{currency}{ded.amount.toLocaleString()}</Text>
                            </View>
                        ))
                    )}
                </View>

                {/* Tax Filing Checklist */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>📝 Tax Filing Checklist</Text>
                    <ChecklistItem text="Gather all receipts and invoices" />
                    <ChecklistItem text="Verify all income entries" />
                    <ChecklistItem text="Document all business deductions" />
                    <ChecklistItem text="Reconcile bank statements" />
                    <ChecklistItem text="Calculate quarterly tax payments" />
                    <ChecklistItem text="Submit tax payment" />
                </View>

                {/* Action Buttons */}
                <View style={s.buttonGroup}>
                    <TouchableOpacity style={s.primaryBtn} onPress={handleExportTaxReport}>
                        <Text style={s.primaryBtnText}>📥 Export Tax Report</Text>
                    </TouchableOpacity>
                </View>

                {/* Info Box */}
                <View style={s.infoBox}>
                    <Text style={s.infoIcon}>⚠️</Text>
                    <Text style={s.infoText}>
                        This is an estimate based on 20% effective tax rate. Consult with a tax professional for accurate calculations specific to your jurisdiction and business type.
                    </Text>
                </View>
            </ScrollView>

            {/* Add Deduction Modal */}
            <Modal visible={showDeductionModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>Add Tax Deduction</Text>

                        <Text style={s.label}>Deduction Name</Text>
                        <TextInput
                            style={s.input}
                            placeholder="e.g., Office Rent, Equipment, Utilities"
                            value={deductionName}
                            onChangeText={setDeductionName}
                            placeholderTextColor={Colors.muted}
                        />

                        <Text style={s.label}>Amount ({currency})</Text>
                        <TextInput
                            style={s.input}
                            placeholder="0"
                            value={deductionAmount}
                            onChangeText={setDeductionAmount}
                            keyboardType="decimal-pad"
                            placeholderTextColor={Colors.muted}
                        />

                        <Text style={s.label}>Quarter</Text>
                        <View style={s.quarterGrid}>
                            {[1, 2, 3, 4].map(q => (
                                <TouchableOpacity
                                    key={q}
                                    style={[s.quarterBtn, selectedQuarter === q && s.quarterBtnActive]}
                                    onPress={() => setSelectedQuarter(q as 1 | 2 | 3 | 4)}
                                >
                                    <Text style={[s.quarterBtnText, selectedQuarter === q && s.quarterBtnTextActive]}>
                                        Q{q}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={s.modalButtons}>
                            <TouchableOpacity
                                style={[s.btn, s.btnSecondary]}
                                onPress={() => setShowDeductionModal(false)}
                            >
                                <Text style={s.btnSecondaryText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleAddDeduction}>
                                <Text style={s.btnPrimaryText}>Add Deduction</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <FooterNav />
        </SafeAreaView>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={[s.summaryCard, { borderLeftColor: color }]}>
            <Text style={s.summaryLabel}>{label}</Text>
            <Text style={[s.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}

function QuarterlyCard({ quarter, currency }: { quarter: any; currency: string }) {
    return (
        <View style={s.quarterCard}>
            <View style={s.quarterCardHeader}>
                <Text style={s.quarterCardTitle}>{quarter.label}</Text>
                <Text style={[s.quarterCardTax, { color: Colors.warning }]}>
                    Tax: {currency}{quarter.estimatedTax.toLocaleString()}
                </Text>
            </View>
            <View style={s.quarterCardRow}>
                <Text style={s.quarterCardLabel}>Income</Text>
                <Text style={[s.quarterCardValue, { color: Colors.income }]}>
                    {currency}{quarter.income.toLocaleString()}
                </Text>
            </View>
            <View style={s.quarterCardRow}>
                <Text style={s.quarterCardLabel}>Expenses</Text>
                <Text style={[s.quarterCardValue, { color: Colors.expense }]}>
                    {currency}{quarter.expenses.toLocaleString()}
                </Text>
            </View>
            <View style={s.quarterCardRow}>
                <Text style={s.quarterCardLabel}>Profit</Text>
                <Text style={[s.quarterCardValue, { color: Colors.primary }]}>
                    {currency}{quarter.profit.toLocaleString()}
                </Text>
            </View>
            {quarter.deductions > 0 && (
                <View style={s.quarterCardRow}>
                    <Text style={s.quarterCardLabel}>Deductions</Text>
                    <Text style={s.quarterCardValue}>
                        -{currency}{quarter.deductions.toLocaleString()}
                    </Text>
                </View>
            )}
            <View style={[s.quarterCardRow, s.quarterCardRowHighlight]}>
                <Text style={s.quarterCardLabel}>Taxable Income</Text>
                <Text style={s.quarterCardValue}>
                    {currency}{quarter.taxableIncome.toLocaleString()}
                </Text>
            </View>
        </View>
    );
}

function ChecklistItem({ text }: { text: string }) {
    const [checked, setChecked] = React.useState(false);
    return (
        <TouchableOpacity style={s.checklistItem} onPress={() => setChecked(!checked)}>
            <Text style={[s.checklistCheckbox, checked && s.checklistCheckboxChecked]}>
                {checked ? '✅' : '☐'}
            </Text>
            <Text style={[s.checklistText, checked && s.checklistTextChecked]}>{text}</Text>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
    section: { marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    addBtn: { backgroundColor: Colors.primary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
    summaryGrid: { gap: 12 },
    summaryCard: { backgroundColor: Colors.bg, padding: 12, borderRadius: 8, borderLeftWidth: 4 },
    summaryLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
    summaryValue: { fontSize: 16, fontWeight: '600' },
    quarterCard: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 12 },
    quarterCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.muted, paddingBottom: 8 },
    quarterCardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
    quarterCardTax: { fontSize: 13, fontWeight: '600' },
    quarterCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    quarterCardRowHighlight: { backgroundColor: Colors.muted, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 6, marginTop: 4 },
    quarterCardLabel: { fontSize: 12, color: Colors.textSecondary },
    quarterCardValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    deductionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.muted },
    deductionName: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
    deductionQuarter: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    deductionAmount: { fontSize: 13, fontWeight: '600', color: Colors.income },
    emptyText: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
    checklistItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.muted },
    checklistCheckbox: { fontSize: 16, marginRight: 12, width: 20 },
    checklistCheckboxChecked: { color: Colors.income },
    checklistText: { fontSize: 13, color: Colors.textPrimary, flex: 1 },
    checklistTextChecked: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
    buttonGroup: { gap: 12, marginBottom: 24 },
    primaryBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    infoBox: { flexDirection: 'row', backgroundColor: Colors.warning + '15', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: Colors.warning, gap: 8 },
    infoIcon: { fontSize: 18 },
    infoText: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginBottom: 16 },
    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: { backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, marginBottom: 16, borderWidth: 1, borderColor: Colors.muted },
    quarterGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    quarterBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: Colors.bg, alignItems: 'center', borderWidth: 1, borderColor: Colors.muted },
    quarterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    quarterBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
    quarterBtnTextActive: { color: '#fff' },
    modalButtons: { flexDirection: 'row', gap: 12 },
    btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnPrimary: { backgroundColor: Colors.primary },
    btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    btnSecondary: { backgroundColor: Colors.muted },
    btnSecondaryText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
});
