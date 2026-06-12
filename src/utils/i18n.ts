export type Language = 'en' | 'zh';

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
    { code: 'en', label: 'English',              nativeLabel: 'English'  },
    { code: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文'  },
];

const T = {
    en: {
        // Navigation
        dashboard: 'Dashboard', reports: 'Reports', invoices: 'Invoices',
        ledger: 'Ledger', goals: 'Goals', insights: 'Insights', settings: 'Settings',
        assets: 'Assets', growth: 'Growth',

        // Auth / Setup
        appName: 'FinanceBook',
        setupSubtitle: 'Set up your business account',
        loginSubtitle: 'Enter your PIN to continue',
        joinSubtitle: 'Enter the invite code your business owner shared with you',
        email: 'Email', businessName: 'Business Name',
        createPin: 'Create 6-Digit PIN', confirmPin: 'Confirm PIN',
        startFresh: 'Start Fresh', startFreshSub: 'Empty ledger, ready for real data',
        loadDemo: 'Load Demo Data', loadDemoSub: 'Explore with sample transactions',
        createAccount: 'Create Account', unlock: 'Unlock',
        joinTeam: 'Join a Team', joiningTeam: 'Joining a team instead? →',
        backToSignIn: 'Back to sign in',
        yourEmail: 'Your Email', newPin: 'Create PIN (6 digits)',
        inviteCode: 'Invite Code', joinTeamBtn: 'Join Team',
        startingData: 'Starting data',
        preferredCurrency: 'Preferred Currency', preferredLanguage: 'Language',

        // Common actions
        save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
        close: 'Close', back: 'Back', done: 'Done', share: 'Share',
        loading: 'Loading…', error: 'Error', success: 'Success',
        required: 'Required', confirm: 'Confirm', add: 'Add',

        // Dashboard
        totalIncome: 'Income', totalExpenses: 'Expenses',
        netProfit: 'Net Profit', cashBalance: 'Cash Balance', margin: 'margin',
        target: 'target', minReserve: 'Min. reserve',
        reserveOk: 'Reserve OK', belowReserve: 'Below Reserve',
        taxCollected: 'Tax Collected', taxPaid: 'Tax Paid', netTax: 'Net Tax',
        totalAssets: 'Total Assets', totalLiabilities: 'Total Liabilities',
        ownersEquity: "Owner's Equity", assetsMinusLiabilities: 'Assets − Liabilities',
        financialGoals: 'Financial Goals', noGoalsYet: 'No goals set yet — tap to add',
        active: 'active', achieved: 'achieved', needAttention: 'need attention',
        swotAnalysis: 'SWOT Analysis',
        swotSub: 'Live strengths, weaknesses, opportunities & threats',
        viewDetailedReports: 'View Detailed Reports',
        fullInsights: 'Full Insights →',
        overdueAlert: 'overdue item(s) — tap to view AR/AP Aging',

        // Settings
        businessType: 'Business Type', currency: 'Currency', language: 'Language',
        financialThresholds: 'Financial Thresholds', taxSettings: 'Tax Settings',
        openingBalance: 'Opening Balance Sheet', changePin: 'Change PIN',
        currentPin: 'Current PIN', newPinLabel: 'New PIN', confirmNewPin: 'Confirm New PIN',
        updatePin: 'Update PIN', dataManagement: 'Data Management',
        exportData: 'Export All Data', importData: 'Import Data',
        teamManagement: 'Team Management', dangerZone: 'Danger Zone',
        clearAllData: 'Clear All Data', saveSettings: 'Save Settings',

        // Transaction statuses
        income: 'Income', expense: 'Expense',
        paid: 'Paid', pending: 'Pending', overdue: 'Overdue',

        // Goal statuses
        onTrack: 'On Track', atRisk: 'At Risk', offTrack: 'Off Track',

        // Invoices
        newInvoice: '+ New Invoice', outstanding: 'Outstanding', sent: 'Sent', draft: 'Draft',
        markPaid: 'Mark Paid', clientName: 'Client Name', clientEmail: 'Client Email',
        clientAddress: 'Client Address', dueDate: 'Due Date', notes: 'Notes',
        lineItems: 'Line Items', saveAndSend: 'Save & Mark as Sent',
        saveAsDraft: 'Save as Draft', shareInvoice: 'Share Invoice',

        // Assets
        assetRegister: 'Asset Register',
        addAsset: '+ Add Asset',
        assetName: 'Asset Name',
        assetCategory: 'Category',
        assetDescription: 'Description (optional)',
        purchaseDate: 'Purchase Date (YYYY-MM-DD)',
        purchaseCost: 'Purchase Cost',
        usefulLife: 'Useful Life (years)',
        residualValue: 'Residual Value',
        currentValue: 'Current Value',
        accumulated: 'Accumulated Depreciation',
        annualDepreciation: 'Annual Depreciation',
        disposeAsset: 'Dispose Asset',
        disposalDate: 'Disposal Date (YYYY-MM-DD)',
        disposalValue: 'Disposal / Sale Value',
        confirmDispose: 'Confirm Disposal',
        assetDisposed: 'Disposed',
        totalActiveValue: 'Total Active Asset Value',
        noAssetsYet: 'No assets registered yet — tap + to add',
        categoryEquipment: 'Equipment',
        categoryVehicle: 'Vehicle',
        categoryFurniture: 'Furniture',
        categoryProperty: 'Property',
        categoryIntangible: 'Intangible',
        categoryOther: 'Other',

        // Alerts
        pinMismatch: 'PINs do not match.',
        incorrectPin: 'The PIN you entered is incorrect.',
        invalidPin: 'PIN must be exactly 6 digits.',
        missingFields: 'Missing fields',
        currencyChangeTitle: 'Currency Change',
        currencyChangeWarning: 'Changing currency only updates the symbol — it does not convert your existing amounts. All historical figures will display in the new currency symbol.',
        permissionDenied: 'Permission Denied',
        accountantPermission: 'Accountants can view and export data but cannot make changes.',
        staffPermission: 'Staff can add transactions only.',
    },

    zh: {
        dashboard: '仪表板', reports: '报告', invoices: '发票',
        ledger: '账本', goals: '目标', insights: '洞察', settings: '设置',
        assets: '资产', growth: '增长',

        appName: 'FinanceBook',
        setupSubtitle: '设置您的企业账户',
        loginSubtitle: '输入PIN码继续',
        joinSubtitle: '输入您的业务所有者分享的邀请码',
        email: '电子邮件', businessName: '企业名称',
        createPin: '创建6位PIN码', confirmPin: '确认PIN码',
        startFresh: '从零开始', startFreshSub: '空账本，准备输入真实数据',
        loadDemo: '加载演示数据', loadDemoSub: '使用样本交易探索',
        createAccount: '创建账户', unlock: '解锁',
        joinTeam: '加入团队', joiningTeam: '加入团队？→',
        backToSignIn: '返回登录',
        yourEmail: '您的电子邮件', newPin: '创建PIN码（6位数字）',
        inviteCode: '邀请码', joinTeamBtn: '加入团队',
        startingData: '初始数据',
        preferredCurrency: '首选货币', preferredLanguage: '语言',

        save: '保存', cancel: '取消', delete: '删除', edit: '编辑',
        close: '关闭', back: '返回', done: '完成', share: '分享',
        loading: '加载中…', error: '错误', success: '成功',
        required: '必填', confirm: '确认', add: '添加',

        totalIncome: '收入', totalExpenses: '支出',
        netProfit: '净利润', cashBalance: '现金余额', margin: '利润率',
        target: '目标', minReserve: '最低准备金',
        reserveOk: '准备金充足', belowReserve: '低于准备金',
        taxCollected: '已收税款', taxPaid: '已付税款', netTax: '净税额',
        totalAssets: '总资产', totalLiabilities: '总负债',
        ownersEquity: '所有者权益', assetsMinusLiabilities: '资产 − 负债',
        financialGoals: '财务目标', noGoalsYet: '尚未设定目标 — 点击添加',
        active: '进行中', achieved: '已达成', needAttention: '需要关注',
        swotAnalysis: 'SWOT分析',
        swotSub: '实时优势、劣势、机会和威胁',
        viewDetailedReports: '查看详细报告',
        fullInsights: '完整洞察 →',
        overdueAlert: '逾期项目 — 点击查看AR/AP账龄',

        businessType: '企业类型', currency: '货币', language: '语言',
        financialThresholds: '财务阈值', taxSettings: '税务设置',
        openingBalance: '期初资产负债表', changePin: '修改PIN码',
        currentPin: '当前PIN码', newPinLabel: '新PIN码', confirmNewPin: '确认新PIN码',
        updatePin: '更新PIN码', dataManagement: '数据管理',
        exportData: '导出所有数据', importData: '导入数据',
        teamManagement: '团队管理', dangerZone: '危险区域',
        clearAllData: '清除所有数据', saveSettings: '保存设置',

        income: '收入', expense: '支出',
        paid: '已付', pending: '待处理', overdue: '逾期',
        onTrack: '正常', atRisk: '有风险', offTrack: '偏离',

        newInvoice: '+ 新发票', outstanding: '未收款', sent: '已发送', draft: '草稿',
        markPaid: '标记已付', clientName: '客户名称', clientEmail: '客户邮箱',
        clientAddress: '客户地址', dueDate: '截止日期', notes: '备注',
        lineItems: '明细项目', saveAndSend: '保存并发送',
        saveAsDraft: '保存为草稿', shareInvoice: '分享发票',

        assetRegister: '资产登记册',
        addAsset: '+ 添加资产',
        assetName: '资产名称',
        assetCategory: '类别',
        assetDescription: '描述（可选）',
        purchaseDate: '购买日期（YYYY-MM-DD）',
        purchaseCost: '购买成本',
        usefulLife: '使用年限（年）',
        residualValue: '残值',
        currentValue: '当前价值',
        accumulated: '累计折旧',
        annualDepreciation: '年折旧额',
        disposeAsset: '处置资产',
        disposalDate: '处置日期（YYYY-MM-DD）',
        disposalValue: '处置/出售价值',
        confirmDispose: '确认处置',
        assetDisposed: '已处置',
        totalActiveValue: '在用资产总价值',
        noAssetsYet: '尚未登记资产 — 点击+添加',
        categoryEquipment: '设备',
        categoryVehicle: '车辆',
        categoryFurniture: '家具',
        categoryProperty: '房产',
        categoryIntangible: '无形资产',
        categoryOther: '其他',

        pinMismatch: 'PIN码不匹配。',
        incorrectPin: '您输入的PIN码不正确。',
        invalidPin: 'PIN码必须是6位数字。',
        missingFields: '缺少必填项',
        currencyChangeTitle: '货币变更',
        currencyChangeWarning: '更改货币仅更新符号，不会转换现有金额。所有历史数据将显示新的货币符号。',
        permissionDenied: '权限不足',
        accountantPermission: '会计只能查看和导出数据，不能进行更改。',
        staffPermission: '员工只能添加交易记录。',
    },
} as const;

export type TranslationKey = keyof typeof T['en'];

export function t(lang: Language, key: TranslationKey): string {
    return ((T[lang] as any)?.[key] ?? T['en'][key] ?? key) as string;
}
