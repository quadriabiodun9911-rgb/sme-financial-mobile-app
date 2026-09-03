import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, StyleSheet,
    Alert, ActivityIndicator, FlatList, Modal, Platform, useWindowDimensions, TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { parsePdfStatement } from '../utils/pdfParser';
import { filterNewTransactions } from '../utils/transactionDedup';
import { performFinancialDiagnosis, buildFinancialHealthInsightCards } from '../utils/financialDiagnosisEngine';
import { getMonthlyExpenseAverage } from '../utils/finance';
import { scanStatementImage, ScannedTransaction, ScanMediaType } from '../utils/statementScan';
import { confirmAction } from '../utils/webAlert';
import { TxCategory, classifyByDescription, loadLearnedRules, learnCategory, normalise } from '../utils/transactionCategorization';
import { auditEvents } from '../utils/auditLog';
import DataConfidenceBadge from '../components/DataConfidenceBadge';
import AhaMomentFeedback from '../components/AhaMomentFeedback';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedRow {
    id:          string;
    date:        string;       // ISO
    description: string;
    amount:      number;
    type:        'income' | 'expense';
    category:    TxCategory;
    subCategory: string;
    flagged:     boolean;      // true = needs user attention
    amountFlagged?: boolean;   // true = the amount itself looks like a parsing artifact (e.g. two columns fused together), not just an uncertain category
    raw:         Record<string, string>;
}

// ─── Nigerian bank column name aliases ───────────────────────────────────────

const DATE_ALIASES   = ['date', 'trans. date', 'transaction date', 'value date', 'txn date', 'trans date', 'posting date'];
const DESC_ALIASES   = ['description', 'narration', 'details', 'remarks', 'transaction details', 'particulars', 'transaction description'];
const DEBIT_ALIASES  = [
    'debit', 'dr', 'withdrawals', 'withdrawal', 'debit amount', 'amount dr', 'debit (ngn)', 'dr amount',
    'money out', 'paid out', 'outflow', 'debit(₦)', 'debit naira',
];
const CREDIT_ALIASES = [
    'credit', 'cr', 'deposits', 'deposit', 'credit amount', 'amount cr', 'credit (ngn)', 'cr amount',
    'money in', 'paid in', 'inflow', 'credit(₦)', 'credit naira',
];
const AMOUNT_ALIASES  = ['amount', 'transaction amount', 'value'];
const BALANCE_ALIASES = ['balance', 'running balance', 'closing balance', 'available balance', 'ledger balance', 'balance (ngn)'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Category keyword rules, learned-rules cache, and classifyByDescription now
// live in ../utils/transactionCategorization so ReconciliationScreen's
// unmatched-bank-row import shares the exact same categorization instead of
// its own (previously much cruder) copy.

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
    const cleaned = raw.replace(/[₦$€£,\s]/g, '');
    // A real amount has at most one decimal point. More than one is the
    // signature of two separate numbers having been fused together
    // upstream (most commonly a PDF column-bucketing artifact where a
    // stray item from an adjacent column — often the running balance —
    // gets joined into the same cell, and the join space is then stripped
    // by this very regex). parseFloat would otherwise silently keep only
    // the digits up to the second '.', truncating the real value instead
    // of failing loudly — treat it as unparseable so the row gets flagged
    // for review rather than importing a wrong number.
    if ((cleaned.match(/\./g) || []).length > 1) return 0;
    return Math.abs(parseFloat(cleaned) || 0);
}

// A parsed amount wildly out of proportion with the rest of the same
// statement is far more likely a parsing artifact (two adjacent columns
// fused into one number, a running balance mistaken for a transaction
// amount, etc.) than a genuine transaction — flag it for the owner to
// check rather than silently importing a number that could be off by
// orders of magnitude and corrupt every downstream revenue/profit total.
function flagAmountOutliers(rows: ParsedRow[]): ParsedRow[] {
    const amounts = rows.map(r => r.amount).filter(a => a > 0).sort((a, b) => a - b);
    if (amounts.length < 3) return rows;
    const median = amounts[Math.floor(amounts.length / 2)];
    // 25x the statement's own median, floored so a handful of small
    // transactions can't make a merely-large-but-real one look anomalous.
    const threshold = Math.max(median * 25, 10000000);
    return rows.map(r => r.amount > threshold ? { ...r, amountFlagged: true } : r);
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

// Rows like "Opening Balance" / "Closing Balance" aren't money moving in or
// out — they're a running total the bank prints at the top/bottom of a
// statement. They have no sensible income/expense/cost category because
// they're not a transaction at all, which is exactly why a user staring at
// "Tap to categorise" on one of these can never find the right answer —
// there isn't one. Drop them before they ever reach the review list.
const SUMMARY_ROW_KEYWORDS = [
    'opening balance', 'closing balance', 'balance b/f', 'balance c/f',
    'balance brought forward', 'balance carried forward', 'available balance',
    'ledger balance', 'statement balance', 'beginning balance', 'ending balance',
    'total debit', 'total credit', 'total withdrawals', 'total deposits',
];

function isSummaryRow(desc: string): boolean {
    const d = normalise(desc);
    return SUMMARY_ROW_KEYWORDS.some(k => d.includes(k));
}

// ─── CSV/Excel parser ─────────────────────────────────────────────────────────

function parseRows(raw: Record<string, string>[]): {
    rows: ParsedRow[]; error?: string; summaryRowsSkipped?: number;
    openingBalance?: number; closingBalance?: number;
} {
    if (!raw.length) return { rows: [], error: 'File is empty or has no data rows.' };

    const headers = Object.keys(raw[0]);

    const dateCol   = findCol(headers, DATE_ALIASES);
    const descCol   = findCol(headers, DESC_ALIASES);
    const debitCol  = findCol(headers, DEBIT_ALIASES);
    const creditCol = findCol(headers, CREDIT_ALIASES);
    const amtCol    = findCol(headers, AMOUNT_ALIASES);
    const balCol    = findCol(headers, BALANCE_ALIASES);

    if (!dateCol)  return { rows: [], error: `Could not find a date column. Headers found: ${headers.join(', ')}` };
    if (!descCol)  return { rows: [], error: `Could not find a description/narration column. Headers found: ${headers.join(', ')}` };

    const hasSplitAmounts = !!(debitCol && creditCol);
    const hasSingleAmount = !hasSplitAmounts && !!amtCol;
    // Some statements only ever print a running balance, no separate
    // amount/debit/credit column (common in crude PDF-table exports) — the
    // amount and direction can still be recovered from how the balance
    // moves between consecutive rows.
    const hasBalanceOnly  = !hasSplitAmounts && !hasSingleAmount && !!balCol;

    if (!hasSplitAmounts && !hasSingleAmount && !hasBalanceOnly) {
        return { rows: [], error: `Could not find amount columns. Headers found: ${headers.join(', ')}` };
    }

    // Extract the balance figure from a value column, or — if there's no
    // dedicated balance column — the last number-looking field in the raw
    // row (banks usually print the running balance last).
    const extractBalance = (r: Record<string, string>): number | null => {
        const raw = balCol ? r[balCol] : Object.values(r).slice().reverse().find(v => /\d/.test(v || ''));
        if (!raw) return null;
        const cleaned = String(raw).replace(/[₦$€£,\s]/g, '');
        // Same fused-numbers guard as parseAmount -- a balance figure with
        // more than one decimal point is a parsing artifact, not a real
        // value, and would otherwise silently poison every subsequent
        // row's balance-delta calculation.
        if ((cleaned.match(/\./g) || []).length > 1) return null;
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    };

    const rows: ParsedRow[] = [];
    let i = 0;
    let summaryRowsSkipped = 0;
    let openingBalance: number | undefined;
    let closingBalance: number | undefined;
    let prevBalance: number | null = null;

    for (const r of raw) {
        const dateRaw  = r[dateCol!]  || '';
        const descRaw  = r[descCol!]  || '';

        // Skip blank rows
        if (!dateRaw.trim() && !descRaw.trim()) continue;

        // Opening/closing balance lines aren't transactions — they're the
        // running total the bank prints at the top/bottom of the
        // statement. Capture their actual value (so the business's
        // start-of-month and end-of-month position isn't lost) instead of
        // just discarding the line.
        if (isSummaryRow(descRaw)) {
            summaryRowsSkipped++;
            const bal = extractBalance(r);
            if (bal !== null) {
                const d = normalise(descRaw);
                if (openingBalance === undefined && /open|brought forward|beginning/.test(d)) {
                    openingBalance = bal;
                    prevBalance = bal;
                } else {
                    closingBalance = bal; // last matching summary line wins
                }
            }
            continue;
        }

        let debit = 0, credit = 0;

        if (hasSplitAmounts) {
            debit  = parseAmount(r[debitCol!]  || '');
            credit = parseAmount(r[creditCol!] || '');
            // Also track the running balance alongside explicit
            // debit/credit columns when a Balance column is present, so
            // the closing position is still known even with no explicit
            // "Closing Balance" summary line in the file.
            if (balCol) { const b = extractBalance(r); if (b !== null) prevBalance = b; }
        } else if (hasSingleAmount) {
            const amt = parseAmount(r[amtCol!] || '');
            // Negative = debit (money out), positive = credit (money in)
            const rawAmt = parseFloat((r[amtCol!] || '').replace(/[₦$€£,\s]/g, ''));
            if (rawAmt < 0) debit = amt;
            else credit = amt;
            if (balCol) { const b = extractBalance(r); if (b !== null) prevBalance = b; }
        } else {
            // Balance-delta fallback: how much the running balance moved
            // tells us both the amount and whether it was money in or out.
            const bal = extractBalance(r);
            if (bal === null) continue;
            if (prevBalance === null) {
                // No opening balance to anchor the very first row against —
                // can't tell direction yet, just seed the baseline and move on.
                prevBalance = bal;
                continue;
            }
            const delta = bal - prevBalance;
            if (delta >= 0) credit = delta; else debit = Math.abs(delta);
            prevBalance = bal;
        }

        const amount = credit > 0 ? credit : debit;
        // A zero amount here means either a no-op balance line (delta 0) or
        // an amount that failed to parse (parseAmount's fused-numbers
        // guard) — neither is a real transaction worth importing as noise.
        if (amount <= 0) continue;
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

    // If no explicit "Closing Balance" line was found, the last row's
    // running balance (when available) is the closing position.
    if (closingBalance === undefined && prevBalance !== null) closingBalance = prevBalance;

    return { rows: flagAmountOutliers(rows), summaryRowsSkipped, openingBalance, closingBalance };
}

// ─── Scanned photo/PDF → preview rows ────────────────────────────────────────
// Reuses the same classifyByDescription auto-categoriser the CSV/Excel/PDF
// path uses, so a scanned receipt lands in the identical review step
// (flagged rows, category picker, dedup) instead of a separate flow.
function rowsFromScan(transactions: ScannedTransaction[]): ParsedRow[] {
    const rows = transactions.map((t, i) => {
        const { category, subCategory, flagged } = classifyByDescription(t.description, t.direction);
        return {
            id:          `scan_${Date.now()}_${i}`,
            date:        parseDate(t.date),
            description: t.description.trim() || 'Scanned transaction',
            amount:      Math.abs(t.amount) || 0,
            type:        t.direction,
            category,
            subCategory,
            flagged,
            raw:         {},
        };
    }).filter(r => r.amount > 0);
    return flagAmountOutliers(rows);
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
    // A deliberate escape hatch: forcing a guess out of someone who genuinely
    // doesn't know what a line item was leads to bad data (wrong category
    // silently treated as certain). This imports it safely as Uncategorized
    // instead of blocking the whole import or teaching the auto-categoriser
    // a wrong pattern — it can be fixed later from the Transactions screen.
    { label: '🤷 Not sure — skip for now', category: 'unknown', subCategory: 'Uncategorized' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportTransactionsScreen() {
    const { navigate, goBack, addTransaction, transactions, invoices, finance, settings, loans, inventory, assets } = useApp();
    const currency = (settings as any).currency || '₦';

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheet so it doesn't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [step,       setStep]       = useState<'upload' | 'preview' | 'done'>('upload');
    const [loading,    setLoading]    = useState(false);
    const [rows,       setRows]       = useState<ParsedRow[]>([]);
    const [error,      setError]      = useState('');
    const [pickerRow,  setPickerRow]  = useState<string | null>(null);
    const [customCategoryLabel, setCustomCategoryLabel] = useState('');
    const [editAmountRow, setEditAmountRow] = useState<string | null>(null);
    const [editAmountValue, setEditAmountValue] = useState('');
    const [skippedNote, setSkippedNote] = useState('');
    const [openingBalance, setOpeningBalance] = useState<number | undefined>(undefined);
    const [closingBalance, setClosingBalance] = useState<number | undefined>(undefined);
    const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
    const [imported,   setImported]   = useState(0);
    const [importedIn,  setImportedIn]  = useState(0);
    const [importedOut, setImportedOut] = useState(0);
    const [scanning,   setScanning]   = useState(false);
    const [scanWarning, setScanWarning] = useState('');

    // Web fallback: hidden <input type="file"> for iOS Safari
    const webInputRef = useRef<any>(null);

    useEffect(() => { loadLearnedRules(); }, []);

    // Run diagnosis on the freshly-imported data immediately, right where the
    // business owner already is, instead of making them navigate away to
    // Financial Assessment to find out what the import actually means.
    // transactions/invoices here already reflect the just-imported rows —
    // addTransaction updates context state, this screen re-renders with it.
    const diagnosis = React.useMemo(() => {
        if (step !== 'done') return null;
        return performFinancialDiagnosis(
            transactions,
            invoices,
            finance.cashBalance,
            getMonthlyExpenseAverage(finance.expense, transactions),
            currency,
            loans,
            inventory,
            assets
        );
    }, [step, transactions, invoices, finance, currency, loans, inventory, assets]);

    const processFile = useCallback(async (uri: string, name: string) => {
        setLoading(true);
        setError('');
        try {
            await loadLearnedRules();
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
                const wb     = new ExcelJS.Workbook();
                await wb.xlsx.load(buffer);
                const ws = wb.worksheets[0];
                if (!ws) throw new Error('No worksheet found in Excel file');
                const headers: string[] = [];
                ws.getRow(1).eachCell((cell) => { headers.push(String(cell.value ?? '').trim()); });
                ws.eachRow((row, rowNum) => {
                    if (rowNum === 1) return;
                    const obj: Record<string, string> = {};
                    row.eachCell((cell, colNum) => {
                        const key = headers[colNum - 1];
                        if (key) obj[key] = String(cell.value ?? '').trim();
                    });
                    if (Object.values(obj).some(v => v)) rawRows.push(obj);
                });
            } else {
                const text = await readText(uri);
                // .txt exports vary by bank — comma, tab, pipe, or semicolon
                // delimited are all common. Papa.parse's own auto-detect only
                // kicks in when delimiter is omitted, but is unreliable on
                // single-line headers, so sniff it ourselves from the first
                // line first and only fall back to Papa's guess.
                const firstLine = text.split(/\r?\n/, 1)[0] || '';
                const delimiterCounts: Record<string, number> = {
                    ',': (firstLine.match(/,/g) || []).length,
                    '\t': (firstLine.match(/\t/g) || []).length,
                    '|': (firstLine.match(/\|/g) || []).length,
                    ';': (firstLine.match(/;/g) || []).length,
                };
                const detectedDelimiter = Object.entries(delimiterCounts).sort((a, b) => b[1] - a[1])[0];
                const delimiter = detectedDelimiter && detectedDelimiter[1] > 0 ? detectedDelimiter[0] : undefined;

                const parsed = Papa.parse<Record<string, string>>(text, {
                    header:          true,
                    skipEmptyLines:  true,
                    delimiter,
                    transformHeader: h => h.trim(),
                    transform:       v => v.trim(),
                });
                rawRows = parsed.data;
            }

            const { rows: parsed, error: parseError, summaryRowsSkipped, openingBalance: ob, closingBalance: cb } = parseRows(rawRows);
            if (parseError) { setError(parseError); return; }
            setRows(parsed);
            setOpeningBalance(ob);
            setClosingBalance(cb);
            setSkippedNote(
                summaryRowsSkipped
                    ? `${summaryRowsSkipped} balance line${summaryRowsSkipped > 1 ? 's' : ''} (Opening/Closing Balance) were excluded as transactions — see the balance summary above.`
                    : ''
            );
            setStep('preview');
        } catch (e: any) {
            setError(e?.message || 'Failed to read file. Make sure it is a CSV, TXT, Excel, or PDF file.');
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
                input.accept = '.csv,.txt,.xlsx,.xls,.pdf,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf';
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
                    'text/plain',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/pdf',
                    'public.comma-separated-values-text', // iOS UTI for CSV
                    'public.plain-text',                  // iOS UTI for TXT
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

    // ── Scan a photo/PDF (camera or gallery/file) → OCR via statement-scan ──
    const runScan = useCallback(async (base64: string, mediaType: ScanMediaType) => {
        setScanning(true);
        setError('');
        setScanWarning('');
        try {
            const result = await scanStatementImage(base64, mediaType);
            const parsed = rowsFromScan(result.transactions);
            if (parsed.length === 0) {
                setError(result.warning || 'No transactions could be read from this photo. Try a clearer, well-lit shot.');
                return;
            }
            setRows(parsed);
            setOpeningBalance(undefined);
            setClosingBalance(undefined);
            setSkippedNote('');
            if (result.warning) setScanWarning(result.warning);
            setStep('preview');
        } catch (e: any) {
            setError(e?.message || 'Could not scan this file. Please try again.');
        } finally {
            setScanning(false);
        }
    }, []);

    // Native (iOS/Android) — expo-image-picker handles both camera capture
    // and the photo library with one API and returns base64 directly.
    const handleScanNative = useCallback(async (source: 'camera' | 'library') => {
        setError('');
        try {
            const perm = source === 'camera'
                ? await ImagePicker.requestCameraPermissionsAsync()
                : await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                setError(source === 'camera'
                    ? 'Camera permission is needed to scan a statement or receipt.'
                    : 'Photo library permission is needed to pick a photo.');
                return;
            }
            const pick = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
            const result = await pick({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                base64: true,
                quality: 0.7,
            });
            if (result.canceled || !result.assets?.[0]?.base64) return;
            await runScan(result.assets[0].base64, 'image/jpeg');
        } catch (e: any) {
            setError(e?.message || 'Failed to open camera/gallery. Please try again.');
        }
    }, [runScan]);

    // Web — a hidden <input type="file" accept="image/*">, with
    // capture="environment" added only for the camera button so it invokes
    // the device camera on mobile browsers instead of the file picker.
    const handleScanWeb = useCallback((useCamera: boolean) => {
        if (typeof document === 'undefined') return;
        setError('');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (useCamera) input.setAttribute('capture', 'environment');
        input.onchange = async (e: any) => {
            const file: File = e.target?.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const idx = result.indexOf(',');
                const base64 = idx >= 0 ? result.slice(idx + 1) : result;
                const mediaType = (file.type || 'image/jpeg') as ScanMediaType;
                runScan(base64, mediaType);
            };
            reader.onerror = () => setError('Could not read that photo. Please try again.');
            reader.readAsDataURL(file);
        };
        input.click();
    }, [runScan]);

    const handleScan = (source: 'camera' | 'library') =>
        Platform.OS === 'web' ? handleScanWeb(source === 'camera') : handleScanNative(source);

    // ── Remove a row from preview ────────────────────────────────────────────
    const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

    // ── Change category on a row ─────────────────────────────────────────────
    const applyCategory = (rowId: string, opt: typeof CATEGORY_OPTIONS[number]) => {
        setRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            learnCategory(r.description, opt.category, opt.subCategory);
            return { ...r, category: opt.category, subCategory: opt.subCategory, flagged: false };
        }));
        setPickerRow(null);
        setCustomCategoryLabel('');
    };

    // CATEGORY_OPTIONS is a fixed, generic 16-bucket list -- same gap as the
    // one just fixed on TransactionsScreen's and Dashboard's own category
    // pickers, here on the bank-statement import path instead. Keeps the
    // row's already-inferred income/expense/cost/asset bucket (r.category --
    // that classification stays structurally meaningful, it drives
    // transactionCategory on the saved Transaction) and only overrides the
    // display label, so a business can name the category to match what it
    // already uses in TransactionsScreen without breaking P&L bucketing.
    const applyCustomCategoryLabel = (rowId: string, label: string) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        setRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            learnCategory(r.description, r.category, trimmed);
            return { ...r, subCategory: trimmed, flagged: false };
        }));
        setPickerRow(null);
        setCustomCategoryLabel('');
    };

    // ── Correct a row's amount ───────────────────────────────────────────────
    // The escape hatch for a row a parser got wrong (e.g. an
    // amountFlagged outlier from two columns getting fused together) --
    // without this, the only fix was deleting the row and re-entering the
    // real transaction by hand from the Transactions screen afterwards.
    const openAmountEdit = (r: ParsedRow) => {
        setEditAmountRow(r.id);
        setEditAmountValue(String(r.amount));
    };
    const saveAmountEdit = () => {
        const next = Math.abs(parseFloat(editAmountValue.replace(/[₦$€£,\s]/g, '')) || 0);
        setRows(prev => prev.map(r => r.id === editAmountRow ? { ...r, amount: next, amountFlagged: false } : r));
        setEditAmountRow(null);
    };

    // ── Final import ─────────────────────────────────────────────────────────
    const importRows = (rowsToImport: ParsedRow[]) => {
        // Same guard used by Reconciliation and the other bank-statement
        // import paths — without it, re-uploading the same (or an
        // overlapping) statement would silently double every transaction
        // in it, with no warning.
        const newRows = filterNewTransactions(rowsToImport, transactions as any);
        const duplicateCount = rowsToImport.length - newRows.length;

        newRows.forEach((r, idx) => {
            addTransaction({
                date:                r.date,
                description:         r.description,
                type:                r.type === 'income' ? 'income' : 'expense',
                category:            r.subCategory,
                amount:              r.amount,
                transactionCategory: r.category === 'cost'   ? 'cost'
                                   : r.category === 'asset'  ? 'purchase'
                                   : r.category === 'income' ? 'sale'
                                   : r.type === 'income'     ? 'sale'
                                   : 'expense',
                reference:           `IMPORT-${Date.now()}-${idx}`,
                // Money moving to the business's own savings/reserve account
                // hasn't left the business -- it's still the owner's cash,
                // just parked somewhere less liquid. Recording the full
                // amount as principalPortion reuses the same "not a P&L
                // expense" mechanism loan principal repayments already rely
                // on (see finance.ts), so this shows up in the transaction
                // history without silently understating profit.
                ...(r.subCategory === 'Internal Transfer' ? { principalPortion: r.amount } : {}),
            });
        });

        setImported(newRows.length);
        setImportedIn(newRows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0));
        setImportedOut(newRows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0));
        setDuplicatesSkipped(duplicateCount);
        setStep('done');
        if (newRows.length > 0) auditEvents.dataImport();
    };

    const handleImport = () => {
        const flagged = rows.filter(r => r.flagged);
        if (flagged.length > 0) {
            // Not knowing which category a transaction belongs in is normal
            // -- most people reading a raw bank statement can't classify
            // every line either. Blocking the whole import on resolving all
            // of them was a dead end for anyone who genuinely didn't know;
            // this offers the same "Uncategorized" escape hatch the
            // per-row picker's "Not sure" option gives, applied in bulk, so
            // the data gets in and can be recategorised later from
            // Transactions instead of never getting in at all.
            confirmAction(
                `${flagged.length} transaction${flagged.length > 1 ? 's' : ''} still need${flagged.length > 1 ? '' : 's'} a category`,
                `You can import now anyway — ${flagged.length > 1 ? 'they' : 'it'} will be saved as "Uncategorized" and you can fix ${flagged.length > 1 ? 'them' : 'it'} anytime from Transactions.`,
                'Import Anyway',
                () => {
                    const resolved = rows.map(r =>
                        r.flagged ? { ...r, category: 'unknown' as TxCategory, subCategory: 'Uncategorized', flagged: false } : r
                    );
                    setRows(resolved);
                    importRows(resolved);
                },
                false
            );
            return;
        }

        importRows(rows);
    };

    // ── Stats for header ─────────────────────────────────────────────────────
    const incomeRows  = rows.filter(r => r.type === 'income');
    const expenseRows = rows.filter(r => r.type === 'expense');
    const flaggedRows = rows.filter(r => r.flagged);
    const totalIn     = incomeRows.reduce((s, r)  => s + r.amount, 0);
    const totalOut    = expenseRows.reduce((s, r) => s + r.amount, 0);

    // The exact same filterNewTransactions() call importRows() makes at
    // commit time (see transactionDedup.ts), run here too so the review
    // screen can show which rows already exist in Quad360 BEFORE the user
    // taps Import, instead of the only signal being an aggregate count on
    // the done screen after the fact. Reusing the identical function (not a
    // separate check) guarantees this preview count always matches what
    // actually gets skipped on import -- including a row that's a duplicate
    // of another row earlier in this same batch, not just of existing data.
    const duplicateRowIds = useMemo(() => {
        const newOnes = new Set(filterNewTransactions(rows, transactions as any).map(r => r.id));
        return new Set(rows.filter(r => !newOnes.has(r.id)).map(r => r.id));
    }, [rows, transactions]);
    const duplicateCount = duplicateRowIds.size;

    const fmt = (n: number) => `${currency}${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP: UPLOAD
    // ─────────────────────────────────────────────────────────────────────────
    if (step === 'upload') {
        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => { if (!goBack()) navigate('dashboard'); }}>
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
                    <View style={styles.supportedRow}>
                        <Icon name="check" size={13} color={Colors.income} />
                        <Text style={styles.supportedText}>CSV  (.csv)</Text>
                    </View>
                    <View style={styles.supportedRow}>
                        <Icon name="check" size={13} color={Colors.income} />
                        <Text style={styles.supportedText}>Text  (.txt — comma, tab, pipe, or semicolon delimited)</Text>
                    </View>
                    <View style={styles.supportedRow}>
                        <Icon name="check" size={13} color={Colors.income} />
                        <Text style={styles.supportedText}>Excel  (.xlsx  ·  .xls)</Text>
                    </View>
                    <View style={styles.supportedRow}>
                        <Icon name="check" size={13} color={Colors.income} />
                        <Text style={styles.supportedText}>PDF bank statements  (.pdf)</Text>
                    </View>
                    <View style={styles.supportedRow}>
                        <Icon name="check" size={13} color={Colors.income} />
                        <Text style={styles.supportedText}>Works with all Nigerian banks</Text>
                    </View>
                    <View style={styles.supportedRow}>
                        <Icon name="check" size={13} color={Colors.income} />
                        <Text style={styles.supportedText}>Processed on your device — never uploaded</Text>
                    </View>
                </View>

                {Platform.OS === 'ios' || (Platform.OS === 'web' && /iphone|ipad/i.test(navigator?.userAgent ?? '')) ? (
                    <View style={styles.iosGuideCard}>
                        <View style={styles.iosGuideTitleRow}>
                            <Icon name="smartphone" size={16} color={Colors.textPrimary} />
                            <Text style={styles.iosGuideTitle}>iPhone tip</Text>
                        </View>
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
                        <Icon name="alert-circle" size={15} color="#b91c1c" />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    onPress={handlePickFile}
                    disabled={loading}
                >
                    {loading
                        ? <ActivityIndicator color="#fff" />
                        : (
                            <View style={styles.primaryBtnContent}>
                                <Icon name="upload" size={16} color="#fff" />
                                <Text style={styles.primaryBtnText}>Choose file (CSV, TXT, Excel or PDF)</Text>
                            </View>
                        )
                    }
                </TouchableOpacity>

                <View style={styles.orDivider}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>OR SCAN A PHOTO</Text>
                    <View style={styles.orLine} />
                </View>
                <Text style={styles.scanHint}>
                    Snap or upload a photo of a paper statement, till receipt, or invoice — it's read automatically into transactions you can review below.
                </Text>

                <View style={styles.scanRow}>
                    <TouchableOpacity
                        style={[styles.secondaryBtn, scanning && styles.btnDisabled]}
                        onPress={() => handleScan('camera')}
                        disabled={scanning || loading}
                    >
                        {scanning
                            ? <ActivityIndicator color={Colors.primary} />
                            : (
                                <View style={styles.primaryBtnContent}>
                                    <Icon name="camera" size={16} color={Colors.primary} />
                                    <Text style={styles.secondaryBtnText}>Scan with Camera</Text>
                                </View>
                            )
                        }
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.secondaryBtn, scanning && styles.btnDisabled]}
                        onPress={() => handleScan('library')}
                        disabled={scanning || loading}
                    >
                        <View style={styles.primaryBtnContent}>
                            <Icon name="image" size={16} color={Colors.primary} />
                            <Text style={styles.secondaryBtnText}>Upload a Photo</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP: DONE
    // ─────────────────────────────────────────────────────────────────────────
    if (step === 'done') {
        const healthColor = diagnosis
            ? diagnosis.healthStatus === 'healthy' ? '#22c55e' : diagnosis.healthStatus === 'warning' ? '#f59e0b' : '#ef4444'
            : Colors.textMuted;

        return (
            <ScrollView style={styles.container} contentContainerStyle={[styles.content, styles.centred]}>
                <View style={styles.doneIconBadge}>
                    <Icon name="check" size={32} color={Colors.income} />
                </View>
                <Text style={styles.doneTitle}>{imported} transaction{imported !== 1 ? 's' : ''} imported</Text>
                <Text style={styles.doneSub}>Your dashboard and reports have been updated.</Text>
                {duplicatesSkipped > 0 && (
                    <Text style={styles.doneSkippedNote}>
                        {duplicatesSkipped} row{duplicatesSkipped > 1 ? 's' : ''} already existed and {duplicatesSkipped > 1 ? 'were' : 'was'} skipped to avoid duplicate transactions.
                    </Text>
                )}

                {/* Breaks down exactly what landed in the ledger from THIS
                    upload -- money in vs money out, and each one's share of
                    the combined total -- so the owner isn't left guessing
                    what "3 transactions imported" actually added up to. */}
                {imported > 0 && (importedIn + importedOut) > 0 && (
                    <View style={styles.flowBreakdownCard}>
                        <Text style={styles.flowBreakdownTitle}>From this upload</Text>
                        <View style={styles.flowBar}>
                            {importedIn > 0 && (
                                <View style={[styles.flowBarSegment, { flex: importedIn, backgroundColor: Colors.income }]} />
                            )}
                            {importedOut > 0 && (
                                <View style={[styles.flowBarSegment, { flex: importedOut, backgroundColor: '#ef4444' }]} />
                            )}
                        </View>
                        <View style={styles.flowRow}>
                            <View style={styles.flowItem}>
                                <View style={styles.flowItemHeader}>
                                    <View style={[styles.flowDot, { backgroundColor: Colors.income }]} />
                                    <Text style={styles.flowItemLabel}>Money in</Text>
                                </View>
                                <Text style={[styles.flowItemValue, { color: Colors.income }]}>{fmt(importedIn)}</Text>
                                <Text style={styles.flowItemPct}>
                                    {Math.round((importedIn / (importedIn + importedOut)) * 100)}% of total
                                </Text>
                            </View>
                            <View style={styles.flowItem}>
                                <View style={styles.flowItemHeader}>
                                    <View style={[styles.flowDot, { backgroundColor: '#ef4444' }]} />
                                    <Text style={styles.flowItemLabel}>Money out</Text>
                                </View>
                                <Text style={[styles.flowItemValue, { color: '#ef4444' }]}>{fmt(importedOut)}</Text>
                                <Text style={styles.flowItemPct}>
                                    {Math.round((importedOut / (importedIn + importedOut)) * 100)}% of total
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* What this import actually means, right here — instead of
                    making the business owner navigate away to find out. The
                    "aha moment": a score, then three scannable cards (what
                    we noticed / the opportunity / where this is headed)
                    built from the same diagnosis data, not a separate call. */}
                {diagnosis && (
                    <>
                        <View style={styles.diagnosisPreviewCard}>
                            <View style={styles.diagnosisPreviewHeader}>
                                <Text style={styles.diagnosisPreviewLabel}>Business health, based on this data</Text>
                                <View style={[styles.diagnosisPreviewBadge, { backgroundColor: healthColor + '22' }]}>
                                    <Text style={[styles.diagnosisPreviewScore, { color: healthColor }]}>{diagnosis.overallHealth}/100</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.insightCardStack}>
                            {buildFinancialHealthInsightCards(diagnosis).map(card => (
                                <View key={card.label} style={styles.insightCard}>
                                    <Text style={styles.insightCardIcon}>{card.icon}</Text>
                                    <View style={styles.insightCardBody}>
                                        <Text style={styles.insightCardLabel}>{card.label}</Text>
                                        <Text style={styles.insightCardText}>{card.text}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* How much to trust the score above -- especially important
                    on a first import, where the score is often built on very
                    little history. */}
                <View style={{ width: '100%', maxWidth: 320 }}>
                    <DataConfidenceBadge transactions={transactions} />
                </View>

                {/* The one measurement that matters more than signup count
                    for a product whose pitch is "understand your business,"
                    asked right where the analysis was just shown -- not
                    buried in a settings menu or a separate survey email. */}
                {diagnosis && <AhaMomentFeedback source="import-done" />}

                {/* This is the "give value before asking for money" moment —
                    the free 4-pillar audit (Money/Performance/Cash/Readiness)
                    on FinancialAssessmentScreen, right after the data that
                    powers it just arrived. */}
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 20, width: 280 }]} onPress={() => navigate('financial-assessment')}>
                    <Text style={styles.primaryBtnText}>Get Your Free Business Health Audit →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ghostBtn, { marginTop: 4 }]} onPress={() => navigate('action-tracker')}>
                    <Text style={styles.ghostBtnText}>See Recommended Actions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => navigate('transactions')}>
                    <Text style={styles.ghostBtnText}>View Transactions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => { setStep('upload'); setRows([]); setError(''); setSkippedNote(''); setScanWarning(''); setOpeningBalance(undefined); setClosingBalance(undefined); setDuplicatesSkipped(0); }}>
                    <Text style={styles.ghostBtnText}>Import another file</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP: PREVIEW
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Fixed header */}
            <View style={styles.previewHeader}>
                <TouchableOpacity onPress={() => { setStep('upload'); setRows([]); setScanWarning(''); }}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.previewTitle}>{rows.length} transactions found</Text>
                    {duplicateCount > 0 && (
                        <View style={styles.noteRow}>
                            <Icon name="alert-triangle" size={12} color="#ef4444" />
                            <Text style={styles.duplicateNote}>
                                {duplicateCount} row{duplicateCount > 1 ? 's' : ''} already in your records — looks like this statement (or part of it) was imported before. {duplicateCount > 1 ? 'They' : 'It'} won't be added again.
                            </Text>
                        </View>
                    )}
                    {flaggedRows.length > 0 && (
                        <View style={styles.noteRow}>
                            <Icon name="alert-triangle" size={12} color="#f59e0b" />
                            <Text style={styles.flaggedNote}>{flaggedRows.length} need a category — tap to fix</Text>
                        </View>
                    )}
                    {!!skippedNote && (
                        <View style={styles.noteRow}>
                            <Icon name="info" size={11} color={Colors.textMuted} />
                            <Text style={styles.skippedNote}>{skippedNote}</Text>
                        </View>
                    )}
                    {!!scanWarning && (
                        <View style={styles.noteRow}>
                            <Icon name="alert-triangle" size={11} color="#f59e0b" />
                            <Text style={styles.flaggedNote}>{scanWarning}</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Summary strip */}
            <View style={styles.summaryStrip}>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryVal}>{fmt(totalIn)}</Text>
                    <Text style={styles.summaryLabel}>
                        Income{(totalIn + totalOut) > 0 ? ` · ${Math.round((totalIn / (totalIn + totalOut)) * 100)}%` : ''}
                    </Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryVal, { color: '#ef4444' }]}>{fmt(totalOut)}</Text>
                    <Text style={styles.summaryLabel}>
                        Expenses{(totalIn + totalOut) > 0 ? ` · ${Math.round((totalOut / (totalIn + totalOut)) * 100)}%` : ''}
                    </Text>
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

            {/* Opening/Closing balance — captured from the statement's own
                summary lines (or the running balance column), not lost when
                those lines are excluded from the transaction list. */}
            {(openingBalance !== undefined || closingBalance !== undefined) && (
                <View style={styles.balanceStrip}>
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryVal}>
                            {openingBalance !== undefined ? fmt(openingBalance) : '—'}
                        </Text>
                        <Text style={styles.summaryLabel}>Started with</Text>
                    </View>
                    <Text style={styles.balanceArrow}>→</Text>
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryVal}>
                            {closingBalance !== undefined ? fmt(closingBalance) : '—'}
                        </Text>
                        <Text style={styles.summaryLabel}>Ended with</Text>
                    </View>
                </View>
            )}

            {/* Transaction rows */}
            <FlatList
                data={rows}
                keyExtractor={r => r.id}
                contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
                renderItem={({ item: r }) => {
                    const isDuplicate = duplicateRowIds.has(r.id);
                    return (
                    <View style={[styles.txRow, (r.flagged || r.amountFlagged) && styles.txRowFlagged, isDuplicate && styles.txRowDuplicate]}>
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
                            {r.amountFlagged && (
                                <Text style={styles.txAmountWarning}>⚠️ Unusually large — tap the amount to check it</Text>
                            )}
                            {isDuplicate && (
                                <Text style={styles.txDuplicateWarning}>⚠️ Already in your records — won't be added again</Text>
                            )}
                        </View>
                        <View style={styles.txRight}>
                            <TouchableOpacity onPress={() => openAmountEdit(r)} activeOpacity={0.7}>
                                <Text style={[
                                    styles.txAmount,
                                    { color: r.amountFlagged ? '#ef4444' : (r.type === 'income' ? '#22c55e' : '#ef4444') },
                                ]}>
                                    {r.type === 'income' ? '+' : '-'}{fmt(r.amount)}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.removeBtn} onPress={() => removeRow(r.id)}>
                                <Icon name="x" size={15} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    );
                }}
            />

            {/* Import button — fixed bottom */}
            <View style={styles.importBar}>
                <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                    <Text style={styles.importBtnText}>
                        {duplicateCount === 0
                            ? `Import ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`
                            : duplicateCount === rows.length
                                ? 'All transactions already recorded — nothing new to import'
                                : `Import ${rows.length - duplicateCount} new transaction${rows.length - duplicateCount !== 1 ? 's' : ''} (${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped)`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Category picker modal */}
            <Modal visible={!!pickerRow} transparent animationType="slide" onRequestClose={() => { setPickerRow(null); setCustomCategoryLabel(''); }}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setPickerRow(null); setCustomCategoryLabel(''); }}>
                    <View style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
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
                        <TextInput
                            style={styles.amountEditInput}
                            placeholder="Or type your own category..."
                            placeholderTextColor={Colors.textMuted}
                            value={customCategoryLabel}
                            onChangeText={setCustomCategoryLabel}
                        />
                        <TouchableOpacity
                            style={[styles.amountEditSaveBtn, !customCategoryLabel.trim() && { opacity: 0.5 }]}
                            disabled={!customCategoryLabel.trim()}
                            onPress={() => pickerRow && applyCustomCategoryLabel(pickerRow, customCategoryLabel)}
                        >
                            <Text style={styles.amountEditSaveBtnText}>Use This Category</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Amount correction modal */}
            <Modal visible={!!editAmountRow} transparent animationType="slide" onRequestClose={() => setEditAmountRow(null)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditAmountRow(null)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                        <Text style={styles.modalTitle}>Correct Amount</Text>
                        <Text style={styles.amountEditHint}>
                            If this looks wrong (e.g. far bigger than the rest of the statement), fix it here or remove the row instead.
                        </Text>
                        <TextInput
                            style={styles.amountEditInput}
                            value={editAmountValue}
                            onChangeText={setEditAmountValue}
                            keyboardType="numeric"
                            autoFocus
                        />
                        <TouchableOpacity style={styles.amountEditSaveBtn} onPress={saveAmountEdit}>
                            <Text style={styles.amountEditSaveBtnText}>Save Amount</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content:   { padding: Spacing.lg, paddingBottom: 60 },
    centred:   { justifyContent: 'center', alignItems: 'center', padding: Spacing.xxxl },

    header:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
    backBtn:   { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    title:     { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

    card:      { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

    bankRow:   { marginBottom: 10 },
    bankName:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    bankSteps: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

    supportedRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
    supportedText: { fontSize: 13, color: Colors.textSecondary },

    iosGuideCard:  { backgroundColor: '#1e3a5f', borderRadius: 14, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.primary },
    iosGuideTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    iosGuideTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    iosGuideText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
    bold:          { fontWeight: '700', color: Colors.textPrimary },

    errorBox:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#fef2f2', borderRadius: 10, padding: Spacing.md, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
    errorText: { flex: 1, fontSize: 13, color: '#b91c1c', lineHeight: 20 },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.sm },
    primaryBtnContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    btnDisabled:    { opacity: 0.5 },

    ghostBtn:     { paddingVertical: Spacing.md, alignItems: 'center' },
    ghostBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },

    orDivider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.lg },
    orLine:    { flex: 1, height: 1, backgroundColor: Colors.border },
    orText:    { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6 },
    scanHint:  { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 18 },
    scanRow:   { flexDirection: 'row', gap: Spacing.md },
    secondaryBtn: {
        flex: 1, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md,
        paddingVertical: 13, alignItems: 'center', backgroundColor: Colors.surface,
    },
    secondaryBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 13 },

    // Preview header
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    previewTitle:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    noteRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    flaggedNote:   { fontSize: 12, color: '#f59e0b' },
    skippedNote:   { fontSize: 11, color: Colors.textMuted },
    duplicateNote: { fontSize: 12, color: '#ef4444', flex: 1, flexShrink: 1 },

    // Summary strip
    summaryStrip: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    summaryItem:  { flex: 1, alignItems: 'center', paddingVertical: 10 },
    summaryVal:   { fontSize: 13, fontWeight: '800', color: Colors.primary },
    summaryLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
    balanceStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: Spacing.sm },
    balanceArrow: { fontSize: 16, color: Colors.textMuted },

    // Transaction rows
    txRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
    txRowFlagged: { borderWidth: 1.5, borderColor: '#f59e0b' },
    txRowDuplicate: { borderWidth: 1.5, borderColor: '#ef4444', opacity: 0.7 },
    txLeft:       { flex: 1, paddingRight: 10 },
    txDate:       { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
    txDesc:       { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.xs },
    txCat:        { fontSize: 12, color: Colors.primary },
    txCatFlagged: { color: '#f59e0b' },
    txRight:      { alignItems: 'flex-end', gap: Spacing.sm },
    txAmount:     { fontSize: 14, fontWeight: '800' },
    txAmountWarning: { fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: '600' },
    txDuplicateWarning: { fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: '600' },
    removeBtn:    { padding: 2 },

    // Fixed import bar
    importBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
    importBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', ...Shadow.sm },
    importBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Category picker modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet:   { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, maxHeight: '70%' },
    modalSheetWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
    modalTitle:   { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
    catOption:    { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
    catOptionText: { fontSize: 14, color: Colors.textPrimary },

    // Amount correction modal
    amountEditHint: { fontSize: 12.5, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },
    amountEditInput: {
        backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.md, color: Colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: Spacing.lg,
    },
    amountEditSaveBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
    amountEditSaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Diagnosis preview on the Done screen
    flowBreakdownCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginTop: Spacing.xxl, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    flowBreakdownTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
    flowBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: Colors.border, marginBottom: 14 },
    flowBarSegment: { height: '100%' },
    flowRow: { flexDirection: 'row', gap: Spacing.md },
    flowItem: { flex: 1 },
    flowItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    flowDot: { width: 8, height: 8, borderRadius: 4 },
    flowItemLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
    flowItemValue: { fontSize: 16, fontWeight: '800' },
    flowItemPct: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    diagnosisPreviewCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginTop: Spacing.lg, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    diagnosisPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    diagnosisPreviewLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', flex: 1, marginRight: Spacing.sm },
    diagnosisPreviewBadge: { paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm },
    diagnosisPreviewScore: { fontSize: 13, fontWeight: '800' },
    diagnosisPreviewProblem: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20 },
    diagnosisPreviewImpact: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },

    insightCardStack: { width: '100%', maxWidth: 340, gap: Spacing.sm, marginTop: Spacing.sm },
    insightCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.md,
        borderWidth: 1, borderColor: Colors.border,
    },
    insightCardIcon: { fontSize: 18, lineHeight: 22 },
    insightCardBody: { flex: 1 },
    insightCardLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
    insightCardText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },

    // Done screen
    doneIconBadge: {
        width: 64, height: 64, borderRadius: Radius.pill,
        backgroundColor: Colors.income + '18',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    doneTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
    doneSub:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
    doneSkippedNote: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 10, paddingHorizontal: Spacing.xl },
});
