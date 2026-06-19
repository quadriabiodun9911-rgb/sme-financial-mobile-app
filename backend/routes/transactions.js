const express = require('express');
const { getTransactionsForUser } = require('./pngme');

const router = express.Router();

/**
 * GET /api/transactions/:userId
 * Returns mapped Quad360 transactions for a user.
 * Optional query param: ?since=ISO_DATE — filters transactions on or after the given date.
 */
router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  const { since } = req.query;

  let transactions = getTransactionsForUser(userId);

  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid `since` date format. Use ISO 8601.' });
    }
    transactions = transactions.filter((t) => new Date(t.date) >= sinceDate);
  }

  res.json({ userId, count: transactions.length, transactions });
});

module.exports = router;
