import { Linking, Alert, Platform } from 'react-native';
import { Invoice } from '../types';

/**
 * WhatsApp Integration Utilities for Quad360
 * Phase 1: Deep Links (No API required, zero cost)
 *
 * Implementation: Add buttons to InvoicesScreen, ReportsScreen, etc.
 */

// ─── Check if WhatsApp is installed ───────────────────────────────────────
export const isWhatsAppInstalled = async (): Promise<boolean> => {
  try {
    const url = Platform.select({
      ios: 'whatsapp://app',
      android: 'whatsapp://send?phone=1',
    });
    const result = await Linking.canOpenURL(url!);
    return result;
  } catch {
    return false;
  }
};

// ─── Send invoice reminder via WhatsApp ────────────────────────────────────
export const sendInvoiceReminderViaWhatsApp = async (
  invoice: Invoice,
  businessName: string,
  currency: string,
  customerPhone: string
) => {
  try {
    if (!customerPhone) {
      Alert.alert('Missing Info', 'Customer phone number not found. Add it to continue.');
      return;
    }

    const message = buildInvoiceMessage(invoice, businessName, currency);
    openWhatsAppWithMessage(customerPhone, message);
  } catch (error) {
    Alert.alert('Error', 'Failed to open WhatsApp. Make sure it\'s installed.');
  }
};

// ─── Send payment request via WhatsApp ─────────────────────────────────────
export const sendPaymentRequestViaWhatsApp = async (
  invoice: Invoice,
  businessName: string,
  currency: string,
  customerPhone: string
) => {
  try {
    if (!customerPhone) {
      Alert.alert('Missing Info', 'Customer phone number not found.');
      return;
    }

    const message = buildPaymentRequestMessage(invoice, businessName, currency);
    openWhatsAppWithMessage(customerPhone, message);
  } catch (error) {
    Alert.alert('Error', 'Failed to send payment request.');
  }
};

// ─── Share financial report via WhatsApp ──────────────────────────────────
export const shareReportViaWhatsApp = async (
  reportTitle: string,
  reportSummary: string,
  recipientPhone?: string
) => {
  try {
    const message = buildReportMessage(reportTitle, reportSummary);

    if (recipientPhone) {
      openWhatsAppWithMessage(recipientPhone, message);
    } else {
      // Open WhatsApp without pre-filling (user selects contact)
      await Linking.openURL('whatsapp://app');
      Alert.alert('Share Report', 'WhatsApp opened. You can now paste this:\n\n' + message);
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to share report.');
  }
};

// ─── Send goal achievement celebration via WhatsApp ────────────────────────
export const sendGoalAchievementNotification = async (
  recipientPhone: string,
  goalTitle: string,
  targetValue: number,
  currency: string
) => {
  try {
    const message = `🎉 Milestone Achieved!\n\nYou've completed your goal: "${goalTitle}" (${currency}${targetValue.toLocaleString()})\n\nGreat work! Keep pushing forward with Quad360 📊`;
    openWhatsAppWithMessage(recipientPhone, message);
  } catch (error) {
    console.error('Error sending goal notification:', error);
  }
};

// ─── Send payment confirmation to customer ─────────────────────────────────
export const sendPaymentConfirmationViaWhatsApp = async (
  customerPhone: string,
  businessName: string,
  invoiceNumber: string,
  amount: number,
  currency: string
) => {
  try {
    const message = `✅ Payment Received\n\nThank you for payment to ${businessName}\n\nInvoice: #${invoiceNumber}\nAmount: ${currency}${amount.toLocaleString()}\n\nYour payment has been recorded.`;
    openWhatsAppWithMessage(customerPhone, message);
  } catch (error) {
    console.error('Error sending payment confirmation:', error);
  }
};

// ─── Send weekly financial summary ─────────────────────────────────────────
export const sendWeeklySummaryViaWhatsApp = async (
  recipientPhone: string,
  summary: {
    weekProfitChange: number;
    currentProfit: number;
    cashBalance: number;
    outstandingInvoices: number;
  },
  currency: string
) => {
  try {
    const trendEmoji = summary.weekProfitChange >= 0 ? '📈' : '📉';
    const message = `📊 Weekly Summary\n\n${trendEmoji} Profit: ${currency}${summary.currentProfit.toLocaleString()}\n${summary.weekProfitChange >= 0 ? '✅' : '⚠️'} Change: ${summary.weekProfitChange >= 0 ? '+' : ''}${summary.weekProfitChange}%\n💰 Cash: ${currency}${summary.cashBalance.toLocaleString()}\n📋 Outstanding: ${currency}${summary.outstandingInvoices.toLocaleString()}\n\nTap to view full dashboard →`;
    openWhatsAppWithMessage(recipientPhone, message);
  } catch (error) {
    console.error('Error sending weekly summary:', error);
  }
};

// ─── Send transaction alert via WhatsApp ──────────────────────────────────
export const sendTransactionAlertViaWhatsApp = async (
  recipientPhone: string,
  alertType: 'large_expense' | 'budget_overrun' | 'unusual_activity',
  details: {
    amount?: number;
    description?: string;
    category?: string;
    currency?: string;
  }
) => {
  try {
    let message = '';

    switch (alertType) {
      case 'large_expense':
        message = `⚠️ Large Expense Alert\n\n${details.description}\nAmount: ${details.currency}${details.amount?.toLocaleString()}\nCategory: ${details.category}\n\nReview this transaction in your app.`;
        break;
      case 'budget_overrun':
        message = `⚠️ Budget Alert\n\nYou've exceeded budget for ${details.category}\nAmount: ${details.currency}${details.amount?.toLocaleString()}\n\nCheck your spending patterns.`;
        break;
      case 'unusual_activity':
        message = `⚠️ Unusual Activity Detected\n\n${details.description}\n\nPlease verify this transaction in your app.`;
        break;
    }

    openWhatsAppWithMessage(recipientPhone, message);
  } catch (error) {
    console.error('Error sending transaction alert:', error);
  }
};

// ─── Helper: Format phone number to E.164 format ────────────────────────────
export const formatPhoneToE164 = (phone: string, countryCode: string = '234'): string => {
  // Remove common formatting characters
  const cleaned = phone.replace(/[^\d+]/g, '');

  // If already has +, return as-is
  if (cleaned.startsWith('+')) return cleaned;

  // If starts with 0, replace with country code
  if (cleaned.startsWith('0')) {
    return `+${countryCode}${cleaned.substring(1)}`;
  }

  // Otherwise prepend country code
  return `+${countryCode}${cleaned}`;
};

// ─── Helper: Build invoice message ─────────────────────────────────────────
const buildInvoiceMessage = (invoice: Invoice, businessName: string, currency: string): string => {
  const dueDate = new Date(invoice.dueDate || new Date()).toLocaleDateString();
  const status = invoice.status === 'overdue' ? '⚠️ OVERDUE' : '📋 DUE';

  return `Invoice from ${businessName}\n\n${status}\nInvoice #${invoice.invoiceNumber}\nAmount: ${currency}${invoice.total?.toLocaleString()}\nDue Date: ${dueDate}\n\nPlease mark as paid once you've completed payment.`;
};

// ─── Helper: Build payment request message ────────────────────────────────
const buildPaymentRequestMessage = (
  invoice: Invoice,
  businessName: string,
  currency: string
): string => {
  const dueDate = new Date(invoice.dueDate || new Date()).toLocaleDateString();

  return `💳 Payment Request\n\nFrom: ${businessName}\nInvoice #${invoice.invoiceNumber}\nAmount Due: ${currency}${invoice.total?.toLocaleString()}\nDue: ${dueDate}\n\nReply PAID when complete or PENDING if delayed.`;
};

// ─── Helper: Build report message ──────────────────────────────────────────
const buildReportMessage = (title: string, summary: string): string => {
  return `📊 ${title}\n\n${summary}\n\nGenerated from Quad360 Financial Management`;
};

// ─── Helper: Build the platform-appropriate WhatsApp deep link ────────────
const buildWhatsAppUrl = (phoneNumber: string, message: string): string | undefined => {
  const formattedPhone = formatPhoneToE164(phoneNumber);
  const encodedMessage = encodeURIComponent(message);
  return Platform.select({
    ios: `whatsapp://wa.me/${formattedPhone}?text=${encodedMessage}`,
    android: `whatsapp://send?phone=${formattedPhone}&text=${encodedMessage}`,
    default: `https://wa.me/${formattedPhone}?text=${encodedMessage}`,
  });
};

// ─── Helper: Open WhatsApp with message ────────────────────────────────────
const openWhatsAppWithMessage = (phoneNumber: string, message: string) => {
  try {
    const url = buildWhatsAppUrl(phoneNumber, message);

    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert(
          'WhatsApp Not Installed',
          'Please install WhatsApp to use this feature.'
        );
      });
    }
  } catch (error) {
    console.error('Error opening WhatsApp:', error);
    Alert.alert('Error', 'Failed to open WhatsApp.');
  }
};

// ─── Open a chat with Quad360 support ──────────────────────────────────────
// Uses the universal wa.me link (not app deep-link schemes) so it works
// identically on web, iOS, and Android — this is the entry point for the
// "human-reachable support" layer, not an automated alert to a customer.
export const openSupportChat = (supportNumber: string, prefillMessage?: string): boolean => {
  if (!supportNumber) return false;
  const message = prefillMessage ?? 'Hi Quad360, I need help with my account.';
  openWhatsAppWithMessage(supportNumber, message);
  return true;
};

// ─── Send a promotional/win-back message to one customer ─────────────────
// Every function above this one sends a fixed, system-generated message
// (a reminder, a confirmation, a report) about something that already
// happened. This is the one place the OWNER's own free-text message goes
// out to a customer -- a promotion, a win-back nudge, an announcement.
// wa.me only ever opens one conversation at a time (there is no bulk-send
// API behind this), so a "broadcast" to several customers is this same
// call made once per recipient, with the caller stepping through the list
// -- see BroadcastModal (GrowthIntelligenceScreen.tsx) for that loop. This
// function itself sends to exactly one number, honestly, rather than
// implying a real bulk send it can't actually do.
//
// Returns a promise resolving only once Linking.openURL actually succeeds --
// the caller (CustomerBroadcastModal) awaits this before marking a customer
// "sent" and advancing, so a rejected launch (WhatsApp not installed, etc.)
// is reported as a failure the owner can retry rather than a silent success.
export const sendPromotionalMessageViaWhatsApp = async (customerPhone: string, message: string): Promise<boolean> => {
  if (!customerPhone || !message.trim()) return false;
  const url = buildWhatsAppUrl(customerPhone, message);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
};

// ─── Send automated overdue invoice alert ─────────────────────────────────
export const sendOverdueInvoiceAlert = async (
  customerPhone: string,
  businessName: string,
  invoiceNumber: string,
  amount: number,
  daysOverdue: number,
  currency: string = '₦'
) => {
  try {
    const formattedPhone = formatPhoneToE164(customerPhone);

    const message = `⏰ Payment Reminder\n\nHi! Your invoice #${invoiceNumber} from ${businessName} is now ${daysOverdue} days overdue.\n\nAmount Due: ${currency}${amount.toLocaleString()}\n\nPlease arrange payment at your earliest convenience. Thank you!`;

    openWhatsAppWithMessage(formattedPhone, message);
  } catch (error) {
    console.error('Error sending overdue alert:', error);
  }
};

// ─── Send cash flow alert via WhatsApp ─────────────────────────────────────
export const sendCashFlowAlert = async (
  recipientPhone: string,
  alertType: 'low_cash' | 'negative_forecast' | 'large_expense',
  details: {
    currentCash?: number;
    threshold?: number;
    projectedMonth?: string;
    expenseAmount?: number;
    currency?: string;
  }
) => {
  try {
    let message = '';

    switch (alertType) {
      case 'low_cash':
        message = `⚠️ Low Cash Alert\n\nYour cash balance has dropped to ${details.currency}${details.currentCash?.toLocaleString()}\n\nYour minimum threshold is: ${details.currency}${details.threshold?.toLocaleString()}\n\nReview your cash position immediately.`;
        break;
      case 'negative_forecast':
        message = `📉 Forecast Alert\n\nBased on current trends, your cash is projected to run negative by ${details.projectedMonth}.\n\nTake action now:\n• Accelerate customer collections\n• Negotiate extended payment terms\n• Review discretionary expenses`;
        break;
      case 'large_expense':
        message = `💸 Large Expense Alert\n\nA significant expense is scheduled for the next 7 days: ${details.currency}${details.expenseAmount?.toLocaleString()}\n\nEnsure sufficient cash on hand to cover this payment.`;
        break;
    }

    openWhatsAppWithMessage(recipientPhone, message);
  } catch (error) {
    console.error('Error sending cash flow alert:', error);
  }
};

// ─── Usage Examples ────────────────────────────────────────────────────────
/**
 * EXAMPLE 1: Add button to InvoicesScreen
 *
 * <TouchableOpacity onPress={() => sendInvoiceReminderViaWhatsApp(invoice, businessName)}>
 *   <Text>💬 Send Reminder via WhatsApp</Text>
 * </TouchableOpacity>
 *
 * EXAMPLE 2: Add button to ReportsScreen
 *
 * <TouchableOpacity onPress={() => shareReportViaWhatsApp('Monthly Report', reportSummary)}>
 *   <Text>📤 Share via WhatsApp</Text>
 * </TouchableOpacity>
 *
 * EXAMPLE 3: Send cash flow alert
 *
 * if (currentCash < lowCashThreshold) {
 *   await sendCashFlowAlert(userPhone, 'low_cash', {
 *     currentCash,
 *     threshold: lowCashThreshold,
 *     currency: '₦'
 *   });
 * }
 *
 * EXAMPLE 4: Check if WhatsApp installed before showing button
 *
 * const whatsappAvailable = await isWhatsAppInstalled();
 * if (whatsappAvailable) {
 *   showWhatsAppButtons();
 * }
 */
