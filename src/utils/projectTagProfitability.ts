import { Transaction } from '../types';
import { computeMarginPct } from './priceHistory';

// "How much is each project/product actually costing and earning" -- the
// one thing a business running several distinct initiatives off one set of
// books (e.g. a technology company developing multiple products in
// parallel) can't answer from the rest of Quad360's P&L, which only ever
// totals the whole business. Reuses Transaction.project (free text, set at
// entry or inherited from a linked invoice -- see that field's own comment)
// rather than inventing a second tagging system; nothing here recomputes
// revenue or cost figures the rest of the app doesn't already produce.
//
// Not to be confused with projectProfitability.ts (computeProjectProfitability)
// -- that's a different, unrelated feature: a professional-services owner's
// manual fee/hours/target-rate calculator for ONE project at a time, shown
// only on Invoices for that industry. This one is transaction-history-driven,
// covers every project tagged across the whole business, and powers the
// Reports → Projects tab for any industry.
export interface ProjectTagProfitability {
    project: string;
    // Cash/recognised revenue -- a plain income transaction, or an
    // invoice-linked one with status 'paid' (or no status at all, the
    // legacy case). This is what actually happened, not what's expected.
    realizedRevenue: number;
    // An invoice-linked transaction with status 'pending' or 'overdue' --
    // sent/signed but not yet collected. Shown separately, never folded
    // into profit, so a project with a big signed contract doesn't look
    // more profitable than it currently is.
    pipelineRevenue: number;
    rdCost: number;
    commercialCost: number;
    // Expense tagged to this project but with no costNature set -- counted
    // in totalCost/profit like any other cost, just not attributable to
    // either bucket above. Surfaced so "R&D vs commercial" doesn't silently
    // undercount itself when nothing's been classified yet.
    unclassifiedCost: number;
    totalCost: number;
    profit: number;
    marginPct: number;
    transactionCount: number;
}

export interface ProjectTagProfitabilitySummary {
    projects: ProjectTagProfitability[];
    // Transactions with no project tag at all -- always present for any
    // business that hasn't started tagging, so this reads as "nothing
    // tagged yet" rather than silently showing an empty project list.
    unassignedCount: number;
    unassignedIncome: number;
    unassignedExpense: number;
}

const REALIZED_STATUSES = new Set<Transaction['status'] | undefined>(['paid', undefined]);
const PIPELINE_STATUSES = new Set<Transaction['status'] | undefined>(['pending', 'overdue']);

export function computeProjectTagProfitability(transactions: Transaction[]): ProjectTagProfitabilitySummary {
    const groups = new Map<string, Transaction[]>();
    let unassignedCount = 0, unassignedIncome = 0, unassignedExpense = 0;

    for (const tx of transactions) {
        const project = tx.project?.trim();
        if (!project) {
            unassignedCount++;
            if (tx.type === 'income') unassignedIncome += tx.amount;
            else unassignedExpense += tx.amount;
            continue;
        }
        const existing = groups.get(project);
        if (existing) existing.push(tx);
        else groups.set(project, [tx]);
    }

    const projects: ProjectTagProfitability[] = Array.from(groups.entries()).map(([project, txs]) => {
        let realizedRevenue = 0, pipelineRevenue = 0, rdCost = 0, commercialCost = 0, unclassifiedCost = 0;
        for (const tx of txs) {
            if (tx.type === 'income') {
                if (REALIZED_STATUSES.has(tx.status)) realizedRevenue += tx.amount;
                else if (PIPELINE_STATUSES.has(tx.status)) pipelineRevenue += tx.amount;
            } else {
                if (tx.costNature === 'rd') rdCost += tx.amount;
                else if (tx.costNature === 'commercial') commercialCost += tx.amount;
                else unclassifiedCost += tx.amount;
            }
        }
        const totalCost = rdCost + commercialCost + unclassifiedCost;
        const profit = realizedRevenue - totalCost;
        return {
            project,
            realizedRevenue,
            pipelineRevenue,
            rdCost,
            commercialCost,
            unclassifiedCost,
            totalCost,
            profit,
            marginPct: computeMarginPct(realizedRevenue, totalCost),
            transactionCount: txs.length,
        };
    });

    // Most financially significant first -- a project with heavy spend but
    // no revenue yet (the common R&D-stage case) still belongs near the
    // top, which plain revenue-sort would bury.
    projects.sort((a, b) => (b.realizedRevenue + b.totalCost) - (a.realizedRevenue + a.totalCost));

    return { projects, unassignedCount, unassignedIncome, unassignedExpense };
}
