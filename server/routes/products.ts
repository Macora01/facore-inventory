import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail, notFound } from '../lib/response.js';
import { logAudit } from '../config/database.js';

const router = Router();
router.use(requireDb);

// ── GET /api/products — Listar ──
router.get('/', requireRole('vendedora', 'admin', 'operador', 'visita'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const search = (req.query.search as string || '').trim();
  const lowStock = req.query.lowStock === 'true';
  let query = `SELECT p.*, COALESCE(SUM(s.quantity), 0)::numeric as total_stock FROM products p LEFT JOIN stock s ON s.product_id = p.id_venta`;
  const params: any[] = [];
  const conditions: string[] = [];
  if (search) {
    conditions.push(`(p.id_venta ILIKE $${params.length+1} OR p.description ILIKE $${params.length+2} OR p.id_fabrica ILIKE $${params.length+3})`);
    const q = `%${search}%`; params.push(q, q, q);
  }
  if (lowStock) conditions.push(`p.min_stock IS NOT NULL`);
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY p.id_venta ORDER BY p.description ASC LIMIT 300';
  let rows = (await pool.query(query, params)).rows;
  if (lowStock) rows = rows.filter((r: any) => Number(r.total_stock) <= (Number(r.min_stock) || 0));
  ok(res, rows);
}));

// ── GET /api/products/:id ──
router.get('/:id', requireRole('vendedora', 'admin', 'operador', 'visita'), asyncHandler(async (req: Request, res: Response) => {
  const product = await req.db!.query('SELECT * FROM products WHERE id_venta = $1', [req.params.id]);
  if (product.rows.length === 0) { notFound(res); return; }
  const stock = await req.db!.query('SELECT s.quantity, l.id as location_id, l.name as location_name FROM stock s JOIN locations l ON s.location_id = l.id WHERE s.product_id = $1 AND s.quantity > 0 ORDER BY l.name', [req.params.id]);
  ok(res, { ...product.rows[0], stock: stock.rows });
}));

// ── POST /api/products — Crear ──
router.post('/', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { id_venta, id_fabrica, description, price, cost, min_stock, category, image } = req.body;
  if (!id_venta || !description) { fail(res, 'id_venta y description requeridos'); return; }
  await req.db!.query(
    `INSERT INTO products (id_venta, id_fabrica, description, price, cost, min_stock, category, image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id_venta, id_fabrica||'', description, price||0, cost||0, min_stock||2, category||'', image||null]
  );
  await logAudit('INFO', 'products', `Producto creado: ${id_venta}`);
  ok(res, { id_venta, description }, 201);
}));

// ── PUT /api/products/:id ──
router.put('/:id', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { id_fabrica, description, price, cost, min_stock, category, image } = req.body;
  await req.db!.query(
    `UPDATE products SET id_fabrica=$1,description=$2,price=$3,cost=$4,min_stock=$5,category=$6,image=$7 WHERE id_venta=$8`,
    [id_fabrica||'', description, price||0, cost||0, min_stock||2, category||'', image||null, req.params.id]
  );
  ok(res, { id_venta: req.params.id });
}));

// ── DELETE /api/products/:id ──
router.delete('/:id', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  await req.db!.query('DELETE FROM products WHERE id_venta = $1', [req.params.id]);
  await logAudit('INFO', 'products', `Producto eliminado: ${req.params.id}`);
  ok(res, { deleted: req.params.id });
}));

export default router;
