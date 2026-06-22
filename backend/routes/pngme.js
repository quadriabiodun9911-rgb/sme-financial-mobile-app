const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// In-memory store: Map<userId, Transaction[]>
const transactionStore = new Map();

/**
 * Expose store so other routes can read from it.
 */
function getTransactionsForUser(userId) {
  return transactionStore.get(userId) || [];
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
router.post('/webhook', (req, res) => {
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

    if (!transactionStore.has(userId)) {
      transactionStore.set(userId, []);
    }
    transactionStore.get(userId).push(transaction);

    console.log(`Stored transaction ${transaction.id} for user ${userId}`);
    return res.json({ received: true, transactionId: transaction.id });
  }

  // Acknowledge unhandled events without error
  res.json({ received: true, event, handled: false });
});

module.exports = router;
module.exports.getTransactionsForUser = getTransactionsForUser;
