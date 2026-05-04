import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/movements — Historial de movimientos ──
router.get('/', requireRole('vendedora', 'admin', 'operador', 'visita'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const type = req.query.type as string | undefined;
  const productId = req.query.productId as string | undefined;

  let query = `
    SELECT m.*, p.description as "productDescription"
    FROM movements m
    LEFT JOIN products p ON m.product_id = p.id_venta
    WHERE 1=1
  `;
  const params: any[] = [];

  if (type) {
    query += ` AND m.type = $${params.length + 1}`;
    params.push(type);
  }

  if (productId) {
    query += ` AND m.product_id = $${params.length + 1}`;
    params.push(productId);
  }

  query += ' ORDER BY m.timestamp DESC LIMIT 500';

  const result = await pool.query(query, params);
  ok(res, result.rows);
}));

export default router;
