const express = require('express');
const router  = express.Router();

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

        if (!data.status) return res.status(400).json({ error: data.message || 'Initialization failed' });

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
