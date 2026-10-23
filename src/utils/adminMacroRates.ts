import { supabase } from './supabase';
import { MacroDriver } from '../types';

export interface AdminMacroRate {
    driver: MacroDriver;
    label: string;
    changePct: number;
    periodMonths: number;
    source: string;
    note?: string;
    asOf: string; // ISO date
}

// Reference % changes Quad360 maintains directly in Supabase (Table Editor
// or SQL -- see migration 049's comment for why there's no in-app admin
// screen for this) for the three MacroDrivers with no free live-data API
// (energy, interestRate, inflation -- see macro-feed/index.ts's own
// research). Lets a business owner with no macroeconomics background see a
// concrete, dated figure instead of being asked to "check with your bank"
// cold. RLS grants read to every signed-in user; nothing in the client can
// write this table. Returns null on any failure -- network error, RLS
// denial, the table not yet migrated on this project -- rather than
// throwing into the UI or fabricating a fallback figure. Never invents a
// rate for a driver Quad360 hasn't actually set.
export async function fetchAdminMacroRates(): Promise<AdminMacroRate[] | null> {
    try {
        const { data, error } = await supabase
            .from('admin_macro_rates')
            .select('driver, label, change_pct, period_months, source, note, as_of');
        if (error || !data) return null;
        return data.map((r: any) => ({
            driver: r.driver,
            label: r.label,
            changePct: Number(r.change_pct),
            periodMonths: r.period_months,
            source: r.source,
            note: r.note ?? undefined,
            asOf: r.as_of,
        }));
    } catch {
        return null;
    }
}
