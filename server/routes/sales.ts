import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getPool, logAudit } from '../config/database.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// ── GET /api/sales — Historial de ventas ──
router.get('/', requireRole('vendedora', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    const status = req.query.status as string | undefined;

    let query = `
      SELECT ps.*, p.description as product_description, l.name as location_name
      FROM pending_sales ps
      JOIN products p ON ps.product_id = p.id_venta
      JOIN locations l ON ps.location_id = l.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    // Vendedora solo ve sus propias ventas
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
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error listando ventas:', err);
    res.status(500).json({ error: 'Error al listar ventas' });
  }
});

// ── GET /api/sales/pending — Ventas pendientes de aprobación ──
router.get('/pending', requireRole('vendedora', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

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
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error listando ventas pendientes:', err);
    res.status(500).json({ error: 'Error al listar ventas pendientes' });
  }
});

// ── POST /api/sales — Registrar venta (vendedora) ──
router.post('/', requireRole('vendedora', 'admin'), async (req, res) => {
  try {
    const { productId, locationId, quantity, price } = req.body;
    const sellerUsername = req.user!.username;

    // Validaciones
    if (!productId || !locationId || quantity == null || price == null) {
      res.status(400).json({ error: 'Faltan campos: productId, locationId, quantity, price' });
      return;
    }
    if (quantity <= 0 || price <= 0) {
      res.status(400).json({ error: 'Cantidad y precio deben ser positivos' });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    // Verificar que el producto existe
    const productCheck = await pool.query(
      'SELECT id_venta, description FROM products WHERE id_venta = $1',
      [productId]
    );
    if (productCheck.rows.length === 0) {
      res.status(404).json({ error: `Producto no encontrado: ${productId}` });
      return;
    }

    // Verificar stock disponible
    const stockCheck = await pool.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2',
      [productId, locationId]
    );
    const available = stockCheck.rows[0] ? Number(stockCheck.rows[0].quantity) : 0;
    if (available < quantity) {
      res.status(400).json({
        error: `Stock insuficiente. Disponible: ${available}, solicitado: ${quantity}`,
        available,
        requested: quantity,
      });
      return;
    }

    // Crear venta pendiente
    const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO pending_sales (id, product_id, location_id, quantity, price, seller_username, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [id, productId, locationId, quantity, price, sellerUsername]
    );

    await logAudit('INFO', 'sales', `Venta pendiente creada: ${id}`, {
      productId,
      locationId,
      quantity,
      price,
      sellerUsername,
    });

    res.status(201).json({
      id,
      status: 'pending',
      productId,
      locationId,
      quantity,
      price,
      message: 'Venta registrada — pendiente de aprobación',
    });
  } catch (err: any) {
    console.error('Error creando venta pendiente:', err);
    res.status(500).json({ error: 'Error al registrar la venta' });
  }
});

// ── POST /api/sales/:id/approve — Aprobar venta (admin) ──
router.post('/:id/approve', requireRole('admin'), async (req, res) => {
  const client = await getPool()?.connect();
  if (!client) {
    res.status(503).json({ error: 'Base de datos no disponible' });
    return;
  }

  try {
    const { id } = req.params;

    // Buscar venta pendiente
    const sale = await client.query(
      'SELECT * FROM pending_sales WHERE id = $1 AND status = $2 FOR UPDATE',
      [id, 'pending']
    );
    if (sale.rows.length === 0) {
      res.status(404).json({ error: 'Venta pendiente no encontrada o ya procesada' });
      return;
    }

    const s = sale.rows[0];

    // Verificar stock nuevamente (otra venta pudo haberlo consumido)
    const stockCheck = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2 FOR UPDATE',
      [s.product_id, s.location_id]
    );
    const available = stockCheck.rows[0] ? Number(stockCheck.rows[0].quantity) : 0;
    if (available < Number(s.quantity)) {
      res.status(400).json({
        error: `Stock insuficiente al momento de aprobar. Disponible: ${available}, requerido: ${s.quantity}`,
        available,
        requested: Number(s.quantity),
      });
      return;
    }

    // Transacción
    await client.query('BEGIN');

    // 1. Actualizar pending_sale
    await client.query(
      `UPDATE pending_sales SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [req.user!.username, id]
    );

    // 2. Crear movimiento de tipo SALE
    const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `INSERT INTO movements (id, product_id, from_location_id, quantity, type, timestamp, price, cost, created_by)
       VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7, $8)`,
      [
        movementId,
        s.product_id,
        s.location_id,
        s.quantity,
        new Date().toISOString(),
        s.price,
        0,
        req.user!.username,
      ]
    );

    // 3. Descontar stock
    await client.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = NOW()
       WHERE product_id = $2 AND location_id = $3`,
      [s.quantity, s.product_id, s.location_id]
    );

    await client.query('COMMIT');

    await logAudit('INFO', 'sales', `Venta aprobada: ${id}`, {
      productId: s.product_id,
      quantity: s.quantity,
      movementId,
      approvedBy: req.user!.username,
    });

    res.json({
      id,
      status: 'approved',
      movementId,
      message: 'Venta aprobada — stock descontado',
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error aprobando venta:', err);
    res.status(500).json({ error: 'Error al aprobar la venta' });
  } finally {
    client.release();
  }
});

// ── POST /api/sales/:id/reject — Rechazar venta (admin) ──
router.post('/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    const result = await pool.query(
      `UPDATE pending_sales SET status = 'rejected', approved_by = $1, approved_at = NOW(), notes = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [req.user!.username, notes || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Venta pendiente no encontrada o ya procesada' });
      return;
    }

    await logAudit('INFO', 'sales', `Venta rechazada: ${id}`, {
      rejectedBy: req.user!.username,
      notes: notes || null,
    });

    res.json({ id, status: 'rejected', message: 'Venta rechazada' });
  } catch (err: any) {
    console.error('Error rechazando venta:', err);
    res.status(500).json({ error: 'Error al rechazar la venta' });
  }
});

export default router;
