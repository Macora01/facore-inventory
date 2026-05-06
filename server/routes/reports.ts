import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/reports/sales-summary — Ventas agrupadas por período ──
router.get(
  '/sales-summary',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const period = (req.query.period as string) || 'day'; // day | week | month

    let dateFormat: string;
    if (period === 'month') {
      dateFormat = "to_char(m.timestamp::date, 'YYYY-MM')";
    } else if (period === 'week') {
      dateFormat = "to_char(date_trunc('week', m.timestamp::date), 'YYYY-MM-DD')";
    } else {
      dateFormat = "to_char(m.timestamp::date, 'YYYY-MM-DD')";
    }

    const result = await pool.query(`
      SELECT ${dateFormat} as period,
             COUNT(*)::int as "totalSales",
             COALESCE(SUM(m.quantity), 0) as "totalQuantity",
             COALESCE(SUM(m.price * m.quantity), 0) as "totalRevenue",
             COALESCE(SUM(m.cost * m.quantity), 0) as "totalCost"
      FROM movements m
      WHERE m.type = 'SALE'
      GROUP BY period
      ORDER BY period DESC
      LIMIT 90
    `);

    const summary = result.rows.map((r: any) => ({
      period: r.period,
      totalSales: r.totalSales,
      totalQuantity: Number(r.totalQuantity),
      totalRevenue: Number(r.totalRevenue),
      totalCost: Number(r.totalCost),
      margin: Number(r.totalRevenue) - Number(r.totalCost),
    }));

    ok(res, summary);
  })
);

// ── GET /api/reports/top-products — Productos más vendidos ──
router.get(
  '/top-products',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const limit = parseInt((req.query.limit as string) || '15', 10);

    const result = await pool.query(
      `SELECT m.product_id as "productId",
              p.description as "productDescription",
              p.id_fabrica as "factoryId",
              p.category,
              SUM(m.quantity)::numeric as "totalSold",
              SUM(m.price * m.quantity)::numeric as "totalRevenue",
              COUNT(*)::int as "saleCount"
       FROM movements m
       JOIN products p ON m.product_id = p.id_venta
       WHERE m.type = 'SALE'
       GROUP BY m.product_id, p.description, p.id_fabrica, p.category
       ORDER BY "totalSold" DESC
       LIMIT $1`,
      [limit]
    );

    const products = result.rows.map((r: any) => ({
      productId: r.productId,
      productDescription: r.productDescription,
      factoryId: r.factoryId,
      category: r.category,
      totalSold: Number(r.totalSold),
      totalRevenue: Number(r.totalRevenue),
      saleCount: r.saleCount,
    }));

    ok(res, products);
  })
);

// ── GET /api/reports/stock-status — Estado actual del stock ──
router.get(
  '/stock-status',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;

    // ── Productos bajo stock mínimo ──
    const lowStockResult = await pool.query(`
      SELECT p.id_venta as "productId",
             p.description as "productDescription",
             p.id_fabrica as "factoryId",
             p.category,
             p.min_stock as "minStock",
             COALESCE(SUM(s.quantity), 0) as "currentStock",
             l.name as "locationName",
             s.location_id as "locationId",
             s.quantity
      FROM products p
      JOIN stock s ON p.id_venta = s.product_id
      JOIN locations l ON s.location_id = l.id
      WHERE s.quantity > 0
        AND s.quantity <= p.min_stock
      ORDER BY s.quantity ASC
      LIMIT 30
    `);

    // ── Distribución por ubicación ──
    const distributionResult = await pool.query(`
      SELECT l.id as "locationId",
             l.name as "locationName",
             l.type as "locationType",
             COUNT(DISTINCT s.product_id)::int as "productCount",
             COALESCE(SUM(s.quantity), 0) as "totalItems"
      FROM locations l
      LEFT JOIN stock s ON l.id = s.location_id AND s.quantity > 0
      WHERE l.is_active = true
      GROUP BY l.id, l.name, l.type
      ORDER BY "totalItems" DESC
    `);

    // ── Totales generales ──
    const totalsResult = await pool.query(`
      SELECT COUNT(DISTINCT s.product_id)::int as "productsWithStock",
             COALESCE(SUM(s.quantity), 0) as "grandTotal"
      FROM stock s
      WHERE s.quantity > 0
    `);

    const lowStock = lowStockResult.rows.map((r: any) => ({
      productId: r.productId,
      productDescription: r.productDescription,
      factoryId: r.factoryId,
      category: r.category,
      minStock: Number(r.minStock),
      currentStock: Number(r.currentStock),
      locationId: r.locationId,
      locationName: r.locationName,
      quantity: Number(r.quantity),
    }));

    const distribution = distributionResult.rows.map((r: any) => ({
      locationId: r.locationId,
      locationName: r.locationName,
      locationType: r.locationType,
      productCount: r.productCount,
      totalItems: Number(r.totalItems),
    }));

    const totals = totalsResult.rows[0];

    ok(res, {
      lowStock,
      distribution,
      productsWithStock: totals.productsWithStock,
      grandTotal: Number(totals.grandTotal),
    });
  })
);

export default router;
