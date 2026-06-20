/**
 * PDF Bank Statement Parser
 *
 * Uses pdfjs-dist (legacy build, browser-compatible) to extract text from
 * PDF bank statements. Works on iPhone Safari, Android Chrome, and desktop.
 *
 * Strategy:
 *  1. Load the PDF via pdfjs
 *  2. Extract all text items with their X/Y positions from every page
 *  3. Cluster items into rows by Y position (±4px tolerance)
 *  4. Sort each row left-to-right by X position
 *  5. Detect the header row that contains date/description/amount keywords
 *  6. Map each data row to { date, description, debit, credit, amount } columns
 *  7. Return as Record<string, string>[] — same shape as CSV/Excel output
 */

import { Platform } from 'react-native';

type TextItem = { x: number; y: number; text: string; page: number };

// ─── Column header detection aliases (same as ImportTransactionsScreen) ──────

const DATE_KW   = ['date', 'trans', 'value', 'txn', 'posting'];
const DESC_KW   = ['desc', 'narr', 'detail', 'remark', 'particular'];
const DEBIT_KW  = ['debit', 'dr', 'withdraw', 'debit amount', 'dr amount'];
const CREDIT_KW = ['credit', 'cr', 'deposit', 'credit amount', 'cr amount'];
const AMOUNT_KW = ['amount', 'value'];
const BALANCE_KW = ['balance', 'bal'];

function matchesAny(cell: string, keywords: string[]): boolean {
    const c = cell.toLowerCase().trim();
    return keywords.some(k => c.includes(k));
}

// ─── Group text items into rows by Y position ─────────────────────────────────

function groupByRow(items: TextItem[], tolerance = 5): TextItem[][] {
    if (items.length === 0) return [];
    const sorted = [...items].sort((a, b) => a.page !== b.page ? a.page - b.page : b.y - a.y);
    const rows: TextItem[][] = [];
    let currentRow: TextItem[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const item = sorted[i];
        const prev = currentRow[currentRow.length - 1];
        if (item.page === prev.page && Math.abs(item.y - prev.y) <= tolerance) {
            currentRow.push(item);
        } else {
            rows.push(currentRow.sort((a, b) => a.x - b.x));
            currentRow = [item];
        }
    }
    rows.push(currentRow.sort((a, b) => a.x - b.x));
    return rows;
}

// ─── Find the header row index ────────────────────────────────────────────────

function findHeaderRow(rows: TextItem[][]): number {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const texts = rows[i].map(t => t.text.toLowerCase());
        const hasDate   = texts.some(t => DATE_KW.some(k => t.includes(k)));
        const hasDesc   = texts.some(t => DESC_KW.some(k => t.includes(k)));
        const hasAmount = texts.some(t => [...DEBIT_KW, ...CREDIT_KW, ...AMOUNT_KW].some(k => t.includes(k)));
        if (hasDate && hasDesc && hasAmount) return i;
    }
    return -1;
}

// ─── Map a data row to named columns using header positions ───────────────────

function mapRowToRecord(
    dataRow: TextItem[],
    headers: { col: string; x: number }[],
    pageWidth: number,
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const header of headers) {
        // Find text items closest to this header's X position
        const bucketItems = dataRow.filter(item => {
            const nextHeader = headers.find(h => h.x > header.x);
            const maxX = nextHeader ? nextHeader.x : pageWidth;
            return item.x >= header.x - 10 && item.x < maxX;
        });
        result[header.col] = bucketItems.map(i => i.text).join(' ').trim();
    }
    return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parsePdfStatement(
    arrayBuffer: ArrayBuffer,
): Promise<{ rows: Record<string, string>[]; error?: string }> {
    if (Platform.OS !== 'web') {
        return { rows: [], error: 'PDF parsing is only supported on the web version. Please export your bank statement as CSV or Excel instead.' };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist');

        // Worker is not needed on web — disable it
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, useSystemFonts: true }).promise;
        const allItems: TextItem[] = [];
        let pageWidth = 600;

        for (let p = 1; p <= pdf.numPages; p++) {
            const page    = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1 });
            pageWidth = viewport.width;
            const content = await page.getTextContent();

            for (const item of content.items) {
                if (!('str' in item) || !item.str.trim()) continue;
                // transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
                const tx = item.transform as number[];
                allItems.push({ x: tx[4], y: tx[5], text: item.str.trim(), page: p });
            }
        }

        if (allItems.length === 0) {
            return { rows: [], error: 'No text found in PDF. The file may be a scanned image — please use CSV or Excel export instead.' };
        }

        const rows      = groupByRow(allItems);
        const headerIdx = findHeaderRow(rows);

        if (headerIdx === -1) {
            return { rows: [], error: 'Could not find a transaction table in this PDF. Please export as CSV or Excel from your bank app instead.' };
        }

        // Build header map: column label → x position
        const headerRow = rows[headerIdx];
        const headers: { col: string; x: number }[] = [];

        for (const cell of headerRow) {
            const t = cell.text.toLowerCase().trim();
            if      (matchesAny(t, DATE_KW))    headers.push({ col: 'date',        x: cell.x });
            else if (matchesAny(t, DESC_KW))    headers.push({ col: 'description', x: cell.x });
            else if (matchesAny(t, DEBIT_KW))   headers.push({ col: 'debit',       x: cell.x });
            else if (matchesAny(t, CREDIT_KW))  headers.push({ col: 'credit',      x: cell.x });
            else if (matchesAny(t, AMOUNT_KW))  headers.push({ col: 'amount',      x: cell.x });
            else if (matchesAny(t, BALANCE_KW)) headers.push({ col: 'balance',     x: cell.x });
        }

        if (headers.length < 2) {
            return { rows: [], error: 'Could not detect columns in this PDF. Please export as CSV or Excel from your bank app instead.' };
        }

        // Extract data rows (everything after header, skip obvious page headers/footers)
        const dataRows: Record<string, string>[] = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
            const row    = rows[i];
            const record = mapRowToRecord(row, headers, pageWidth);

            // Skip rows that look like sub-headers, totals, or page footers
            const firstCell = (record.date || record.description || '').toLowerCase();
            if (!firstCell) continue;
            if (['total', 'subtotal', 'balance b/f', 'balance c/f', 'opening', 'closing', 'page'].some(s => firstCell.includes(s))) continue;
            // Must have at least a date or description that looks real
            if (!record.date && !record.description) continue;

            dataRows.push(record);
        }

        if (dataRows.length === 0) {
            return { rows: [], error: 'PDF detected but no transactions found. Try exporting a statement with transaction data.' };
        }

        return { rows: dataRows };
    } catch (err: any) {
        return { rows: [], error: `PDF parsing failed: ${err?.message ?? 'unknown error'}. Please try CSV or Excel export.` };
    }
}
