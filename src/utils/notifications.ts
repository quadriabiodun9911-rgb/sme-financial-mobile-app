import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PayrollReminderStatus } from './payrollReminders';
import { TaxDeadlineStatus } from './taxDeadline';

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
