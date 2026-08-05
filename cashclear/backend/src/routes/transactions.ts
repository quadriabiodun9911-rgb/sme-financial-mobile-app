import { Router } from 'express';
import { transactions } from '../data/mockDb';
import { categorizeTransactions } from '../services/categorization';

// "Core Services -> Categorization" in the architecture diagram.
const router = Router();

router.get('/', (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const categorized = categorizeTransactions(transactions);
    const result = projectId ? categorized.filter((tx) => tx.projectId === projectId) : categorized;
    res.json({ transactions: result, commingledCount: result.filter((tx) => tx.isCommingled).length });
});

export default router;
