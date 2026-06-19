const express = require('express');
const router = express.Router();
const { getProvider, getProviderList, getProviderName } = require('../providers');

const SUPPORTED_CURRENCIES = new Set([
    'NGN','GHS','KES','UGX','TZS','RWF','ZMW','ETB','MWK',
    'EGP','SAR','AED','BHD','KWD','JOD','QAR',
    'USD','GBP','EUR','CAD','AUD','CHF',
]);

function validateCurrency(currencyCode, res) {
  if (!currencyCode) {
    res.status(400).json({ error: 'currencyCode is required' });
    return false;
  }
  if (!SUPPORTED_CURRENCIES.has(currencyCode.toUpperCase())) {
    res.status(400).json({
      error: `Unsupported currencyCode: ${currencyCode}`,
      supported: [...SUPPORTED_CURRENCIES],
    });
    return false;
  }
  return true;
}

/**
 * POST /api/bank-data/connect
 * Body: { userId, currencyCode, ...options }
 */
router.post('/connect', async (req, res) => {
  const { userId, currencyCode, ...options } = req.body || {};

  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!validateCurrency(currencyCode, res)) return;

  try {
    const provider = getProvider(currencyCode.toUpperCase());
    const result = await provider.connectUser(userId, options);
    res.json({ success: true, provider: getProviderName(currencyCode.toUpperCase()), ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      provider: err.provider || 'unknown',
    });
  }
});

/**
 * GET /api/bank-data/accounts/:userId?currencyCode=NGN
 */
router.get('/accounts/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currencyCode, ...options } = req.query;

  if (!validateCurrency(currencyCode, res)) return;

  try {
    const provider = getProvider(currencyCode.toUpperCase());
    const accounts = await provider.getAccounts(userId, options);
    res.json({ success: true, provider: getProviderName(currencyCode.toUpperCase()), accounts });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      provider: err.provider || 'unknown',
    });
  }
});

/**
 * GET /api/bank-data/transactions/:userId?currencyCode=NGN&since=ISO
 */
router.get('/transactions/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currencyCode, since, ...options } = req.query;

  if (!validateCurrency(currencyCode, res)) return;

  try {
    const provider = getProvider(currencyCode.toUpperCase());
    const transactions = await provider.getTransactions(userId, {
      ...options,
      since,
      currencyCode: currencyCode.toUpperCase(),
    });
    res.json({
      success: true,
      provider: getProviderName(currencyCode.toUpperCase()),
      count: transactions.length,
      transactions,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      provider: err.provider || 'unknown',
    });
  }
});

/**
 * GET /api/bank-data/balance/:userId?currencyCode=NGN
 */
router.get('/balance/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currencyCode, ...options } = req.query;

  if (!validateCurrency(currencyCode, res)) return;

  try {
    const provider = getProvider(currencyCode.toUpperCase());
    const balance = await provider.getBalance(userId, options);
    res.json({ success: true, provider: getProviderName(currencyCode.toUpperCase()), balance });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      provider: err.provider || 'unknown',
    });
  }
});

/**
 * GET /api/bank-data/providers
 * Returns all supported currencies and their mapped providers.
 */
router.get('/providers', (req, res) => {
  res.json({ success: true, providers: getProviderList() });
});

module.exports = router;
