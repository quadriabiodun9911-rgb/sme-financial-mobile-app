import { Transaction } from '../types';
import { Colors } from '../theme/colors';

/**
 * One shared taxonomy for "how trustworthy is this figure," per the trust
 * review this was built from: every important number should be able to say
 * whether it was Recorded (owner-entered), Imported (a connected source),
 * Verified (checked against supporting records), Estimated (built on
 * assumptions or known-incomplete data), or Missing (the data needed isn't
 * there at all). A deliberately small, ordered taxonomy -- not a score --
 * so it stays simple enough to explain to a business owner in one line.
 */
export type DataProvenanceState = 'recorded' | 'imported' | 'verified' | 'estimated' | 'missing';

export interface DataProvenanceMeta {
    label: string;
    description: string;
    color: string;
}

export const DATA_PROVENANCE_META: Record<DataProvenanceState, DataProvenanceMeta> = {
    recorded: {
        label: 'Recorded',
        description: 'Entered by the business owner.',
        color: Colors.textMuted,
    },
    imported: {
        label: 'Imported',
        description: 'Obtained from an uploaded file or connected accounting source.',
        color: Colors.primary,
    },
    verified: {
        label: 'Verified',
        description: 'Checked against a connected, consent-based bank feed.',
        color: Colors.success,
    },
    estimated: {
        label: 'Estimated',
        description: 'Calculated using assumptions or incomplete information -- see below.',
        color: Colors.warning,
    },
    missing: {
        label: 'Missing',
        description: 'Information needed for a reliable figure has not been supplied yet.',
        color: Colors.danger,
    },
};

/**
 * One transaction's own provenance, straight from Transaction.source (see
 * its own doc comment in types/index.ts for exactly what each value means).
 * 'manual'/undefined covers everything Quad360 owns and can edit -- typed
 * entry, Quick Add, bank-statement import, receipt scan, WhatsApp capture --
 * which is "Recorded" in this taxonomy even though some of those originate
 * from a file, because the owner (or their proxy) entered or confirmed it
 * into Quad360 directly, rather than it flowing in from a system Quad360
 * doesn't control.
 */
export function transactionProvenance(tx: Pick<Transaction, 'source'>): DataProvenanceState {
    switch (tx.source) {
        case 'mono': return 'verified';
        case 'quickbooks':
        case 'xero': return 'imported';
        default: return 'recorded';
    }
}

/**
 * A derived figure's (Profit, Revenue, Expenses, Cash, ...) own provenance,
 * built from the transactions behind it plus a completeness signal the
 * caller already has (e.g. financialDiagnosisEngine.ts's
 * diagnoseRecordKeeping -- see profitMayBeIncomplete in DashboardScreen.tsx
 * for the canonical way to get one). Deliberately a plain decision tree,
 * not a weighted score, so it stays something you can explain in one
 * sentence rather than a number nobody can audit:
 *
 * 1. A known completeness gap always wins -- a figure built on data
 *    diagnoseRecordKeeping already flagged as likely incomplete is
 *    Estimated no matter how clean the transactions behind it look,
 *    because the real problem is what's NOT there.
 * 2. No transactions at all is Missing, full stop.
 * 3. Otherwise, the figure can only claim the WEAKEST provenance among its
 *    own transactions -- one manually-entered transaction mixed into an
 *    otherwise bank-verified set still makes the whole figure "Recorded,"
 *    never "Verified." Conservative on purpose: overclaiming confidence in
 *    a mixed-source figure is exactly the failure mode this exists to
 *    prevent.
 */
export function aggregateFigureProvenance(
    transactions: Transaction[],
    hasCompletenessGap: boolean,
): DataProvenanceState {
    if (hasCompletenessGap) return 'estimated';
    if (transactions.length === 0) return 'missing';

    const states = transactions.map(transactionProvenance);
    if (states.every(s => s === 'verified')) return 'verified';
    if (states.every(s => s === 'verified' || s === 'imported')) return 'imported';
    return 'recorded';
}
