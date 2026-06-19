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
      'mono-sec-key': process.env.MONO_SECRET_KEY || '',
      'Content-Type': 'application/json',
      'accept': 'application/json',
    };
  }

  async _fetch(path, method = 'GET', body = null) {
    const opts = { method, headers: this._headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Mono API error ${res.status}: ${text}`);
      err.provider = 'mono';
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * Step 1: Initiate account linking — returns a mono_url the user opens
   * in a browser/WebView to connect their bank via Mono Connect widget.
   * Docs: POST /v2/accounts/initiate
   */
  async connectUser(userId, options = {}) {
    const { name = 'Business Owner', email = userId, redirectUrl = 'https://quad360.app/mono/callback' } = options;

    const apiKey = process.env.MONO_SECRET_KEY;
    if (!apiKey) throw Object.assign(new Error('MONO_SECRET_KEY not configured'), { provider: 'mono', status: 500 });

    const data = await this._fetch('/v2/accounts/initiate', 'POST', {
      customer: { name, email },
      meta:     { ref: `quad360_${userId}_${Date.now()}` },
      scope:    'auth',
      redirect_url: redirectUrl,
    });

    // mono_url is the Connect widget URL the user must open
    return {
      provider:    'mono',
      monoConnectUrl: data.mono_url || data.url,
      sessionId:   data.id || null,
      message:     'Open monoConnectUrl in a browser. After user connects, call /exchange with the returned code.',
    };
  }

  /**
   * Step 2: Exchange the code returned by Mono Connect widget for an accountId.
   * Docs: POST /v2/accounts/auth
   */
  async exchangeCode(userId, code) {
    const data = await this._fetch('/v2/accounts/auth', 'POST', { code });
    const accountId = data.id || data.account?.id;
    if (!accountId) throw Object.assign(new Error('Mono exchange: no accountId in response'), { provider: 'mono', status: 502 });
    accountStore.set(userId, accountId);
    return { provider: 'mono', accountId };
  }

  async getAccounts(userId, options = {}) {
    const accountId = accountStore.get(userId) || options.accountId;
    if (!accountId) throw Object.assign(
      new Error('Mono: no accountId for this user. Complete connectUser + exchangeCode first.'),
      { provider: 'mono', status: 404 }
    );
    const data = await this._fetch(`/v2/accounts/${accountId}`);
    return [{ ...data, provider: 'mono' }];
  }

  async getTransactions(userId, options = {}) {
    const accountId = accountStore.get(userId) || options.accountId;
    if (!accountId) throw Object.assign(
      new Error('Mono: no accountId for this user. Complete connectUser + exchangeCode first.'),
      { provider: 'mono', status: 404 }
    );

    const params = new URLSearchParams({ narration: 'true', paginate: 'false' });
    if (options.since) params.set('start', options.since.slice(0, 10)); // YYYY-MM-DD

    const data = await this._fetch(`/v2/accounts/${accountId}/transactions?${params}`);
    const records = Array.isArray(data) ? data : (data.data || data.transactions || []);
    return records.map(r => this.normalizeTransaction(r));
  }

  async getBalance(userId, options = {}) {
    const accountId = accountStore.get(userId) || options.accountId;
    if (!accountId) throw Object.assign(
      new Error('Mono: no accountId for this user. Complete connectUser + exchangeCode first.'),
      { provider: 'mono', status: 404 }
    );
    const data = await this._fetch(`/v2/accounts/${accountId}`);
    return {
      provider:  'mono',
      accountId,
      balance:   data.balance != null ? data.balance / 100 : null, // kobo → NGN
      currency:  data.currency || 'NGN',
    };
  }

  normalizeTransaction(raw) {
    return {
      id:            raw._id || raw.id || null,
      date:          raw.date ? new Date(raw.date).toISOString() : null,
      description:   raw.narration || raw.description || '',
      type:          raw.type === 'debit' ? 'expense' : 'income',
      category:      raw.category || raw.type || 'uncategorized',
      amount:        Math.abs(Number(raw.amount || 0)) / 100, // kobo → NGN
      currency:      raw.currency || 'NGN',
      reference:     raw.reference || null,
      vendorCustomer: raw.merchant || null,
      provider:      'mono',
      raw,
    };
  }
}

module.exports = new MonoProvider();
