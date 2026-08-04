import { Router } from 'express';
import { BUSINESS_ID, projects } from '../data/mockDb';

// Per-project sub-account discipline: ring-fences funds per project/business
// line so spending on one project can't silently draw down another's cash.
const router = Router();

router.get('/', (req, res) => {
    const businessId = (req.query.businessId as string) || BUSINESS_ID;
    res.json({ projects: projects.filter((p) => p.businessId === businessId) });
});

router.post('/', (req, res) => {
    const { businessId, name } = req.body ?? {};
    if (!businessId || !name) return res.status(400).json({ error: 'businessId and name are required' });
    const project = { id: `proj-${Date.now()}`, businessId, name, walletBalance: 0, createdAt: new Date().toISOString().slice(0, 10) };
    projects.push(project);
    res.status(201).json(project);
});

export default router;
