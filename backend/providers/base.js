class BankProvider {
  constructor(config) {
    this.config = config;
  }

  async getAccounts(userId, options) {
    throw new Error('Not implemented');
  }

  async getTransactions(userId, options) {
    throw new Error('Not implemented');
  }

  async getBalance(userId, options) {
    throw new Error('Not implemented');
  }

  async connectUser(userId, options) {
    throw new Error('Not implemented');
  }

  normalizeTransaction(raw) {
    throw new Error('Not implemented');
  }
}

// Normalized transaction shape ALL providers must return:
// {
//   id, date, // ISO string
//   description, type: 'income'|'expense',
//   category, amount, // positive number
//   currency, // ISO code e.g. 'NGN'
//   reference, vendorCustomer,
//   provider, // 'mono'|'lean'|'plaid'|'pngme'
//   raw // original object for debugging
// }

module.exports = BankProvider;
