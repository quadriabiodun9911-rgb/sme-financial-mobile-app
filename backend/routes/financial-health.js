const express = require('express');
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
    const body = await res.text();
    throw Object.assign(new Error(`Pngme API error ${res.status}`), { status: res.status, body });
  }
  return res.json();
}

/**
 * GET /api/financial-health/:phone?currencyCode=NGN
 * Returns income estimate + financial features for the given phone number.
 */
router.get('/:phone', async (req, res, next) => {
  try {
    const { phone } = req.params;
    const currencyCode = (req.query.currencyCode || 'NGN').toUpperCase();
    const country = COUNTRY_MAP[currencyCode] || 'nigeria';

    const apiKey = process.env.PNGME_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'PNGME_API_KEY not configured' });

    // Normalise phone — strip leading 0, ensure country code present
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
        features.status === 'rejected' ? features.reason.message : null,
        income.status   === 'rejected' ? income.reason.message   : null,
      ].filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
