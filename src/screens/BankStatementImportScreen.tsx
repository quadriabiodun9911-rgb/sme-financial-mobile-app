import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import {
  parseCSVWithMapping,
  autoDetectColumns,
  ColumnMapping,
  ParsedBankStatement,
} from '../utils/flexibleBankStatementParser';
import {
  findMatchingProfile,
  saveBankProfile,
  BankProfile,
  createHeaderSignature,
  loadBankProfiles,
  deleteBankProfile,
  formatProfileInfo,
} from '../utils/bankProfileManager';
import { useApp } from '../contexts/AppContext';
import { isDuplicateTransaction } from '../utils/transactionDedup';

// Load saved profiles on mount
const loadProfiles = async (callback: (profiles: BankProfile[]) => void) => {
  try {
    const profiles = await loadBankProfiles();
    callback(profiles);
  } catch (error) {
    console.error('Error loading profiles:', error);
  }
};

export default function BankStatementImportScreen() {
  const { transactions: existingTransactions, invoices, finance, settings, setCurrentScreen, addTransaction } = useApp();
  const [step, setStep] = useState<'upload' | 'mapping' | 'review' | 'complete'>('upload');
  const [parsed, setParsed] = useState<ParsedBankStatement | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [csvRows, setCsvRows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [columnOptions, setColumnOptions] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState<string | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<BankProfile | null>(null);
  const [skipMapping, setSkipMapping] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState<BankProfile[]>([]);
  const [showProfiles, setShowProfiles] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [bankNameInput, setBankNameInput] = useState('');

  // Load profiles when screen mounts or on upload step
  useEffect(() => {
    if (step === 'upload') {
      loadProfiles(setSavedProfiles);
    }
  }, [step]);

  const handleDeleteProfile = async (profileId: string) => {
    Alert.alert(
      'Delete Profile',
      'Are you sure you want to delete this saved bank format?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteBankProfile(profileId);
              loadProfiles(setSavedProfiles);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete profile');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

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

  const handleParse = async () => {
    if (!csvContent.trim()) {
      Alert.alert('Error', 'Please enter CSV data or click "Load Sample"');
      return;
    }

    try {
      setLoading(true);
      const rows = csvContent.split('\n').filter(line => line.trim());
      setCsvRows(rows);

      if (rows.length === 0) {
        Alert.alert('Error', 'CSV appears to be empty');
        return;
      }

      const headerRow = rows[0].split(',').map(h => h.trim());
      setColumnOptions(headerRow);

      // Check if this matches a saved bank profile
      const matched = await findMatchingProfile(headerRow);
      if (matched) {
        setMatchedProfile(matched);
        setColumnMapping(matched.columnMapping);
        // Show option to use saved format
        setStep('mapping');
      } else {
        // Auto-detect columns for new format
        const detected = autoDetectColumns(rows);
        if (detected) {
          setColumnMapping(detected);
        } else {
          // If auto-detection fails, use default mapping (0, 1, 2)
          setColumnMapping({
            dateColumn: 0,
            descriptionColumn: 1,
            amountColumn: 2,
          });
        }
        setMatchedProfile(null);
        setStep('mapping');
      }
    } catch (error) {
      Alert.alert('Parse Error', `Failed to parse CSV: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMapping = () => {
    if (!columnMapping) {
      Alert.alert('Error', 'Please select column mappings');
      return;
    }

    try {
      setLoading(true);
      const result = parseCSVWithMapping(csvContent, columnMapping);
      setParsed(result);

      // If using saved profile, mark it
      if (matchedProfile) {
        setSkipMapping(true);
      }

      setStep('review');
    } catch (error) {
      Alert.alert('Parse Error', `Failed to parse CSV with mapping: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportAndCreateTactics = async () => {
    if (!parsed || !columnMapping || csvRows.length === 0) return;

    try {
      // Add all parsed transactions to the app
      let addedCount = 0;
      parsed.transactions.forEach((transaction) => {
        // Shared duplicate guard — same rule used by the Reconciliation screen
        const exists = isDuplicateTransaction(transaction, existingTransactions as any);

        if (!exists) {
          addTransaction({
            description: transaction.description,
            type: transaction.type,
            category: transaction.category,
            amount: transaction.amount,
            date: transaction.date,
            vendorCustomer: extractVendorCustomer(transaction.description),
          } as any);
          addedCount++;
        }
      });

      setImportedCount(addedCount);

      // If this was a new format (not a saved profile), offer to save it via a
      // cross-platform modal (Alert.prompt is iOS-only and fails on web/Android).
      if (!matchedProfile && !skipMapping) {
        setBankNameInput('');
        setShowSaveModal(true);
      } else {
        setStep('complete');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to import transactions: ${error}`);
    }
  };

  const handleSaveFormat = async () => {
    const name = bankNameInput.trim();
    if (name && columnMapping && csvRows.length > 0) {
      try {
        const headerRow = csvRows[0].split(',').map(h => h.trim());
        await saveBankProfile(name, columnMapping, headerRow);
        Alert.alert('Success', `Saved "${name}" format for future imports`);
      } catch (error) {
        console.error('Error saving profile:', error);
      }
    }
    setShowSaveModal(false);
    setStep('complete');
  };

  const extractVendorCustomer = (description: string): string => {
    // Try to extract vendor/customer name from description
    const parts = description.split(/[#\-:\|]/);
    return parts[0]?.trim() || description;
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

          {/* CSV Input — real cross-platform text field (works on web/Android/iOS) */}
          <Text style={styles.inputLabel}>Paste CSV Content:</Text>
          <View style={styles.textInputContainer}>
            <TextInput
              style={styles.textInput}
              value={csvContent}
              onChangeText={setCsvContent}
              placeholder={'Paste your bank statement CSV here...\nDate,Description,Amount,Type'}
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              autoCorrect={false}
              autoCapitalize="none"
            />
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

          {/* Saved Bank Formats */}
          {savedProfiles.length > 0 && (
            <View style={styles.savedProfilesSection}>
              <TouchableOpacity
                style={styles.savedProfilesHeader}
                onPress={() => setShowProfiles(!showProfiles)}
              >
                <Text style={styles.savedProfilesTitle}>
                  💾 Saved Bank Formats ({savedProfiles.length})
                </Text>
                <Text style={styles.savedProfilesArrow}>
                  {showProfiles ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {showProfiles && (
                <View style={styles.savedProfilesList}>
                  {savedProfiles.map((profile) => {
                    const info = formatProfileInfo(profile);
                    return (
                      <View key={profile.id} style={styles.profileItem}>
                        <View style={styles.profileInfo}>
                          <Text style={styles.profileName}>🏦 {info.displayName}</Text>
                          <Text style={styles.profileMeta}>{info.lastUsed}</Text>
                          <Text style={styles.profileUsage}>{info.usageCount}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.profileDeleteButton}
                          onPress={() => handleDeleteProfile(profile.id)}
                        >
                          <Text style={styles.profileDeleteText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Info */}
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>💡 Tips:</Text>
            <Text style={styles.warningText}>
              • Extracted transactions are saved to your records (Reports, Transactions & Invoices){'\n'}
              • The raw statement file itself is not kept — only the transactions you import{'\n'}
              • We identify revenue trends, expense concentration, and cash gaps{'\n'}
              • App remembers your bank formats for faster imports next time{'\n'}
              • Tactics auto-add to Action Tracker for execution
            </Text>
          </View>
        </ScrollView>
        <FooterNav />
      </SafeAreaView>
    );
  }

  if (step === 'mapping' && csvRows.length > 0) {
    const headerRow = csvRows[0].split(',').map(h => h.trim());

    return (
      <SafeAreaView style={styles.safe}>
        <Header />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
          {matchedProfile ? (
            <>
              <Text style={styles.title}>🏦 Recognized Bank Format</Text>
              <Text style={styles.subtitle}>
                We found your {matchedProfile.bankName} format
              </Text>

              {/* Matched Profile Card */}
              <View style={styles.matchedProfileCard}>
                <View style={styles.matchedProfileHeader}>
                  <Text style={styles.matchedProfileBank}>🏦 {matchedProfile.bankName}</Text>
                  <Text style={styles.matchedProfileUsage}>
                    Used {matchedProfile.importCount} {matchedProfile.importCount === 1 ? 'time' : 'times'}
                  </Text>
                </View>

                <Text style={styles.matchedProfileLabel}>Column Mapping:</Text>
                <View style={styles.matchedProfileMapping}>
                  <Text style={styles.matchedProfileMappingItem}>
                    📅 Date: {headerRow[columnMapping?.dateColumn ?? 0] || 'Column A'}
                  </Text>
                  <Text style={styles.matchedProfileMappingItem}>
                    📝 Description: {headerRow[columnMapping?.descriptionColumn ?? 1] || 'Column B'}
                  </Text>
                  <Text style={styles.matchedProfileMappingItem}>
                    💰 Amount: {headerRow[columnMapping?.amountColumn ?? 2] || 'Column C'}
                  </Text>
                  {columnMapping?.typeColumn !== undefined && (
                    <Text style={styles.matchedProfileMappingItem}>
                      🏷️ Type: {headerRow[columnMapping.typeColumn] || 'Column D'}
                    </Text>
                  )}
                </View>
              </View>

              {/* CSV Preview */}
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>CSV Preview:</Text>
                {csvRows.slice(0, 5).map((row, idx) => (
                  <Text
                    key={idx}
                    style={[
                      styles.previewText,
                      idx === 0 && { fontWeight: '700', color: Colors.primary },
                    ]}
                  >
                    {row}
                  </Text>
                ))}
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => {
                  setMatchedProfile(null);
                  setStep('mapping');
                }}>
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleConfirmMapping}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? '⏳ Processing...' : '✓ Use Format'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>🗂️ Map Columns</Text>
              <Text style={styles.subtitle}>
                Tell us which columns contain date, description, and amount
              </Text>

              {/* CSV Preview */}
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>CSV Preview:</Text>
                {csvRows.slice(0, 5).map((row, idx) => (
                  <Text
                    key={idx}
                    style={[
                      styles.previewText,
                      idx === 0 && { fontWeight: '700', color: Colors.primary },
                    ]}
                  >
                    {row}
                  </Text>
                ))}
              </View>

          {/* Column Mapping UI */}
          <View style={styles.mappingContainer}>
            <Text style={styles.mappingLabel}>📅 Date Column</Text>
            <TouchableOpacity
              style={styles.columnSelector}
              onPress={() => setShowColumnSelector('date')}
            >
              <Text style={styles.columnSelectorText}>
                {columnMapping ? headerRow[columnMapping.dateColumn] : 'Select column...'}
              </Text>
              <Text style={styles.columnSelectorArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.mappingLabel}>📝 Description Column</Text>
            <TouchableOpacity
              style={styles.columnSelector}
              onPress={() => setShowColumnSelector('description')}
            >
              <Text style={styles.columnSelectorText}>
                {columnMapping ? headerRow[columnMapping.descriptionColumn] : 'Select column...'}
              </Text>
              <Text style={styles.columnSelectorArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.mappingLabel}>💰 Amount Column</Text>
            <TouchableOpacity
              style={styles.columnSelector}
              onPress={() => setShowColumnSelector('amount')}
            >
              <Text style={styles.columnSelectorText}>
                {columnMapping ? headerRow[columnMapping.amountColumn] : 'Select column...'}
              </Text>
              <Text style={styles.columnSelectorArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.mappingLabel}>🏷️ Type Column (Optional)</Text>
            <TouchableOpacity
              style={styles.columnSelector}
              onPress={() => setShowColumnSelector('type')}
            >
              <Text style={styles.columnSelectorText}>
                {columnMapping?.typeColumn !== undefined
                  ? headerRow[columnMapping.typeColumn]
                  : 'Auto-detect'}
              </Text>
              <Text style={styles.columnSelectorArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Column Selector Modal */}
          <Modal
            visible={showColumnSelector !== null}
            transparent
            animationType="slide"
            onRequestClose={() => setShowColumnSelector(null)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  Select {showColumnSelector === 'date' ? 'Date' :
                          showColumnSelector === 'description' ? 'Description' :
                          showColumnSelector === 'amount' ? 'Amount' : 'Type'} Column
                </Text>
                <FlatList
                  data={headerRow}
                  keyExtractor={(_, idx) => idx.toString()}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      style={styles.columnOption}
                      onPress={() => {
                        if (showColumnSelector === 'date') {
                          setColumnMapping(prev => ({ ...prev!, dateColumn: index }));
                        } else if (showColumnSelector === 'description') {
                          setColumnMapping(prev => ({ ...prev!, descriptionColumn: index }));
                        } else if (showColumnSelector === 'amount') {
                          setColumnMapping(prev => ({ ...prev!, amountColumn: index }));
                        } else if (showColumnSelector === 'type') {
                          setColumnMapping(prev => ({ ...prev!, typeColumn: index }));
                        }
                        setShowColumnSelector(null);
                      }}
                    >
                      <Text style={styles.columnOptionText}>{item}</Text>
                    </TouchableOpacity>
                  )}
                  scrollEnabled
                />
                {showColumnSelector === 'type' && (
                  <TouchableOpacity
                    style={styles.columnOption}
                    onPress={() => {
                      setColumnMapping(prev => ({ ...prev!, typeColumn: undefined }));
                      setShowColumnSelector(null);
                    }}
                  >
                    <Text style={[styles.columnOptionText, { color: Colors.primary, fontWeight: '600' }]}>
                      Auto-detect
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowColumnSelector(null)}
                >
                  <Text style={styles.modalCloseText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>💡 About Column Mapping:</Text>
            <Text style={styles.infoText}>
              • Type column is optional - we'll auto-detect income vs expense from descriptions{'\n'}
              • We'll remember this mapping for future imports from the same bank
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setStep('upload')}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleConfirmMapping}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? '⏳ Parsing...' : '✓ Confirm Mapping'}
              </Text>
            </TouchableOpacity>
          </View>
            </>
          )}
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

        {/* Save Bank Format Modal (cross-platform replacement for Alert.prompt) */}
        <Modal visible={showSaveModal} transparent animationType="fade" onRequestClose={() => handleSaveFormat()}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: 20 }]}>
              <Text style={styles.modalTitle}>💾 Save Bank Format?</Text>
              <Text style={[styles.infoText, { marginBottom: 12 }]}>
                Name this bank so we can auto-recognize its format next time (optional).
              </Text>
              <TextInput
                style={styles.input}
                value={bankNameInput}
                onChangeText={setBankNameInput}
                placeholder="e.g., GTBank, UBA, Access Bank"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                autoCapitalize="words"
              />
              <View style={[styles.buttonContainer, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={() => { setShowSaveModal(false); setStep('complete'); }}
                >
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>Not Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton, { marginBottom: 0 }]}
                  onPress={handleSaveFormat}
                >
                  <Text style={styles.buttonText}>Save Format</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
            {importedCount} transactions added • {parsed?.generatedTactics.length || 0} tactics generated
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

          {/* Data Availability Section */}
          <View style={styles.dataAvailabilitySection}>
            <Text style={styles.dataAvailabilityTitle}>📍 Your data is now available in:</Text>

            <TouchableOpacity
              style={styles.dataCard}
              onPress={() => setCurrentScreen('reports')}
            >
              <Text style={styles.dataCardIcon}>📊</Text>
              <View style={styles.dataCardContent}>
                <Text style={styles.dataCardTitle}>Financial Reports</Text>
                <Text style={styles.dataCardDesc}>View in P&L, Balance Sheet, and Cash Flow</Text>
              </View>
              <Text style={styles.dataCardArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dataCard}
              onPress={() => setCurrentScreen('transactions')}
            >
              <Text style={styles.dataCardIcon}>📝</Text>
              <View style={styles.dataCardContent}>
                <Text style={styles.dataCardTitle}>Transactions Screen</Text>
                <Text style={styles.dataCardDesc}>All {importedCount} transactions listed and categorized</Text>
              </View>
              <Text style={styles.dataCardArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dataCard}
              onPress={() => setCurrentScreen('invoices')}
            >
              <Text style={styles.dataCardIcon}>💵</Text>
              <View style={styles.dataCardContent}>
                <Text style={styles.dataCardTitle}>Sales & Invoices</Text>
                <Text style={styles.dataCardDesc}>Link income transactions to customer invoices</Text>
              </View>
              <Text style={styles.dataCardArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dataCard}
              onPress={() => setCurrentScreen('action-tracker')}
            >
              <Text style={styles.dataCardIcon}>⚡</Text>
              <View style={styles.dataCardContent}>
                <Text style={styles.dataCardTitle}>Action Tracker</Text>
                <Text style={styles.dataCardDesc}>{parsed?.generatedTactics.length || 0} tactics ready to execute</Text>
              </View>
              <Text style={styles.dataCardArrow}>→</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.nextSteps}>
            <Text style={styles.nextStepsTitle}>💡 What's Next:</Text>
            <Text style={styles.nextStepsText}>
              1. 📊 Review your financial reports with new data{'\n'}
              2. 💵 Check sales breakdown by customer{'\n'}
              3. ⚡ Execute high-impact tactics from Action Tracker{'\n'}
              4. 📈 Track progress and adjust strategies
            </Text>
          </View>

          <View style={styles.completeButtonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setCurrentScreen('reports')}
            >
              <Text style={styles.buttonText}>📊 View Financial Reports</Text>
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
  textInput: { fontSize: 11, color: Colors.textSecondary, lineHeight: 17, minHeight: 100, padding: 0 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textPrimary,
  },

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

  // Saved profiles
  savedProfilesSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  savedProfilesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  savedProfilesTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  savedProfilesArrow: { fontSize: 12, color: Colors.textMuted },
  savedProfilesList: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 14 },
  profileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  profileMeta: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  profileUsage: { fontSize: 9, color: Colors.textMuted, fontStyle: 'italic' },
  profileDeleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.expense + '20',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.expense,
  },
  profileDeleteText: { fontSize: 10, fontWeight: '600', color: Colors.expense },

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

  // Mapping screen
  mappingContainer: { marginBottom: 16 },
  mappingLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginTop: 12, marginBottom: 8 },
  columnSelector: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  columnSelectorText: { fontSize: 13, color: Colors.textPrimary, flex: 1 },
  columnSelectorArrow: { fontSize: 12, color: Colors.textMuted, marginLeft: 10 },

  // Matched profile
  matchedProfileCard: {
    backgroundColor: Colors.primary + '15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  matchedProfileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchedProfileBank: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  matchedProfileUsage: { fontSize: 11, color: Colors.textMuted },
  matchedProfileLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  matchedProfileMapping: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12 },
  matchedProfileMappingItem: { fontSize: 11, color: Colors.textSecondary, marginBottom: 6, lineHeight: 17 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  columnOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  columnOptionText: { fontSize: 14, color: Colors.textSecondary },
  modalCloseButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 12,
  },
  modalCloseText: { fontSize: 13, fontWeight: '700', color: '#fff' },

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

  dataAvailabilitySection: { width: '100%', marginBottom: 20 },
  dataAvailabilityTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },

  dataCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  dataCardIcon: { fontSize: 28 },
  dataCardContent: { flex: 1 },
  dataCardTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  dataCardDesc: { fontSize: 10, color: Colors.textMuted },
  dataCardArrow: { fontSize: 14, color: Colors.primary, fontWeight: '700' },

  completeButtonContainer: { width: '100%', gap: 10 },
});

function getPriorityColor(priority: number): string {
  if (priority >= 8) return Colors.expense;
  if (priority >= 6) return Colors.warning;
  return Colors.primary;
}
