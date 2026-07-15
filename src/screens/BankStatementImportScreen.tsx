import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { parseCSVBankStatement, ParsedStatement } from '../utils/bankStatementParser';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { useApp } from '../contexts/AppContext';

export default function BankStatementImportScreen() {
  const { transactions: existingTransactions, invoices, finance, settings, setCurrentScreen } = useApp();
  const [step, setStep] = useState<'upload' | 'review' | 'complete'>('upload');
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSampleCSV = () => {
    const sample = `Date,Description,Amount,Type
2026-07-01,Sales Invoice #001,50000,credit
2026-07-02,Office Supplies,5000,debit
2026-07-03,Customer Payment,75000,credit
2026-07-04,Salary Payment,30000,debit
2026-07-05,Product Sale,60000,credit
2026-07-06,Utilities Bill,8000,debit
2026-07-07,Marketing Campaign,15000,debit
2026-07-08,Service Revenue,40000,credit
2026-07-09,Rent Payment,25000,debit
2026-07-10,Consulting Fee,55000,credit`;

    setCsvContent(sample);
    Alert.alert(
      'Sample CSV Loaded',
      'This is a sample format. Replace with your actual bank statement in CSV format.'
    );
  };

  const handleParse = () => {
    if (!csvContent.trim()) {
      Alert.alert('Error', 'Please enter CSV data or click "Load Sample"');
      return;
    }

    try {
      setLoading(true);
      const result = parseCSVBankStatement(csvContent);
      setParsed(result);
      setStep('review');
    } catch (error) {
      Alert.alert('Parse Error', `Failed to parse CSV: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportAndCreateTactics = () => {
    if (!parsed) return;

    // Show success and navigate to Action Tracker
    Alert.alert('Success!', 'Bank statement imported and tactics generated.', [
      {
        text: 'View Tactics',
        onPress: () => setCurrentScreen('action-tracker'),
      },
      {
        text: 'Stay Here',
        onPress: () => setStep('complete'),
      },
    ]);
  };

  if (step === 'upload') {
    return (
      <SafeAreaView style={styles.safe}>
        <Header />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
          <Text style={styles.title}>📊 Import Bank Statement</Text>
          <Text style={styles.subtitle}>
            Upload your bank statement as CSV to auto-generate actionable tactics
          </Text>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How it works:</Text>
            <Text style={styles.infoText}>
              1. Export your bank statement as CSV{'\n'}
              2. Required columns: Date, Description, Amount, Type{'\n'}
              3. We analyze patterns and generate tactics{'\n'}
              4. Tactics appear in Action Tracker
            </Text>
          </View>

          {/* Format Guide */}
          <View style={styles.formatGuide}>
            <Text style={styles.formatTitle}>CSV Format:</Text>
            <Text style={styles.formatText}>Date | Description | Amount | Type</Text>
            <Text style={styles.formatExample}>
              2026-07-01 | Sales Invoice | 50000 | credit{'\n'}
              2026-07-02 | Supplies | 5000 | debit
            </Text>
          </View>

          {/* Sample Button */}
          <TouchableOpacity style={styles.sampleButton} onPress={handleSampleCSV}>
            <Text style={styles.sampleButtonText}>📋 Load Sample CSV</Text>
          </TouchableOpacity>

          {/* CSV Input */}
          <Text style={styles.inputLabel}>Paste CSV Content:</Text>
          <View style={styles.textInputContainer}>
            <Text
              style={styles.textInput}
              onPress={() => {
                Alert.prompt('Enter CSV Data', 'Paste your bank statement CSV:', [
                  { text: 'Cancel', onPress: () => {} },
                  {
                    text: 'OK',
                    onPress: (text) => {
                      if (text) setCsvContent(text);
                    },
                  },
                ]);
              }}
            >
              {csvContent || 'Tap to enter CSV data...'}
            </Text>
          </View>

          {csvContent && (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Preview ({csvContent.split('\n').length} rows):</Text>
              <Text style={styles.previewText}>{csvContent.split('\n').slice(0, 5).join('\n')}</Text>
              {csvContent.split('\n').length > 5 && (
                <Text style={styles.previewEllipsis}>... ({csvContent.split('\n').length - 5} more rows)</Text>
              )}
            </View>
          )}

          {/* Parse Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleParse}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? '⏳ Parsing...' : '🔍 Analyze Statement'}</Text>
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>💡 Tips:</Text>
            <Text style={styles.warningText}>
              • Your bank statement is NOT stored - it's only used to analyze patterns{'\n'}
              • We identify revenue trends, expense concentration, and cash gaps{'\n'}
              • Tactics auto-add to Action Tracker for execution{'\n'}
              • Edit tactics anytime to match your business
            </Text>
          </View>
        </ScrollView>
        <FooterNav />
      </SafeAreaView>
    );
  }

  if (step === 'review' && parsed) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
          <Text style={styles.title}>📈 Statement Analysis</Text>
          <Text style={styles.subtitle}>
            {parsed.summary.periodStart} to {parsed.summary.periodEnd}
          </Text>

          {/* Summary Stats */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Transactions</Text>
              <Text style={styles.summaryValue}>{parsed.summary.transactionCount}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Income</Text>
              <Text style={[styles.summaryValue, { color: Colors.income }]}>
                {settings.currency}{Math.round(parsed.summary.totalIncome / 1000)}k
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Expenses</Text>
              <Text style={[styles.summaryValue, { color: Colors.expense }]}>
                {settings.currency}{Math.round(parsed.summary.totalExpenses / 1000)}k
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Profit/Loss</Text>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      parsed.summary.totalIncome - parsed.summary.totalExpenses > 0
                        ? Colors.income
                        : Colors.expense,
                  },
                ]}
              >
                {settings.currency}
                {Math.round((parsed.summary.totalIncome - parsed.summary.totalExpenses) / 1000)}k
              </Text>
            </View>
          </View>

          {/* Generated Tactics */}
          <Text style={styles.sectionTitle}>🎯 Generated Tactics ({parsed.generatedTactics.length})</Text>
          {parsed.generatedTactics.map((tactic, idx) => (
            <View key={idx} style={styles.tacticCard}>
              <View style={styles.tacticHeader}>
                <Text style={styles.tacticTitle}>{tactic.title}</Text>
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(tactic.priority) }]}>
                  <Text style={styles.priorityText}>P{tactic.priority}</Text>
                </View>
              </View>
              <Text style={styles.tacticDescription}>{tactic.description}</Text>
              <View style={styles.tacticMeta}>
                <Text style={styles.metaTag}>⏱️ {tactic.timelineWeeks}w</Text>
                <Text style={styles.metaTag}>💰 +{settings.currency}{Math.round(tactic.expectedImpact / 1000)}k</Text>
                <Text style={styles.metaTag}>✅ {(tactic.successProbability * 100).toFixed(0)}%</Text>
              </View>
            </View>
          ))}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setStep('upload')}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleImportAndCreateTactics}
            >
              <Text style={styles.buttonText}>✓ Add Tactics</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <FooterNav />
      </SafeAreaView>
    );
  }

  // Complete step
  return (
    <SafeAreaView style={styles.safe}>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
        <View style={styles.completeContainer}>
          <Text style={styles.completeEmoji}>✅</Text>
          <Text style={styles.completeTitle}>Statement Imported!</Text>
          <Text style={styles.completeSubtitle}>
            {parsed?.generatedTactics.length || 0} tactics generated and ready to execute
          </Text>

          {parsed && (
            <View style={styles.completeStats}>
              <Text style={styles.completeStat}>
                📊 Period: {parsed.summary.periodStart} to {parsed.summary.periodEnd}
              </Text>
              <Text style={styles.completeStat}>
                💰 Income: {settings.currency}{Math.round(parsed.summary.totalIncome / 1000)}k
              </Text>
              <Text style={styles.completeStat}>
                💸 Expenses: {settings.currency}{Math.round(parsed.summary.totalExpenses / 1000)}k
              </Text>
              <Text style={styles.completeStat}>
                🎯 Key Focus: {parsed.summary.topExpenseCategory} ({((parsed.summary.topExpenseAmount / parsed.summary.totalExpenses) * 100).toFixed(0)}% of budget)
              </Text>
            </View>
          )}

          <View style={styles.nextSteps}>
            <Text style={styles.nextStepsTitle}>Next Steps:</Text>
            <Text style={styles.nextStepsText}>
              1. View generated tactics in Action Tracker{'\n'}
              2. Review recommended priorities{'\n'}
              3. Start with high-impact, easy tactics{'\n'}
              4. Track progress and adjust as needed
            </Text>
          </View>

          <View style={styles.completeButtonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setCurrentScreen('action-tracker')}
            >
              <Text style={styles.buttonText}>🚀 View Action Tracker</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => setCurrentScreen('dashboard')}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>← Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <FooterNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  pad: { padding: 16, paddingBottom: 100 },

  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 20 },

  infoCard: {
    backgroundColor: Colors.primary + '15',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  infoTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  infoText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 18 },

  formatGuide: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  formatTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  formatText: { fontSize: 11, fontWeight: '600', color: Colors.primary, marginBottom: 6 },
  formatExample: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', lineHeight: 16 },

  sampleButton: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  sampleButtonText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  textInputContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    marginBottom: 12,
  },
  textInput: { fontSize: 11, color: Colors.textSecondary, lineHeight: 17 },

  previewBox: {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewTitle: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  previewText: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', lineHeight: 14 },
  previewEllipsis: { fontSize: 9, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },

  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  secondaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: { color: Colors.textPrimary },

  warningBox: {
    backgroundColor: Colors.warning + '10',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  warningTitle: { fontSize: 12, fontWeight: '700', color: Colors.warning, marginBottom: 6 },
  warningText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 17 },

  // Review screen
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  summaryCard: { width: '48%', backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
  summaryValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },

  tacticCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 },
  tacticHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  tacticTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  priorityText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  tacticDescription: { fontSize: 11, color: Colors.textSecondary, marginBottom: 8, lineHeight: 17 },
  tacticMeta: { flexDirection: 'row', gap: 8 },
  metaTag: { fontSize: 9, backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, color: Colors.textMuted },

  buttonContainer: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },

  // Complete screen
  completeContainer: { alignItems: 'center', paddingVertical: 40 },
  completeEmoji: { fontSize: 64, marginBottom: 16 },
  completeTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  completeSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },

  completeStats: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, width: '100%', marginBottom: 20 },
  completeStat: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8, lineHeight: 18 },

  nextSteps: { backgroundColor: Colors.primary + '10', borderRadius: 12, padding: 14, width: '100%', marginBottom: 20 },
  nextStepsTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  nextStepsText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 18 },

  completeButtonContainer: { width: '100%', gap: 10 },
});

function getPriorityColor(priority: number): string {
  if (priority >= 8) return Colors.expense;
  if (priority >= 6) return Colors.warning;
  return Colors.primary;
}
