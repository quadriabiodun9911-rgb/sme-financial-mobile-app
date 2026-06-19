const BankProvider = require('./base');

const SANDBOX_BASE = 'https://sandbox.leantech.me';
const PROD_BASE = 'https://api.leantech.me';

class LeanProvider extends BankProvider {
  constructor() {
    super({ appToken: process.env.LEAN_APP_TOKEN });
    this.baseUrl = process.env.LEAN_SANDBOX === 'true' ? SANDBOX_BASE : PROD_BASE;
  }

  _headers() {
    return {
      'lean-app-token': this.config.appToken,
      'Content-Type': 'application/json',
    };
  }

  async _fetch(path, method = 'GET', body = null) {
    const opts = { method, headers: this._headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Lean API error: ${res.status} ${text}`);
      err.provider = 'lean';
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async connectUser(userId, options = {}) {
    const data = await this._fetch('/customers/v1', 'POST', { app_user_id: userId });
    const customerId = data.customer_id || data.id;
    return { customer_id: customerId, provider: 'lean' };
  }

  async getAccounts(userId, options = {}) {
    const { customerId } = options;
    if (!customerId) {
      const err = new Error('Lean: customerId is required in options');
      err.provider = 'lean';
      err.status = 400;
      throw err;
    }
    const data = await this._fetch(`/accounts/v1?customer_id=${customerId}`);
    const accounts = Array.isArray(data) ? data : (data.data || data.accounts || []);
    return accounts.map(a => ({ ...a, provider: 'lean' }));
  }

  async getTransactions(userId, options = {}) {
    const { accountId, since } = options;
    if (!accountId) {
      const err = new Error('Lean: accountId is required in options');
      err.provider = 'lean';
      err.status = 400;
      throw err;
    }

    const params = new URLSearchParams({ account_id: accountId });
    if (since) params.set('start_date', since);

    const data = await this._fetch(`/transactions/v1?${params}`);
    const records = Array.isArray(data) ? data : (data.data || data.transactions || []);
    return records.map(r => this.normalizeTransaction(r));
  }

  async getBalance(userId, options = {}) {
    const { accountId } = options;
    if (!accountId) {
      const err = new Error('Lean: accountId is required in options');
      err.provider = 'lean';
      err.status = 400;
      throw err;
    }
    const data = await this._fetch(`/balance/v1?account_id=${accountId}`);
    return { provider: 'lean', accountId, ...data };
  }

  normalizeTransaction(raw) {
    const txType = (raw.transaction_type || '').toUpperCase();
    const type = txType === 'CREDIT' ? 'income' : 'expense';

    const amountObj = raw.amount || {};
    const amount = Math.abs(Number(amountObj.amount != null ? amountObj.amount : (raw.amount || 0)));
    const currency = amountObj.currency || raw.currency || null;

    return {
      id: raw.transaction_id || raw.id || null,
      date: raw.transaction_date ? new Date(raw.transaction_date).toISOString() : null,
      description: raw.description || '',
      type,
      category: raw.category || null,
      amount,
      currency,
      reference: raw.reference || null,
      vendorCustomer: raw.merchant_name || null,
      provider: 'lean',
      raw,
    };
  }
}

module.exports = LeanProvider;
