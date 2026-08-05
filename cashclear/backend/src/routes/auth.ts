import { Router } from 'express';

// Stands in for the "User Auth & Consent Management" service in the
// architecture diagram (OAuth2 + NDPR-compliant consent). Demo-only: issues
// a static token instead of a real OAuth2 flow.
const router = Router();

router.post('/login', (req, res) => {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    res.json({
        token: 'demo-token',
        businessId: 'biz-obi-fresh-foods',
        user: { email, name: 'Amaka Obi', businessName: 'Obi Fresh Foods' },
    });
});

// Open Banking consent grant, modeled on NIBSS's Open Banking Consent
// Management System (OBCMS). Records that the business authorized CashClear
// to pull account data from a given institution for a bounded scope/duration.
router.post('/consent', (req, res) => {
    const { businessId, institution, scope, durationDays } = req.body ?? {};
    if (!businessId || !institution || !scope) {
        return res.status(400).json({ error: 'businessId, institution and scope are required' });
    }
    res.status(201).json({
        consentId: `consent-${Date.now()}`,
        businessId,
        institution,
        scope,
        expiresAt: new Date(Date.now() + (durationDays ?? 90) * 24 * 60 * 60 * 1000).toISOString(),
        status: 'granted',
    });
});

export default router;
