import { Router } from 'express';
import { pool } from '../db/pool.js';

export const slipsRouter = Router();

interface SlipLegBody {
  propId: number;
  side: 'over' | 'under';
  multiplierAtAdd: number;
  edgeAtAdd: number;
}

slipsRouter.post('/slips', async (req, res) => {
  const { clientId, mode, legs, combinedMultiplier, estProbability, estEv } = req.body as {
    clientId: string;
    mode: 'edge' | 'lottery';
    legs: SlipLegBody[];
    combinedMultiplier: number;
    estProbability: number;
    estEv: number;
  };

  if (!clientId || !mode || !Array.isArray(legs) || legs.length === 0) {
    return res.status(400).json({ error: 'clientId, mode, and at least one leg are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO slips (user_id, mode, combined_multiplier, est_probability, est_ev)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [clientId, mode, combinedMultiplier, estProbability, estEv],
    );
    const slipId = rows[0].id;

    for (const leg of legs) {
      await client.query(
        `INSERT INTO slip_legs (slip_id, prop_id, side, multiplier_at_add, edge_at_add)
         VALUES ($1, $2, $3, $4, $5)`,
        [slipId, leg.propId, leg.side, leg.multiplierAtAdd, leg.edgeAtAdd],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ slipId, createdAt: rows[0].created_at });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

slipsRouter.get('/slips', async (req, res) => {
  const clientId = req.query.clientId as string;
  if (!clientId) return res.status(400).json({ error: 'clientId is required' });

  const { rows: slips } = await pool.query(
    `SELECT id, mode, created_at, combined_multiplier, est_probability, est_ev
     FROM slips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [clientId],
  );

  res.json({
    slips: slips.map((s) => ({
      id: s.id,
      mode: s.mode,
      createdAt: s.created_at,
      combinedMultiplier: Number(s.combined_multiplier),
      estProbability: Number(s.est_probability),
      estEv: Number(s.est_ev),
    })),
  });
});
