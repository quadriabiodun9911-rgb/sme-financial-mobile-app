/**
 * Local Y-M-D, not toISOString() -- toISOString() converts to UTC, which
 * reports the PREVIOUS calendar day for the early hours of the local day in
 * any timezone far enough ahead of UTC. Used for stamping "today" onto a
 * user-created record (a sale, a stock-in, an invoice, a price change, a
 * manually-recorded payment) so it can never look silently backdated.
 */
export function localDateStr(now: Date = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
