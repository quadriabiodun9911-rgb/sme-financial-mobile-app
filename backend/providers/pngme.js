const BankProvider = require('./base');

const API_BASE = 'https://api.pngme.com/api';

const CURRENCY_COUNTRY_MAP = {
  NGN: 'nigeria',
  GHS: 'ghana',
  KES: 'kenya',
  UGX: 'uganda',
  ZMW: 'zambia',
  TZS: 'tanzania',
};

class PngmeProvider extends BankProvider {
  constructor() {
    super({ apiKey: process.env.PNGME_API_KEY });
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async _fetch(url) {
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Pngme API error: ${res.status} ${text}`);
      err.provider = 'pngme';
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async getAccounts(userId, options = {}) {
    // Pngme is SMS-based; accounts are derived from phone number
    return [{ provider: 'pngme', userId, note: 'Accounts derived from SMS data via phone number' }];
  }

  async getTransactions(userId, options = {}) {
    const { since, currencyCode } = options;
    const country = CURRENCY_COUNTRY_MAP[currencyCode];
    if (!country) {
      const err = new Error(`Pngme: unsupported currencyCode ${currencyCode}`);
      err.provider = 'pngme';
      err.status = 400;
      throw err;
    }

    const params = new URLSearchParams({ phoneNumber: userId });
    if (since) params.set('startDate', since);

    const [featuresData, incomeData] = await Promise.allSettled([
      this._fetch(`${API_BASE}/v1/${country}/features?${params}`),
      this._fetch(`${API_BASE}/v1/income?${params}`),
    ]);

    const transactions = [];

    if (featuresData.status === 'fulfilled') {
      const records = Array.isArray(featuresData.value) ? featuresData.value : (featuresData.value.data || []);
      records.forEach(r => transactions.push(this.normalizeTransaction({ ...r, _currency: currencyCode })));
    }

    if (incomeData.status === 'fulfilled') {
      const records = Array.isArray(incomeData.value) ? incomeData.value : (incomeData.value.data || []);
      records.forEach(r => transactions.push(this.normalizeTransaction({ ...r, _currency: currencyCode, _direction: 'credit' })));
    }

    return transactions;
  }

  async getBalance(userId, options = {}) {
    // Pngme does not expose a dedicated balance endpoint; return null
    return { provider: 'pngme', userId, balance: null, note: 'Balance not available via Pngme API' };
  }

  async connectUser(userId, options = {}) {
    // Pngme SMS collection is device-side via SDK
    return {
      provider: 'pngme',
      message: 'Use SDK on device',
      userId,
    };
  }

  normalizeTransaction(raw) {
    const direction = raw.direction || raw._direction || 'debit';
    const type = direction === 'credit' ? 'income' : 'expense';

    return {
      id: raw.id || raw.transactionId || null,
      date: raw.utcTimestamp ? new Date(raw.utcTimestamp).toISOString() : (raw.date || null),
      description: raw.description || raw.narration || raw.label || '',
      type,
      category: raw.label || raw.category || null,
      amount: Math.abs(Number(raw.amount || 0)),
      currency: raw._currency || raw.currency || null,
      reference: raw.reference || null,
      vendorCustomer: raw.merchant || raw.counterparty || null,
      provider: 'pngme',
      raw,
    };
  }
}

module.exports = PngmeProvider;
