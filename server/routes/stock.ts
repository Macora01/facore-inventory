import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/stock — Todo el stock ──
router.get('/', requireRole('vendedora', 'admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const locationId = req.query.locationId as string | undefined;

  let query = `
    SELECT s.product_id as "productId", s.location_id as "locationId", s.quantity,
           l.name as "locationName"
    FROM stock s
    JOIN locations l ON s.location_id = l.id
    WHERE s.quantity > 0
  `;
  const params: any[] = [];

  if (locationId) {
    query += ` AND s.location_id = $${params.length + 1}`;
    params.push(locationId);
  }

  query += ' ORDER BY l.name, s.product_id';

  const result = await pool.query(query, params);
  ok(res, result.rows);
}));

export default router;
