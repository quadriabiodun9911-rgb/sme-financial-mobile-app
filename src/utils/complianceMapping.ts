import { BusinessSettings, LegalEntityType, StaffMember } from '../types';

export interface ComplianceObligation {
    id: string;
    label: string;
    detail: string;
    // Only true when there's real data behind the flag (e.g. staff on
    // payroll) — not a jurisdiction-specific legal determination.
    relevant: boolean;
}

export interface ComplianceProfile {
    hasEntityType: boolean;
    entityType: LegalEntityType | null;
    entityLabel: string;
    liabilityNote: string;
    obligations: ComplianceObligation[];
}

const ENTITY_LABELS: Record<LegalEntityType, string> = {
    'sole-proprietorship': 'Sole Proprietorship',
    partnership: 'Partnership',
    llc: 'LLC / Limited Company',
    corporation: 'Corporation',
    nonprofit: 'Nonprofit',
};

const LIABILITY_NOTES: Record<LegalEntityType, string> = {
    'sole-proprietorship': 'No legal separation between you and the business — your personal assets are exposed to business debts and liabilities.',
    partnership: 'Partners are typically personally liable for the business\'s debts, often including debts run up by other partners.',
    llc: 'The business is a separate legal entity from you — your personal assets are generally shielded from business debts.',
    corporation: 'The business is a separate legal entity from you — your personal assets are generally shielded from business debts.',
    nonprofit: 'The organization is a separate legal entity — but tax-exempt status usually comes with its own ongoing reporting obligations.',
};

/**
 * Generic, entity-type-driven compliance categories a business of this
 * structure TYPICALLY needs to think about. Deliberately not tied to any
 * one country's exact filing names or deadlines — Quad360 has no per-
 * jurisdiction legal/tax database, so pretending to know exact obligations
 * for e.g. Nigeria vs the UK vs the US would be fabricating certainty it
 * doesn't have. This is a starting checklist for "ask your accountant
 * about X", not a substitute for one — same posture as Tax Filing Readiness.
 */
function baseObligations(entityType: LegalEntityType): Omit<ComplianceObligation, 'relevant'>[] {
    switch (entityType) {
        case 'sole-proprietorship':
            return [
                { id: 'personal-return', label: 'Business income reported on your personal tax return', detail: 'Most jurisdictions treat sole proprietorship income as personal income — there\'s usually no separate business tax filing, but self-employment/social security contributions often still apply.' },
                { id: 'business-license', label: 'Local business license or trade registration', detail: 'Many cities/states require a basic trade license or "doing business as" registration even for sole proprietors.' },
            ];
        case 'partnership':
            return [
                { id: 'partnership-return', label: 'Partnership information return', detail: 'The partnership itself usually files an information return even though it may not pay tax directly — each partner then reports their share of profit personally.' },
                { id: 'partnership-agreement', label: 'A written partnership agreement', detail: 'Not always legally required, but strongly recommended — covers profit split, exit terms, and liability between partners.' },
            ];
        case 'llc':
            return [
                { id: 'annual-return', label: 'Annual company return / confirmation statement', detail: 'Registered companies typically must file a yearly return confirming directors, ownership, and registered address with the company registrar, separate from tax filings.' },
                { id: 'corporate-tax', label: 'Corporate/company tax return', detail: 'A separate filing from your personal tax return, covering the company\'s own profit.' },
                { id: 'registered-agent', label: 'Registered office / agent address kept current', detail: 'Most registrars require an up-to-date registered address for legal correspondence.' },
            ];
        case 'corporation':
            return [
                { id: 'annual-return', label: 'Annual company return / confirmation statement', detail: 'Registered companies typically must file a yearly return confirming directors, ownership, and registered address with the company registrar, separate from tax filings.' },
                { id: 'corporate-tax', label: 'Corporate tax return', detail: 'A separate filing from any personal tax return, covering the corporation\'s own profit.' },
                { id: 'board-records', label: 'Board/shareholder meeting records', detail: 'Corporations typically have stricter formal recordkeeping requirements (resolutions, minutes) than other structures.' },
            ];
        case 'nonprofit':
            return [
                { id: 'exempt-status-filing', label: 'Annual information return to keep tax-exempt status', detail: 'Tax-exempt status is usually not automatic or permanent — most jurisdictions require an annual filing to maintain it, even when no tax is owed.' },
                { id: 'donor-records', label: 'Donation/grant records kept separately', detail: 'Needed both for the exempt-status filing and for donor tax receipts.' },
            ];
    }
}

export function computeComplianceObligations(
    settings: BusinessSettings,
    staff: StaffMember[] = [],
): ComplianceProfile {
    const entityType = settings.legalEntityType ?? null;

    if (!entityType) {
        return {
            hasEntityType: false,
            entityType: null,
            entityLabel: '',
            liabilityNote: '',
            obligations: [],
        };
    }

    const obligations: ComplianceObligation[] = baseObligations(entityType).map(o => ({ ...o, relevant: true }));

    // The one obligation grounded in real data already in the app, rather
    // than a generic-by-structure statement: payroll implies employer
    // withholding/social-security obligations regardless of entity type.
    const activeStaff = staff.filter(s => s.status === 'active');
    if (activeStaff.length > 0) {
        obligations.push({
            id: 'employer-payroll',
            label: `Employer payroll obligations for ${activeStaff.length} active staff member${activeStaff.length === 1 ? '' : 's'}`,
            detail: 'Paying staff usually triggers withholding and employer-side social security/insurance contributions, regardless of your entity type — confirm registration with your local tax/labor authority.',
            relevant: true,
        });
    }

    return {
        hasEntityType: true,
        entityType,
        entityLabel: ENTITY_LABELS[entityType],
        liabilityNote: LIABILITY_NOTES[entityType],
        obligations,
    };
}
