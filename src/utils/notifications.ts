import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

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
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Quad360 Daily Check-in 💰',
                body: "Don't forget to record today's transactions. Stay on top of your finances!",
            },
            trigger: { hour: 20, minute: 0, repeats: true } as any,
        });
    } catch {
        // Fail silently — notifications not available
    }
}

export async function scheduleWeeklySummaryReminder(): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Your Weekly Business Summary 📊',
                body: 'See how your business performed this week. Tap to view your report.',
            },
            trigger: { weekday: 1, hour: 9, minute: 0, repeats: true } as any,
        });
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
