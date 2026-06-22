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
 * Body: { currencyCode, ...options }
 * userId is taken from the authenticated session (req.userId), never from body.
 */
router.post('/connect', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { currencyCode, ...options } = req.body || {};

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
 * GET /api/bank-data/accounts?currencyCode=NGN
 * userId from authenticated session only.
 */
router.get('/accounts', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
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
 * GET /api/bank-data/transactions?currencyCode=NGN&since=ISO
 * userId from authenticated session only.
 */
router.get('/transactions', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
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
 * GET /api/bank-data/balance?currencyCode=NGN
 * userId from authenticated session only.
 */
router.get('/balance', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
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
 * POST /api/bank-data/plaid-exchange
 * Exchange a Plaid public_token (from Link SDK onSuccess) for a persistent access_token.
 * Body: { userId, publicToken }
 */
router.post('/plaid-exchange', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { publicToken } = req.body || {};
  if (!publicToken) return res.status(400).json({ error: 'publicToken is required' });

  try {
    const provider = getProvider('USD'); // Plaid handles USD/GBP/EUR/NGN etc.
    if (typeof provider.exchangeToken !== 'function') {
      return res.status(400).json({ error: 'This provider does not support token exchange' });
    }
    await provider.exchangeToken(userId, publicToken);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/bank-data/exchange
 * Mono-specific: exchange the code returned by Mono Connect widget for an accountId.
 * Body: { userId, code }
 * Called after the user completes the Mono Connect widget flow.
 */
router.post('/exchange', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code is required' });

  try {
    const provider = getProvider('NGN'); // Mono handles NGN/GHS
    if (typeof provider.exchangeCode !== 'function') {
      return res.status(400).json({ error: 'This provider does not support token exchange' });
    }
    const result = await provider.exchangeCode(userId, code);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, provider: err.provider || 'mono' });
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
