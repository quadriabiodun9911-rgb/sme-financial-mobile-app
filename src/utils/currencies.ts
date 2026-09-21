// A broad, ISO-4217-based currency list -- not just the dozen major
// trading currencies this app used to hardcode in SettingsScreen, but
// enough of the world's active currencies that an SME anywhere can pick
// their own country's currency as their base currency, not just approximate
// it with USD/EUR/GBP. `symbol` falls back to the ISO code itself for
// currencies with no widely-recognized distinct symbol, since a business
// showing amounts as "XOF 45,000" is still correct and unambiguous.
export interface CurrencyOption {
    code: string;   // ISO 4217
    symbol: string; // shown as the amount prefix throughout the app
    name: string;   // currency name, used for the dropdown label + search
}

export const CURRENCIES: CurrencyOption[] = [
    // ─── Africa ─────────────────────────────────────────────────────────
    { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira' },
    { code: 'ZAR', symbol: 'R',   name: 'South African Rand' },
    { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    { code: 'GHS', symbol: '₵',   name: 'Ghanaian Cedi' },
    { code: 'EGP', symbol: 'E£',  name: 'Egyptian Pound' },
    { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham' },
    { code: 'DZD', symbol: 'DZD', name: 'Algerian Dinar' },
    { code: 'TND', symbol: 'DT',  name: 'Tunisian Dinar' },
    { code: 'ETB', symbol: 'Br',  name: 'Ethiopian Birr' },
    { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
    { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
    { code: 'RWF', symbol: 'RF',  name: 'Rwandan Franc' },
    { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
    { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc' },
    { code: 'ZMW', symbol: 'ZK',  name: 'Zambian Kwacha' },
    { code: 'MWK', symbol: 'MK',  name: 'Malawian Kwacha' },
    { code: 'MZN', symbol: 'MT',  name: 'Mozambican Metical' },
    { code: 'BWP', symbol: 'P',   name: 'Botswana Pula' },
    { code: 'NAD', symbol: 'N$',  name: 'Namibian Dollar' },
    { code: 'SZL', symbol: 'E',   name: 'Eswatini Lilangeni' },
    { code: 'LSL', symbol: 'L',   name: 'Lesotho Loti' },
    { code: 'AOA', symbol: 'Kz',  name: 'Angolan Kwanza' },
    { code: 'SLL', symbol: 'Le',  name: 'Sierra Leonean Leone' },
    { code: 'LRD', symbol: 'L$',  name: 'Liberian Dollar' },
    { code: 'GMD', symbol: 'D',   name: 'Gambian Dalasi' },
    { code: 'GNF', symbol: 'FG',  name: 'Guinean Franc' },
    { code: 'CDF', symbol: 'FC',  name: 'Congolese Franc' },
    { code: 'SDG', symbol: 'SDG', name: 'Sudanese Pound' },
    { code: 'SOS', symbol: 'Sh',  name: 'Somali Shilling' },
    { code: 'DJF', symbol: 'Fdj', name: 'Djiboutian Franc' },
    { code: 'MUR', symbol: '₨',  name: 'Mauritian Rupee' },
    { code: 'SCR', symbol: '₨',  name: 'Seychellois Rupee' },
    { code: 'MGA', symbol: 'Ar',  name: 'Malagasy Ariary' },
    { code: 'BIF', symbol: 'FBu', name: 'Burundian Franc' },
    { code: 'CVE', symbol: '$',   name: 'Cape Verdean Escudo' },
    { code: 'LYD', symbol: 'LD',  name: 'Libyan Dinar' },

    // ─── Middle East ────────────────────────────────────────────────────
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    { code: 'SAR', symbol: 'SR',  name: 'Saudi Riyal' },
    { code: 'QAR', symbol: 'QR',  name: 'Qatari Riyal' },
    { code: 'KWD', symbol: 'KD',  name: 'Kuwaiti Dinar' },
    { code: 'BHD', symbol: 'BD',  name: 'Bahraini Dinar' },
    { code: 'OMR', symbol: 'OMR', name: 'Omani Rial' },
    { code: 'JOD', symbol: 'JD',  name: 'Jordanian Dinar' },
    { code: 'ILS', symbol: '₪',  name: 'Israeli New Shekel' },
    { code: 'LBP', symbol: 'L£',  name: 'Lebanese Pound' },
    { code: 'IQD', symbol: 'ID',  name: 'Iraqi Dinar' },
    { code: 'IRR', symbol: '﷼',  name: 'Iranian Rial' },
    { code: 'YER', symbol: 'YR',  name: 'Yemeni Rial' },
    { code: 'TRY', symbol: '₺',  name: 'Turkish Lira' },

    // ─── Asia-Pacific ───────────────────────────────────────────────────
    { code: 'INR', symbol: '₹',  name: 'Indian Rupee' },
    { code: 'CNY', symbol: '¥',   name: 'Chinese Yuan' },
    { code: 'JPY', symbol: '¥',   name: 'Japanese Yen' },
    { code: 'KRW', symbol: '₩',  name: 'South Korean Won' },
    { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar' },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    { code: 'MYR', symbol: 'RM',  name: 'Malaysian Ringgit' },
    { code: 'THB', symbol: '฿',  name: 'Thai Baht' },
    { code: 'IDR', symbol: 'Rp',  name: 'Indonesian Rupiah' },
    { code: 'PHP', symbol: '₱',  name: 'Philippine Peso' },
    { code: 'VND', symbol: '₫',  name: 'Vietnamese Dong' },
    { code: 'PKR', symbol: '₨',  name: 'Pakistani Rupee' },
    { code: 'BDT', symbol: '৳',  name: 'Bangladeshi Taka' },
    { code: 'LKR', symbol: 'Rs',  name: 'Sri Lankan Rupee' },
    { code: 'NPR', symbol: '₨',  name: 'Nepalese Rupee' },
    { code: 'MMK', symbol: 'K',   name: 'Myanmar Kyat' },
    { code: 'KHR', symbol: '៛',  name: 'Cambodian Riel' },
    { code: 'LAK', symbol: '₭',  name: 'Lao Kip' },
    { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
    { code: 'MNT', symbol: '₮',  name: 'Mongolian Tugrik' },
    { code: 'KZT', symbol: '₸',  name: 'Kazakhstani Tenge' },
    { code: 'UZS', symbol: 'UZS', name: 'Uzbekistani Som' },
    { code: 'AFN', symbol: '؋',  name: 'Afghan Afghani' },
    { code: 'BND', symbol: 'B$',  name: 'Brunei Dollar' },
    { code: 'FJD', symbol: 'FJ$', name: 'Fijian Dollar' },
    { code: 'PGK', symbol: 'K',   name: 'Papua New Guinean Kina' },
    { code: 'MVR', symbol: 'Rf',  name: 'Maldivian Rufiyaa' },
    { code: 'BTN', symbol: 'Nu.', name: 'Bhutanese Ngultrum' },

    // ─── Europe ─────────────────────────────────────────────────────────
    { code: 'EUR', symbol: '€',   name: 'Euro' },
    { code: 'GBP', symbol: '£',   name: 'British Pound' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'SEK', symbol: 'kr',  name: 'Swedish Krona' },
    { code: 'NOK', symbol: 'kr',  name: 'Norwegian Krone' },
    { code: 'DKK', symbol: 'kr',  name: 'Danish Krone' },
    { code: 'PLN', symbol: 'zł',  name: 'Polish Zloty' },
    { code: 'CZK', symbol: 'Kč',  name: 'Czech Koruna' },
    { code: 'HUF', symbol: 'Ft',  name: 'Hungarian Forint' },
    { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
    { code: 'BGN', symbol: 'лв',  name: 'Bulgarian Lev' },
    { code: 'HRK', symbol: 'kn',  name: 'Croatian Kuna' },
    { code: 'RSD', symbol: 'din', name: 'Serbian Dinar' },
    { code: 'UAH', symbol: '₴',  name: 'Ukrainian Hryvnia' },
    { code: 'RUB', symbol: '₽',  name: 'Russian Ruble' },
    { code: 'ISK', symbol: 'kr',  name: 'Icelandic Krona' },
    { code: 'ALL', symbol: 'L',   name: 'Albanian Lek' },
    { code: 'MKD', symbol: 'ден', name: 'Macedonian Denar' },
    { code: 'BAM', symbol: 'KM',  name: 'Bosnia-Herzegovina Mark' },
    { code: 'MDL', symbol: 'L',   name: 'Moldovan Leu' },
    { code: 'GEL', symbol: '₾',  name: 'Georgian Lari' },
    { code: 'AMD', symbol: '֏',  name: 'Armenian Dram' },
    { code: 'AZN', symbol: '₼',  name: 'Azerbaijani Manat' },

    // ─── Americas ───────────────────────────────────────────────────────
    { code: 'USD', symbol: '$',   name: 'US Dollar' },
    { code: 'CAD', symbol: 'C$',  name: 'Canadian Dollar' },
    { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
    { code: 'BRL', symbol: 'R$',  name: 'Brazilian Real' },
    { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
    { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
    { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
    { code: 'PEN', symbol: 'S/',  name: 'Peruvian Sol' },
    { code: 'UYU', symbol: '$U',  name: 'Uruguayan Peso' },
    { code: 'BOB', symbol: 'Bs',  name: 'Bolivian Boliviano' },
    { code: 'PYG', symbol: '₲',  name: 'Paraguayan Guarani' },
    { code: 'VES', symbol: 'Bs.', name: 'Venezuelan Bolivar' },
    { code: 'GTQ', symbol: 'Q',   name: 'Guatemalan Quetzal' },
    { code: 'HNL', symbol: 'L',   name: 'Honduran Lempira' },
    { code: 'CRC', symbol: '₡',  name: 'Costa Rican Colon' },
    { code: 'DOP', symbol: 'RD$', name: 'Dominican Peso' },
    { code: 'JMD', symbol: 'J$',  name: 'Jamaican Dollar' },
    { code: 'TTD', symbol: 'TT$', name: 'Trinidad & Tobago Dollar' },
    { code: 'BSD', symbol: 'B$',  name: 'Bahamian Dollar' },
    { code: 'BBD', symbol: 'Bds$', name: 'Barbadian Dollar' },
    { code: 'PAB', symbol: 'B/.', name: 'Panamanian Balboa' },
    { code: 'NIO', symbol: 'C$',  name: 'Nicaraguan Cordoba' },

    // ─── Oceania ────────────────────────────────────────────────────────
    { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar' },
    { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
];

// Fast lookup, e.g. to resolve a stored currencyCode back to its symbol.
export const CURRENCY_BY_CODE: Record<string, CurrencyOption> = Object.fromEntries(
    CURRENCIES.map(c => [c.code, c])
);
