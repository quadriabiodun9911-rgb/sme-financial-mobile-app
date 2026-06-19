const BankProvider = require('./base');

const API_BASE = 'https://api.okraapi.com/v2';

// userId → { recordId, accountId }
const accountStore = new Map();

class OkraProvider extends BankProvider {
    constructor() {
        super({ secretKey: process.env.OKRA_SECRET_KEY });
    }

    _headers() {
        return {
            'Authorization': `Bearer ${process.env.OKRA_SECRET_KEY || ''}`,
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
            const err = new Error(`Okra API error ${res.status}: ${text}`);
            err.provider = 'okra';
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    /**
     * Initiate bank connection — returns a widget URL the user opens in browser.
     * Okra widget is configured with the app's okraKey and a callback URL.
     */
    async connectUser(userId, options = {}) {
        const okraKey = process.env.OKRA_KEY;
        const secretKey = process.env.OKRA_SECRET_KEY;

        if (!secretKey) throw Object.assign(
            new Error('OKRA_SECRET_KEY not configured'),
            { provider: 'okra', status: 500 }
        );
        if (!okraKey) throw Object.assign(
            new Error('OKRA_KEY not configured'),
            { provider: 'okra', status: 500 }
        );

        const isSandbox = process.env.OKRA_SANDBOX !== 'false';
        const env = isSandbox ? 'sandbox-beta' : 'production-sandbox';

        // Build widget URL using Okra's short-url approach
        const params = new URLSearchParams({
            key:          okraKey,
            token:        secretKey,
            products:     'auth,balance,transactions',
            env,
            currency:     'NGN',
            color:        '0066FF',
            limit:        '24',
            callback_url: options.redirectUrl || 'https://quad360.app/okra/callback',
            meta:         JSON.stringify({ userId }),
        });

        const widgetUrl = `https://okra.ng/widget?${params}`;

        return {
            provider:     'okra',
            okraWidgetUrl: widgetUrl,
            message:      'Open okraWidgetUrl in browser. After user connects, call /exchange with the returned record_id.',
        };
    }

    /**
     * Exchange the record_id returned by Okra widget callback for stored account data.
     * Called from POST /api/bank-data/exchange?provider=okra
     */
    async exchangeCode(userId, recordId) {
        // Fetch the record to get accountId
        const data = await this._fetch('/products/auths/getById', 'POST', { id: recordId });
        const record = data.data || data;
        const accountId = record.account?._id || record.account?.id || record._id;

        if (!accountId) throw Object.assign(
            new Error('Okra exchange: no accountId in response'),
            { provider: 'okra', status: 502 }
        );

        accountStore.set(userId, { recordId, accountId });
        return { provider: 'okra', recordId, accountId };
    }

    async getAccounts(userId, options = {}) {
        const stored = accountStore.get(userId) || { accountId: options.accountId };
        if (!stored.accountId) throw Object.assign(
            new Error('Okra: no accountId for this user. Complete connectUser first.'),
            { provider: 'okra', status: 404 }
        );

        const data = await this._fetch('/accounts/getById', 'POST', { id: stored.accountId });
        const account = data.data || data;
        return [{ ...account, provider: 'okra' }];
    }

    async getTransactions(userId, options = {}) {
        const stored = accountStore.get(userId) || { accountId: options.accountId };
        if (!stored.accountId) throw Object.assign(
            new Error('Okra: no accountId for this user. Complete connectUser first.'),
            { provider: 'okra', status: 404 }
        );

        const body = {
            account: stored.accountId,
            page:    0,
            limit:   200,
        };
        if (options.since) body.from = options.since.slice(0, 10); // YYYY-MM-DD

        const data = await this._fetch('/transactions/getByAccount', 'POST', body);
        const records = data.data?.transaction || data.data || data.transactions || [];
        return records.map(r => this.normalizeTransaction(r));
    }

    async getBalance(userId, options = {}) {
        const stored = accountStore.get(userId) || { accountId: options.accountId };
        if (!stored.accountId) throw Object.assign(
            new Error('Okra: no accountId for this user. Complete connectUser first.'),
            { provider: 'okra', status: 404 }
        );

        const data = await this._fetch('/balance/getByAccount', 'POST', { account: stored.accountId });
        const balance = data.data || data;
        return {
            provider:  'okra',
            accountId: stored.accountId,
            balance:   balance.available_balance ?? balance.ledger_balance ?? null,
            currency:  balance.currency || 'NGN',
        };
    }

    normalizeTransaction(raw) {
        const amount = Math.abs(Number(raw.amount || 0));
        return {
            id:             raw._id || raw.id || null,
            date:           raw.date ? new Date(raw.date).toISOString() : null,
            description:    raw.notes || raw.narration || raw.desc || '',
            type:           raw.credit_debit === 'credit' ? 'income' : 'expense',
            category:       raw.category || 'uncategorized',
            amount,
            currency:       raw.currency || 'NGN',
            reference:      raw.reference || null,
            vendorCustomer: raw.merchant || null,
            provider:       'okra',
            raw,
        };
    }
}

module.exports = new OkraProvider();
