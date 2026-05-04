import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail, notFound } from '../lib/response.js';

const router = Router();

router.use(requireDb);

// ── GET /api/products — Listar productos con búsqueda y stock ──
router.get('/', requireRole('vendedora', 'admin', 'operador', 'visita'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const search = (req.query.search as string || '').trim();
  const lowStock = req.query.lowStock === 'true';

  let query = `
    SELECT 
      p.*,
      COALESCE(SUM(s.quantity), 0)::numeric as total_stock
    FROM products p
    LEFT JOIN stock s ON s.product_id = p.id_venta
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (search) {
    conditions.push(
      `(p.id_venta ILIKE $${params.length + 1} OR p.description ILIKE $${params.length + 2} OR p.id_fabrica ILIKE $${params.length + 3})`
    );
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  if (lowStock) {
    conditions.push(`p.min_stock IS NOT NULL`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY p.id_venta ORDER BY p.description ASC LIMIT 300';

  const result = await pool.query(query, params);

  // Si pidió solo stock bajo, filtrar en memoria
  let rows = result.rows;
  if (lowStock) {
    rows = rows.filter((r: any) => Number(r.total_stock) <= (Number(r.min_stock) || 0));
  }

  ok(res, rows);
}));

// ── GET /api/products/:id — Detalle con stock por ubicación ──
router.get('/:id', requireRole('vendedora', 'admin', 'operador', 'visita'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const { id } = req.params;

  const product = await pool.query('SELECT * FROM products WHERE id_venta = $1', [id]);
  if (product.rows.length === 0) {
    notFound(res, `Producto no encontrado: ${id}`);
    return;
  }

  const stock = await pool.query(
    `SELECT s.quantity, l.id as location_id, l.name as location_name
     FROM stock s
     JOIN locations l ON s.location_id = l.id
     WHERE s.product_id = $1 AND s.quantity > 0
     ORDER BY l.name`,
    [id]
  );

  ok(res, {
    ...product.rows[0],
    stock: stock.rows,
  });
}));

export default router;
