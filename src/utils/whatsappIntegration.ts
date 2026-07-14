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
  businessName: string
) => {
  try {
    if (!invoice.vendorCustomer) {
      Alert.alert('Missing Info', 'Customer phone number not found. Add it to continue.');
      return;
    }

    const message = buildInvoiceMessage(invoice, businessName);
    openWhatsAppWithMessage(invoice.vendorCustomer, message);
  } catch (error) {
    Alert.alert('Error', 'Failed to open WhatsApp. Make sure it\'s installed.');
  }
};

// ─── Send payment request via WhatsApp ─────────────────────────────────────
export const sendPaymentRequestViaWhatsApp = async (
  invoice: Invoice,
  businessName: string,
  currency: string
) => {
  try {
    if (!invoice.vendorCustomer) {
      Alert.alert('Missing Info', 'Customer phone number not found.');
      return;
    }

    const message = buildPaymentRequestMessage(invoice, businessName, currency);
    openWhatsAppWithMessage(invoice.vendorCustomer, message);
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
    const message = `🎉 Milestone Achieved!\n\nYou've completed your goal: "${goalTitle}" (₦${targetValue.toLocaleString()})\n\nGreat work! Keep pushing forward with Quad360 📊`;
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
const buildInvoiceMessage = (invoice: Invoice, businessName: string): string => {
  const dueDate = new Date(invoice.dueDate || new Date()).toLocaleDateString();
  const status = invoice.status === 'overdue' ? '⚠️ OVERDUE' : '📋 DUE';

  return `Invoice from ${businessName}\n\n${status}\nInvoice #${invoice.id}\nAmount: ₦${invoice.amount?.toLocaleString()}\nDue Date: ${dueDate}\n\nPlease mark as paid once you've completed payment.`;
};

// ─── Helper: Build payment request message ────────────────────────────────
const buildPaymentRequestMessage = (
  invoice: Invoice,
  businessName: string,
  currency: string
): string => {
  const dueDate = new Date(invoice.dueDate || new Date()).toLocaleDateString();

  return `💳 Payment Request\n\nFrom: ${businessName}\nInvoice #${invoice.id}\nAmount Due: ${currency}${invoice.amount?.toLocaleString()}\nDue: ${dueDate}\n\nReply PAID when complete or PENDING if delayed.`;
};

// ─── Helper: Build report message ──────────────────────────────────────────
const buildReportMessage = (title: string, summary: string): string => {
  return `📊 ${title}\n\n${summary}\n\nGenerated from Quad360 Financial Management`;
};

// ─── Helper: Open WhatsApp with message ────────────────────────────────────
const openWhatsAppWithMessage = (phoneNumber: string, message: string) => {
  try {
    const formattedPhone = formatPhoneToE164(phoneNumber);
    const encodedMessage = encodeURIComponent(message);

    const url = Platform.select({
      ios: `whatsapp://wa.me/${formattedPhone}?text=${encodedMessage}`,
      android: `whatsapp://send?phone=${formattedPhone}&text=${encodedMessage}`,
    });

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
        message = `💸 Large Expense Alert\n\nA significant expense is scheduled for the next 7 days: ${details.currency}${details.currentCash?.toLocaleString()}\n\nEnsure sufficient cash on hand to cover this payment.`;
        break;
    }

    openWhatsAppWithMessage(recipientPhone, message);
  } catch (error) {
    console.error('Error sending cash flow alert:', error);
  }
};

// ─── Automatically detect and send overdue invoice alerts ──────────────────
export const detectAndSendOverdueAlerts = async (
  invoices: Invoice[],
  businessName: string,
  overdueThresholdDays: number = 7,
  sentAlertIds: Set<string> = new Set()
): Promise<string[]> => {
  const newAlertsSent: string[] = [];
  const now = new Date();

  for (const invoice of invoices) {
    // Skip already sent, paid, or draft invoices
    if (
      sentAlertIds.has(invoice.id) ||
      invoice.status === 'paid' ||
      invoice.status === 'draft'
    ) {
      continue;
    }

    // Check if invoice is overdue
    const dueDate = new Date(invoice.dueDate);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue >= overdueThresholdDays) {
      try {
        // Get customer phone (assuming it's in vendorCustomer field or needs to be added)
        const customerPhone = (invoice as any).customerPhone || (invoice as any).vendorCustomer;

        if (customerPhone) {
          await sendOverdueInvoiceAlert(
            customerPhone,
            businessName,
            invoice.invoiceNumber,
            invoice.total,
            daysOverdue,
            '₦'
          );
          newAlertsSent.push(invoice.id);
        }
      } catch (error) {
        console.error(`Failed to send alert for invoice ${invoice.id}:`, error);
      }
    }
  }

  return newAlertsSent;
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
 * EXAMPLE 3: Automated overdue alert (run periodically)
 *
 * useEffect(() => {
 *   const sentAlerts = new Set<string>();
 *   detectAndSendOverdueAlerts(invoices, businessName, 7, sentAlerts);
 * }, [invoices]);
 *
 * EXAMPLE 4: Send cash flow alert
 *
 * if (currentCash < lowCashThreshold) {
 *   await sendCashFlowAlert(userPhone, 'low_cash', {
 *     currentCash,
 *     threshold: lowCashThreshold,
 *     currency: '₦'
 *   });
 * }
 *
 * EXAMPLE 5: Check if WhatsApp installed before showing button
 *
 * const whatsappAvailable = await isWhatsAppInstalled();
 * if (whatsappAvailable) {
 *   showWhatsAppButtons();
 * }
 */
