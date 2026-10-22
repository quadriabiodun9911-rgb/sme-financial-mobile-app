const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Same getSupabase() pattern as payments.js -- a service-role client, since
// this route (and transactions.js, which reads it back) runs entirely
// server-side with no Supabase session of its own to attach.
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Transactions used to live only in an in-memory Map -- correct while this
// process stayed up, but wiped on every restart/redeploy with no way to
// recover a business's data afterward. Now persisted to the
// pngme_transactions table (migration 048) instead.
/**
 * Fetch a user's Pngme-sourced transactions, mapped to the Quad360
 * Transaction shape, newest first filtered to oldest first for the caller.
 */
async function getTransactionsForUser(userId) {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[pngme] SUPABASE_URL/SUPABASE_SERVICE_KEY not configured — cannot read transactions.');
    return [];
  }

  const { data, error } = await supabase
    .from('pngme_transactions')
    .select('pngme_transaction_id, date, description, type, category, amount, reference, vendor_customer')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('[pngme] Failed to load transactions:', error.message);
    return [];
  }

  return data.map(row => ({
    id: row.pngme_transaction_id,
    date: row.date,
    description: row.description || '',
    type: row.type,
    category: row.category || 'uncategorized',
    amount: Number(row.amount),
    reference: row.reference || '',
    vendorCustomer: row.vendor_customer || '',
  }));
}

/**
 * Map a Pngme transaction event payload to the Quad360 Transaction shape.
 * Pngme event structure:
 * {
 *   event: 'transaction.created',
 *   data: {
 *     userId, institutionId, amount, direction: 'credit'|'debit',
 *     description, label, transactionId, utcTimestamp
 *   }
 * }
 */
function mapToQuad360Transaction(data) {
  return {
    id: data.transactionId || uuidv4(),
    date: data.utcTimestamp ? new Date(data.utcTimestamp).toISOString() : new Date().toISOString(),
    description: data.description || '',
    type: data.direction === 'credit' ? 'income' : 'expense',
    category: data.label || 'uncategorized',
    amount: Math.abs(Number(data.amount)),
    reference: data.transactionId || '',
    vendorCustomer: data.description || '',
  };
}

/**
 * Verify Pngme webhook HMAC SHA256 signature.
 * Header: x-pngme-signature
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.PNGME_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[SECURITY] PNGME_WEBHOOK_SECRET not configured — rejecting webhook. Set this env var on Render.');
    return false;
  }
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Pngme may prefix with "sha256="
  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(provided, 'hex')
  );
}

// POST /pngme/webhook
router.post('/webhook', async (req, res) => {
  const rawBody = req.body; // express.raw middleware gives us a Buffer
  const signature = req.headers['x-pngme-signature'];

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const { event, data } = payload;

  if (event === 'transaction.created' && data) {
    const { userId } = data;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId in event data' });
    }

    const transaction = mapToQuad360Transaction(data);

    const supabase = getSupabase();
    if (!supabase) {
      console.error('[pngme] SUPABASE_URL/SUPABASE_SERVICE_KEY not configured — cannot persist webhook.');
      // A real 5xx (not a silent 200) so Pngme's own retry policy kicks in
      // instead of this event being acknowledged and lost.
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const { error: insertError } = await supabase
      .from('pngme_transactions')
      .upsert({
        user_id: userId,
        pngme_transaction_id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        type: transaction.type,
        category: transaction.category,
        amount: transaction.amount,
        reference: transaction.reference,
        vendor_customer: transaction.vendorCustomer,
        raw_event: payload,
      }, { onConflict: 'user_id,pngme_transaction_id' });

    if (insertError) {
      console.error('[pngme] Failed to persist transaction:', insertError.message);
      return res.status(500).json({ error: 'Failed to store transaction' });
    }

    console.log(`Stored transaction ${transaction.id} for user ${userId}`);
    return res.json({ received: true, transactionId: transaction.id });
  }

  // Acknowledge unhandled events without error
  res.json({ received: true, event, handled: false });
});

module.exports = router;
module.exports.getTransactionsForUser = getTransactionsForUser;
