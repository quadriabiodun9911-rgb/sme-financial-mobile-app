import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function scheduleOverdueInvoiceReminder(invoiceNumber: string, clientName: string): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Invoice Overdue ⚠️',
                body: `${invoiceNumber} for ${clientName} is overdue. Follow up to get paid.`,
            },
            trigger: null,
        });
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
