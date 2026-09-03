import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PayrollReminderStatus } from './payrollReminders';
import { TaxDeadlineStatus } from './taxDeadline';
import { DailyBriefingResult } from './dailyBriefing';
import { DailyRecapResult } from './dailyRecap';
import { MonthlyBriefResult } from './monthlyBrief';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

const KEYS = {
    dailyId:  '@quad360/notif_daily_id',
    weeklyId: '@quad360/notif_weekly_id',
    financingQualifyId: '@quad360/notif_financing_qualify_id',
    financingOpportunityId: '@quad360/notif_financing_opportunity_id',
    overdueRemindersId: '@quad360/notif_overdue_reminders_id',
    loanPaymentDueId: '@quad360/notif_loan_payment_due_id',
    payrollDueId: '@quad360/notif_payroll_due_id',
    overdueTransactionsId: '@quad360/notif_overdue_transactions_id',
    taxDeadlineId: '@quad360/notif_tax_deadline_id',
    goalAlertsId: '@quad360/notif_goal_alerts_id',
    recurringTransactionsId: '@quad360/notif_recurring_transactions_id',
    budgetPeriodLapsedId: '@quad360/notif_budget_period_lapsed_id',
    assetReplacementId: '@quad360/notif_asset_replacement_id',
    stockoutRiskId: '@quad360/notif_stockout_risk_id',
    taxAbilityToPayId: '@quad360/notif_tax_ability_to_pay_id',
    slowMovingStockId: '@quad360/notif_slow_moving_stock_id',
    lowCashRunwayId: '@quad360/notif_low_cash_runway_id',
    risingCostCategoryId: '@quad360/notif_rising_cost_category_id',
    morningBriefingId: '@quad360/notif_morning_briefing_id',
    eveningRecapId: '@quad360/notif_evening_recap_id',
    monthlyBriefId: '@quad360/notif_monthly_brief_id',
};

export async function requestNotificationPermission(): Promise<boolean> {
    try {
        if (Platform.OS === 'web') return false;
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus === 'granted') return true;
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    } catch {
        return false;
    }
}

export async function scheduleDailyReminder(): Promise<void> {
    try {
        // Cancel only the previous daily notification, not all notifications
        const prevId = await AsyncStorage.getItem(KEYS.dailyId);
        if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Quad360 Daily Check-in 💰',
                body: "Don't forget to record today's transactions. Stay on top of your finances!",
            },
            trigger: { hour: 20, minute: 0, repeats: true } as any,
        });
        await AsyncStorage.setItem(KEYS.dailyId, id);
    } catch {
        // Fail silently — notifications not available
    }
}

export async function scheduleWeeklySummaryReminder(): Promise<void> {
    try {
        // Cancel only the previous weekly notification
        const prevId = await AsyncStorage.getItem(KEYS.weeklyId);
        if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Your Weekly Business Summary 📊',
                body: 'See how your business performed this week. Tap to view your report.',
            },
            trigger: { weekday: 1, hour: 9, minute: 0, repeats: true } as any,
        });
        await AsyncStorage.setItem(KEYS.weeklyId, id);
    } catch {
        // Fail silently
    }
}

// Throttled to once per day -- getInvoicesDueForReminder (invoiceReminders.ts)
// recomputes on every relevant change, but a fresh notification every time
// would repeat on each transaction/invoice edit even though the same
// overdue invoices are still sitting there from an hour ago.
export async function notifyOverdueRemindersDue(count: number): Promise<void> {
    try {
        if (Platform.OS === 'web') return;

        const prevNotified = await AsyncStorage.getItem(KEYS.overdueRemindersId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${count} invoice${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} a reminder 📬`,
                body: 'Tap to send WhatsApp payment reminders to your customers.',
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.overdueRemindersId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// A self-reminder, not a client-facing message -- there's no WhatsApp
// equivalent here since the "recipient" is the business owner's own lender
// payment, so a plain local notification is the whole feature. Throttled
// to once per day for the same reason as notifyOverdueRemindersDue: the
// same loan being due soon shouldn't re-notify on every unrelated recompute.
export async function notifyLoanPaymentDueSoon(lenderName: string, daysUntilDue: number, otherCount: number): Promise<void> {
    try {
        if (Platform.OS === 'web') return;

        const prevNotified = await AsyncStorage.getItem(KEYS.loanPaymentDueId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        const body = otherCount > 0
            ? `${lenderName} payment due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}, plus ${otherCount} more coming up.`
            : `${lenderName} payment due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Loan payment coming up 📅',
                body,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.loanPaymentDueId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Throttled to once per day, same reasoning as the other reminder
// notifications -- the underlying status only actually changes once a
// month (a run is recorded, or the calendar rolls over), so a fresh
// notification on every recompute would just repeat itself all day.
export async function notifyPayrollDue(status: PayrollReminderStatus): Promise<void> {
    try {
        if (Platform.OS === 'web' || status.kind === 'none') return;

        const prevNotified = await AsyncStorage.getItem(KEYS.payrollDueId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        const body = status.kind === 'overdue'
            ? `No payroll run was recorded for ${status.missedPeriod}. Log it if staff were paid another way.`
            : `${status.daysLeftInMonth} day${status.daysLeftInMonth === 1 ? '' : 's'} left in ${status.period} and payroll hasn't been run yet.`;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: status.kind === 'overdue' ? 'Payroll was never run 📋' : 'Payroll not run yet this month 📋',
                body,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.payrollDueId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Overdue income logged directly as a transaction (not via Invoices) --
// invoices already have their own richer reminder flow (invoiceReminders.ts
// + this screen's stepper); this is the equivalent bare-minimum "you have
// money to chase" nudge for the uninvoiced kind. Throttled to once a day,
// same reasoning as the other reminder notifications here.
export async function notifyOverdueTransactionsFound(count: number, totalAmount: number, currency: string): Promise<void> {
    try {
        if (Platform.OS === 'web' || count === 0) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.overdueTransactionsId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${count} payment${count === 1 ? '' : 's'} overdue 💰`,
                body: `${currency}${Math.round(totalAmount).toLocaleString()} owed to you, logged as sales rather than invoices.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.overdueTransactionsId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Mirrors the Tax Filing Readiness tab's own deadline card, which only the
// user visiting Reports would otherwise see. Throttled to once a day, same
// reasoning as the other reminder notifications here.
export async function notifyTaxDeadline(status: TaxDeadlineStatus): Promise<void> {
    try {
        if (Platform.OS === 'web' || status.kind === 'none' || status.kind === 'ok') return;

        const prevNotified = await AsyncStorage.getItem(KEYS.taxDeadlineId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        const body = status.kind === 'overdue'
            ? `Your tax filing deadline (${status.deadline}) was ${status.daysOverdue} day${status.daysOverdue === 1 ? '' : 's'} ago. File as soon as possible to limit penalties.`
            : `Your tax filing deadline (${status.deadline}) is in ${status.daysUntilDeadline} day${status.daysUntilDeadline === 1 ? '' : 's'}.`;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: status.kind === 'overdue' ? 'Tax filing deadline overdue 🏛️' : 'Tax filing deadline coming up 🏛️',
                body,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.taxDeadlineId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Goals screen already shows each goal's own days-remaining state -- this
// is just the same "you'd otherwise only see it if you opened that screen"
// nudge the other reminders here give. Lower urgency than the others (no
// third-party penalty attached to a self-set goal), so it's a single
// summary notification rather than one per goal. Throttled to once a day.
export async function notifyGoalAlerts(missedCount: number, offTrackCount: number): Promise<void> {
    try {
        if (Platform.OS === 'web' || (missedCount === 0 && offTrackCount === 0)) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.goalAlertsId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        const parts: string[] = [];
        if (missedCount > 0) parts.push(`${missedCount} goal${missedCount === 1 ? '' : 's'} past deadline`);
        if (offTrackCount > 0) parts.push(`${offTrackCount} falling behind pace`);

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Your goals need a check-in 🎯',
                body: `${parts.join(', ')}. Tap to review.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.goalAlertsId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Same ambiguity as notifyPayrollDue -- Quad360 can't know for certain a
// recurring bill was missed vs. just not re-logged, so this is a nudge to
// check, not a confident "you owe this." Single summary notification since
// several recurring transactions can be due/overdue at once. Throttled to
// once a day.
export async function notifyRecurringTransactionAlerts(overdueCount: number, dueSoonCount: number): Promise<void> {
    try {
        if (Platform.OS === 'web' || (overdueCount === 0 && dueSoonCount === 0)) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.recurringTransactionsId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        const parts: string[] = [];
        if (overdueCount > 0) parts.push(`${overdueCount} recurring bill${overdueCount === 1 ? '' : 's'} overdue`);
        if (dueSoonCount > 0) parts.push(`${dueSoonCount} coming up soon`);

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Recurring transactions need a check 🔁',
                body: `${parts.join(', ')}. Tap to review.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.recurringTransactionsId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Only fires for a business that has budgeted before (see
// budgetPeriod.ts's isBudgetPeriodLapsed) -- never a nag to someone who's
// simply never used the feature. Throttled to once a day.
export async function notifyBudgetPeriodLapsed(period: string): Promise<void> {
    try {
        if (Platform.OS === 'web') return;

        const prevNotified = await AsyncStorage.getItem(KEYS.budgetPeriodLapsedId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'No budget set this month 📋',
                body: `You've budgeted before, but nothing is active for ${period}. Renew it to keep tracking overspending.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.budgetPeriodLapsedId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Mirrors AssetsScreen's own "nearly fully depreciated" banner (same
// ≤20%-of-cost threshold, see finance.ts's computeAssetsNearingReplacement)
// -- this is the equivalent nudge for someone who hasn't opened that screen
// lately. Throttled to once a day.
export async function notifyAssetsNearingReplacement(count: number, totalValue: number, currency: string): Promise<void> {
    try {
        if (Platform.OS === 'web' || count === 0) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.assetReplacementId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${count} asset${count === 1 ? '' : 's'} nearing replacement 🔧`,
                body: `${currency}${Math.round(totalValue).toLocaleString()} in remaining book value. Consider a replacement-fund goal.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.assetReplacementId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Only fires for items with real recent sales data (computeStockVelocity's
// 'fast' tier -- see stockVelocity.ts), never a guess for items with no
// sales history. Throttled to once a day.
export async function notifyStockoutRisk(count: number, totalValue: number, currency: string): Promise<void> {
    try {
        if (Platform.OS === 'web' || count === 0) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.stockoutRiskId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${count} item${count === 1 ? '' : 's'} selling out fast 📦`,
                body: `${currency}${Math.round(totalValue).toLocaleString()} in stock at risk of running out. Reorder soon.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.stockoutRiskId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Mirrors the Tax Filing Readiness tab's own "ability to pay" check
// (computeTaxAbilityToPay, taxFilingReadiness.ts) -- distinct from
// notifyTaxDeadline above, which is purely about the filing *date*. This
// fires when cash on hand won't cover tax already collected but not yet
// remitted, regardless of how far off the deadline is. Throttled to once
// a day, same reasoning as the other reminder notifications here.
export async function notifyTaxAbilityToPayShortfall(shortfall: number, currency: string): Promise<void> {
    try {
        if (Platform.OS === 'web' || shortfall <= 0) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.taxAbilityToPayId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'May not cover your tax bill 💰',
                body: `You could be short by ${currency}${Math.round(shortfall).toLocaleString()} against tax already collected. Set cash aside before it's due.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.taxAbilityToPayId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// The mirror image of notifyStockoutRisk -- dead-slow stock (computeStockVelocity's
// 'slow' tier) tying up cash for far longer than needed, rather than about to run
// out. Same real-sales-data guard, same once-a-day throttle.
export async function notifySlowMovingStock(count: number, totalValue: number, currency: string): Promise<void> {
    try {
        if (Platform.OS === 'web' || count === 0) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.slowMovingStockId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${count} item${count === 1 ? '' : 's'} moving slowly 🐌`,
                body: `${currency}${Math.round(totalValue).toLocaleString()} tied up in slow-selling stock. Consider a discount to free up cash.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.slowMovingStockId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Mirrors DashboardScreen's own Cash Runway gauge -- same <30-day threshold
// that already turns the gauge red there (see runwayColor), so this never
// introduces a second, independently-tuned number for "low." Throttled to
// once a day, same reasoning as the other reminder notifications here: the
// underlying runway figure barely moves hour to hour, so a fresh
// notification on every recompute would just repeat itself all day.
export async function notifyLowCashRunway(runwayDays: number, currency: string, cashBalance: number): Promise<void> {
    try {
        if (Platform.OS === 'web' || runwayDays >= 30) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.lowCashRunwayId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Cash runway getting short ⏳',
                body: `At your current burn rate, ${currency}${Math.round(cashBalance).toLocaleString()} in the bank covers about ${runwayDays} more day${runwayDays === 1 ? '' : 's'}. Worth slowing spend or chasing outstanding invoices.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.lowCashRunwayId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// Mirrors Cost Exposure's own "which expense category is quietly eating a
// bigger share of revenue" signal (costExposure.ts) -- the caller decides
// how large a pctPointChange counts as worth interrupting the owner for
// (see DashboardScreen's own call site, which matches costExposure.ts's own
// MODEL.breadthThresholdPctPoints rather than picking a second, unrelated
// number here); this function only guards against a non-positive change
// (nothing rising, nothing to say) and throttles to once a day.
export async function notifyRisingCostCategory(category: string, pctPointChange: number, currentPctOfRevenue: number): Promise<void> {
    try {
        if (Platform.OS === 'web' || pctPointChange <= 0) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.risingCostCategoryId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 1) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `"${category}" is taking a bigger bite of revenue 📈`,
                body: `Up ${pctPointChange.toFixed(1)} points to ${currentPctOfRevenue.toFixed(1)}% of revenue over the last 3 months. Check Cost Exposure for what's driving it.`,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.risingCostCategoryId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

export async function sendWelcomeNotification(businessName: string): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `Welcome to Quad360, ${businessName}! 🎉`,
                body: 'Your financial dashboard is ready. Add your first transaction to get started.',
            },
            trigger: { seconds: 2 } as any,
        });
    } catch {
        // Fail silently
    }
}

export async function notifyFinancingQualificationProgress(daysActive: number): Promise<void> {
    try {
        if (Platform.OS === 'web') return;

        // Only notify if user is between 75 and 90 days active
        if (daysActive < 75 || daysActive >= 90) return;

        const prevNotified = await AsyncStorage.getItem(KEYS.financingQualifyId);
        // Only send once per 7 days
        if (prevNotified) {
            const lastNotifTime = parseInt(prevNotified, 10);
            const daysSinceLastNotif = (Date.now() - lastNotifTime) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 7) return;
        }

        const daysRemaining = 90 - daysActive;
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'You\'re Almost Qualified! 🎉',
                body: `Just ${daysRemaining} more days of activity and you'll unlock merchant financing. Keep logging transactions!`,
            },
            trigger: null,
        });

        // Mark that we've sent this notification
        await AsyncStorage.setItem(KEYS.financingQualifyId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// A strong-confidence entry in financingRecommendation.ts's output --
// see that file for how "strong" is earned (real outstanding invoices,
// real aging assets, real DSCR + trend), never a generic "you might want
// financing" nudge. Throttled to once per 14 days so it can't repeat
// every app open even though the same real signal often keeps holding
// true from one day to the next.
export async function notifyFinancingOpportunity(label: string, reason: string): Promise<void> {
    try {
        if (Platform.OS === 'web') return;

        const prevNotified = await AsyncStorage.getItem(KEYS.financingOpportunityId);
        if (prevNotified) {
            const daysSinceLastNotif = (Date.now() - parseInt(prevNotified, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastNotif < 14) return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `You may qualify for ${label} 💡`,
                body: reason,
            },
            trigger: null,
        });

        await AsyncStorage.setItem(KEYS.financingOpportunityId, Date.now().toString());
    } catch {
        // Fail silently
    }
}

// The next real occurrence of hour:minute -- today if it hasn't passed yet,
// tomorrow otherwise. Used instead of expo-notifications' own `repeats: true`
// hour/minute trigger (see scheduleDailyReminder above) because that trigger
// can only ever repeat the SAME static text every day. The morning
// briefing/evening recap need today's real numbers, and Quad360 has no
// backend or push server to compute those server-side at the target hour --
// this app is fully client-side. The only honest way to get real content at
// a fixed clock time is to compute it fresh whenever the app is open and
// schedule it as a ONE-OFF local notification for the next 7am/6pm, then
// replace that notification every time fresher data becomes available (see
// DashboardScreen's call sites). A business that never reopens the app
// between one firing and the next will get a notification built from
// whatever was known last time it was open -- stale, but never fabricated.
function nextOccurrenceOf(hour: number, minute: number, now: Date = new Date()): Date {
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
}

// Fires once, at the next 7:00 AM, with real content built from whatever the
// app already knows at scheduling time (see buildDailyBriefing). Reschedules
// (cancelling the previous one) every time this is called so the content
// stays as fresh as the app's own data.
export async function scheduleMorningBriefing(briefing: DailyBriefingResult, now: Date = new Date()): Promise<void> {
    try {
        if (Platform.OS === 'web') return;

        const prevId = await AsyncStorage.getItem(KEYS.morningBriefingId);
        if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});

        const id = await Notifications.scheduleNotificationAsync({
            content: { title: briefing.title, body: briefing.body },
            trigger: { date: nextOccurrenceOf(7, 0, now) } as any,
        });
        await AsyncStorage.setItem(KEYS.morningBriefingId, id);
    } catch {
        // Fail silently -- notifications not available
    }
}

// Fires once, at the next 6:00 PM, with real content built from today's
// actual transactions (see buildDailyRecap). Skipped entirely when nothing
// was logged today -- there is nothing honest to recap yet, so no
// notification is scheduled rather than firing an empty one at 6pm.
export async function scheduleEveningRecap(recap: DailyRecapResult, now: Date = new Date()): Promise<void> {
    try {
        if (Platform.OS === 'web' || !recap.available) return;

        const prevId = await AsyncStorage.getItem(KEYS.eveningRecapId);
        if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});

        const id = await Notifications.scheduleNotificationAsync({
            content: { title: recap.title, body: recap.body },
            trigger: { date: nextOccurrenceOf(18, 0, now) } as any,
        });
        await AsyncStorage.setItem(KEYS.eveningRecapId, id);
    } catch {
        // Fail silently -- notifications not available
    }
}

// The next real occurrence of day-of-month at hour:minute -- this month's
// occurrence if it hasn't passed yet, next month's otherwise. Mirrors
// nextOccurrenceOf above but for a monthly cadence.
function nextMonthlyOccurrenceOf(day: number, hour: number, minute: number, now: Date = new Date()): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), day, hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) d.setMonth(d.getMonth() + 1);
    return d;
}

// Fires once, at the next 1st-of-month 8:00 AM, with real content built
// from whatever the app already knows at scheduling time (see
// buildMonthlyBrief). Reschedules every time this is called -- same
// reasoning as scheduleMorningBriefing/scheduleEveningRecap above: a
// business that reopens the app anytime during the new month gets the
// freshest possible recap of the month that just closed, and one that
// never reopens it gets whatever was last built, never fabricated. Skipped
// entirely when last month had nothing logged -- same as
// scheduleEveningRecap, there's nothing honest to recap yet.
export async function scheduleMonthlyBrief(brief: MonthlyBriefResult, now: Date = new Date()): Promise<void> {
    try {
        if (Platform.OS === 'web' || !brief.available) return;

        const prevId = await AsyncStorage.getItem(KEYS.monthlyBriefId);
        if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});

        const id = await Notifications.scheduleNotificationAsync({
            content: { title: brief.title, body: brief.body },
            trigger: { date: nextMonthlyOccurrenceOf(1, 8, 0, now) } as any,
        });
        await AsyncStorage.setItem(KEYS.monthlyBriefId, id);
    } catch {
        // Fail silently -- notifications not available
    }
}
