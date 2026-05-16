import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail, notFound } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/traceability/:productId — Trazabilidad completa de un producto ──
router.get(
  '/:productId',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const { productId } = req.params;

    // ── 1. Buscar producto ──
    const prodResult = await pool.query(
      'SELECT * FROM products WHERE id_venta = $1 OR id_fabrica = $1',
      [productId]
    );

    if (prodResult.rows.length === 0) {
      return notFound(res, `Producto "${productId}" no encontrado`);
    }

    const product = prodResult.rows[0];
    const idVenta = product.id_venta;

    // ── 2. Historial de movimientos (LIFO: más reciente primero) ──
    const movResult = await pool.query(
      `SELECT m.*, p.description as "productDescription"
       FROM movements m
       LEFT JOIN products p ON m.product_id = p.id_venta
       WHERE m.product_id = $1
       ORDER BY m.timestamp DESC, m.id DESC`,
      [idVenta]
    );

    const history = movResult.rows;

    // ── 3. Totales ──
    // totalPurchased: INITIAL_LOAD + PURCHASE (entradas externas, no transferencias)
    // totalAdjustments: ADJUSTMENT_IN - ADJUSTMENT_OUT (neto)
    const totalsResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('INITIAL_LOAD', 'PURCHASE') THEN quantity ELSE 0 END), 0) as "totalPurchased",
         COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) as "totalSold",
         COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT_IN' THEN quantity ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT_OUT' THEN quantity ELSE 0 END), 0) as "totalAdjustments"
       FROM movements
       WHERE product_id = $1`,
      [idVenta]
    );

    const { totalPurchased, totalSold, totalAdjustments } = totalsResult.rows[0];

    // ── 4. Stock por ubicación ──
    const stockResult = await pool.query(
      `SELECT s.location_id as "locationId", l.name as "locationName", s.quantity
       FROM stock s
       JOIN locations l ON s.location_id = l.id
       WHERE s.product_id = $1 AND s.quantity > 0
       ORDER BY s.quantity DESC`,
      [idVenta]
    );

    const stockByLocation = stockResult.rows.map((r: any) => ({
      locationId: r.locationId,
      locationName: r.locationName,
      quantity: Number(r.quantity),
    }));

    const totalInStock = stockByLocation.reduce(
      (sum: number, s: any) => sum + s.quantity,
      0
    );

    // ── 5. Ventas por ubicación con porcentaje ──
    const salesResult = await pool.query(
      `SELECT m.to_location_id as "locationId", l.name as "locationName",
              SUM(m.quantity) as quantity
       FROM movements m
       JOIN locations l ON m.to_location_id = l.id
       WHERE m.product_id = $1 AND m.type = 'SALE'
       GROUP BY m.to_location_id, l.name
       ORDER BY quantity DESC`,
      [idVenta]
    );

    const totalSalesQty = salesResult.rows.reduce(
      (sum: number, r: any) => sum + Number(r.quantity),
      0
    );

    const salesByLocation = salesResult.rows.map((r: any) => ({
      locationId: r.locationId,
      locationName: r.locationName,
      quantity: Number(r.quantity),
      percentage:
        totalSalesQty > 0
          ? Math.round((Number(r.quantity) / totalSalesQty) * 100)
          : 0,
    }));

    ok(res, {
      product: {
        id_venta: product.id_venta,
        id_fabrica: product.id_fabrica,
        description: product.description,
        price: Number(product.price),
        cost: Number(product.cost),
        minStock: product.min_stock ? Number(product.min_stock) : undefined,
        category: product.category,
        image: product.image,
      },
      totalPurchased: Number(totalPurchased),
      totalInStock: Number(totalInStock),
      totalSold: Number(totalSold),
      totalAdjustments: Number(totalAdjustments),
      stockByLocation,
      salesByLocation,
      history: history.map((m: any) => ({
        id: m.id,
        productId: m.product_id,
        fromLocationId: m.from_location_id,
        toLocationId: m.to_location_id,
        quantity: Number(m.quantity),
        type: m.type,
        reason: m.reason,
        timestamp: m.timestamp,
        relatedFile: m.related_file,
        price: m.price ? Number(m.price) : undefined,
        cost: m.cost ? Number(m.cost) : undefined,
        createdBy: m.created_by,
        productDescription: m.productDescription,
      })),
    });
  })
);

export default router;
