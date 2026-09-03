// Client-side half of tier-2 (server-side) proactive alerts -- registers
// this device for Expo push and keeps the server's cash_position_summary
// row current, so send-proactive-alerts (a scheduled Edge Function) can
// decide whether to push without ever seeing a real transaction. See
// supabase/migrations/028_proactive_alerts_push.sql for why only these
// few derived numbers -- never transaction amounts/descriptions/categories,
// which are field-encrypted with a key this server never has -- are synced.
//
// Mirrors notifications.ts's conventions: web-guarded (Expo push tokens
// are a native-only concept here; no VAPID/web-push setup exists), fails
// silently since none of this should ever block or crash the screen that
// triggers it.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';

// From app.json -- expo-notifications needs this to mint an Expo push
// token outside of the classic (deprecated) token flow.
const EXPO_PROJECT_ID = '5577b2eb-04eb-4a01-bfad-6412b3cf1e29';

export async function registerForPushNotificationsAsync(): Promise<void> {
    try {
        if (Platform.OS === 'web') return;
        const ownerId = await getWorkspaceOwnerId();
        if (!ownerId) return;

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        const status = existingStatus === 'granted'
            ? existingStatus
            : (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return;

        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
        if (!expoPushToken) return;

        await supabase.from('push_tokens').upsert(
            { user_id: ownerId, expo_push_token: expoPushToken, platform: Platform.OS, updated_at: new Date().toISOString() },
            { onConflict: 'expo_push_token' },
        );
    } catch {
        // Fail silently -- push registration is best-effort, same as every
        // local-notification call in notifications.ts.
    }
}

export interface CashPositionSummaryInput {
    currency: string;
    runwayDays: number | null;
    topCostCategory: string | null;
    topCostPctPointChange: number | null;
    topCostCurrentPctOfRevenue: number | null;
    // Phase 2 -- see 029_proactive_alerts_push_v2.sql. All optional so a
    // caller that only has the original cash/cost-exposure signals (or a
    // caller mid-migration) doesn't have to fabricate the rest.
    overdueRemindersCount?: number | null;
    loanPaymentDueDays?: number | null;
    loanPaymentDueOtherCount?: number | null;
    payrollStatus?: 'overdue' | 'due_soon' | null;
    payrollDaysLeft?: number | null;
    payrollPeriodLabel?: string | null;
    taxShortfall?: number | null;
}

export async function syncCashPositionSummary(input: CashPositionSummaryInput): Promise<void> {
    try {
        if (Platform.OS === 'web') return;
        const ownerId = await getWorkspaceOwnerId();
        if (!ownerId) return;

        await supabase.from('cash_position_summary').upsert(
            {
                user_id: ownerId,
                currency: input.currency,
                runway_days: input.runwayDays,
                top_cost_category: input.topCostCategory,
                top_cost_pct_point_change: input.topCostPctPointChange,
                top_cost_current_pct_of_revenue: input.topCostCurrentPctOfRevenue,
                overdue_reminders_count: input.overdueRemindersCount ?? null,
                loan_payment_due_days: input.loanPaymentDueDays ?? null,
                loan_payment_due_other_count: input.loanPaymentDueOtherCount ?? null,
                payroll_status: input.payrollStatus ?? null,
                payroll_days_left: input.payrollDaysLeft ?? null,
                payroll_period_label: input.payrollPeriodLabel ?? null,
                tax_shortfall: input.taxShortfall ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
        );
    } catch {
        // Fail silently -- this is a best-effort sync feeding an
        // already-optional push tier, never something worth surfacing to
        // the user or blocking the screen on.
    }
}
