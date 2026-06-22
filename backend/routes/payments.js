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

// Initialise a Paystack transaction (returns authorization_url)
// POST /api/payments/paystack/initialize
router.post('/paystack/initialize', async (req, res) => {
    // Use authenticated user's email from middleware; fall back to body email for
    // customer-facing payments where the payer email differs from the business owner
    const { amount, currency = 'NGN', email: bodyEmail, name, description } = req.body;
    const email = bodyEmail || req.userEmail;
    if (!amount || !email) return res.status(400).json({ error: 'amount and email are required' });
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 10_000_000) {
        return res.status(400).json({ error: 'amount must be a positive number not exceeding 10,000,000' });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return res.status(503).json({ error: 'Paystack not configured on server' });

    // Paystack requires amount in subunit (kobo for NGN, pesewas for GHS, etc.)
    const amountInSubunit = Math.round(amountNum * 100);

    const payload = {
        amount:   amountInSubunit,
        currency: currency.toUpperCase(),
        email,
        metadata: { name: name || '', description: description || '' },
    };
    // Only include callback_url if FRONTEND_URL is configured
    if (process.env.FRONTEND_URL) payload.callback_url = process.env.FRONTEND_URL + '/';

    try {
        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method:  'POST',
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        console.log('[Paystack initialize] status=%s message=%s', data.status, data.message);

        if (!data.status) return res.status(400).json({ error: data.message || 'Paystack initialization failed' });

        res.json({
            authorization_url: data.data.authorization_url,
            access_code:       data.data.access_code,
            reference:         data.data.reference,
        });
    } catch (err) {
        console.error('[Paystack initialize]', err);
        res.status(502).json({ error: 'Failed to contact Paystack' });
    }
});

// Initialise a Korapay checkout (returns checkout_url)
// POST /api/payments/korapay/initialize
router.post('/korapay/initialize', async (req, res) => {
    const { amount, currency = 'NGN', email, name, reference, narration } = req.body;
    if (!amount || !email) return res.status(400).json({ error: 'amount and email are required' });

    const secretKey = process.env.KORAPAY_SECRET_KEY;
    if (!secretKey) return res.status(503).json({ error: 'Korapay not configured on server' });

    try {
        const response = await fetch('https://api.korapay.com/merchant/api/v1/charges/initialize', {
            method:  'POST',
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount,
                currency,
                reference: reference || `QD360-${Date.now()}`,
                narration:  narration || 'Payment to business',
                customer: { email, name: name || '' },
                notification_url: `${process.env.BACKEND_URL || ''}/api/payments/korapay/webhook`,
            }),
        });
        const data = await response.json();

        console.log('[Korapay initialize] status=%s checkout_url=%s message=%s', data.status, data.data?.checkout_url, data.message);

        if (!data.status) return res.status(400).json({ error: data.message || 'Initialization failed' });
        if (!data.data?.checkout_url) return res.status(502).json({ error: 'Korapay did not return a checkout URL. Make sure your Korapay account is active and the secret key is correct.' });

        res.json({
            checkoutUrl: data.data.checkout_url,
            reference:   data.data.reference,
        });
    } catch (err) {
        console.error('[Korapay initialize]', err);
        res.status(502).json({ error: 'Failed to contact Korapay' });
    }
});

module.exports = router;
