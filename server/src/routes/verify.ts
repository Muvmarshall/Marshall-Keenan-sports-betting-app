import { Router } from 'express';
import { verifyFair } from '@parlay/shared';

export const verifyRouter = Router();

/**
 * Public, permanent verification endpoint — not a dev tool. Anyone can confirm
 * the edge math by hand from this response alone; every intermediate value is
 * exposed. See packages/shared/src/verify.ts for the four reference cases this
 * must reproduce exactly, and the /verify page for the same calculator in the UI.
 */
verifyRouter.get('/verify/fair', (req, res) => {
  const over = Number(req.query.over);
  const under = Number(req.query.under);
  const multiplier = Number(req.query.multiplier);

  if (!Number.isFinite(over) || !Number.isFinite(under) || !Number.isFinite(multiplier)) {
    return res.status(400).json({
      error: 'over, under, and multiplier query params are all required and must be numbers.',
      example: '/api/verify/fair?over=-110&under=-110&multiplier=2.00',
    });
  }
  if (multiplier <= 1) {
    return res.status(400).json({ error: 'multiplier must be greater than 1.' });
  }
  if (over === 0 || under === 0) {
    return res.status(400).json({ error: 'over and under cannot be 0.' });
  }

  try {
    res.json(verifyFair({ over, under, multiplier }));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid input.' });
  }
});
