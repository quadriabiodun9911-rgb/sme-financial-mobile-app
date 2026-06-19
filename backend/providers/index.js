const pngme = require('./pngme');
const mono  = require('./mono');
const lean  = require('./lean');
const plaid = require('./plaid');

// Currency code → provider name
const CURRENCY_PROVIDER_MAP = {
    // Plaid sandbox (fallback while Mono business account is being set up)
    NGN: 'plaid', GHS: 'plaid',
    // Pngme — SMS-based, East/Central Africa
    KES: 'pngme', UGX: 'pngme', TZS: 'pngme', RWF: 'pngme', ZMW: 'pngme', ETB: 'pngme', MWK: 'pngme',
    // Lean — open banking MENA
    EGP: 'lean', SAR: 'lean', AED: 'lean', BHD: 'lean', KWD: 'lean', JOD: 'lean', QAR: 'lean',
    // Plaid — open banking Western markets
    USD: 'plaid', GBP: 'plaid', EUR: 'plaid', CAD: 'plaid', AUD: 'plaid', CHF: 'plaid',
};

const PROVIDERS = { pngme, mono, lean, plaid };

function getProviderName(currencyCode) {
    return CURRENCY_PROVIDER_MAP[(currencyCode || '').toUpperCase()] || 'pngme';
}

function getProvider(currencyCode) {
    const name = getProviderName(currencyCode);
    return PROVIDERS[name];
}

function getSupportedCurrencies() {
    return Object.entries(CURRENCY_PROVIDER_MAP).map(([currency, provider]) => ({
        currency,
        provider,
        currencies: Object.keys(CURRENCY_PROVIDER_MAP).filter(c => CURRENCY_PROVIDER_MAP[c] === provider),
    }));
}

function getProviderList() {
    const seen = new Set();
    return Object.entries(CURRENCY_PROVIDER_MAP)
        .reduce((acc, [currency, provider]) => {
            if (!seen.has(provider)) {
                seen.add(provider);
                acc.push({
                    provider,
                    currencies: Object.keys(CURRENCY_PROVIDER_MAP).filter(c => CURRENCY_PROVIDER_MAP[c] === provider),
                });
            }
            return acc;
        }, []);
}

module.exports = { getProvider, getProviderName, getSupportedCurrencies, getProviderList };
