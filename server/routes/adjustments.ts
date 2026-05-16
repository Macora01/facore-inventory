import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';

const router = Router();
router.use(requireDb);
router.use(authenticateToken);

// ── POST /api/adjustments — Ajuste manual de stock ──
router.post(
  '/',
  requireRole('admin', 'operador'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const { productId, locationId, quantity, type, reason } = req.body;

    // ── Validaciones ──
    if (!productId || !locationId || !quantity || !type) {
      return fail(res, 'Faltan campos: productId, locationId, quantity, type');
    }

    if (!['ADJUSTMENT_OUT', 'ADJUSTMENT_IN'].includes(type)) {
      return fail(res, 'Tipo inválido. Usar ADJUSTMENT_OUT o ADJUSTMENT_IN');
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return fail(res, 'Cantidad debe ser un número positivo');
    }

    if (!reason || !String(reason).trim()) {
      return fail(res, 'El motivo es obligatorio');
    }

    // ── Verificar que el producto existe ──
    const prod = await pool.query(
      'SELECT id_venta FROM products WHERE id_venta = $1',
      [productId]
    );
    if (prod.rows.length === 0) {
      return fail(res, `Producto "${productId}" no encontrado`, 404);
    }

    // ── Verificar que la ubicación existe ──
    const loc = await pool.query(
      'SELECT id FROM locations WHERE id = $1',
      [locationId]
    );
    if (loc.rows.length === 0) {
      return fail(res, `Ubicación "${locationId}" no encontrada`, 404);
    }

    // ── Transacción ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Crear movimiento
      const movId = `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timestamp = new Date().toISOString();
      const createdBy = (req as any).user?.username || 'admin';

      await client.query(
        `INSERT INTO movements (id, product_id, from_location_id, to_location_id, quantity, type, reason, timestamp, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          movId,
          productId,
          type === 'ADJUSTMENT_OUT' ? locationId : null,
          type === 'ADJUSTMENT_IN' ? locationId : null,
          qty,
          type,
          reason.trim(),
          timestamp,
          createdBy,
        ]
      );

      // Actualizar stock
      const stockDelta = type === 'ADJUSTMENT_OUT' ? -qty : qty;
      const stockResult = await client.query(
        `INSERT INTO stock (product_id, location_id, quantity)
         VALUES ($1, $2, GREATEST($3, 0))
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET quantity = GREATEST(stock.quantity + $3, 0), updated_at = NOW()
         RETURNING quantity`,
        [productId, locationId, stockDelta]
      );

      const newStock = stockResult.rows[0]?.quantity ?? 0;

      await client.query('COMMIT');

      ok(res, {
        movementId: movId,
        productId,
        locationId,
        type,
        quantity: qty,
        reason: reason.trim(),
        newStock: Number(newStock),
        timestamp,
      }, 201);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

export default router;
