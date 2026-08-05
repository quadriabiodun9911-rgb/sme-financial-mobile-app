import React, { createContext, useContext, useMemo, useState } from 'react';
import { mockDebtRecords, mockInvoices, mockProjects, mockTransactions, mockUser } from '../data/mockData';
import { categorizeTransactions } from '../services/categorization';
import { computeCreditReadinessScore, DocumentChecklist } from '../services/creditScore';
import { buildCashFlowAlerts, projectCashFlow, receivablesAging } from '../services/cashFlowForecast';
import { CreditReadinessResult, Project, Screen, Transaction, User } from '../types';

interface AppContextValue {
    user: User | null;
    isAuthenticated: boolean;
    login: () => void;
    logout: () => void;
    currentScreen: Screen;
    setCurrentScreen: (screen: Screen) => void;
    transactions: Transaction[];
    projects: Project[];
    activeProjectId: string | 'all';
    setActiveProjectId: (id: string | 'all') => void;
    creditResult: CreditReadinessResult;
    documentChecklist: DocumentChecklist;
    toggleDocument: (key: keyof DocumentChecklist) => void;
    totalBalance: number;
    cashFlowProjections: ReturnType<typeof projectCashFlow>;
    cashFlowAlerts: ReturnType<typeof buildCashFlowAlerts>;
    agingReceivables: ReturnType<typeof receivablesAging>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentScreen, setCurrentScreen] = useState<Screen>('onboarding');
    const [activeProjectId, setActiveProjectId] = useState<string | 'all'>('all');
    const [documentChecklist, setDocumentChecklist] = useState<DocumentChecklist>({
        hasTaxFilings: true,
        hasBankStatements: true,
        hasBusinessRegistration: false,
        hasFinancialStatements: false,
    });

    const transactions = useMemo(() => categorizeTransactions(mockTransactions), []);
    const projects = mockProjects;

    const filteredTransactions = useMemo(
        () => (activeProjectId === 'all' ? transactions : transactions.filter((tx) => tx.projectId === activeProjectId)),
        [transactions, activeProjectId],
    );

    const totalBalance = useMemo(() => projects.reduce((sum, p) => sum + p.walletBalance, 0), [projects]);

    const creditResult = useMemo(
        () => computeCreditReadinessScore(transactions, mockInvoices, mockDebtRecords, documentChecklist),
        [transactions, documentChecklist],
    );

    const cashFlowProjections = useMemo(() => projectCashFlow(transactions, totalBalance), [transactions, totalBalance]);
    const agingReceivables = useMemo(() => receivablesAging(mockInvoices), []);
    const cashFlowAlerts = useMemo(
        () => buildCashFlowAlerts(cashFlowProjections, mockInvoices, 14),
        [cashFlowProjections],
    );

    const toggleDocument = (key: keyof DocumentChecklist) => {
        setDocumentChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const value: AppContextValue = {
        user: isAuthenticated ? mockUser : null,
        isAuthenticated,
        login: () => {
            setIsAuthenticated(true);
            setCurrentScreen('dashboard');
        },
        logout: () => {
            setIsAuthenticated(false);
            setCurrentScreen('onboarding');
        },
        currentScreen,
        setCurrentScreen,
        transactions: filteredTransactions,
        projects,
        activeProjectId,
        setActiveProjectId,
        creditResult,
        documentChecklist,
        toggleDocument,
        totalBalance,
        cashFlowProjections,
        cashFlowAlerts,
        agingReceivables,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
