const express = require('express');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const router  = express.Router();

function getSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

// POST /api/payments/paystack/webhook
// Registered in Paystack dashboard → Settings → Webhooks
router.post('/paystack/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
        console.error('[SECURITY] PAYSTACK_SECRET_KEY not set — rejecting webhook');
        return res.status(503).json({ error: 'Not configured' });
    }

    // Verify HMAC-SHA512 signature
    const signature = req.headers['x-paystack-signature'];
    const expected  = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
    if (!signature || signature !== expected) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString('utf8'));
    console.log('[Paystack webhook]', event.event, event.data?.reference);

    // Handle successful payment
    if (event.event === 'charge.success') {
        const data = event.data;
        const reference = data?.reference;
        const amountPaid = (data?.amount || 0) / 100; // kobo → naira
        const email      = data?.customer?.email;
        const currency   = data?.currency;
        const paidAt     = data?.paid_at;

        const supabase = getSupabase();
        if (supabase && reference) {
            // Record the payment in the payments table
            const { error: insertError } = await supabase
                .from('payments')
                .upsert({
                    reference,
                    amount:    amountPaid,
                    currency,
                    status:    'paid',
                    email,
                    paid_at:   paidAt,
                    provider:  'paystack',
                    raw_event: event,
                }, { onConflict: 'reference' });

            if (insertError) {
                console.error('[Paystack webhook] Failed to save payment:', insertError.message);
            } else {
                console.log(`[Paystack webhook] Payment ${reference} (${currency} ${amountPaid}) recorded.`);
            }
        }
    }

    // Always acknowledge quickly so Paystack doesn't retry
    res.json({ received: true });
});

// Verify a Paystack transaction reference
// POST /api/payments/paystack/verify
router.post('/paystack/verify', async (req, res) => {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return res.status(503).json({ error: 'Paystack not configured on server' });

    try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secretKey}` },
        });
        const data = await response.json();

        if (!data.status || data.data?.status !== 'success') {
            return res.status(402).json({ verified: false, message: data.message || 'Payment not successful' });
        }

        res.json({
            verified:   true,
            reference:  data.data.reference,
            amount:     data.data.amount / 100, // kobo → naira
            currency:   data.data.currency,
            email:      data.data.customer?.email,
            paidAt:     data.data.paid_at,
        });
    } catch (err) {
        console.error('[Paystack verify]', err);
        res.status(502).json({ error: 'Failed to contact Paystack' });
    }
});

// Verify a Korapay transaction reference
// POST /api/payments/korapay/verify
router.post('/korapay/verify', async (req, res) => {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const secretKey = process.env.KORAPAY_SECRET_KEY;
    if (!secretKey) return res.status(503).json({ error: 'Korapay not configured on server' });

    try {
        const response = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secretKey}` },
        });
        const data = await response.json();

        if (!data.status || data.data?.status !== 'success') {
            return res.status(402).json({ verified: false, message: data.message || 'Payment not successful' });
        }

        res.json({
            verified:  true,
            reference: data.data.reference,
            amount:    data.data.amount,
            currency:  data.data.currency,
            email:     data.data.customer?.email,
            paidAt:    data.data.paid_at,
        });
    } catch (err) {
        console.error('[Korapay verify]', err);
        res.status(502).json({ error: 'Failed to contact Korapay' });
    }
});

// /paystack/initialize and /korapay/initialize used to live here. They now
// live in supabase/functions/payment-init -- the only two endpoints this
// Express app actually served that the client called, and this app was
// never deployed anywhere in practice (see that function's header for the
// full story). Removed instead of left duplicated so there's one source
// of truth for the initialize logic.

module.exports = router;
