import { StaffMember, PayrollItem, PayrollRun } from '../types';

/**
 * Abstraction over "who actually runs payroll" — so the rest of the app
 * (PayrollScreen, cash flow, P&L) doesn't need to know whether payroll is
 * being tracked manually or executed by a real, licensed payroll processor.
 *
 * IMPORTANT — what this file does NOT do: it does not withhold real payroll
 * tax, move real money, or file any statutory return. The only implementation
 * shipped today is ManualPayrollProvider, which is exactly the flat-rate
 * tracking PayrollScreen already had — this file just gives that behavior a
 * name and a seam to swap out.
 *
 * To go live with real payroll, pick ONE licensed embedded-payroll partner
 * and implement a provider class for it. Realistic options as of 2026:
 *   - Gusto Embedded / Check — US-focused, handle federal+state withholding
 *     and filings. https://gusto.com/embedded  https://checkhq.com
 *   - Deel / Remote / Papaya Global / Omnipresent — multi-country
 *     payroll & Employer-of-Record, relevant if staff are outside the US.
 * Each has its own onboarding (business KYC, banking details, per-employee
 * tax forms) that happens on the PROVIDER's side, not inside this file —
 * this abstraction only defines the shape Quad360 needs to talk to it.
 */

export interface PayrollProviderInfo {
    id: string;
    name: string;
    isReal: boolean; // false for ManualPayrollProvider — no real money moves, no real withholding
    description: string;
}

export interface RunPayrollResult {
    run: PayrollRun;
    /** Present only for real providers — a receipt/reference from the processor. */
    providerRunId?: string;
}

export class PayrollProviderNotConfiguredError extends Error {
    constructor(providerId: string) {
        super(`Payroll provider "${providerId}" has no API credentials configured. Add them in Settings before running payroll through it.`);
        this.name = 'PayrollProviderNotConfiguredError';
    }
}

export interface PayrollProvider {
    readonly info: PayrollProviderInfo;
    isConfigured(): boolean;
    /** Compute (and, for real providers, submit) a payroll run for a period. */
    runPayroll(period: string, staff: StaffMember[], deductionRate: number): Promise<RunPayrollResult>;
}

function makeId(): string {
    return `pr_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * The only provider that actually works today. Applies a single flat
 * deduction rate to gross salary — the same simplification PayrollScreen
 * has always used. No tax withholding tables, no statutory filing, no
 * money movement: this is a record-keeping tool, not a payroll processor.
 */
export class ManualPayrollProvider implements PayrollProvider {
    readonly info: PayrollProviderInfo = {
        id: 'manual',
        name: 'Manual Tracking',
        isReal: false,
        description: 'You pay staff and handle tax withholding yourself, outside the app. Quad360 just records what happened.',
    };

    isConfigured(): boolean {
        return true; // no external credentials needed
    }

    async runPayroll(period: string, staff: StaffMember[], deductionRate: number): Promise<RunPayrollResult> {
        const rate = Math.max(0, deductionRate) / 100;
        const items: PayrollItem[] = staff.map(m => {
            const gross = m.salary;
            const deductions = gross * rate;
            return { staffId: m.id, staffName: m.name, grossSalary: gross, deductions, netSalary: gross - deductions };
        });
        const run: PayrollRun = {
            id: makeId(),
            period,
            runDate: new Date().toISOString().split('T')[0],
            items,
            totalGross: items.reduce((s, i) => s + i.grossSalary, 0),
            totalDeductions: items.reduce((s, i) => s + i.deductions, 0),
            totalNet: items.reduce((s, i) => s + i.netSalary, 0),
            status: 'draft',
            createdAt: new Date().toISOString(),
        };
        return { run };
    }
}

/**
 * Stub for a real embedded-payroll integration. Not implemented — this
 * exists to show exactly where a real provider plugs in. Replace the body
 * with actual API calls once you have partner credentials; until then it
 * fails loudly instead of silently pretending to run real payroll.
 */
export class UnimplementedPayrollProvider implements PayrollProvider {
    constructor(
        public readonly info: PayrollProviderInfo,
        private apiKey?: string,
    ) {}

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    async runPayroll(_period: string, _staff: StaffMember[], _deductionRate: number): Promise<RunPayrollResult> {
        throw new PayrollProviderNotConfiguredError(this.info.id);
        // Real implementation would, e.g.:
        //   1. POST staff who aren't yet synced to the provider (KYC/tax forms happen on their side)
        //   2. POST a payroll run request for `period`
        //   3. Poll or webhook for completion, map the provider's response into a PayrollRun
        //   4. Return { run, providerRunId } so the UI can show a real receipt/reference
    }
}

export const AVAILABLE_PAYROLL_PROVIDERS: PayrollProviderInfo[] = [
    { id: 'manual', name: 'Manual Tracking', isReal: false, description: 'Record payroll yourself — no external processor.' },
    { id: 'gusto', name: 'Gusto Embedded (US)', isReal: true, description: 'Real US payroll: tax withholding, direct deposit, federal/state filings. Requires a Gusto partner account.' },
    { id: 'deel', name: 'Deel (Global)', isReal: true, description: 'Multi-country payroll & Employer of Record. Requires a Deel partner account.' },
];

export function getPayrollProvider(providerId: string, apiKey?: string): PayrollProvider {
    if (providerId === 'manual' || !providerId) return new ManualPayrollProvider();
    const known = AVAILABLE_PAYROLL_PROVIDERS.find(p => p.id === providerId);
    if (!known) return new ManualPayrollProvider();
    return new UnimplementedPayrollProvider(known, apiKey);
}
