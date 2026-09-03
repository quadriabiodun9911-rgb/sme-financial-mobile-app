import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';

// The number a linking message / logged transaction actually goes to --
// genuinely doesn't exist yet (no Twilio WhatsApp sender has been
// provisioned). Replace once one is: see supabase/functions/whatsapp-
// webhook's header for the full deploy sequence this number is the other
// half of.
export const WHATSAPP_BOT_NUMBER = '';

function generateLinkCode(): string {
    // A 6-digit numeric code, easy to read back and type/tap over WhatsApp
    // -- matches what whatsapp-webhook's digit-extraction expects.
    return String(Math.floor(100000 + Math.random() * 900000));
}

// Creates a fresh linking code tied to the signed-in user and returns the
// wa.me deep link that pre-fills it as the outgoing message -- tapping
// Send once in WhatsApp is the entire linking step, no code to copy or
// retype. See whatsapp-webhook/index.ts for the redemption side: the code
// only ever proves anything once it arrives back over a real WhatsApp
// message, so this is still a genuine ownership check, not just a lookup.
export async function createWhatsAppLinkRequest(): Promise<{ code: string; deepLink: string } | null> {
    if (!WHATSAPP_BOT_NUMBER) return null;
    try {
        const ownerId = await getWorkspaceOwnerId();
        if (!ownerId) return null;

        const code = generateLinkCode();
        const { error } = await supabase.from('whatsapp_link_codes').insert({ code, user_id: ownerId });
        if (error) return null;

        const deepLink = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(code)}`;
        return { code, deepLink };
    } catch {
        return null;
    }
}

export interface WhatsAppLinkStatus {
    linked: boolean;
    whatsappNumber?: string;
}

export async function getWhatsAppLinkStatus(): Promise<WhatsAppLinkStatus> {
    try {
        const ownerId = await getWorkspaceOwnerId();
        if (!ownerId) return { linked: false };
        const { data } = await supabase.from('whatsapp_accounts').select('whatsapp_number').eq('user_id', ownerId).maybeSingle();
        return data ? { linked: true, whatsappNumber: data.whatsapp_number as string } : { linked: false };
    } catch {
        return { linked: false };
    }
}

export async function disconnectWhatsApp(): Promise<boolean> {
    try {
        const ownerId = await getWorkspaceOwnerId();
        if (!ownerId) return false;
        const { error } = await supabase.from('whatsapp_accounts').delete().eq('user_id', ownerId);
        return !error;
    } catch {
        return false;
    }
}

interface IncomingWhatsAppTransactionRow {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    category: string;
    description: string | null;
    raw_message: string | null;
}

// Same claim pattern as claimIncomingPayments (incomingPayments.ts) and the
// exact same reason: a transaction logged over WhatsApp lands in
// incoming_whatsapp_transactions unencrypted (the server has no field-
// encryption key), and only becomes a real, properly-encrypted transaction
// once it flows through the app's own addTransaction() -- never read
// straight into `transactions` server-side, which storage.ts's
// saveTransactions() would treat as an orphan and delete on the next
// ordinary save.
export async function claimIncomingWhatsAppTransactions(
    ownerUserId: string,
    addTransaction: (tx: Record<string, unknown>) => void,
): Promise<number> {
    const { data, error } = await supabase
        .from('incoming_whatsapp_transactions')
        .select('id, type, amount, category, description, raw_message')
        .eq('user_id', ownerUserId);
    if (error || !data || data.length === 0) return 0;

    let claimed = 0;
    for (const row of data as IncomingWhatsAppTransactionRow[]) {
        // Claim (delete the staging row) before adding, not after -- same
        // double-claim guard as claimIncomingPayments.
        await supabase.from('incoming_whatsapp_transactions').delete().eq('id', row.id);
        addTransaction({
            type: row.type,
            amount: row.amount,
            description: row.description || row.raw_message || 'Logged via WhatsApp',
            category: row.category,
            date: new Date().toISOString().split('T')[0],
        });
        claimed++;
    }
    return claimed;
}
