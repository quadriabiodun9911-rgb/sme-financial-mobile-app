/**
 * Statement of Changes in Equity -- the one statement missing from the
 * accounting cycle Quad360 otherwise already covers end to end (see
 * journalEntry.ts/chartOfAccounts.ts for the ledger foundation this and
 * every other statement ultimately reconciles against).
 *
 * Opening Equity + Net Profit for the period + Owner Contributions -
 * Owner Drawings = Closing Equity, computed per month. Net profit,
 * contributions and drawings are each computed independently and directly
 * from that month's own transactions (so "Net Profit" here always agrees
 * with the P&L card for the same period, and contributions/drawings
 * always agree with what was actually logged as an owner capital
 * movement -- see Transaction.equityMovement). Opening/closing equity are
 * NOT re-derived separately -- they're read straight off
 * balanceSheetTrend.ts's own netWorth figure for this and the prior
 * period, reusing the one already-trusted source of "what is equity as of
 * this date" instead of a second, parallel calculation that could quietly
 * drift from the Balance Sheet.
 *
 * Because those two paths are independent, they don't always tie out
 * exactly -- a manual opening-balance edit in Settings, or
 * balanceSheetTrend.ts's own documented AR/AP-as-of-a-past-date floor
 * (see that file's module comment), can move the Balance Sheet's equity
 * without showing up as profit or an owner movement this month. Rather
 * than silently forcing the numbers to match, any gap is surfaced as its
 * own "Other movements (unexplained)" line -- real information about a
 * figure this statement can't fully explain, not a bug to hide.
 */
import { Transaction, Asset, Loan, BusinessSettings, BadDebtProvision } from '../types';
import { computeEnhancedPnL } from './finance';
import { computeBalanceSheetTrend, ManualBalances } from './balanceSheetTrend';
import { localDateStr } from './localDate';

export interface ChangesInEquityPoint {
    key: string;
    label: string;
    openingEquity: number;
    netProfit: number;
    ownerContributions: number;
    ownerDrawings: number;
    closingEquity: number;
    // closingEquity - (openingEquity + netProfit + ownerContributions - ownerDrawings)
    unexplainedMovement: number;
}

function monthEndDate(year: number, month1to12: number): string {
    return localDateStr(new Date(year, month1to12, 0));
}

function capAtToday(endDate: string): string {
    const today = localDateStr();
    return endDate > today ? today : endDate;
}

export function computeChangesInEquity(
    months: string[], // sorted 'YYYY-MM' keys that have transaction data, e.g. from computeMonthlyTrend
    transactions: Transaction[],
    assets: Asset[],
    loans: Loan[],
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities'>,
    manual: ManualBalances = { stockValue: 0, manualEquipment: 0, otherAssets: 0, otherLiabilities: 0 },
    badDebtProvisions: BadDebtProvision[] = [],
): ChangesInEquityPoint[] {
    if (months.length === 0) return [];

    // Same badDebtProvisions array threaded into both the Balance Sheet
    // (closingEquity, via netWorth) and the P&L (netProfit) below -- a
    // provision counted in one but not the other would show up as a false
    // "unexplainedMovement", the exact silent-disagreement failure mode
    // this statement's own header comment exists to surface, not hide.
    const balanceSheetPoints = computeBalanceSheetTrend('monthly', months, transactions, assets, loans, manual, badDebtProvisions);

    const openingBaseline = (parseFloat(settings.openingAssets) || 0) - (parseFloat(settings.openingLiabilities) || 0);

    return months.map((m, i) => {
        const [y, mo] = m.split('-').map(Number);
        const periodStart = `${y}-${String(mo).padStart(2, '0')}-01`;
        const periodEnd = capAtToday(monthEndDate(y, mo));

        const periodTx = transactions.filter(t => t.date && t.date >= periodStart && t.date <= periodEnd);

        // computeEnhancedPnL already excludes equityMovement transactions
        // from revenue/expense -- this is the exact same "Net Profit"
        // figure the P&L statement shows for this period, not a second,
        // independently-derived one.
        const pnl = computeEnhancedPnL(periodTx, assets, badDebtProvisions);

        const ownerContributions = periodTx
            .filter(t => t.equityMovement === 'owner-contribution')
            .reduce((s, t) => s + (t.amount ?? 0), 0);
        const ownerDrawings = periodTx
            .filter(t => t.equityMovement === 'owner-drawing')
            .reduce((s, t) => s + (t.amount ?? 0), 0);

        const openingEquity = i === 0 ? openingBaseline : balanceSheetPoints[i - 1].netWorth;
        const closingEquity = balanceSheetPoints[i].netWorth;
        const expectedClosing = openingEquity + pnl.netProfit + ownerContributions - ownerDrawings;

        return {
            key: m,
            label: balanceSheetPoints[i].label,
            openingEquity,
            netProfit: pnl.netProfit,
            ownerContributions,
            ownerDrawings,
            closingEquity,
            unexplainedMovement: closingEquity - expectedClosing,
        };
    });
}
