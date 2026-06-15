import { Transaction, Asset, Loan, InventoryItem, Invoice } from '../types';

export interface DemoBusiness {
    id: string;
    flag: string;
    country: string;
    emoji: string;
    name: string;
    description: string;
    currency: string;
    businessName: string;
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
            { id: 'nga1', name: 'Display shelves & racks', purchaseCost: 85000, purchaseDate: d(180), category: 'Furniture', depreciationYears: 5, status: 'active', createdAt: d(180) },
            { id: 'nga2', name: 'POS machine', purchaseCost: 35000, purchaseDate: d(90), category: 'Equipment', depreciationYears: 3, status: 'active', createdAt: d(90) },
        ],
        loans: [
            { id: 'ngl1', lenderName: 'First Bank Nigeria', principal: 500000, interestRate: 18, termMonths: 12, startDate: d(120), purpose: 'Stock expansion', status: 'active', payments: [{ id: 'p1', date: d(90), amount: 52000, note: 'Month 1' }, { id: 'p2', date: d(60), amount: 52000, note: 'Month 2' }], createdAt: d(120) },
        ],
        inventory: [
            { id: 'ngi1', name: 'Ankara fabric (yards)', sku: 'ANK-001', quantity: 45, unit: 'yards', costPrice: 800, sellingPrice: 1400, category: 'Fabric', lowStockThreshold: 20, createdAt: d(30), updatedAt: d(5) },
            { id: 'ngi2', name: 'Ladies shoes (pairs)', sku: 'SHO-001', quantity: 12, unit: 'pairs', costPrice: 5500, sellingPrice: 9500, category: 'Shoes', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(8) },
            { id: 'ngi3', name: 'Men\'s agbada sets', sku: 'AGD-001', quantity: 8, unit: 'pieces', costPrice: 15000, sellingPrice: 28000, category: 'Clothing', lowStockThreshold: 5, createdAt: d(30), updatedAt: d(10) },
        ],
        invoices: [
            { id: 'ngiv1', invoiceNumber: 'INV-001', clientName: 'Zenith Bank Plc', clientEmail: 'procurement@zenithbank.com', items: [{ description: 'Corporate uniforms x20', quantity: 20, unitPrice: 4750, total: 95000 }], subtotal: 95000, tax: 0, total: 95000, status: 'sent', issueDate: d(20), dueDate: d(-5), createdAt: d(20) },
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
            { id: 'uka1', name: 'MacBook Pro 16"', purchaseCost: 2400, purchaseDate: d(300), category: 'Equipment', depreciationYears: 3, status: 'active', createdAt: d(300) },
            { id: 'uka2', name: 'Office furniture set', purchaseCost: 1200, purchaseDate: d(400), category: 'Furniture', depreciationYears: 5, status: 'active', createdAt: d(400) },
        ],
        loans: [],
        inventory: [],
        invoices: [
            { id: 'ukiv1', invoiceNumber: 'INV-034', clientName: 'NHS Trust', clientEmail: 'procurement@nhstrust.nhs.uk', items: [{ description: 'Workshop facilitation — 1 day', quantity: 1, unitPrice: 2400, total: 2400 }], subtotal: 2400, tax: 0, total: 2400, status: 'sent', issueDate: d(12), dueDate: d(-2), createdAt: d(12) },
            { id: 'ukiv2', invoiceNumber: 'INV-035', clientName: 'GreenTech Startup', clientEmail: 'cfo@greentech.io', items: [{ description: 'Monthly retainer — consulting', quantity: 1, unitPrice: 1500, total: 1500 }], subtotal: 1500, tax: 0, total: 1500, status: 'sent', issueDate: d(28), dueDate: d(-1), createdAt: d(28) },
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
            { id: 'zaa1', name: 'Commercial gas stove', purchaseCost: 18000, purchaseDate: d(365), category: 'Equipment', depreciationYears: 7, status: 'active', createdAt: d(365) },
            { id: 'zaa2', name: 'Industrial fridge/freezer', purchaseCost: 25000, purchaseDate: d(200), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(200) },
            { id: 'zaa3', name: 'Dining tables & chairs (8 sets)', purchaseCost: 15000, purchaseDate: d(365), category: 'Furniture', depreciationYears: 5, status: 'active', createdAt: d(365) },
        ],
        loans: [],
        inventory: [
            { id: 'zai1', name: 'Maize meal (25kg)', sku: 'MAZ-001', quantity: 6, unit: 'bags', costPrice: 220, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 4, createdAt: d(30), updatedAt: d(3) },
            { id: 'zai2', name: 'Cooking oil (5L)', sku: 'OIL-001', quantity: 4, unit: 'bottles', costPrice: 180, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 4, createdAt: d(30), updatedAt: d(3) },
        ],
        invoices: [
            { id: 'zaiv1', invoiceNumber: 'INV-012', clientName: 'Thabo Nkosi Events', clientEmail: 'thabo@nkosievents.co.za', items: [{ description: 'Wedding catering 150 pax', quantity: 150, unitPrice: 167, total: 25000 }], subtotal: 25000, tax: 0, total: 25000, status: 'sent', issueDate: d(12), dueDate: d(-3), createdAt: d(12) },
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
        transactions: [
            { id: 'us1',  date: d(1),  description: 'SaaS subscriptions — monthly MRR',    type: 'income',  category: 'Software Sales',   amount: 12400, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
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
            { id: 'usa1', name: 'MacBook Pro workstations x2', purchaseCost: 5800, purchaseDate: d(250), category: 'Equipment', depreciationYears: 3, status: 'active', createdAt: d(250) },
            { id: 'usa2', name: 'Server hardware', purchaseCost: 12000, purchaseDate: d(400), category: 'Equipment', depreciationYears: 5, status: 'active', createdAt: d(400) },
        ],
        loans: [],
        inventory: [],
        invoices: [
            { id: 'usiv1', invoiceNumber: 'INV-078', clientName: 'EduPlatform Inc', clientEmail: 'billing@eduplatform.com', items: [{ description: 'Annual SaaS license — EDU plan', quantity: 1, unitPrice: 24000, total: 24000 }], subtotal: 24000, tax: 0, total: 24000, status: 'sent', issueDate: d(15), dueDate: d(-4), createdAt: d(15) },
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
            { id: 'eua1', name: 'Football training equipment set', purchaseCost: 8500, purchaseDate: d(400), category: 'Equipment', depreciationYears: 5, status: 'active', createdAt: d(400) },
            { id: 'eua2', name: 'Gym machines & weights', purchaseCost: 22000, purchaseDate: d(300), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(300) },
            { id: 'eua3', name: 'Shop fit-out & display racks', purchaseCost: 6500, purchaseDate: d(500), category: 'Furniture', depreciationYears: 7, status: 'active', createdAt: d(500) },
        ],
        loans: [
            { id: 'eul1', lenderName: 'Sparkasse Berlin Business Loan', principal: 50000, interestRate: 5.5, termMonths: 36, startDate: d(240), purpose: 'Gym expansion & equipment', status: 'active', payments: [{ id: 'p1', date: d(210), amount: 1600, note: 'Month 1' }, { id: 'p2', date: d(180), amount: 1600, note: 'Month 2' }, { id: 'p3', date: d(150), amount: 1600, note: 'Month 3' }, { id: 'p4', date: d(120), amount: 1600, note: 'Month 4' }], createdAt: d(240) },
        ],
        inventory: [
            { id: 'eui1', name: 'Football boots (pairs)', sku: 'FBT-001', quantity: 28, unit: 'pairs', costPrice: 65, sellingPrice: 110, category: 'Footwear', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(2) },
            { id: 'eui2', name: 'Training jerseys & shorts sets', sku: 'KIT-001', quantity: 40, unit: 'sets', costPrice: 38, sellingPrice: 65, category: 'Clothing', lowStockThreshold: 15, createdAt: d(30), updatedAt: d(5) },
            { id: 'eui3', name: 'Footballs (match grade)', sku: 'BLL-001', quantity: 15, unit: 'units', costPrice: 42, sellingPrice: 75, category: 'Equipment', lowStockThreshold: 8, createdAt: d(30), updatedAt: d(7) },
            { id: 'eui4', name: 'Resistance bands & cones set', sku: 'TRN-001', quantity: 22, unit: 'sets', costPrice: 18, sellingPrice: 32, category: 'Equipment', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(10) },
        ],
        invoices: [
            { id: 'euiv1', invoiceNumber: 'INV-EU-021', clientName: 'TechFirm GmbH', clientEmail: 'hr@techfirm.de', items: [{ description: 'Corporate wellness programme — 10 sessions', quantity: 10, unitPrice: 350, total: 3500 }], subtotal: 3500, tax: 0, total: 3500, status: 'sent', issueDate: d(12), dueDate: d(-3), createdAt: d(12) },
        ],
    },

    // ─── 7. CHINA ─────────────────────────────────────────────────────────────
    {
        id: 'china',
        flag: '🇨🇳',
        country: 'China',
        emoji: '📦',
        name: 'Manufacturing & Export',
        description: 'Electronics factory & wholesale exports, Shenzhen',
        currency: '¥',
        businessName: 'Shenzhen BrightTech Manufacturing',
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
            { id: 'cna1', name: 'SMT assembly machines x2', purchaseCost: 480000, purchaseDate: d(500), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(500) },
            { id: 'cna2', name: 'Factory forklift', purchaseCost: 95000, purchaseDate: d(300), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(300) },
            { id: 'cna3', name: 'Delivery van', purchaseCost: 125000, purchaseDate: d(400), category: 'Vehicle', depreciationYears: 5, status: 'active', createdAt: d(400) },
        ],
        loans: [
            { id: 'cnl1', lenderName: 'Bank of China SME Loan', principal: 800000, interestRate: 4.35, termMonths: 36, startDate: d(300), purpose: 'Production line expansion', status: 'active', payments: [{ id: 'p1', date: d(270), amount: 28000, note: 'Month 1' }, { id: 'p2', date: d(240), amount: 28000, note: 'Month 2' }, { id: 'p3', date: d(210), amount: 28000, note: 'Month 3' }], createdAt: d(300) },
        ],
        inventory: [
            { id: 'cni1', name: 'Assembled phones (units)', sku: 'PHN-A1', quantity: 120, unit: 'units', costPrice: 850, sellingPrice: 1400, category: 'Electronics', lowStockThreshold: 50, createdAt: d(30), updatedAt: d(2) },
            { id: 'cni2', name: 'Lithium batteries (cells)', sku: 'BAT-18650', quantity: 2000, unit: 'cells', costPrice: 18, sellingPrice: 0, category: 'Components', lowStockThreshold: 500, createdAt: d(30), updatedAt: d(5) },
            { id: 'cni3', name: 'Earbuds (pairs)', sku: 'EBD-001', quantity: 80, unit: 'pairs', costPrice: 420, sellingPrice: 720, category: 'Electronics', lowStockThreshold: 30, createdAt: d(30), updatedAt: d(8) },
        ],
        invoices: [
            { id: 'cniv1', invoiceNumber: 'INV-CN-056', clientName: 'TechMart USA LLC', clientEmail: 'orders@techmart.us', items: [{ description: 'Smartwatches — Model X batch', quantity: 200, unitPrice: 990, total: 198000 }], subtotal: 198000, tax: 0, total: 198000, status: 'sent', issueDate: d(8), dueDate: d(-4), createdAt: d(8) },
        ],
    },
];
