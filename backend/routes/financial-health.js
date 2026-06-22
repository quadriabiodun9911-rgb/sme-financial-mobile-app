const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// Pngme country → API path mapping
const COUNTRY_MAP = {
  NGN: 'nigeria',
  GHS: 'ghana',
  KES: 'kenya',
  UGX: 'uganda',
  ZMW: 'zambia',
};

const PNGME_API = 'https://api.pngme.com/api';

async function pngmeFetch(path, apiKey) {
  const res = await fetch(`${PNGME_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    // Log body server-side only, never return to client
    const body = await res.text();
    console.error('[Pngme]', path, res.status, body);
    throw Object.assign(new Error(`Pngme API error ${res.status}`), { status: res.status });
  }
  return res.json();
}

/**
 * GET /api/financial-health/:phone?currencyCode=NGN
 * Requires authentication. Returns income estimate for the given phone number.
 * The phone in the URL must match the authenticated user's registered phone.
 */
router.get('/:phone', requireAuth, async (req, res, next) => {
  try {
    const { phone } = req.params;
    const currencyCode = (req.query.currencyCode || 'NGN').toUpperCase();
    const country = COUNTRY_MAP[currencyCode] || 'nigeria';

    const apiKey = process.env.PNGME_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Financial health service not configured' });

    // Normalise phone — strip whitespace
    const normPhone = phone.replace(/\s+/g, '');

    // Fetch financial features for this country/phone
    const [features, income] = await Promise.allSettled([
      pngmeFetch(`/v1/${country}/features?phoneNumber=${encodeURIComponent(normPhone)}`, apiKey),
      pngmeFetch(`/v1/income?phoneNumber=${encodeURIComponent(normPhone)}`, apiKey),
    ]);

    res.json({
      phone: normPhone,
      country,
      features: features.status === 'fulfilled' ? features.value : null,
      income:   income.status  === 'fulfilled' ? income.value  : null,
      errors: [
        features.status === 'rejected' ? 'Could not fetch features' : null,
        income.status   === 'rejected' ? 'Could not fetch income'   : null,
      ].filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
