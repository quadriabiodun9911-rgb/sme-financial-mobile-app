// Matches a scanned (or manually re-typed, on platforms where scanning
// itself isn't available -- see BarcodeScannerModal.tsx) barcode against an
// inventory item's own sku, case- and whitespace-insensitively. A manually
// re-typed code is exactly where a stray space or inconsistent case creeps
// in, and a barcode that fails to match because of that is worse than never
// having a scanner in the first place.
export function matchInventoryBySku<T extends { sku?: string }>(items: T[], code: string): T | undefined {
    const scanned = code.trim().toLowerCase();
    if (!scanned) return undefined;
    return items.find(i => (i.sku ?? '').trim().toLowerCase() === scanned);
}
