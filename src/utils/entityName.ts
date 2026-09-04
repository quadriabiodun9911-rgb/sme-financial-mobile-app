// Canonical customer/supplier identity extracted from a transaction's
// vendorCustomer field. That field sometimes carries a "Name | phone" or
// "Name|reference" suffix (see TransactionsScreen's joinVendorCustomer and
// the invoice-payment matching in finance.ts), and the same real customer
// or supplier can show up capitalized differently depending on where the
// name came from -- typed by hand (usually Title Case) vs lifted verbatim
// from a bank statement description (frequently ALL CAPS, since that's how
// most Nigerian bank statements print the counterparty). Every place that
// groups transactions by customer/supplier needs the same answer to "is
// this the same entity," so a case or whitespace difference alone must
// never split one real customer into two.
//
// This was previously reimplemented independently in five places with
// drifted behaviour -- computeCustomerConcentration/computeSupplierConcentration
// and supplierIntelligence.ts's supplierKey didn't lowercase at all, so a
// supplier typed once by hand and once imported from a statement (almost
// guaranteed to differ in case) silently counted as two separate suppliers,
// understating exactly the concentration risk computeRiskScore's
// Concentration factor (and a lender reading the Funding Readiness Pack) is
// trying to catch.

function extractName(vendorCustomer: string | undefined | null): string | null {
    if (!vendorCustomer) return null;
    const name = vendorCustomer.split('|')[0].trim().replace(/\s+/g, ' ');
    return name || null;
}

// The grouping key -- case-insensitive, so two spellings of the same real
// entity always fall into the same bucket. Never shown to a user directly.
export function entityKey(vendorCustomer: string | undefined | null): string | null {
    const name = extractName(vendorCustomer);
    return name ? name.toLowerCase() : null;
}

// The human-facing label for the same entity -- same extraction, original
// casing preserved, for anywhere displaying the name rather than grouping
// by it.
export function entityDisplayName(vendorCustomer: string | undefined | null): string | null {
    return extractName(vendorCustomer);
}
