import { Router } from 'express';
import { invoices, projects, transactions } from '../data/mockDb';
import { categorizeTransactions } from '../services/categorization';
import { projectCashFlow, receivablesAging } from '../services/cashFlowForecast';

// "Core Services -> Forecasting" in the architecture diagram.
const router = Router();

router.get('/projection', (req, res) => {
    const totalBalance = projects.reduce((s, p) => s + p.walletBalance, 0);
    const categorized = categorizeTransactions(transactions);
    res.json({
        projections: projectCashFlow(categorized, totalBalance),
        receivablesAging: receivablesAging(invoices),
    });
});

export default router;
