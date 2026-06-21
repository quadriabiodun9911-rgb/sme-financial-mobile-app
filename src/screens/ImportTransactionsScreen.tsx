import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, StyleSheet,
    Alert, ActivityIndicator, FlatList, Modal, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { parsePdfStatement } from '../utils/pdfParser';

// ─── Types ───────────────────────────────────────────────────────────────────

type TxCategory = 'income' | 'expense' | 'cost' | 'asset' | 'unknown';

interface ParsedRow {
    id:          string;
    date:        string;       // ISO
    description: string;
    amount:      number;
    type:        'income' | 'expense';
    category:    TxCategory;
    subCategory: string;
    flagged:     boolean;      // true = needs user attention
    raw:         Record<string, string>;
}

// ─── Nigerian bank column name aliases ───────────────────────────────────────

const DATE_ALIASES   = ['date', 'trans. date', 'transaction date', 'value date', 'txn date', 'trans date', 'posting date'];
const DESC_ALIASES   = ['description', 'narration', 'details', 'remarks', 'transaction details', 'particulars', 'transaction description'];
const DEBIT_ALIASES  = ['debit', 'dr', 'withdrawals', 'debit amount', 'amount dr', 'withdrawal', 'debit (ngn)', 'dr amount'];
const CREDIT_ALIASES = ['credit', 'cr', 'deposits', 'credit amount', 'amount cr', 'deposit', 'credit (ngn)', 'cr amount'];
const AMOUNT_ALIASES = ['amount', 'transaction amount', 'value'];

// ─── Keyword → sub-category map ──────────────────────────────────────────────

const CATEGORY_RULES: { keywords: string[]; category: TxCategory; subCategory: string }[] = [
    { keywords: ['salary', 'payroll', 'wage', 'staff pay'],                                         category: 'expense',  subCategory: 'Payroll' },
    { keywords: ['rent', 'lease', 'office rent'],                                                   category: 'expense',  subCategory: 'Rent' },
    { keywords: ['diesel', 'fuel', 'petrol', 'gas station'],                                        category: 'expense',  subCategory: 'Fuel & Generator' },
    { keywords: ['airtime', 'data', 'mtn', 'airtel', 'glo', '9mobile', 'etisalat'],                category: 'expense',  subCategory: 'Utilities' },
    { keywords: ['electricity', 'nepa', 'phcn', 'eko electric', 'ikedc', 'aedc', 'kedco'],         category: 'expense',  subCategory: 'Utilities' },
    { keywords: ['water', 'lawma', 'waste'],                                                        category: 'expense',  subCategory: 'Utilities' },
    { keywords: ['internet', 'wifi', 'spectranet', 'smile', 'ipnx', 'swift'],                      category: 'expense',  subCategory: 'Internet' },
    { keywords: ['supplier', 'stock', 'inventory', 'goods', 'raw material', 'merchandise'],        category: 'cost',     subCategory: 'Cost of Goods' },
    { keywords: ['equipment', 'laptop', 'machine', 'vehicle', 'generator', 'furniture', 'asset'],  category: 'asset',    subCategory: 'Asset Purchase' },
    { keywords: ['advert', 'marketing', 'promotion', 'flyer', 'banner', 'social media', 'google'], category: 'expense',  subCategory: 'Marketing' },
    { keywords: ['transport', 'uber', 'bolt', 'taxi', 'logistics', 'dispatch', 'delivery'],        category: 'expense',  subCategory: 'Transport' },
    { keywords: ['pos purchase', 'pos payment', 'pos trxn'],                                       category: 'expense',  subCategory: 'POS Purchase' },
    { keywords: ['loan repayment', 'loan payment', 'emi', 'mortgage repayment'],                   category: 'expense',  subCategory: 'Loan Repayment' },
    { keywords: ['bank charge', 'sms charge', 'maintenance fee', 'card fee', 'vat charge'],        category: 'expense',  subCategory: 'Bank Charges' },
    // Income signals
    { keywords: ['invoice', 'sales', 'revenue', 'payment received', 'customer payment'],           category: 'income',   subCategory: 'Sales Revenue' },
    { keywords: ['transfer from', 'trf from', 'payment from'],                                     category: 'income',   subCategory: 'Transfer Received' },
    { keywords: ['interest earned', 'interest credit'],                                             category: 'income',   subCategory: 'Interest' },
    { keywords: ['refund', 'reversal'],                                                             category: 'income',   subCategory: 'Refund' },
];

// ─── Learned rules (in-memory, session only) ─────────────────────────────────
const learnedRules: Map<string, { category: TxCategory; subCategory: string }> = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(s: string) {
    return (s || '').toLowerCase().trim();
}

function findCol(headers: string[], aliases: string[]): string | null {
    for (const h of headers) {
        if (aliases.includes(normalise(h))) return h;
    }
    // Partial match fallback
    for (const h of headers) {
        for (const a of aliases) {
            if (normalise(h).includes(a) || a.includes(normalise(h))) return h;
        }
    }
    return null;
}

function parseAmount(raw: string): number {
    if (!raw) return 0;
    // Remove currency symbols, spaces, commas → parse float
    return Math.abs(parseFloat(raw.replace(/[₦$€£,\s]/g, '')) || 0);
}

function toDateString(dt: Date): string {
    const y  = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const d  = String(dt.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

function parseDate(raw: string): string {
    if (!raw) return toDateString(new Date());
    // Try common Nigerian bank date formats
    const formats = [
        // DD/MM/YYYY or DD-MM-YYYY
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
        // DD-Mon-YYYY (e.g. 15-Jun-2025)
        /^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{4})$/,
        // YYYY-MM-DD
        /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
    ];
    const months: Record<string, number> = {
        jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
        jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    };

    for (const fmt of formats) {
        const m = raw.trim().match(fmt);
        if (m) {
            let y: number, mo: number, d: number;
            if (fmt === formats[0]) { [, d, mo, y] = m.map(Number) as any; }
            else if (fmt === formats[1]) { d = +m[1]; mo = months[m[2].toLowerCase()]; y = +m[3]; }
            else { [, y, mo, d] = m.map(Number) as any; }
            const dt = new Date(y, mo - 1, d);
            if (!isNaN(dt.getTime())) return toDateString(dt);
        }
    }
    // Last resort
    const fallback = new Date(raw);
    return isNaN(fallback.getTime()) ? toDateString(new Date()) : toDateString(fallback);
}

function classifyByDescription(desc: string, direction: 'income' | 'expense'): { category: TxCategory; subCategory: string; flagged: boolean } {
    const d = normalise(desc);

    // Check learned rules first
    for (const [pattern, result] of learnedRules.entries()) {
        if (d.includes(pattern)) return { ...result, flagged: false };
    }

    for (const rule of CATEGORY_RULES) {
        if (rule.keywords.some(k => d.includes(k))) {
            return { category: rule.category, subCategory: rule.subCategory, flagged: false };
        }
    }

    // Default to direction with unknown sub-category → flagged for review
    return { category: direction, subCategory: direction === 'income' ? 'Other Income' : 'Other Expense', flagged: true };
}

// ─── CSV/Excel parser ─────────────────────────────────────────────────────────

function parseRows(raw: Record<string, string>[]): { rows: ParsedRow[]; error?: string } {
    if (!raw.length) return { rows: [], error: 'File is empty or has no data rows.' };

    const headers = Object.keys(raw[0]);

    const dateCol   = findCol(headers, DATE_ALIASES);
    const descCol   = findCol(headers, DESC_ALIASES);
    const debitCol  = findCol(headers, DEBIT_ALIASES);
    const creditCol = findCol(headers, CREDIT_ALIASES);
    const amtCol    = findCol(headers, AMOUNT_ALIASES);

    if (!dateCol)  return { rows: [], error: `Could not find a date column. Headers found: ${headers.join(', ')}` };
    if (!descCol)  return { rows: [], error: `Could not find a description/narration column. Headers found: ${headers.join(', ')}` };

    const hasSplitAmounts = debitCol && creditCol;
    const hasSingleAmount = !hasSplitAmounts && amtCol;

    if (!hasSplitAmounts && !hasSingleAmount) {
        return { rows: [], error: `Could not find amount columns. Headers found: ${headers.join(', ')}` };
    }

    const rows: ParsedRow[] = [];
    let i = 0;

    for (const r of raw) {
        const dateRaw  = r[dateCol!]  || '';
        const descRaw  = r[descCol!]  || '';

        // Skip blank rows
        if (!dateRaw.trim() && !descRaw.trim()) continue;

        let debit = 0, credit = 0;

        if (hasSplitAmounts) {
            debit  = parseAmount(r[debitCol!]  || '');
            credit = parseAmount(r[creditCol!] || '');
        } else {
            const amt = parseAmount(r[amtCol!] || '');
            // Negative = debit (money out), positive = credit (money in)
            const rawAmt = parseFloat((r[amtCol!] || '').replace(/[₦$€£,\s]/g, ''));
            if (rawAmt < 0) debit = amt;
            else credit = amt;
        }

        const amount    = credit > 0 ? credit : debit;
        const direction: 'income' | 'expense' = credit > 0 ? 'income' : 'expense';
        const { category, subCategory, flagged } = classifyByDescription(descRaw, direction);

        rows.push({
            id:          `imp_${Date.now()}_${i++}`,
            date:        parseDate(dateRaw),
            description: descRaw.trim(),
            amount,
            type:        direction,
            category,
            subCategory,
            flagged,
            raw:         r,
        });
    }

    return { rows };
}

// ─── Category options shown in the picker ────────────────────────────────────

const CATEGORY_OPTIONS: { label: string; category: TxCategory; subCategory: string }[] = [
    { label: '💰 Sales Revenue',     category: 'income',   subCategory: 'Sales Revenue' },
    { label: '💰 Transfer Received', category: 'income',   subCategory: 'Transfer Received' },
    { label: '💰 Other Income',      category: 'income',   subCategory: 'Other Income' },
    { label: '📦 Cost of Goods',     category: 'cost',     subCategory: 'Cost of Goods' },
    { label: '🏭 Payroll',           category: 'expense',  subCategory: 'Payroll' },
    { label: '🏠 Rent',              category: 'expense',  subCategory: 'Rent' },
    { label: '⚡ Utilities',         category: 'expense',  subCategory: 'Utilities' },
    { label: '🌐 Internet',          category: 'expense',  subCategory: 'Internet' },
    { label: '⛽ Fuel & Generator',  category: 'expense',  subCategory: 'Fuel & Generator' },
    { label: '📢 Marketing',         category: 'expense',  subCategory: 'Marketing' },
    { label: '🚗 Transport',         category: 'expense',  subCategory: 'Transport' },
    { label: '🛍️ POS Purchase',      category: 'expense',  subCategory: 'POS Purchase' },
    { label: '🏦 Bank Charges',      category: 'expense',  subCategory: 'Bank Charges' },
    { label: '💳 Loan Repayment',    category: 'expense',  subCategory: 'Loan Repayment' },
    { label: '📱 Other Expense',     category: 'expense',  subCategory: 'Other Expense' },
    { label: '🏢 Asset Purchase',    category: 'asset',    subCategory: 'Asset Purchase' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportTransactionsScreen() {
    const { navigate, addTransaction, settings } = useApp();
    const currency = (settings as any).currency || '₦';

    const [step,       setStep]       = useState<'upload' | 'preview' | 'done'>('upload');
    const [loading,    setLoading]    = useState(false);
    const [rows,       setRows]       = useState<ParsedRow[]>([]);
    const [error,      setError]      = useState('');
    const [pickerRow,  setPickerRow]  = useState<string | null>(null);
    const [imported,   setImported]   = useState(0);

    // Web fallback: hidden <input type="file"> for iOS Safari
    const webInputRef = useRef<any>(null);

    const processFile = useCallback(async (uri: string, name: string) => {
        setLoading(true);
        setError('');
        try {
            const isExcel = /\.(xlsx|xls)$/i.test(name);
            const isPdf   = /\.pdf$/i.test(name);
            let rawRows: Record<string, string>[] = [];

            // On native, fetch(file://) is unreliable — use expo-file-system for local URIs
            const readBuffer = async (fileUri: string): Promise<ArrayBuffer> => {
                if (Platform.OS !== 'web' && fileUri.startsWith('file://')) {
                    const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
                    const binary = atob(b64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    return bytes.buffer;
                }
                return (await fetch(fileUri)).arrayBuffer();
            };
            const readText = async (fileUri: string): Promise<string> => {
                if (Platform.OS !== 'web' && fileUri.startsWith('file://')) {
                    return FileSystem.readAsStringAsync(fileUri);
                }
                return (await fetch(fileUri)).text();
            };

            if (isPdf) {
                const buffer = await readBuffer(uri);
                const { rows: pdfRows, error: pdfError } = await parsePdfStatement(buffer);
                if (pdfError) { setError(pdfError); return; }
                rawRows = pdfRows;
            } else if (isExcel) {
                const buffer = await readBuffer(uri);
                const wb     = XLSX.read(buffer, { type: 'array' });
                const ws     = wb.Sheets[wb.SheetNames[0]];
                rawRows      = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
            } else {
                const text = await readText(uri);
                const parsed = Papa.parse<Record<string, string>>(text, {
                    header:          true,
                    skipEmptyLines:  true,
                    transformHeader: h => h.trim(),
                    transform:       v => v.trim(),
                });
                rawRows = parsed.data;
            }

            const { rows: parsed, error: parseError } = parseRows(rawRows);
            if (parseError) { setError(parseError); return; }
            setRows(parsed);
            setStep('preview');
        } catch (e: any) {
            setError(e?.message || 'Failed to read file. Make sure it is a CSV, Excel, or PDF file.');
        } finally {
            setLoading(false);
        }
    }, []);

    // ── File pick & parse ────────────────────────────────────────────────────
    const handlePickFile = useCallback(async () => {
        setError('');

        // On web (including iPhone Safari) use a native <input type="file">
        if (Platform.OS === 'web') {
            if (typeof document !== 'undefined') {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv,.xlsx,.xls,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf';
                input.onchange = async (e: any) => {
                    const file: File = e.target?.files?.[0];
                    if (!file) return;
                    const uri = URL.createObjectURL(file);
                    try {
                        await processFile(uri, file.name);
                    } finally {
                        URL.revokeObjectURL(uri);
                    }
                };
                input.click();
            }
            return;
        }

        // Native iOS / Android — use expo-document-picker
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'text/csv',
                    'text/comma-separated-values',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/pdf',
                    'public.comma-separated-values-text', // iOS UTI for CSV
                    'com.microsoft.excel.xls',            // iOS UTI for xls
                    'org.openxmlformats.spreadsheetml.sheet', // iOS UTI for xlsx
                    'com.adobe.pdf',                      // iOS UTI for PDF
                    '*/*',
                ],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;
            const file = result.assets[0];
            await processFile(file.uri, file.name);
        } catch (e: any) {
            setError(e?.message || 'Failed to open file. Please try again.');
            setLoading(false);
        }
    }, [processFile]);

    // ── Remove a row from preview ────────────────────────────────────────────
    const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

    // ── Change category on a row ─────────────────────────────────────────────
    const applyCategory = (rowId: string, opt: typeof CATEGORY_OPTIONS[number]) => {
        setRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            // Learn for future imports
            const key = normalise(r.description).split(' ').slice(0, 4).join(' ');
            learnedRules.set(key, { category: opt.category, subCategory: opt.subCategory });
            return { ...r, category: opt.category, subCategory: opt.subCategory, flagged: false };
        }));
        setPickerRow(null);
    };

    // ── Final import ─────────────────────────────────────────────────────────
    const handleImport = () => {
        const flagged = rows.filter(r => r.flagged);
        if (flagged.length > 0) {
            Alert.alert(
                `${flagged.length} transaction${flagged.length > 1 ? 's' : ''} need a category`,
                'Please assign a category to all flagged rows (marked ⚠️) before importing.',
            );
            return;
        }

        rows.forEach((r, idx) => {
            addTransaction({
                date:                r.date,
                description:         r.description,
                type:                r.type === 'income' ? 'income' : 'expense',
                category:            r.subCategory,
                amount:              r.amount,
                transactionCategory: r.category === 'cost'   ? 'cost'
                                   : r.category === 'asset'  ? 'purchase'
                                   : r.category === 'income' ? 'sale'
                                   : 'expense',
                reference:           `IMPORT-${Date.now()}-${idx}`,
            });
        });

        setImported(rows.length);
        setStep('done');
    };

    // ── Stats for header ─────────────────────────────────────────────────────
    const incomeRows  = rows.filter(r => r.type === 'income');
    const expenseRows = rows.filter(r => r.type === 'expense');
    const flaggedRows = rows.filter(r => r.flagged);
    const totalIn     = incomeRows.reduce((s, r)  => s + r.amount, 0);
    const totalOut    = expenseRows.reduce((s, r) => s + r.amount, 0);

    const fmt = (n: number) => `${currency}${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP: UPLOAD
    // ─────────────────────────────────────────────────────────────────────────
    if (step === 'upload') {
        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigate('settings')}>
                        <Text style={styles.backBtn}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Import Bank Statement</Text>
                </View>

                {/* How to export guide */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>How to export your statement</Text>
                    {[
                        { bank: 'GTBank',     steps: 'Internet banking → Accounts → Statement → Export → CSV' },
                        { bank: 'Access',     steps: 'Internet banking → History → Download → Excel' },
                        { bank: 'Zenith',     steps: 'Internet banking → Transactions → Export → CSV' },
                        { bank: 'UBA',        steps: 'UBA Internet banking → Statements → Download' },
                        { bank: 'First Bank', steps: 'FirstOnline → Account → E-Statement → Download' },
                        { bank: 'Others',     steps: 'Any bank → Transaction History → Export/Download → CSV or Excel' },
                    ].map(({ bank, steps }) => (
                        <View key={bank} style={styles.bankRow}>
                            <Text style={styles.bankName}>{bank}</Text>
                            <Text style={styles.bankSteps}>{steps}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Supported formats</Text>
                    <Text style={styles.supportedText}>✅  CSV  (.csv)</Text>
                    <Text style={styles.supportedText}>✅  Excel  (.xlsx  ·  .xls)</Text>
                    <Text style={styles.supportedText}>✅  PDF bank statements  (.pdf)</Text>
                    <Text style={styles.supportedText}>✅  Works with all Nigerian banks</Text>
                    <Text style={styles.supportedText}>✅  Processed on your device — never uploaded</Text>
                </View>

                {Platform.OS === 'ios' || (Platform.OS === 'web' && /iphone|ipad/i.test(navigator?.userAgent ?? '')) ? (
                    <View style={styles.iosGuideCard}>
                        <Text style={styles.iosGuideTitle}>📱 iPhone tip</Text>
                        <Text style={styles.iosGuideText}>
                            1. Open your bank's website or app and download your statement as <Text style={styles.bold}>Excel or CSV</Text>.{'\n'}
                            2. When the file downloads, tap <Text style={styles.bold}>"Files"</Text> to save it to your iPhone Files app.{'\n'}
                            3. Come back here and tap <Text style={styles.bold}>"Choose File"</Text> below — pick the file from Files.{'\n\n'}
                            💡 PDF bank statements are now supported directly — just pick the PDF from Files.
                        </Text>
                    </View>
                ) : null}

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>❌  {error}</Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    onPress={handlePickFile}
                    disabled={loading}
                >
                    {loading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnText}>📁  Choose file (CSV, Excel or PDF)</Text>
                    }
                </TouchableOpacity>
            </ScrollView>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP: DONE
    // ─────────────────────────────────────────────────────────────────────────
    if (step === 'done') {
        return (
            <View style={[styles.container, styles.centred]}>
                <Text style={styles.doneIcon}>✅</Text>
                <Text style={styles.doneTitle}>{imported} transactions imported</Text>
                <Text style={styles.doneSub}>Your dashboard and reports have been updated.</Text>
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 32, width: 220 }]} onPress={() => navigate('transactions')}>
                    <Text style={styles.primaryBtnText}>View Transactions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => { setStep('upload'); setRows([]); setError(''); }}>
                    <Text style={styles.ghostBtnText}>Import another file</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP: PREVIEW
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Fixed header */}
            <View style={styles.previewHeader}>
                <TouchableOpacity onPress={() => { setStep('upload'); setRows([]); }}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.previewTitle}>{rows.length} transactions found</Text>
                    {flaggedRows.length > 0 && (
                        <Text style={styles.flaggedNote}>⚠️  {flaggedRows.length} need a category — tap to fix</Text>
                    )}
                </View>
            </View>

            {/* Summary strip */}
            <View style={styles.summaryStrip}>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryVal}>{fmt(totalIn)}</Text>
                    <Text style={styles.summaryLabel}>Income</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryVal, { color: '#ef4444' }]}>{fmt(totalOut)}</Text>
                    <Text style={styles.summaryLabel}>Expenses</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryVal}>{incomeRows.length + expenseRows.length}</Text>
                    <Text style={styles.summaryLabel}>Rows</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryVal, flaggedRows.length > 0 ? { color: '#f59e0b' } : {}]}>
                        {flaggedRows.length}
                    </Text>
                    <Text style={styles.summaryLabel}>Flagged</Text>
                </View>
            </View>

            {/* Transaction rows */}
            <FlatList
                data={rows}
                keyExtractor={r => r.id}
                contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
                renderItem={({ item: r }) => (
                    <View style={[styles.txRow, r.flagged && styles.txRowFlagged]}>
                        <View style={styles.txLeft}>
                            <Text style={styles.txDate}>
                                {new Date(r.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                            </Text>
                            <Text style={styles.txDesc} numberOfLines={1}>{r.description}</Text>
                            <TouchableOpacity onPress={() => setPickerRow(r.id)} activeOpacity={0.7}>
                                <Text style={[styles.txCat, r.flagged && styles.txCatFlagged]}>
                                    {r.flagged ? '⚠️ Tap to categorise' : `${r.type === 'income' ? '💰' : '📤'} ${r.subCategory} ▾`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.txRight}>
                            <Text style={[styles.txAmount, { color: r.type === 'income' ? '#22c55e' : '#ef4444' }]}>
                                {r.type === 'income' ? '+' : '-'}{fmt(r.amount)}
                            </Text>
                            <TouchableOpacity onPress={() => removeRow(r.id)}>
                                <Text style={styles.removeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />

            {/* Import button — fixed bottom */}
            <View style={styles.importBar}>
                <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                    <Text style={styles.importBtnText}>
                        Import {rows.length} transaction{rows.length !== 1 ? 's' : ''}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Category picker modal */}
            <Modal visible={!!pickerRow} transparent animationType="slide" onRequestClose={() => setPickerRow(null)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerRow(null)}>
                    <View style={styles.modalSheet}>
                        <Text style={styles.modalTitle}>Select Category</Text>
                        <ScrollView>
                            {CATEGORY_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.subCategory}
                                    style={styles.catOption}
                                    onPress={() => pickerRow && applyCategory(pickerRow, opt)}
                                >
                                    <Text style={styles.catOptionText}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content:   { padding: 16, paddingBottom: 60 },
    centred:   { justifyContent: 'center', alignItems: 'center', padding: 32 },

    header:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    backBtn:   { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    title:     { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

    card:      { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },

    bankRow:   { marginBottom: 10 },
    bankName:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    bankSteps: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

    supportedText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },

    iosGuideCard:  { backgroundColor: '#1e3a5f', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.primary },
    iosGuideTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    iosGuideText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
    bold:          { fontWeight: '700', color: Colors.textPrimary },

    errorBox:  { backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
    errorText: { fontSize: 13, color: '#b91c1c', lineHeight: 20 },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    btnDisabled:    { opacity: 0.5 },

    ghostBtn:     { paddingVertical: 12, alignItems: 'center' },
    ghostBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },

    // Preview header
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    previewTitle:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    flaggedNote:   { fontSize: 12, color: '#f59e0b', marginTop: 2 },

    // Summary strip
    summaryStrip: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    summaryItem:  { flex: 1, alignItems: 'center', paddingVertical: 10 },
    summaryVal:   { fontSize: 13, fontWeight: '800', color: Colors.primary },
    summaryLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

    // Transaction rows
    txRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
    txRowFlagged: { borderWidth: 1.5, borderColor: '#f59e0b' },
    txLeft:       { flex: 1, paddingRight: 10 },
    txDate:       { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
    txDesc:       { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
    txCat:        { fontSize: 12, color: Colors.primary },
    txCatFlagged: { color: '#f59e0b' },
    txRight:      { alignItems: 'flex-end', gap: 8 },
    txAmount:     { fontSize: 14, fontWeight: '800' },
    removeBtn:    { fontSize: 16, color: Colors.textMuted, padding: 2 },

    // Fixed import bar
    importBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
    importBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    importBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Category picker modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet:   { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
    modalTitle:   { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },
    catOption:    { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
    catOptionText: { fontSize: 14, color: Colors.textPrimary },

    // Done screen
    doneIcon:  { fontSize: 64, marginBottom: 16 },
    doneTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
    doneSub:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 8 },
});
