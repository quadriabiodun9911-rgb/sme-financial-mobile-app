import { Transaction, Asset, Loan, InventoryItem, Invoice } from '../types';

export interface DemoBusiness {
    id: string;
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
    // ─── 1. RETAIL SHOP ───────────────────────────────────────────────────────
    {
        id: 'retail',
        emoji: '🛒',
        name: 'Retail Shop',
        description: 'Clothing & accessories boutique',
        currency: '₦',
        businessName: 'Adunola Fashion Store',
        transactions: [
            { id: 'r1',  date: d(1),  description: 'Sales — Ankara dresses',       type: 'income',  category: 'Sales',          amount: 85000,  status: 'paid' },
            { id: 'r2',  date: d(2),  description: 'Sales — Shoes & bags',          type: 'income',  category: 'Sales',          amount: 42000,  status: 'paid' },
            { id: 'r3',  date: d(3),  description: 'Stock purchase — Ankara fabric',type: 'expense', category: 'Stock/Inventory', amount: 35000,  status: 'paid' },
            { id: 'r4',  date: d(4),  description: 'Shop rent — monthly',           type: 'expense', category: 'Rent',            amount: 25000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'r5',  date: d(5),  description: 'Sales — Men\'s shirts',         type: 'income',  category: 'Sales',          amount: 31000,  status: 'paid' },
            { id: 'r6',  date: d(7),  description: 'Sales assistant salary',        type: 'expense', category: 'Salaries',        amount: 35000,  status: 'paid' },
            { id: 'r7',  date: d(8),  description: 'Sales — Children\'s wear',      type: 'income',  category: 'Sales',          amount: 28000,  status: 'paid' },
            { id: 'r8',  date: d(10), description: 'Electricity & generator fuel',  type: 'expense', category: 'Utilities',       amount: 12000,  status: 'paid' },
            { id: 'r9',  date: d(12), description: 'Sales — Evening gowns x3',      type: 'income',  category: 'Sales',          amount: 67500,  status: 'paid' },
            { id: 'r10', date: d(14), description: 'Stock purchase — Shoes',        type: 'expense', category: 'Stock/Inventory', amount: 28000,  status: 'paid' },
            { id: 'r11', date: d(15), description: 'Sales — Accessories',           type: 'income',  category: 'Sales',          amount: 19500,  status: 'paid' },
            { id: 'r12', date: d(18), description: 'Instagram ads',                 type: 'expense', category: 'Marketing',       amount: 8000,   status: 'paid' },
            { id: 'r13', date: d(20), description: 'Sales — Corporate uniforms',    type: 'income',  category: 'Sales',          amount: 95000,  status: 'pending', dueDate: d(-5) },
            { id: 'r14', date: d(22), description: 'Packaging & bags',              type: 'expense', category: 'Office & Admin',  amount: 4500,   status: 'paid' },
            { id: 'r15', date: d(25), description: 'Sales — Weekend market',        type: 'income',  category: 'Sales',          amount: 52000,  status: 'paid' },
        ],
        assets: [
            { id: 'ra1', name: 'Display shelves & racks', purchaseCost: 85000, purchaseDate: d(180), category: 'Furniture', depreciationYears: 5, status: 'active', createdAt: d(180) },
            { id: 'ra2', name: 'POS machine', purchaseCost: 35000, purchaseDate: d(90), category: 'Equipment', depreciationYears: 3, status: 'active', createdAt: d(90) },
        ],
        loans: [
            { id: 'rl1', lenderName: 'First Bank', principal: 500000, interestRate: 18, termMonths: 12, startDate: d(120), purpose: 'Stock expansion', status: 'active', payments: [], createdAt: d(120) },
        ],
        inventory: [
            { id: 'ri1', name: 'Ankara fabric (yards)', sku: 'ANK-001', quantity: 45, unit: 'yards', costPrice: 800, sellingPrice: 1400, category: 'Fabric', lowStockThreshold: 20, createdAt: d(30), updatedAt: d(5) },
            { id: 'ri2', name: 'Ladies shoes (pairs)', sku: 'SHO-001', quantity: 12, unit: 'pairs', costPrice: 5500, sellingPrice: 9500, category: 'Shoes', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(8) },
            { id: 'ri3', name: 'Men\'s shirts', sku: 'SHT-001', quantity: 8, unit: 'pieces', costPrice: 3500, sellingPrice: 6500, category: 'Clothing', lowStockThreshold: 15, createdAt: d(30), updatedAt: d(10) },
        ],
        invoices: [
            { id: 'ri1', invoiceNumber: 'INV-001', clientName: 'Zenith Bank Corp', clientEmail: 'procurement@zenithbank.com', items: [{ description: 'Corporate uniforms x20', quantity: 20, unitPrice: 4750, total: 95000 }], subtotal: 95000, tax: 0, total: 95000, status: 'sent', issueDate: d(20), dueDate: d(-5), createdAt: d(20) },
        ],
    },

    // ─── 2. RESTAURANT / FOOD ─────────────────────────────────────────────────
    {
        id: 'restaurant',
        emoji: '🍽️',
        name: 'Restaurant / Food',
        description: 'Eatery, catering or food business',
        currency: '₦',
        businessName: 'Mama Titi Kitchen',
        transactions: [
            { id: 'f1',  date: d(1),  description: 'Daily sales — lunch & dinner',  type: 'income',  category: 'Sales',          amount: 38500,  status: 'paid' },
            { id: 'f2',  date: d(2),  description: 'Catering — office event 80 pax',type: 'income',  category: 'Catering',       amount: 120000, status: 'paid' },
            { id: 'f3',  date: d(3),  description: 'Food ingredients — market run', type: 'expense', category: 'Cost of Goods',   amount: 28000,  status: 'paid' },
            { id: 'f4',  date: d(4),  description: 'Daily sales',                   type: 'income',  category: 'Sales',          amount: 31000,  status: 'paid' },
            { id: 'f5',  date: d(5),  description: 'Cook & waiter salaries',        type: 'expense', category: 'Salaries',        amount: 75000,  status: 'paid' },
            { id: 'f6',  date: d(6),  description: 'Daily sales',                   type: 'income',  category: 'Sales',          amount: 44000,  status: 'paid' },
            { id: 'f7',  date: d(7),  description: 'Gas & cooking fuel',            type: 'expense', category: 'Utilities',       amount: 18000,  status: 'paid' },
            { id: 'f8',  date: d(8),  description: 'Weekend sales — special menu',  type: 'income',  category: 'Sales',          amount: 67000,  status: 'paid' },
            { id: 'f9',  date: d(10), description: 'Restaurant rent',               type: 'expense', category: 'Rent',            amount: 45000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'f10', date: d(12), description: 'Catering — wedding 150 pax',    type: 'income',  category: 'Catering',       amount: 250000, status: 'pending', dueDate: d(-3) },
            { id: 'f11', date: d(14), description: 'Daily sales',                   type: 'income',  category: 'Sales',          amount: 35500,  status: 'paid' },
            { id: 'f12', date: d(15), description: 'Packaging & disposables',       type: 'expense', category: 'Office & Admin',  amount: 9500,   status: 'paid' },
            { id: 'f13', date: d(18), description: 'Food ingredients',              type: 'expense', category: 'Cost of Goods',   amount: 32000,  status: 'paid' },
            { id: 'f14', date: d(20), description: 'Daily sales',                   type: 'income',  category: 'Sales',          amount: 29000,  status: 'paid' },
            { id: 'f15', date: d(25), description: 'Generator maintenance',         type: 'expense', category: 'Maintenance',     amount: 15000,  status: 'paid' },
        ],
        assets: [
            { id: 'fa1', name: 'Commercial gas cooker', purchaseCost: 180000, purchaseDate: d(365), category: 'Equipment', depreciationYears: 7, status: 'active', createdAt: d(365) },
            { id: 'fa2', name: 'Industrial freezer', purchaseCost: 250000, purchaseDate: d(200), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(200) },
            { id: 'fa3', name: 'Dining tables & chairs (10 sets)', purchaseCost: 150000, purchaseDate: d(365), category: 'Furniture', depreciationYears: 5, status: 'active', createdAt: d(365) },
        ],
        loans: [],
        inventory: [
            { id: 'fi1', name: 'Rice (50kg bags)', sku: 'RIC-001', quantity: 4, unit: 'bags', costPrice: 42000, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 3, createdAt: d(30), updatedAt: d(3) },
            { id: 'fi2', name: 'Cooking oil (25L)', sku: 'OIL-001', quantity: 2, unit: 'containers', costPrice: 28000, sellingPrice: 0, category: 'Ingredients', lowStockThreshold: 3, createdAt: d(30), updatedAt: d(3) },
        ],
        invoices: [
            { id: 'fiv1', invoiceNumber: 'INV-012', clientName: 'Adeola Bakare', clientEmail: 'adeola@gmail.com', items: [{ description: 'Wedding catering 150 pax', quantity: 150, unitPrice: 1667, total: 250000 }], subtotal: 250000, tax: 0, total: 250000, status: 'sent', issueDate: d(12), dueDate: d(-3), createdAt: d(12) },
        ],
    },

    // ─── 3. CONSULTING / FREELANCE ────────────────────────────────────────────
    {
        id: 'consulting',
        emoji: '💼',
        name: 'Consulting / Freelance',
        description: 'Professional services & advisory',
        currency: '£',
        businessName: 'Okafor Advisory Ltd',
        transactions: [
            { id: 'c1',  date: d(2),  description: 'Strategy consulting — TechStart Ltd',  type: 'income',  category: 'Consulting',     amount: 3500,  status: 'paid' },
            { id: 'c2',  date: d(5),  description: 'Monthly retainer — BuildCo',           type: 'income',  category: 'Consulting',     amount: 2000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'c3',  date: d(7),  description: 'Home office rent contribution',        type: 'expense', category: 'Rent',            amount: 800,   status: 'paid' },
            { id: 'c4',  date: d(8),  description: 'Financial analysis — PropCo',          type: 'income',  category: 'Consulting',     amount: 1800,  status: 'paid' },
            { id: 'c5',  date: d(10), description: 'LinkedIn Premium & tools',             type: 'expense', category: 'Subscriptions',   amount: 120,   status: 'paid' },
            { id: 'c6',  date: d(12), description: 'Workshop facilitation — NHS Trust',    type: 'income',  category: 'Training',        amount: 2400,  status: 'pending', dueDate: d(-2) },
            { id: 'c7',  date: d(15), description: 'Professional insurance',               type: 'expense', category: 'Insurance',       amount: 350,   status: 'paid' },
            { id: 'c8',  date: d(16), description: 'Market entry report — AfriCorp',       type: 'income',  category: 'Consulting',     amount: 4200,  status: 'paid' },
            { id: 'c9',  date: d(18), description: 'Travel — client meetings',             type: 'expense', category: 'Travel',          amount: 280,   status: 'paid' },
            { id: 'c10', date: d(20), description: 'Accountant fees — quarterly',          type: 'expense', category: 'Professional Fees', amount: 450, status: 'paid' },
            { id: 'c11', date: d(22), description: 'Due diligence project — InvestCo',    type: 'income',  category: 'Consulting',     amount: 5500,  status: 'paid' },
            { id: 'c12', date: d(25), description: 'Phone & broadband',                   type: 'expense', category: 'Utilities',       amount: 85,    status: 'paid' },
            { id: 'c13', date: d(28), description: 'Retainer — GreenTech Startup',        type: 'income',  category: 'Consulting',     amount: 1500,  status: 'pending', dueDate: d(-1) },
        ],
        assets: [
            { id: 'ca1', name: 'MacBook Pro', purchaseCost: 2400, purchaseDate: d(300), category: 'Equipment', depreciationYears: 3, status: 'active', createdAt: d(300) },
            { id: 'ca2', name: 'Office furniture', purchaseCost: 1200, purchaseDate: d(400), category: 'Furniture', depreciationYears: 5, status: 'active', createdAt: d(400) },
        ],
        loans: [],
        inventory: [],
        invoices: [
            { id: 'civ1', invoiceNumber: 'INV-034', clientName: 'NHS Trust', clientEmail: 'procurement@nhs.net', items: [{ description: 'Workshop facilitation — 1 day', quantity: 1, unitPrice: 2400, total: 2400 }], subtotal: 2400, tax: 0, total: 2400, status: 'sent', issueDate: d(12), dueDate: d(-2), createdAt: d(12) },
            { id: 'civ2', invoiceNumber: 'INV-035', clientName: 'GreenTech Startup', clientEmail: 'cfo@greentech.io', items: [{ description: 'Monthly retainer — June', quantity: 1, unitPrice: 1500, total: 1500 }], subtotal: 1500, tax: 0, total: 1500, status: 'sent', issueDate: d(28), dueDate: d(-1), createdAt: d(28) },
        ],
    },

    // ─── 4. IMPORT / EXPORT ───────────────────────────────────────────────────
    {
        id: 'import-export',
        emoji: '📦',
        name: 'Import / Export',
        description: 'Cross-border trading business',
        currency: '₦',
        businessName: 'Balogun Global Traders',
        transactions: [
            { id: 'ie1',  date: d(2),  description: 'Sale — Electronics batch (China)',    type: 'income',  category: 'Sales',          amount: 380000, status: 'paid' },
            { id: 'ie2',  date: d(4),  description: 'Import cost — phones from Shenzhen',  type: 'expense', category: 'Cost of Goods',   amount: 185000, status: 'paid' },
            { id: 'ie3',  date: d(5),  description: 'Sale — Fabric rolls (wholesale)',     type: 'income',  category: 'Sales',          amount: 220000, status: 'paid' },
            { id: 'ie4',  date: d(6),  description: 'Customs & clearing fees',             type: 'expense', category: 'Logistics',       amount: 45000,  status: 'paid' },
            { id: 'ie5',  date: d(8),  description: 'Sale — Kitchen appliances',           type: 'income',  category: 'Sales',          amount: 165000, status: 'pending', dueDate: d(-4) },
            { id: 'ie6',  date: d(10), description: 'Freight & shipping cost',             type: 'expense', category: 'Logistics',       amount: 68000,  status: 'paid' },
            { id: 'ie7',  date: d(12), description: 'Warehouse rent',                      type: 'expense', category: 'Rent',            amount: 80000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'ie8',  date: d(14), description: 'Sale — Shoes batch (wholesale)',      type: 'income',  category: 'Sales',          amount: 290000, status: 'paid' },
            { id: 'ie9',  date: d(16), description: 'Import cost — shoes from Guangzhou',  type: 'expense', category: 'Cost of Goods',   amount: 145000, status: 'paid' },
            { id: 'ie10', date: d(18), description: 'Staff wages x3',                     type: 'expense', category: 'Salaries',        amount: 90000,  status: 'paid' },
            { id: 'ie11', date: d(20), description: 'Sale — Cosmetics bulk order',         type: 'income',  category: 'Sales',          amount: 175000, status: 'paid' },
            { id: 'ie12', date: d(22), description: 'Bank transfer fees (USD to NGN)',     type: 'expense', category: 'Bank Charges',    amount: 12500,  status: 'paid' },
            { id: 'ie13', date: d(25), description: 'Export — Cashew nuts to China',       type: 'income',  category: 'Export Sales',   amount: 450000, status: 'pending', dueDate: d(-7) },
        ],
        assets: [
            { id: 'iea1', name: 'Toyota Hilux (delivery)', purchaseCost: 4500000, purchaseDate: d(400), category: 'Vehicle', depreciationYears: 5, status: 'active', createdAt: d(400) },
            { id: 'iea2', name: 'Warehouse forklift', purchaseCost: 850000, purchaseDate: d(300), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(300) },
        ],
        loans: [
            { id: 'iel1', lenderName: 'GTBank Trade Finance', principal: 2000000, interestRate: 21, termMonths: 18, startDate: d(200), purpose: 'Import financing', status: 'active', payments: [{ id: 'p1', date: d(170), amount: 145000, note: 'Month 1' }, { id: 'p2', date: d(140), amount: 145000, note: 'Month 2' }, { id: 'p3', date: d(110), amount: 145000, note: 'Month 3' }], createdAt: d(200) },
        ],
        inventory: [
            { id: 'iei1', name: 'Samsung phones (units)', sku: 'PHN-001', quantity: 23, unit: 'units', costPrice: 85000, sellingPrice: 125000, category: 'Electronics', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(2) },
            { id: 'iei2', name: 'Fabric rolls (metres)', sku: 'FAB-001', quantity: 180, unit: 'metres', costPrice: 450, sellingPrice: 800, category: 'Textiles', lowStockThreshold: 50, createdAt: d(30), updatedAt: d(5) },
            { id: 'iei3', name: 'Kitchen blenders', sku: 'BLD-001', quantity: 6, unit: 'units', costPrice: 12000, sellingPrice: 22000, category: 'Appliances', lowStockThreshold: 10, createdAt: d(30), updatedAt: d(8) },
        ],
        invoices: [
            { id: 'ieiv1', invoiceNumber: 'INV-089', clientName: 'Sunrise Supermarket', clientEmail: 'buying@sunrise.ng', items: [{ description: 'Kitchen appliances batch', quantity: 15, unitPrice: 11000, total: 165000 }], subtotal: 165000, tax: 0, total: 165000, status: 'sent', issueDate: d(8), dueDate: d(-4), createdAt: d(8) },
        ],
    },

    // ─── 5. CONSTRUCTION / CONTRACTING ───────────────────────────────────────
    {
        id: 'construction',
        emoji: '🏗️',
        name: 'Construction / Contracting',
        description: 'Building, renovation & contracts',
        currency: '₦',
        businessName: 'Emeka Build & Construct',
        transactions: [
            { id: 'b1',  date: d(2),  description: 'Contract payment — Block of flats phase 2', type: 'income',  category: 'Contract Income', amount: 850000, status: 'paid' },
            { id: 'b2',  date: d(4),  description: 'Cement & blocks purchase',                  type: 'expense', category: 'Materials',        amount: 320000, status: 'paid' },
            { id: 'b3',  date: d(5),  description: 'Contract payment — Office renovation',      type: 'income',  category: 'Contract Income', amount: 450000, status: 'paid' },
            { id: 'b4',  date: d(7),  description: 'Labour — site workers x12',                 type: 'expense', category: 'Salaries',         amount: 180000, status: 'paid' },
            { id: 'b5',  date: d(8),  description: 'Rebar & roofing sheets',                    type: 'expense', category: 'Materials',        amount: 245000, status: 'paid' },
            { id: 'b6',  date: d(10), description: 'Milestone payment — Duplex project',        type: 'income',  category: 'Contract Income', amount: 1200000, status: 'pending', dueDate: d(-3) },
            { id: 'b7',  date: d(12), description: 'Equipment hire — concrete mixer',           type: 'expense', category: 'Equipment Hire',   amount: 45000,  status: 'paid' },
            { id: 'b8',  date: d(14), description: 'Office rent',                               type: 'expense', category: 'Rent',             amount: 35000,  status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'b9',  date: d(16), description: 'Plumbing contract — estate',               type: 'income',  category: 'Contract Income', amount: 380000, status: 'paid' },
            { id: 'b10', date: d(18), description: 'Diesel & transport',                        type: 'expense', category: 'Fuel & Transport', amount: 65000,  status: 'paid' },
            { id: 'b11', date: d(20), description: 'Electrical materials',                      type: 'expense', category: 'Materials',        amount: 88000,  status: 'paid' },
            { id: 'b12', date: d(22), description: 'Tiling & finishing — completed job',        type: 'income',  category: 'Contract Income', amount: 295000, status: 'paid' },
            { id: 'b13', date: d(25), description: 'Safety equipment & PPE',                   type: 'expense', category: 'Equipment',        amount: 28000,  status: 'paid' },
        ],
        assets: [
            { id: 'ba1', name: 'Concrete mixer', purchaseCost: 350000, purchaseDate: d(500), category: 'Equipment', depreciationYears: 8, status: 'active', createdAt: d(500) },
            { id: 'ba2', name: 'Toyota pickup truck', purchaseCost: 3800000, purchaseDate: d(600), category: 'Vehicle', depreciationYears: 5, status: 'active', createdAt: d(600) },
            { id: 'ba3', name: 'Scaffolding set', purchaseCost: 420000, purchaseDate: d(400), category: 'Equipment', depreciationYears: 10, status: 'active', createdAt: d(400) },
        ],
        loans: [
            { id: 'bl1', lenderName: 'UBA Business Loan', principal: 3000000, interestRate: 22, termMonths: 24, startDate: d(300), purpose: 'Equipment purchase', status: 'active', payments: [{ id: 'p1', date: d(270), amount: 175000, note: 'Month 1' }, { id: 'p2', date: d(240), amount: 175000, note: 'Month 2' }, { id: 'p3', date: d(210), amount: 175000, note: 'Month 3' }, { id: 'p4', date: d(180), amount: 175000, note: 'Month 4' }], createdAt: d(300) },
        ],
        inventory: [
            { id: 'bi1', name: 'Cement bags', sku: 'CEM-001', quantity: 45, unit: 'bags', costPrice: 5500, sellingPrice: 0, category: 'Materials', lowStockThreshold: 20, createdAt: d(30), updatedAt: d(4) },
            { id: 'bi2', name: 'Rebar bundles', sku: 'REB-001', quantity: 8, unit: 'bundles', costPrice: 48000, sellingPrice: 0, category: 'Materials', lowStockThreshold: 5, createdAt: d(30), updatedAt: d(4) },
        ],
        invoices: [
            { id: 'biv1', invoiceNumber: 'INV-056', clientName: 'Alhaji Musa Properties', clientEmail: 'alhaji@musaproperties.com', items: [{ description: 'Duplex construction — milestone 3', quantity: 1, unitPrice: 1200000, total: 1200000 }], subtotal: 1200000, tax: 0, total: 1200000, status: 'sent', issueDate: d(10), dueDate: d(-3), createdAt: d(10) },
        ],
    },
];
