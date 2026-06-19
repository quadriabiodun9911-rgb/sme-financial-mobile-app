const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const BankProvider = require('./base');

const tokenStore = new Map(); // userId → { accessToken, itemId }

class PlaidProvider extends BankProvider {
    constructor() {
        super({});
        const env = process.env.PLAID_ENV === 'production'
            ? PlaidEnvironments.production
            : PlaidEnvironments.sandbox;

        this.client = new PlaidApi(new Configuration({
            basePath: env,
            baseOptions: {
                headers: {
                    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
                    'PLAID-SECRET':    process.env.PLAID_SECRET    || '',
                },
            },
        }));
    }

    async connectUser(userId, { businessName = 'Quad360' } = {}) {
        const res = await this.client.linkTokenCreate({
            user:          { client_user_id: userId },
            client_name:   businessName,
            products:      ['transactions'],
            country_codes: ['US', 'GB', 'CA', 'FR', 'DE', 'ES', 'NL'],
            language:      'en',
        });
        return { provider: 'plaid', linkToken: res.data.link_token };
    }

    async exchangeToken(userId, publicToken) {
        const res = await this.client.itemPublicTokenExchange({ public_token: publicToken });
        const { access_token, item_id } = res.data;
        tokenStore.set(userId, { accessToken: access_token, itemId: item_id });
        return { accessToken: access_token, itemId: item_id };
    }

    async getAccounts(userId) {
        const stored = tokenStore.get(userId);
        if (!stored) throw Object.assign(new Error('User not connected to Plaid'), { status: 404 });
        const res = await this.client.accountsGet({ access_token: stored.accessToken });
        return res.data.accounts;
    }

    async getTransactions(userId) {
        const stored = tokenStore.get(userId);
        if (!stored) throw Object.assign(new Error('User not connected to Plaid'), { status: 404 });
        const res = await this.client.transactionsSync({ access_token: stored.accessToken });
        return (res.data.added || []).map(t => this.normalizeTransaction(t));
    }

    async getBalance(userId) {
        const stored = tokenStore.get(userId);
        if (!stored) throw Object.assign(new Error('User not connected to Plaid'), { status: 404 });
        const res = await this.client.accountsBalanceGet({ access_token: stored.accessToken });
        const acct = res.data.accounts[0];
        return { balance: acct?.balances?.current, currency: acct?.balances?.iso_currency_code };
    }

    normalizeTransaction(raw) {
        // Plaid: positive amount = money out (expense), negative = money in (income)
        return {
            id:            raw.transaction_id,
            date:          new Date(raw.date).toISOString(),
            description:   raw.name || raw.merchant_name || '',
            type:          raw.amount > 0 ? 'expense' : 'income',
            category:      raw.category?.[0] || 'uncategorized',
            amount:        Math.abs(raw.amount),
            currency:      raw.iso_currency_code || 'USD',
            reference:     raw.transaction_id,
            vendorCustomer: raw.merchant_name || raw.name || '',
            provider:      'plaid',
            raw,
        };
    }
}

module.exports = new PlaidProvider();
