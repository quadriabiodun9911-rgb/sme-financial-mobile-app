const BankProvider = require('./base');

const API_BASE = 'https://api.withmono.com';

// In-memory store: userId -> accountId
// Production: replace with Redis or DB
const accountStore = new Map();

class MonoProvider extends BankProvider {
  constructor() {
    super({ secretKey: process.env.MONO_SECRET_KEY });
  }

  _headers() {
    return {
      'mono-sec-key': this.config.secretKey,
      'Content-Type': 'application/json',
    };
  }

  async _fetch(path, method = 'GET', body = null) {
    const opts = { method, headers: this._headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Mono API error: ${res.status} ${text}`);
      err.provider = 'mono';
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async connectUser(userId, options = {}) {
    const { code } = options;
    if (!code) {
      const err = new Error('Mono connectUser requires a code from the Mono Connect widget');
      err.provider = 'mono';
      err.status = 400;
      throw err;
    }
    const data = await this._fetch('/account/auth', 'POST', { code });
    const accountId = data.id || data.account_id || data.accountId;
    accountStore.set(userId, accountId);
    return { accountId, provider: 'mono' };
  }

  async getAccounts(userId, options = {}) {
    const accountId = accountStore.get(userId) || options.accountId;
    if (!accountId) {
      const err = new Error('Mono: no accountId found for userId. Call connectUser first.');
      err.provider = 'mono';
      err.status = 404;
      throw err;
    }
    const data = await this._fetch(`/accounts/${accountId}`);
    return [{ ...data, provider: 'mono' }];
  }

  async getTransactions(userId, options = {}) {
    const accountId = accountStore.get(userId) || options.accountId;
    if (!accountId) {
      const err = new Error('Mono: no accountId found for userId. Call connectUser first.');
      err.provider = 'mono';
      err.status = 404;
      throw err;
    }

    const params = new URLSearchParams({ narration: 'true' });
    if (options.since) params.set('start', options.since);
    if (options.paginate) {
      params.set('page', options.paginate.page || 1);
    }

    const data = await this._fetch(`/accounts/${accountId}/transactions?${params}`);
    const records = Array.isArray(data) ? data : (data.data || data.transactions || []);
    return records.map(r => this.normalizeTransaction(r));
  }

  async getBalance(userId, options = {}) {
    const accountId = accountStore.get(userId) || options.accountId;
    if (!accountId) {
      const err = new Error('Mono: no accountId found for userId. Call connectUser first.');
      err.provider = 'mono';
      err.status = 404;
      throw err;
    }
    const data = await this._fetch(`/accounts/${accountId}`);
    return {
      provider: 'mono',
      accountId,
      balance: data.balance != null ? data.balance / 100 : null, // kobo to NGN
      currency: data.currency || 'NGN',
      raw: data,
    };
  }

  normalizeTransaction(raw) {
    const type = raw.type === 'debit' ? 'expense' : 'income';
    // Mono amounts are in kobo
    const amount = Math.abs(Number(raw.amount || 0)) / 100;

    return {
      id: raw._id || raw.id || null,
      date: raw.date ? new Date(raw.date).toISOString() : null,
      description: raw.narration || raw.description || '',
      type,
      category: raw.category || raw.type || null,
      amount,
      currency: raw.currency || 'NGN',
      reference: raw.reference || null,
      vendorCustomer: raw.merchant || null,
      provider: 'mono',
      raw,
    };
  }
}

module.exports = MonoProvider;
