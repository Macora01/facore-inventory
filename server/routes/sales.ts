import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail, notFound } from '../lib/response.js';
import { logAudit } from '../config/database.js';

const router = Router();

// Todas las rutas requieren autenticación y DB
router.use(authenticateToken);
router.use(requireDb);

// ── GET /api/sales — Historial de ventas ──
router.get('/', requireRole('vendedora', 'admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const status = req.query.status as string | undefined;

  let query = `
    SELECT ps.*, p.description as product_description, l.name as location_name
    FROM pending_sales ps
    JOIN products p ON ps.product_id = p.id_venta
    JOIN locations l ON ps.location_id = l.id
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (req.user!.role === 'vendedora') {
    conditions.push(`ps.seller_username = $${params.length + 1}`);
    params.push(req.user!.username);
  }

  if (status) {
    conditions.push(`ps.status = $${params.length + 1}`);
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY ps.created_at DESC LIMIT 200';

  const result = await pool.query(query, params);
  ok(res, result.rows);
}));

// ── GET /api/sales/pending — Ventas pendientes ──
router.get('/pending', requireRole('vendedora', 'admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;

  let query = `
    SELECT ps.*, p.description as product_description, l.name as location_name
    FROM pending_sales ps
    JOIN products p ON ps.product_id = p.id_venta
    JOIN locations l ON ps.location_id = l.id
    WHERE ps.status = 'pending'
  `;
  const params: any[] = [];

  if (req.user!.role === 'vendedora') {
    query += ' AND ps.seller_username = $1';
    params.push(req.user!.username);
  }

  query += ' ORDER BY ps.created_at DESC';

  const result = await pool.query(query, params);
  ok(res, result.rows);
}));

// ── POST /api/sales — Registrar venta ──
router.post('/', requireRole('vendedora', 'admin'), asyncHandler(async (req: Request, res: Response) => {
  const { productId, locationId, quantity, price } = req.body;
  const sellerUsername = req.user!.username;

  if (!productId || !locationId || quantity == null || price == null) {
    fail(res, 'Faltan campos: productId, locationId, quantity, price');
    return;
  }
  if (quantity <= 0 || price <= 0) {
    fail(res, 'Cantidad y precio deben ser positivos');
    return;
  }

  const pool = req.db!;

  // Verificar producto
  const productCheck = await pool.query(
    'SELECT id_venta FROM products WHERE id_venta = $1',
    [productId]
  );
  if (productCheck.rows.length === 0) {
    notFound(res, `Producto no encontrado: ${productId}`);
    return;
  }

  // Verificar stock
  const stockCheck = await pool.query(
    'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2',
    [productId, locationId]
  );
  const available = stockCheck.rows[0] ? Number(stockCheck.rows[0].quantity) : 0;
  if (available < quantity) {
    fail(res, `Stock insuficiente. Disponible: ${available}, solicitado: ${quantity}`);
    return;
  }

  const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO pending_sales (id, product_id, location_id, quantity, price, seller_username, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [id, productId, locationId, quantity, price, sellerUsername]
  );

  await logAudit('INFO', 'sales', `Venta pendiente: ${id}`, { productId, quantity, sellerUsername });

  ok(res, {
    id, status: 'pending', productId, locationId, quantity, price,
    message: 'Venta registrada — pendiente de aprobación',
  }, 201);
}));

// ── POST /api/sales/:id/approve — Aprobar venta ──
router.post('/:id/approve', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = req.db!;
  const client = await pool.connect();

  try {
    const sale = await client.query(
      'SELECT * FROM pending_sales WHERE id = $1 AND status = $2 FOR UPDATE',
      [id, 'pending']
    );
    if (sale.rows.length === 0) {
      notFound(res, 'Venta pendiente no encontrada o ya procesada');
      return;
    }

    const s = sale.rows[0];

    // Verificar stock con lock
    const stockCheck = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2 FOR UPDATE',
      [s.product_id, s.location_id]
    );
    const available = stockCheck.rows[0] ? Number(stockCheck.rows[0].quantity) : 0;
    if (available < Number(s.quantity)) {
      fail(res, `Stock insuficiente. Disponible: ${available}, requerido: ${s.quantity}`);
      return;
    }

    await client.query('BEGIN');

    // 1. Actualizar venta
    await client.query(
      `UPDATE pending_sales SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [req.user!.username, id]
    );

    // 2. Movimiento SALE
    const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `INSERT INTO movements (id, product_id, from_location_id, quantity, type, timestamp, price, cost, created_by)
       VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7, $8)`,
      [movementId, s.product_id, s.location_id, s.quantity, new Date().toISOString(), s.price, 0, req.user!.username]
    );

    // 3. Descontar stock
    await client.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = NOW()
       WHERE product_id = $2 AND location_id = $3`,
      [s.quantity, s.product_id, s.location_id]
    );

    await client.query('COMMIT');

    await logAudit('INFO', 'sales', `Venta aprobada: ${id}`, {
      productId: s.product_id, quantity: s.quantity, movementId, approvedBy: req.user!.username,
    });

    ok(res, { id, status: 'approved', movementId, message: 'Venta aprobada — stock descontado' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // el asyncHandler lo captura
  } finally {
    client.release();
  }
}));

// ── POST /api/sales/:id/reject — Rechazar venta ──
router.post('/:id/reject', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;
  const pool = req.db!;

  const result = await pool.query(
    `UPDATE pending_sales SET status = 'rejected', approved_by = $1, approved_at = NOW(), notes = $2
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [req.user!.username, notes || null, id]
  );

  if (result.rows.length === 0) {
    notFound(res, 'Venta pendiente no encontrada o ya procesada');
    return;
  }

  await logAudit('INFO', 'sales', `Venta rechazada: ${id}`, {
    rejectedBy: req.user!.username, notes: notes || null,
  });

  ok(res, { id, status: 'rejected', message: 'Venta rechazada' });
}));

export default router;
