import { Router } from 'express';
import { BUSINESS_ID, debtRecords, documentChecklists, invoices, transactions } from '../data/mockDb';
import { categorizeTransactions } from '../services/categorization';
import { computeCreditReadinessScore } from '../services/creditScoreEngine';

// "Core Services -> Scoring Engine" in the architecture diagram: the
// proprietary Credit Readiness Score across the 5 pillars.
const router = Router();

router.get('/', (req, res) => {
    const businessId = (req.query.businessId as string) || BUSINESS_ID;
    const docs = documentChecklists[businessId] ?? documentChecklists[BUSINESS_ID];
    const categorized = categorizeTransactions(transactions);
    const result = computeCreditReadinessScore(businessId, categorized, invoices, debtRecords, docs);
    res.json(result);
});

router.patch('/documents', (req, res) => {
    const businessId = (req.body?.businessId as string) || BUSINESS_ID;
    const updates = req.body?.updates ?? {};
    documentChecklists[businessId] = { ...(documentChecklists[businessId] ?? documentChecklists[BUSINESS_ID]), ...updates };
    res.json(documentChecklists[businessId]);
});

export default router;
