const express = require('express');

const router = express.Router();

const PNGME_BASE_URL = 'https://api.pngme.com/v1';

/**
 * POST /api/users
 * Register a user with Pngme and return the widget URL for account linking.
 * Expected body: { userId, phoneNumber, firstName, lastName }
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId, phoneNumber, firstName, lastName } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({ error: 'userId and phoneNumber are required' });
    }

    const apiKey = process.env.PNGME_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'PNGME_API_KEY not configured' });
    }

    const response = await fetch(`${PNGME_BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        externalId: userId,
        phoneNumber,
        firstName: firstName || '',
        lastName: lastName || '',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Pngme user creation failed:', errorBody);
      return res.status(response.status).json({ error: 'Failed to register user with Pngme', details: errorBody });
    }

    const pngmeUser = await response.json();

    res.status(201).json({
      userId,
      pngmeUserId: pngmeUser.userId || pngmeUser.id,
      widgetUrl: pngmeUser.widgetUrl || pngmeUser.widget_url || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:userId/connect-url
 * Retrieve the Pngme widget URL for the given user to link their bank accounts.
 */
router.get('/:userId/connect-url', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const apiKey = process.env.PNGME_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'PNGME_API_KEY not configured' });
    }

    const response = await fetch(`${PNGME_BASE_URL}/users/${encodeURIComponent(userId)}/widget-url`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Pngme widget URL fetch failed:', errorBody);
      return res.status(response.status).json({ error: 'Failed to retrieve widget URL', details: errorBody });
    }

    const data = await response.json();

    res.json({
      userId,
      widgetUrl: data.widgetUrl || data.widget_url || data.url,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
