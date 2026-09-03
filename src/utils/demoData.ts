import { Transaction, Asset, Loan, InventoryItem, Invoice, Industry } from '../types';

export interface DemoBusiness {
    id: string;
    flag: string;
    country: string;
    emoji: string;
    name: string;
    description: string;
    currency: string;
    businessName: string;
    industry?: Industry;
    // Only set for a business with genuinely no physical goods -- lets it
    // demonstrate the service-only customization (FooterNav/Reports/
    // Forecast hiding Inventory-only surfaces, see FooterNav.tsx) rather
    // than every demo defaulting to 'both' and never showing it. Omitted
    // (defaults to 'both' at hydration) for every business that carries
    // real inventory, even a nominally "professional services" one.
    businessType?: 'product' | 'service' | 'both';
    transactions: Transaction[];
    assets: Asset[];
    loans: Loan[];
    inventory: InventoryItem[];
    invoices: Invoice[];
}

const today = new Date();
const d = (daysAgo: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};
// Forward-dated, for InventoryItem.expiryDate demo data -- d() above only
// ever looks backward.
const future = (daysAhead: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + daysAhead);
    return date.toISOString().split('T')[0];
};

export const DEMO_BUSINESSES: DemoBusiness[] = [

    // ─── 1. NIGERIA ───────────────────────────────────────────────────────────
    {
        id: 'nigeria',
        flag: '🇳🇬',
        country: 'Nigeria',
        emoji: '🛒',
        name: 'Fashion Boutique',
        description: 'Clothing & accessories retailer, Lagos',
        currency: '₦',
        businessName: 'Adunola Fashion Store',
        industry: 'retail',
        transactions: [
            { id: 'ng1',  date: d(1),  description: 'Sales — Ankara dresses',         type: 'income',  category: 'Sales',           amount: 85000,  status: 'paid' },
            { id: 'ng2',  date: d(2),  description: 'Sales — Shoes & handbags',        type: 'income',  category: 'Sales',           amount: 42000,  status: 'paid' },
            { id: 'ng3',  date: d(3),  description: 'Stock purchase — Ankara fabric',  type: 'expense', category: 'Stock/Inventory',  amount: 35000,  status: 'paid' },
            { id: 'ng4',  date: d(4),  description: 'Shop rent — monthly',             type: 'expense', category: 'Rent',             amount: 25000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'ng5',  date: d(5),  description: 'Sales — Men\'s traditional wear', type: 'income',  category: 'Sales',           amount: 31000,  status: 'paid' },
            { id: 'ng6',  date: d(7),  description: 'Sales assistant salary',          type: 'expense', category: 'Salaries',         amount: 35000,  status: 'paid' },
            { id: 'ng7',  date: d(8),  description: 'Sales — Children\'s wear',        type: 'income',  category: 'Sales',           amount: 28000,  status: 'paid' },
            { id: 'ng8',  date: d(10), description: 'Electricity & generator fuel',    type: 'expense', category: 'Utilities',        amount: 12000,  status: 'paid' },
            { id: 'ng9',  date: d(12), description: 'Sales — Evening gowns x3',        type: 'income',  category: 'Sales',           amount: 67500,  status: 'paid' },
            { id: 'ng10', date: d(14), description: 'Stock purchase — shoes',          type: 'expense', category: 'Stock/Inventory',  amount: 28000,  status: 'paid' },
            { id: 'ng11', date: d(15), description: 'Sales — accessories',             type: 'income',  category: 'Sales',           amount: 19500,  status: 'paid' },
            { id: 'ng12', date: d(18), description: 'Instagram & WhatsApp ads',        type: 'expense', category: 'Marketing',        amount: 8000,   status: 'paid' },
            { id: 'ng13', date: d(20), description: 'Sales — corporate uniforms',      type: 'income',  category: 'Sales',           amount: 95000,  status: 'pending', dueDate: d(-5) },
            { id: 'ng14', date: d(22), description: 'Packaging & carrier bags',        type: 'expense', category: 'Office & Admin',   amount: 4500,   status: 'paid' },
            { id: 'ng15', date: d(25), description: 'Sales — weekend Oshodi market',   type: 'income',  category: 'Sales',           amount: 52000,  status: 'paid' },
        ],
        assets: [
            { id: 'nga1', name: 'Display shelves & racks', purchaseCost: 85000, purchaseDate: d(180), category: 'furniture', usefulLifeYears: 5, status: 'active', createdAt: d(180), description: '', residualValue: 0 },
            { id: 'nga2', name: 'POS machine', purchaseCost: 35000, purchaseDate: d(90), category: 'equipment', usefulLifeYears: 3, status: 'active', createdAt: d(90), description: '', residualValue: 0 },
        ],
        loans: [
            { id: 'ngl1', lenderName: 'First Bank Nigeria', principal: 500000, interestRate: 18, termMonths: 12, startDate: d(120), purpose: 'Stock expansion', status: 'active', payments: [{ id: 'p1', date: d(90), amount: 52000, note: 'Month 1' }, { id: 'p2', date: d(60), amount: 52000, note: 'Month 2' }], createdAt: d(120) },
        ],
        inventory: [
            { id: 'ngi1', name: 'Ankara fabric (yards)', quantity: 45, unit: 'yards', costPrice: 800, sellingPrice: 1400, category: 'Fabric', lowStockThreshold: 20, createdAt: d(30), updatedAt: d(5) },
            { id: 'ngi2', name: 'Ladies shoes (pairs)', quantity: 12, unit: 'pairs', costPrice: 5500, sellingPrice: 9500, category: 'Shoes', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(8) },
            { id: 'ngi3', name: 'Men\'s agbada sets', quantity: 8, unit: 'pieces', costPrice: 15000, sellingPrice: 28000, category: 'Clothing', lowStockThreshold: 5, createdAt: d(30), updatedAt: d(10) },
        ],
        invoices: [
            { id: 'ngiv1', invoiceNumber: 'INV-001', clientName: 'Zenith Bank Plc', clientEmail: 'procurement@zenithbank.com', clientAddress: '', notes: '', lineItems: [{ description: 'Corporate uniforms x20', quantity: 20, unitPrice: 4750, taxRate: 0 }], subtotal: 95000, taxTotal: 0, total: 95000, status: 'sent', issueDate: d(20), dueDate: d(-5), createdAt: d(20) },
        ],
    },

    // ─── 2. UNITED KINGDOM ────────────────────────────────────────────────────
    {
        id: 'uk',
        flag: '🇬🇧',
        country: 'United Kingdom',
        emoji: '💼',
        name: 'Consulting Firm',
        description: 'Business advisory & professional services, London',
        currency: '£',
        businessName: 'Okafor Advisory Ltd',
        industry: 'professional-services',
        businessType: 'service',
        transactions: [
            { id: 'uk1',  date: d(2),  description: 'Strategy consulting — TechStart Ltd',  type: 'income',  category: 'Consulting',       amount: 3500,  status: 'paid' },
            { id: 'uk2',  date: d(5),  description: 'Monthly retainer — BuildCo',           type: 'income',  category: 'Consulting',       amount: 2000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'uk3',  date: d(7),  description: 'London office co-working space',       type: 'expense', category: 'Rent',             amount: 850,   status: 'paid' },
            { id: 'uk4',  date: d(8),  description: 'Financial analysis — PropCo',          type: 'income',  category: 'Consulting',       amount: 1800,  status: 'paid' },
            { id: 'uk5',  date: d(10), description: 'LinkedIn Premium & software tools',    type: 'expense', category: 'Subscriptions',    amount: 120,   status: 'paid' },
            { id: 'uk6',  date: d(12), description: 'Workshop facilitation — NHS Trust',    type: 'income',  category: 'Training',         amount: 2400,  status: 'pending', dueDate: d(-2) },
            { id: 'uk7',  date: d(15), description: 'Professional indemnity insurance',     type: 'expense', category: 'Insurance',        amount: 350,   status: 'paid' },
            { id: 'uk8',  date: d(16), description: 'Market entry report — AfriCorp',       type: 'income',  category: 'Consulting',       amount: 4200,  status: 'paid' },
            { id: 'uk9',  date: d(18), description: 'Train travel — client meetings',       type: 'expense', category: 'Travel',           amount: 180,   status: 'paid' },
            { id: 'uk10', date: d(20), description: 'Accountant fees — quarterly',          type: 'expense', category: 'Professional Fees', amount: 450,  status: 'paid' },
            { id: 'uk11', date: d(22), description: 'Due diligence project — InvestCo',    type: 'income',  category: 'Consulting',       amount: 5500,  status: 'paid' },
            { id: 'uk12', date: d(25), description: 'Phone & broadband',                   type: 'expense', category: 'Utilities',        amount: 85,    status: 'paid' },
            { id: 'uk13', date: d(28), description: 'Retainer — GreenTech Startup',        type: 'income',  category: 'Consulting',       amount: 1500,  status: 'pending', dueDate: d(-1) },
        ],
        assets: [
            { id: 'uka1', name: 'MacBook Pro 16"', purchaseCost: 2400, purchaseDate: d(300), category: 'equipment', usefulLifeYears: 3, status: 'active', createdAt: d(300), description: '', residualValue: 0 },
            { id: 'uka2', name: 'Office furniture set', purchaseCost: 1200, purchaseDate: d(400), category: 'furniture', usefulLifeYears: 5, status: 'active', createdAt: d(400), description: '', residualValue: 0 },
        ],
        loans: [],
        inventory: [],
        invoices: [
            { id: 'ukiv1', invoiceNumber: 'INV-034', clientName: 'NHS Trust', clientEmail: 'procurement@nhstrust.nhs.uk', clientAddress: '', notes: '', lineItems: [{ description: 'Workshop facilitation — 1 day', quantity: 1, unitPrice: 2400, taxRate: 0 }], subtotal: 2400, taxTotal: 0, total: 2400, status: 'sent', issueDate: d(12), dueDate: d(-2), createdAt: d(12) },
            { id: 'ukiv2', invoiceNumber: 'INV-035', clientName: 'GreenTech Startup', clientEmail: 'cfo@greentech.io', clientAddress: '', notes: '', lineItems: [{ description: 'Monthly retainer — consulting', quantity: 1, unitPrice: 1500, taxRate: 0 }], subtotal: 1500, taxTotal: 0, total: 1500, status: 'sent', issueDate: d(28), dueDate: d(-1), createdAt: d(28) },
        ],
    },

    // ─── 3. SOUTH AFRICA ──────────────────────────────────────────────────────
    {
        id: 'south-africa',
        flag: '🇿🇦',
        country: 'South Africa',
        emoji: '🍽️',
        name: 'Restaurant & Catering',
        description: 'Township eatery & events catering, Soweto',
        currency: 'R',
        businessName: 'Mama Zanele Kitchen',
        industry: 'food-service',
        transactions: [
            { id: 'za1',  date: d(1),  description: 'Daily restaurant sales',          type: 'income',  category: 'Sales',          amount: 3850,  status: 'paid' },
            { id: 'za2',  date: d(2),  description: 'Catering — corporate lunch 80pax',type: 'income',  category: 'Catering',       amount: 12000, status: 'paid' },
            { id: 'za3',  date: d(3),  description: 'Food ingredients — fresh market', type: 'expense', category: 'Cost of Goods',  amount: 2800,  status: 'paid' },
            { id: 'za4',  date: d(4),  description: 'Daily restaurant sales',          type: 'income',  category: 'Sales',          amount: 3100,  status: 'paid' },
            { id: 'za5',  date: d(5),  description: 'Staff wages — cook & waiters',    type: 'expense', category: 'Salaries',        amount: 7500,  status: 'paid' },
            { id: 'za6',  date: d(6),  description: 'Weekend braai special sales',     type: 'income',  category: 'Sales',          amount: 6700,  status: 'paid' },
            { id: 'za7',  date: d(7),  description: 'Gas & electricity',               type: 'expense', category: 'Utilities',       amount: 1800,  status: 'paid' },
            { id: 'za8',  date: d(8),  description: 'Catering — birthday party 60pax', type: 'income',  category: 'Catering',       amount: 8500,  status: 'paid' },
            { id: 'za9',  date: d(10), description: 'Restaurant rent — monthly',       type: 'expense', category: 'Rent',            amount: 4500,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'za10', date: d(12), description: 'Catering — wedding 150 pax',      type: 'income',  category: 'Catering',       amount: 25000, status: 'pending', dueDate: d(-3) },
            { id: 'za11', date: d(14), description: 'Daily restaurant sales',          type: 'income',  category: 'Sales',          amount: 3550,  status: 'paid' },
            { id: 'za12', date: d(15), description: 'Packaging & disposables',         type: 'expense', category: 'Office & Admin',  amount: 950,   status: 'paid' },
            { id: 'za13', date: d(18), description: 'Meat & produce — bulk buy',       type: 'expense', category: 'Cost of Goods',  amount: 3200,  status: 'paid' },
            { id: 'za14', date: d(20), description: 'Daily restaurant sales',          type: 'income',  category: 'Sales',          amount: 2900,  status: 'paid' },
            { id: 'za15', date: d(25), description: 'Refrigerator service & repair',   type: 'expense', category: 'Maintenance',     amount: 1500,  status: 'paid' },
        ],
        assets: [
            { id: 'zaa1', name: 'Commercial gas stove', purchaseCost: 18000, purchaseDate: d(365), category: 'equipment', usefulLifeYears: 7, status: 'active', createdAt: d(365), description: '', residualValue: 0 },
            { id: 'zaa2', name: 'Industrial fridge/freezer', purchaseCost: 25000, purchaseDate: d(200), category: 'equipment', usefulLifeYears: 8, status: 'active', createdAt: d(200), description: '', residualValue: 0 },
            { id: 'zaa3', name: 'Dining tables & chairs (8 sets)', purchaseCost: 15000, purchaseDate: d(365), category: 'furniture', usefulLifeYears: 5, status: 'active', createdAt: d(365), description: '', residualValue: 0 },
        ],
        loans: [],
        inventory: [
            { id: 'zai1', name: 'Maize meal (25kg)', quantity: 6, unit: 'bags', costPrice: 220, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 4, createdAt: d(30), updatedAt: d(3), expiryDate: future(60) },
            { id: 'zai2', name: 'Cooking oil (5L)', quantity: 4, unit: 'bottles', costPrice: 180, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 4, createdAt: d(30), updatedAt: d(3), expiryDate: future(90) },
            // Perishables -- shows both halves of the Expiring Stock card
            // (Analytics tab): one already past its date, one about to be.
            { id: 'zai3', name: 'Fresh chicken (kg)', quantity: 8, unit: 'kg', costPrice: 65, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 5, createdAt: d(3), updatedAt: d(1), expiryDate: d(1) },
            { id: 'zai4', name: 'Fresh vegetables (crate)', quantity: 3, unit: 'crates', costPrice: 95, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 2, createdAt: d(2), updatedAt: d(1), expiryDate: future(2) },
        ],
        invoices: [
            { id: 'zaiv1', invoiceNumber: 'INV-012', clientName: 'Thabo Nkosi Events', clientEmail: 'thabo@nkosievents.co.za', clientAddress: '', notes: '', lineItems: [{ description: 'Wedding catering 150 pax', quantity: 150, unitPrice: 167, taxRate: 0 }], subtotal: 25000, taxTotal: 0, total: 25000, status: 'sent', issueDate: d(12), dueDate: d(-3), createdAt: d(12) },
        ],
    },

    // ─── 4. UNITED STATES ─────────────────────────────────────────────────────
    {
        id: 'usa',
        flag: '🇺🇸',
        country: 'United States',
        emoji: '💻',
        name: 'Tech & SaaS Business',
        description: 'Software subscriptions & digital services, Atlanta',
        currency: '$',
        businessName: 'BrightStack Solutions LLC',
        // Mixed revenue (SaaS MRR + billable dev/consulting projects), but
        // no inventory at all -- 'professional-services' is the closer fit
        // of the five options, and lets its project-based revenue lines
        // (Custom dev, Consulting) show up in Project/Retainer Profitability.
        industry: 'professional-services',
        businessType: 'service',
        transactions: [
            { id: 'us1', date: d(1),  description: 'SaaS subscriptions — monthly MRR',    type: 'income',  category: 'Software Sales',   amount: 12400, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'us2',  date: d(3),  description: 'Custom dev project — RetailCo',       type: 'income',  category: 'Software Sales',   amount: 8500,  status: 'paid' },
            { id: 'us3',  date: d(5),  description: 'AWS cloud hosting',                   type: 'expense', category: 'Software',         amount: 1200,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'us4',  date: d(6),  description: 'New enterprise client onboarding',    type: 'income',  category: 'Software Sales',   amount: 5000,  status: 'paid' },
            { id: 'us5',  date: d(8),  description: 'Developer salaries x2',               type: 'expense', category: 'Salaries',         amount: 14000, status: 'paid' },
            { id: 'us6',  date: d(10), description: 'Consulting project — HealthApp Inc',  type: 'income',  category: 'Consulting',       amount: 6200,  status: 'paid' },
            { id: 'us7',  date: d(12), description: 'Office lease — Atlanta co-work',      type: 'expense', category: 'Rent',             amount: 1800,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'us8',  date: d(14), description: 'SaaS tools — Slack, Notion, GitHub',  type: 'expense', category: 'Subscriptions',    amount: 340,   status: 'paid' },
            { id: 'us9',  date: d(15), description: 'Annual contract — EDU platform',      type: 'income',  category: 'Software Sales',   amount: 24000, status: 'pending', dueDate: d(-4) },
            { id: 'us10', date: d(18), description: 'Contractor — UI/UX freelancer',       type: 'expense', category: 'Professional Fees', amount: 3500, status: 'paid' },
            { id: 'us11', date: d(20), description: 'Google Ads & LinkedIn campaigns',     type: 'expense', category: 'Marketing',        amount: 1200,  status: 'paid' },
            { id: 'us12', date: d(22), description: 'API integration project — FinTech',   type: 'income',  category: 'Software Sales',   amount: 9800,  status: 'paid' },
            { id: 'us13', date: d(25), description: 'Business insurance',                  type: 'expense', category: 'Insurance',        amount: 420,   status: 'paid' },
        ],
        assets: [
            { id: 'usa1', name: 'MacBook Pro workstations x2', purchaseCost: 5800, purchaseDate: d(250), category: 'equipment', usefulLifeYears: 3, status: 'active', createdAt: d(250), description: '', residualValue: 0 },
            { id: 'usa2', name: 'Server hardware', purchaseCost: 12000, purchaseDate: d(400), category: 'equipment', usefulLifeYears: 5, status: 'active', createdAt: d(400), description: '', residualValue: 0 },
        ],
        loans: [],
        inventory: [],
        invoices: [
            { id: 'usiv1', invoiceNumber: 'INV-078', clientName: 'EduPlatform Inc', clientEmail: 'billing@eduplatform.com', clientAddress: '', notes: '', lineItems: [{ description: 'Annual SaaS license — EDU plan', quantity: 1, unitPrice: 24000, taxRate: 0 }], subtotal: 24000, taxTotal: 0, total: 24000, status: 'sent', issueDate: d(15), dueDate: d(-4), createdAt: d(15) },
        ],
    },

    // ─── 5. EUROPE ────────────────────────────────────────────────────────────
    {
        id: 'europe',
        flag: '🇩🇪',
        country: 'Germany · Europe',
        emoji: '⚽',
        name: 'Sports Academy & Shop',
        description: 'Football training academy & sports equipment retail, Berlin',
        currency: '€',
        businessName: 'Berlin ProSport Academy',
        industry: 'retail',
        transactions: [
            { id: 'eu1',  date: d(1),  description: 'Monthly training fees — 24 junior members',  type: 'income',  category: 'Training Fees',    amount: 4800,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'eu2',  date: d(2),  description: 'Sales — football boots & kits',              type: 'income',  category: 'Equipment Sales',  amount: 2350,  status: 'paid' },
            { id: 'eu3',  date: d(3),  description: 'Pitch & facility rent — monthly',            type: 'expense', category: 'Rent',             amount: 2200,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'eu4',  date: d(4),  description: 'Private coaching sessions x8',               type: 'income',  category: 'Training Fees',    amount: 1600,  status: 'paid' },
            { id: 'eu5',  date: d(5),  description: 'Sales — gym equipment (weights, bands)',      type: 'income',  category: 'Equipment Sales',  amount: 3100,  status: 'paid' },
            { id: 'eu6',  date: d(7),  description: 'Coaches salaries x3',                       type: 'expense', category: 'Salaries',         amount: 7500,  status: 'paid' },
            { id: 'eu7',  date: d(8),  description: 'Weekend football tournament — entry fees',   type: 'income',  category: 'Events',           amount: 1800,  status: 'paid' },
            { id: 'eu8',  date: d(10), description: 'Stock — Adidas & Nike kit restock',          type: 'expense', category: 'Stock/Inventory',  amount: 5800,  status: 'paid' },
            { id: 'eu9',  date: d(12), description: 'Corporate wellness contract — TechFirm GmbH',type: 'income',  category: 'Training Fees',    amount: 3500,  status: 'pending', dueDate: d(-3) },
            { id: 'eu10', date: d(14), description: 'Sales — sports nutrition & supplements',     type: 'income',  category: 'Equipment Sales',  amount: 980,   status: 'paid' },
            { id: 'eu11', date: d(15), description: 'Utilities — electricity & water',            type: 'expense', category: 'Utilities',        amount: 480,   status: 'paid' },
            { id: 'eu12', date: d(18), description: 'Online coaching subscriptions — 12 clients', type: 'income',  category: 'Training Fees',    amount: 1440,  status: 'paid' },
            { id: 'eu13', date: d(20), description: 'Marketing — Instagram & Facebook ads',       type: 'expense', category: 'Marketing',        amount: 350,   status: 'paid' },
            { id: 'eu14', date: d(22), description: 'Sales — goalkeeper gloves & accessories',    type: 'income',  category: 'Equipment Sales',  amount: 640,   status: 'paid' },
            { id: 'eu15', date: d(25), description: 'Equipment maintenance & pitch repairs',      type: 'expense', category: 'Maintenance',      amount: 620,   status: 'paid' },
        ],
        assets: [
            { id: 'eua1', name: 'Football training equipment set', purchaseCost: 8500, purchaseDate: d(400), category: 'equipment', usefulLifeYears: 5, status: 'active', createdAt: d(400), description: '', residualValue: 0 },
            { id: 'eua2', name: 'Gym machines & weights', purchaseCost: 22000, purchaseDate: d(300), category: 'equipment', usefulLifeYears: 8, status: 'active', createdAt: d(300), description: '', residualValue: 0 },
            { id: 'eua3', name: 'Shop fit-out & display racks', purchaseCost: 6500, purchaseDate: d(500), category: 'furniture', usefulLifeYears: 7, status: 'active', createdAt: d(500), description: '', residualValue: 0 },
        ],
        loans: [
            { id: 'eul1', lenderName: 'Sparkasse Berlin Business Loan', principal: 50000, interestRate: 5.5, termMonths: 36, startDate: d(240), purpose: 'Gym expansion & equipment', status: 'active', payments: [{ id: 'p1', date: d(210), amount: 1600, note: 'Month 1' }, { id: 'p2', date: d(180), amount: 1600, note: 'Month 2' }, { id: 'p3', date: d(150), amount: 1600, note: 'Month 3' }, { id: 'p4', date: d(120), amount: 1600, note: 'Month 4' }], createdAt: d(240) },
        ],
        inventory: [
            { id: 'eui1', name: 'Football boots (pairs)', quantity: 28, unit: 'pairs', costPrice: 65, sellingPrice: 110, category: 'Footwear', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(2) },
            { id: 'eui2', name: 'Training jerseys & shorts sets', quantity: 40, unit: 'sets', costPrice: 38, sellingPrice: 65, category: 'Clothing', lowStockThreshold: 15, createdAt: d(30), updatedAt: d(5) },
            { id: 'eui3', name: 'Footballs (match grade)', quantity: 15, unit: 'units', costPrice: 42, sellingPrice: 75, category: 'equipment', lowStockThreshold: 8, createdAt: d(30), updatedAt: d(7) },
            { id: 'eui4', name: 'Resistance bands & cones set', quantity: 22, unit: 'sets', costPrice: 18, sellingPrice: 32, category: 'equipment', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(10) },
        ],
        invoices: [
            { id: 'euiv1', invoiceNumber: 'INV-EU-021', clientName: 'TechFirm GmbH', clientEmail: 'hr@techfirm.de', clientAddress: '', notes: '', lineItems: [{ description: 'Corporate wellness programme — 10 sessions', quantity: 10, unitPrice: 350, taxRate: 0 }], subtotal: 3500, taxTotal: 0, total: 3500, status: 'sent', issueDate: d(12), dueDate: d(-3), createdAt: d(12) },
        ],
    },

    // ─── 7. REAL ESTATE — UAE ─────────────────────────────────────────────────
    {
        id: 'real-estate',
        flag: '🇦🇪',
        country: 'UAE · Dubai',
        emoji: '🏢',
        name: 'Real Estate Agency',
        description: 'Property sales, rentals & management, Dubai',
        currency: 'AED',
        businessName: 'Al Noor Properties LLC',
        transactions: [
            { id: 're1',  date: d(2),  description: 'Commission — villa sale (Palm Jumeirah)',     type: 'income',  category: 'Sales Commission',  amount: 85000,  status: 'paid' },
            { id: 're2',  date: d(4),  description: 'Rental management fees — 8 units (March)',   type: 'income',  category: 'Management Fees',   amount: 12400,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 're3',  date: d(5),  description: 'Office rent — Business Bay',                 type: 'expense', category: 'Rent',              amount: 18000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 're4',  date: d(6),  description: 'Commission — apartment sale (Downtown)',      type: 'income',  category: 'Sales Commission',  amount: 42000,  status: 'paid' },
            { id: 're5',  date: d(7),  description: 'Agent salaries x4',                         type: 'expense', category: 'Salaries',          amount: 32000,  status: 'paid' },
            { id: 're6',  date: d(8),  description: 'Property listing — Bayut & Property Finder', type: 'expense', category: 'Marketing',         amount: 5500,   status: 'paid' },
            { id: 're7',  date: d(10), description: 'Commission — penthouse rental contract',     type: 'income',  category: 'Rental Commission', amount: 28500,  status: 'paid' },
            { id: 're8',  date: d(12), description: 'Commission — villa sale (JBR)',              type: 'income',  category: 'Sales Commission',  amount: 110000, status: 'pending', dueDate: d(-5) },
            { id: 're9',  date: d(14), description: 'Vehicle lease — 2 SUVs for agents',         type: 'expense', category: 'Transport',         amount: 8800,   status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 're10', date: d(15), description: 'Rental management fees — April',            type: 'income',  category: 'Management Fees',   amount: 12400,  status: 'paid' },
            { id: 're11', date: d(18), description: 'Commission — commercial office lease',       type: 'income',  category: 'Rental Commission', amount: 19800,  status: 'paid' },
            { id: 're12', date: d(20), description: 'Google Ads & social media marketing',        type: 'expense', category: 'Marketing',         amount: 3200,   status: 'paid' },
            { id: 're13', date: d(22), description: 'Commission — studio apartment sale',         type: 'income',  category: 'Sales Commission',  amount: 18500,  status: 'paid' },
            { id: 're14', date: d(24), description: 'RERA licence renewal & legal fees',          type: 'expense', category: 'Professional Fees', amount: 9500,   status: 'paid' },
            { id: 're15', date: d(26), description: 'Property photography & virtual tours',       type: 'expense', category: 'Marketing',         amount: 2800,   status: 'paid' },
        ],
        assets: [
            { id: 'rea1', name: 'BMW X5 — agent vehicle', purchaseCost: 280000, purchaseDate: d(400), category: 'vehicle', usefulLifeYears: 5, status: 'active', createdAt: d(400), description: '', residualValue: 0 },
            { id: 'rea2', name: 'Office furniture & fit-out', purchaseCost: 85000, purchaseDate: d(600), category: 'furniture', usefulLifeYears: 7, status: 'active', createdAt: d(600), description: '', residualValue: 0 },
            { id: 'rea3', name: 'CRM software licence (annual)', purchaseCost: 18000, purchaseDate: d(90), category: 'equipment', usefulLifeYears: 1, status: 'active', createdAt: d(90), description: '', residualValue: 0 },
        ],
        loans: [],
        inventory: [
            { id: 'rei1', name: 'Active listings — villas', quantity: 6, unit: 'properties', costPrice: 0, sellingPrice: 0, category: 'Listings', lowStockThreshold: 3, createdAt: d(30), updatedAt: d(2) },
            { id: 'rei2', name: 'Active listings — apartments', quantity: 18, unit: 'properties', costPrice: 0, sellingPrice: 0, category: 'Listings', lowStockThreshold: 8, createdAt: d(30), updatedAt: d(2) },
            { id: 'rei3', name: 'Rental managed units', quantity: 8, unit: 'units', costPrice: 0, sellingPrice: 0, category: 'Managed Properties', lowStockThreshold: 5, createdAt: d(30), updatedAt: d(4) },
        ],
        invoices: [
            { id: 'reiv1', invoiceNumber: 'INV-AE-041', clientName: 'Mr James Carter', clientEmail: 'j.carter@outlook.com', clientAddress: '', notes: '', lineItems: [{ description: 'Sales commission — JBR villa (2%)', quantity: 1, unitPrice: 110000, taxRate: 0 }], subtotal: 110000, taxTotal: 0, total: 110000, status: 'sent', issueDate: d(12), dueDate: d(-5), createdAt: d(12) },
        ],
    },

    // ─── 9. CHINA ─────────────────────────────────────────────────────────────
    {
        id: 'china',
        flag: '🇨🇳',
        country: 'China',
        emoji: '📦',
        name: 'Manufacturing & Export',
        description: 'Electronics factory & wholesale exports, Shenzhen',
        currency: '¥',
        businessName: 'Shenzhen BrightTech Manufacturing',
        industry: 'manufacturing',
        transactions: [
            { id: 'cn1',  date: d(2),  description: 'Export sale — phones to Nigeria',      type: 'income',  category: 'Export Sales',    amount: 285000, status: 'paid' },
            { id: 'cn2',  date: d(4),  description: 'Raw materials — PCB components',       type: 'expense', category: 'Cost of Goods',   amount: 98000,  status: 'paid' },
            { id: 'cn3',  date: d(5),  description: 'Export sale — earbuds to UK',          type: 'income',  category: 'Export Sales',    amount: 142000, status: 'paid' },
            { id: 'cn4',  date: d(6),  description: 'Factory floor rent — monthly',         type: 'expense', category: 'Rent',            amount: 35000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'cn5',  date: d(8),  description: 'Export sale — smartwatches to USA',    type: 'income',  category: 'Export Sales',    amount: 198000, status: 'pending', dueDate: d(-4) },
            { id: 'cn6',  date: d(10), description: 'Freight & logistics — sea shipment',   type: 'expense', category: 'Logistics',       amount: 22000,  status: 'paid' },
            { id: 'cn7',  date: d(12), description: 'Factory workers wages x15',            type: 'expense', category: 'Salaries',        amount: 75000,  status: 'paid' },
            { id: 'cn8',  date: d(14), description: 'Export sale — power banks to Africa',  type: 'income',  category: 'Export Sales',    amount: 165000, status: 'paid' },
            { id: 'cn9',  date: d(16), description: 'Raw materials — lithium batteries',    type: 'expense', category: 'Cost of Goods',   amount: 58000,  status: 'paid' },
            { id: 'cn10', date: d(18), description: 'Quality testing equipment lease',      type: 'expense', category: 'Equipment Hire',  amount: 12000,  status: 'paid' },
            { id: 'cn11', date: d(20), description: 'Export sale — cables & accessories',   type: 'income',  category: 'Export Sales',    amount: 88000,  status: 'paid' },
            { id: 'cn12', date: d(22), description: 'Customs & export documentation',       type: 'expense', category: 'Logistics',       amount: 8500,   status: 'paid' },
            { id: 'cn13', date: d(25), description: 'Export sale — laptop bags to SA',      type: 'income',  category: 'Export Sales',    amount: 72000,  status: 'paid' },
        ],
        assets: [
            { id: 'cna1', name: 'SMT assembly machines x2', purchaseCost: 480000, purchaseDate: d(500), category: 'equipment', usefulLifeYears: 8, status: 'active', createdAt: d(500), description: '', residualValue: 0 },
            { id: 'cna2', name: 'Factory forklift', purchaseCost: 95000, purchaseDate: d(300), category: 'equipment', usefulLifeYears: 8, status: 'active', createdAt: d(300), description: '', residualValue: 0 },
            { id: 'cna3', name: 'Delivery van', purchaseCost: 125000, purchaseDate: d(400), category: 'vehicle', usefulLifeYears: 5, status: 'active', createdAt: d(400), description: '', residualValue: 0 },
        ],
        loans: [
            { id: 'cnl1', lenderName: 'Bank of China SME Loan', principal: 800000, interestRate: 4.35, termMonths: 36, startDate: d(300), purpose: 'Production line expansion', status: 'active', payments: [{ id: 'p1', date: d(270), amount: 28000, note: 'Month 1' }, { id: 'p2', date: d(240), amount: 28000, note: 'Month 2' }, { id: 'p3', date: d(210), amount: 28000, note: 'Month 3' }], createdAt: d(300) },
        ],
        inventory: [
            // itemType demos the Production Cost Calculator's material
            // picker: the two finished products are excluded from it (a
            // business can't build its own product out of itself), the raw
            // component still shows up as a valid material.
            { id: 'cni1', name: 'Assembled phones (units)', quantity: 120, unit: 'units', costPrice: 850, sellingPrice: 1400, category: 'Electronics', lowStockThreshold: 50, createdAt: d(30), updatedAt: d(2), itemType: 'finished_good' },
            { id: 'cni2', name: 'Lithium batteries (cells)', quantity: 2000, unit: 'cells', costPrice: 18, sellingPrice: 0, category: 'Components', lowStockThreshold: 500, createdAt: d(30), updatedAt: d(5), itemType: 'raw_material' },
            { id: 'cni3', name: 'Earbuds (pairs)', quantity: 80, unit: 'pairs', costPrice: 420, sellingPrice: 720, category: 'Electronics', lowStockThreshold: 30, createdAt: d(30), updatedAt: d(8), itemType: 'finished_good' },
        ],
        invoices: [
            { id: 'cniv1', invoiceNumber: 'INV-CN-056', clientName: 'TechMart USA LLC', clientEmail: 'orders@techmart.us', clientAddress: '', notes: '', lineItems: [{ description: 'Smartwatches — Model X batch', quantity: 200, unitPrice: 990, taxRate: 0 }], subtotal: 198000, taxTotal: 0, total: 198000, status: 'sent', issueDate: d(8), dueDate: d(-4), createdAt: d(8) },
        ],
    },

    // ─── 8. KENYA ─────────────────────────────────────────────────────────────
    // Wholesale/distribution: buys building materials in bulk, resells to
    // contractors and smaller hardware shops — the "distributor" archetype
    // that sits alongside direct retail in the commerce-business segment.
    {
        id: 'kenya',
        flag: '🇰🇪',
        country: 'Kenya',
        emoji: '🧱',
        name: 'Building Materials Wholesaler',
        description: 'Cement, rebar & roofing distributor, Nairobi',
        currency: 'KSh',
        businessName: 'Kamau Building Supplies',
        industry: 'retail',
        transactions: [
            { id: 'ke1',  date: d(1),  description: 'Bulk sale — cement to contractor',      type: 'income',  category: 'Sales',           amount: 185000, status: 'paid' },
            { id: 'ke2',  date: d(2),  description: 'Sale — roofing sheets, retail shop',    type: 'income',  category: 'Sales',           amount: 62000,  status: 'paid' },
            { id: 'ke3',  date: d(3),  description: 'Stock purchase — cement (bulk)',        type: 'expense', category: 'Stock/Inventory', amount: 140000, status: 'paid' },
            { id: 'ke4',  date: d(4),  description: 'Warehouse rent — monthly',              type: 'expense', category: 'Rent',            amount: 45000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'ke5',  date: d(5),  description: 'Sale — rebar to construction site',     type: 'income',  category: 'Sales',           amount: 210000, status: 'paid' },
            { id: 'ke6',  date: d(7),  description: 'Warehouse staff wages x4',              type: 'expense', category: 'Salaries',        amount: 68000,  status: 'paid' },
            { id: 'ke7',  date: d(8),  description: 'Sale — mixed hardware, walk-in trade',  type: 'income',  category: 'Sales',           amount: 34000,  status: 'paid' },
            { id: 'ke8',  date: d(10), description: 'Truck fuel & delivery costs',           type: 'expense', category: 'Transport',       amount: 22000,  status: 'paid' },
            { id: 'ke9',  date: d(12), description: 'Bulk sale — roofing sheets, developer', type: 'income',  category: 'Sales',           amount: 275000, status: 'paid' },
            { id: 'ke10', date: d(14), description: 'Stock purchase — rebar restock',        type: 'expense', category: 'Stock/Inventory', amount: 165000, status: 'paid' },
            { id: 'ke11', date: d(15), description: 'Sale — cement, small hardware shop',    type: 'income',  category: 'Sales',           amount: 48000,  status: 'paid' },
            { id: 'ke12', date: d(18), description: 'Forklift maintenance',                  type: 'expense', category: 'Maintenance',     amount: 15000,  status: 'paid' },
            { id: 'ke13', date: d(20), description: 'Bulk sale — housing estate project',    type: 'income',  category: 'Sales',           amount: 420000, status: 'pending', dueDate: d(-6) },
            { id: 'ke14', date: d(22), description: 'Loading bay repairs',                   type: 'expense', category: 'Maintenance',     amount: 9500,   status: 'paid' },
            { id: 'ke15', date: d(25), description: 'Sale — mixed materials, weekend trade', type: 'income',  category: 'Sales',           amount: 58000,  status: 'paid' },
        ],
        assets: [
            { id: 'kea1', name: 'Flatbed delivery truck', purchaseCost: 1800000, purchaseDate: d(400), category: 'vehicle', usefulLifeYears: 8, status: 'active', createdAt: d(400), description: '', residualValue: 0 },
            { id: 'kea2', name: 'Warehouse forklift', purchaseCost: 650000, purchaseDate: d(250), category: 'equipment', usefulLifeYears: 7, status: 'active', createdAt: d(250), description: '', residualValue: 0 },
            { id: 'kea3', name: 'Weighing & POS scale', purchaseCost: 45000, purchaseDate: d(120), category: 'equipment', usefulLifeYears: 4, status: 'active', createdAt: d(120), description: '', residualValue: 0 },
        ],
        loans: [
            { id: 'kel1', lenderName: 'Equity Bank Kenya', principal: 2000000, interestRate: 15, termMonths: 24, startDate: d(180), purpose: 'Warehouse stock financing', status: 'active', payments: [{ id: 'p1', date: d(150), amount: 105000, note: 'Month 1' }, { id: 'p2', date: d(120), amount: 105000, note: 'Month 2' }, { id: 'p3', date: d(90), amount: 105000, note: 'Month 3' }], createdAt: d(180) },
        ],
        inventory: [
            { id: 'kei1', name: 'Cement (50kg bags)', quantity: 480, unit: 'bags', costPrice: 650, sellingPrice: 850, category: 'Cement', lowStockThreshold: 150, createdAt: d(30), updatedAt: d(2) },
            { id: 'kei2', name: 'Rebar (12mm, per length)', quantity: 620, unit: 'lengths', costPrice: 950, sellingPrice: 1250, category: 'Steel', lowStockThreshold: 200, createdAt: d(30), updatedAt: d(3) },
            { id: 'kei3', name: 'Roofing sheets (iron sheets)', quantity: 340, unit: 'sheets', costPrice: 780, sellingPrice: 1050, category: 'Roofing', lowStockThreshold: 100, createdAt: d(30), updatedAt: d(5) },
        ],
        invoices: [
            { id: 'keiv1', invoiceNumber: 'INV-KE-018', clientName: 'Riverside Estates Ltd', clientEmail: 'procurement@riversideestates.co.ke', clientAddress: '', notes: '', lineItems: [{ description: 'Cement & rebar — housing estate phase 1', quantity: 1, unitPrice: 420000, taxRate: 0 }], subtotal: 420000, taxTotal: 0, total: 420000, status: 'sent', issueDate: d(20), dueDate: d(-6), createdAt: d(20) },
        ],
    },

    // ─── 9. GHANA ─────────────────────────────────────────────────────────────
    // Built specifically to demonstrate the "strong" Invoice Financing path
    // in financingRecommendation.ts -- unpaid invoices here (₵255,000, two
    // genuinely overdue) exceed this business's own trailing monthly
    // revenue (₵241,500), unlike Adunola Fashion Store's single ₦95,000
    // invoice, which never clears even the moderate 0.5x threshold against
    // its ₦420,000 revenue. A B2B printing/branding studio invoicing
    // corporate clients on net terms is a realistic setting for real,
    // sizeable uncollected AR -- unlike the walk-in-trade retail businesses
    // elsewhere in this file.
    {
        id: 'ghana',
        flag: '🇬🇭',
        country: 'Ghana',
        emoji: '🖨️',
        name: 'Print & Branding Studio',
        description: 'Corporate printing, signage & branding, Accra',
        currency: 'GH₵',
        businessName: 'Kofi Print & Branding',
        industry: 'professional-services',
        transactions: [
            { id: 'gh1',  date: d(1),  description: 'Sale — corporate banners',              type: 'income',  category: 'Sales',        amount: 22000, status: 'paid' },
            { id: 'gh2',  date: d(2),  description: 'Sale — branded merchandise',             type: 'income',  category: 'Sales',        amount: 15500, status: 'paid' },
            { id: 'gh3',  date: d(3),  description: 'Printing supplies purchase',              type: 'expense', category: 'Stock/Inventory', amount: 18000, status: 'paid' },
            { id: 'gh4',  date: d(4),  description: 'Studio rent — monthly',                   type: 'expense', category: 'Rent',         amount: 12000, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'gh5',  date: d(5),  description: 'Sale — event signage package',            type: 'income',  category: 'Sales',        amount: 38000, status: 'paid' },
            { id: 'gh6',  date: d(7),  description: 'Studio staff wages x3',                   type: 'expense', category: 'Salaries',     amount: 21000, status: 'paid' },
            { id: 'gh7',  date: d(8),  description: 'Sale — vehicle branding',                 type: 'income',  category: 'Sales',        amount: 26500, status: 'paid' },
            { id: 'gh8',  date: d(10), description: 'Printer maintenance & ink',                type: 'expense', category: 'Maintenance',  amount: 9500,  status: 'paid' },
            { id: 'gh9',  date: d(12), description: 'Sale — exhibition booth branding',         type: 'income',  category: 'Sales',        amount: 48000, status: 'paid' },
            { id: 'gh10', date: d(14), description: 'Vinyl & print material restock',           type: 'expense', category: 'Stock/Inventory', amount: 24000, status: 'paid' },
            { id: 'gh11', date: d(15), description: 'Sale — office signage, walk-in',           type: 'income',  category: 'Sales',        amount: 12500, status: 'paid' },
            { id: 'gh12', date: d(18), description: 'Marketing — social media ads',             type: 'expense', category: 'Marketing',    amount: 6000,  status: 'paid' },
            { id: 'gh13', date: d(20), description: 'Sale — corporate rebrand package',         type: 'income',  category: 'Sales',        amount: 65000, status: 'pending', dueDate: d(-10) },
            { id: 'gh14', date: d(22), description: 'Delivery van fuel',                        type: 'expense', category: 'Transport',    amount: 7000,  status: 'paid' },
            { id: 'gh15', date: d(25), description: 'Sale — weekend market stall signage',      type: 'income',  category: 'Sales',        amount: 14000, status: 'paid' },
        ],
        assets: [
            { id: 'gha1', name: 'Large format printer', purchaseCost: 180000, purchaseDate: d(200), category: 'equipment', usefulLifeYears: 5, status: 'active', createdAt: d(200), description: '', residualValue: 0 },
            { id: 'gha2', name: 'Delivery van', purchaseCost: 220000, purchaseDate: d(300), category: 'vehicle', usefulLifeYears: 7, status: 'active', createdAt: d(300), description: '', residualValue: 0 },
        ],
        loans: [
            { id: 'ghl1', lenderName: 'GCB Bank Ghana', principal: 150000, interestRate: 22, termMonths: 18, startDate: d(150), purpose: 'Printer upgrade', status: 'active', payments: [{ id: 'p1', date: d(120), amount: 10500, note: 'Month 1' }, { id: 'p2', date: d(90), amount: 10500, note: 'Month 2' }], createdAt: d(150) },
        ],
        inventory: [
            { id: 'ghi1', name: 'Vinyl rolls', quantity: 40, unit: 'rolls', costPrice: 450, sellingPrice: 900, category: 'Print Material', lowStockThreshold: 15, createdAt: d(30), updatedAt: d(4) },
            { id: 'ghi2', name: 'Ink cartridge sets', quantity: 18, unit: 'sets', costPrice: 1200, sellingPrice: 2000, category: 'Print Material', lowStockThreshold: 8, createdAt: d(30), updatedAt: d(6) },
        ],
        invoices: [
            { id: 'ghiv1', invoiceNumber: 'INV-GH-101', clientName: 'Accra Mall Developers', clientEmail: 'accounts@accramalldev.com.gh', clientAddress: '', notes: '', lineItems: [{ description: 'Mall directory & wayfinding signage', quantity: 1, unitPrice: 95000, taxRate: 0 }], subtotal: 95000, taxTotal: 0, total: 95000, status: 'overdue', issueDate: d(45), dueDate: d(15), createdAt: d(45) },
            { id: 'ghiv2', invoiceNumber: 'INV-GH-102', clientName: 'Kumasi Retail Group', clientEmail: 'finance@kumasiretail.com.gh', clientAddress: '', notes: '', lineItems: [{ description: 'Storefront rebrand — 6 locations', quantity: 1, unitPrice: 68000, taxRate: 0 }], subtotal: 68000, taxTotal: 0, total: 68000, status: 'overdue', issueDate: d(50), dueDate: d(20), createdAt: d(50) },
            { id: 'ghiv3', invoiceNumber: 'INV-GH-103', clientName: 'Ministry of Trade — Event Services', clientEmail: 'procurement@mot.gov.gh', clientAddress: '', notes: '', lineItems: [{ description: 'Trade fair pavilion branding', quantity: 1, unitPrice: 92000, taxRate: 0 }], subtotal: 92000, taxTotal: 0, total: 92000, status: 'sent', issueDate: d(15), dueDate: d(-3), createdAt: d(15) },
        ],
    },
];
