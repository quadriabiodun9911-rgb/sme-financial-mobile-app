import { Router } from 'express';
import { BUSINESS_ID, debtRecords, documentChecklists, invoices, lenderShares, transactions } from '../data/mockDb';
import { categorizeTransactions } from '../services/categorization';
import { computeCreditReadinessScore } from '../services/creditScoreEngine';

// "Core Services -> Reporting" + "Integration Layer -> Lender APIs" in the
// architecture diagram: generates a lender-ready report and shares the
// business's Credit Readiness Score with a connected lender/fintech.
const router = Router();

router.post('/share', (req, res) => {
    const { businessId, lenderId } = req.body ?? {};
    if (!businessId || !lenderId) return res.status(400).json({ error: 'businessId and lenderId are required' });
    lenderShares.push({ businessId, lenderId, sharedAt: new Date().toISOString() });
    res.status(201).json({ shared: true, businessId, lenderId });
});

router.get('/report', (req, res) => {
    const businessId = (req.query.businessId as string) || BUSINESS_ID;
    const docs = documentChecklists[businessId] ?? documentChecklists[BUSINESS_ID];
    const categorized = categorizeTransactions(transactions);
    const creditReadiness = computeCreditReadinessScore(businessId, categorized, invoices, debtRecords, docs);
    res.json({
        businessId,
        generatedAt: new Date().toISOString(),
        creditReadiness,
        outstandingReceivables: invoices.filter((inv) => !inv.paid).reduce((s, inv) => s + inv.amount, 0),
        activeLoans: debtRecords.filter((d) => d.active).length,
    });
});

export default router;
