import { Router } from 'express';
import { projects } from '../data/mockDb';

// Stands in for the "Integration Layer -> Open Banking APIs / Bank Partners"
// box: account aggregation across mobile money wallets, bank accounts and
// POS terminals via Nigeria's Open Banking API standard.
const router = Router();

router.get('/', (req, res) => {
    const businessId = req.query.businessId as string | undefined;
    const result = businessId ? projects.filter((p) => p.businessId === businessId) : projects;
    res.json({ accounts: result, totalBalance: result.reduce((s, p) => s + p.walletBalance, 0) });
});

export default router;
