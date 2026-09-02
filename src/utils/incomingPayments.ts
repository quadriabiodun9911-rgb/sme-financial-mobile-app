import { supabase } from './supabase';

const PROVIDER_LABEL: Record<string, string> = {
    paystack: 'Paystack',
    korapay: 'Korapay',
    flutterwave: 'Flutterwave',
};

interface IncomingPaymentRow {
    id: string;
    provider: 'paystack' | 'korapay' | 'flutterwave';
    tx_ref: string;
    amount: number;
    currency: string | null;
    customer_name: string | null;
    description: string | null;
    invoice_id: string | null;
}

// Pulls down payments payment-webhook has already verified as successful
// (see supabase/functions/payment-webhook) and turns each into a real
// transaction via the app's normal addTransaction path -- deliberately not
// read directly into the shared `transactions` table server-side, since
// storage.ts's saveTransactions() deletes any remote transaction row not
// present in the caller's current local array, and a row written there
// straight from the webhook would get wiped out by the very next ordinary
// save from any device. Routing it through addTransaction() instead means
// it enters local state first, exactly like a transaction the user typed in
// by hand, and gets synced up normally from there.
//
// existingReferences guards against a double-record: recordManualPayment in
// PaymentLinkScreen.tsx stores this same provider-generated reference on
// the transaction it creates, so if the merchant already tapped "Mark as
// Paid" for a checkout the webhook also confirmed, this skips it instead of
// creating a second transaction for the same payment.
export async function claimIncomingPayments(
    ownerUserId: string,
    existingReferences: Set<string>,
    addTransaction: (tx: Record<string, unknown>) => void,
    markInvoiceStatus?: (id: string, status: string) => void,
): Promise<number> {
    const { data, error } = await supabase
        .from('incoming_payments')
        .select('id, provider, tx_ref, amount, currency, customer_name, description, invoice_id')
        .eq('owner_user_id', ownerUserId);
    if (error || !data || data.length === 0) return 0;

    let claimed = 0;
    for (const p of data as IncomingPaymentRow[]) {
        // Claim (delete the staging row) before adding, not after -- a
        // second concurrent claim call (e.g. Dashboard and the payment-
        // complete tab both mounting around the same time) must not also
        // see this row and double-record it.
        await supabase.from('incoming_payments').delete().eq('id', p.id);
        if (existingReferences.has(p.tx_ref)) continue;
        addTransaction({
            type: 'income',
            amount: p.amount,
            description: p.description || `Payment via ${PROVIDER_LABEL[p.provider] || p.provider}`,
            category: 'Sales',
            date: new Date().toISOString().split('T')[0],
            vendorCustomer: p.customer_name || undefined,
            status: 'paid',
            reference: p.tx_ref,
        });
        if (p.invoice_id && markInvoiceStatus) markInvoiceStatus(p.invoice_id, 'paid');
        existingReferences.add(p.tx_ref);
        claimed++;
    }
    return claimed;
}
