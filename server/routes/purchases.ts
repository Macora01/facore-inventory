import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, notFound } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/purchases — Órdenes de compra ──
router.get('/', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const status = req.query.status as string | undefined;

  let query = `
    SELECT po.*,
      COALESCE(json_agg(
        json_build_object(
          'productId', poi.product_id,
          'quantityOrdered', poi.quantity_ordered,
          'quantityReceived', poi.quantity_received,
          'unitCost', poi.unit_cost
        )
      ) FILTER (WHERE poi.product_id IS NOT NULL), '[]') as items
    FROM purchase_orders po
    LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (status) {
    conditions.push(`po.status = $${params.length + 1}`);
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY po.id ORDER BY po.created_at DESC LIMIT 100';

  const result = await pool.query(query, params);
  ok(res, result.rows);
}));

export default router;
