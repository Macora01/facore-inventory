import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── Helper: parsea ?locations=a,b,c → string[] ──
function parseLocations(query: any): string[] | null {
  const raw = query.locations as string | undefined;
  if (!raw) return null;
  const ids = raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

// ── Helper: agrega IN ($1, $2, ...) a partir de params.length ──
function addLocFilter(
  conditions: string[],
  params: any[],
  column: string,
  locationIds: string[],
): void {
  const base = params.length + 1;
  const placeholders = locationIds.map((_, i) => `$${base + i}`).join(', ');
  conditions.push(`${column} IN (${placeholders})`);
  params.push(...locationIds);
}

// ── GET /api/reports/sales-summary — Ventas agrupadas por período ──
router.get(
  '/sales-summary',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const period = (req.query.period as string) || 'day';
    const dateFrom = req.query.from as string | undefined;
    const dateTo = req.query.to as string | undefined;
    const locationIds = parseLocations(req.query);

    let dateFormat: string;
    if (period === 'month') {
      dateFormat = "to_char(m.timestamp::date, 'YYYY-MM')";
    } else if (period === 'week') {
      dateFormat = "to_char(date_trunc('week', m.timestamp::date), 'YYYY-MM-DD')";
    } else {
      dateFormat = "to_char(m.timestamp::date, 'YYYY-MM-DD')";
    }

    const conditions: string[] = ["m.type = 'SALE'"];
    const params: any[] = [];

    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`m.timestamp::date >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`m.timestamp::date <= $${params.length}`);
    }
    if (locationIds) {
      addLocFilter(conditions, params, 'm.location_id', locationIds);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query(`
      SELECT ${dateFormat} as period,
             COUNT(*)::int as "totalSales",
             COALESCE(SUM(m.quantity), 0) as "totalQuantity",
             COALESCE(SUM(m.price * m.quantity), 0) as "totalRevenue",
             COALESCE(SUM(m.cost * m.quantity), 0) as "totalCost"
      FROM movements m
      WHERE ${whereClause}
      GROUP BY period
      ORDER BY period DESC
      LIMIT 90
    `, params);

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
    const locationIds = parseLocations(req.query);

    const conditions: string[] = ["m.type = 'SALE'"];
    const params: any[] = [limit];

    if (locationIds) {
      addLocFilter(conditions, params, 'm.location_id', locationIds);
    }

    const whereClause = conditions.join(' AND ');

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
       WHERE ${whereClause}
       GROUP BY m.product_id, p.description, p.id_fabrica, p.category
       ORDER BY "totalSold" DESC
       LIMIT $1`,
      params
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
    const locationIds = parseLocations(req.query);

    // ── Productos bajo stock mínimo ──
    let lowQuery = `
      SELECT p.id_venta as "productId",
             p.description as "productDescription",
             p.id_fabrica as "factoryId",
             p.category,
             p.min_stock as "minStock",
             s.quantity as "currentStock",
             l.name as "locationName",
             s.location_id as "locationId",
             s.quantity
      FROM products p
      JOIN stock s ON p.id_venta = s.product_id
      JOIN locations l ON s.location_id = l.id
      WHERE s.quantity > 0
        AND s.quantity <= p.min_stock`;
    const lowParams: any[] = [];
    if (locationIds) {
      const base = lowParams.length + 1;
      const ph = locationIds.map((_, i) => `$${base + i}`).join(', ');
      lowQuery += ` AND s.location_id IN (${ph})`;
      lowParams.push(...locationIds);
    }
    lowQuery += ' ORDER BY s.quantity ASC LIMIT 30';
    const lowStockResult = await pool.query(lowQuery, lowParams);

    // ── Distribución por ubicación ──
    let distQuery = `
      SELECT l.id as "locationId",
             l.name as "locationName",
             l.type as "locationType",
             COUNT(DISTINCT s.product_id)::int as "productCount",
             COALESCE(SUM(s.quantity), 0) as "totalItems"
      FROM locations l
      LEFT JOIN stock s ON l.id = s.location_id AND s.quantity > 0
      WHERE l.is_active = true`;
    const distParams: any[] = [];
    if (locationIds) {
      const base = distParams.length + 1;
      const ph = locationIds.map((_, i) => `$${base + i}`).join(', ');
      distQuery += ` AND l.id IN (${ph})`;
      distParams.push(...locationIds);
    }
    distQuery += ' GROUP BY l.id, l.name, l.type ORDER BY "totalItems" DESC';
    const distributionResult = await pool.query(distQuery, distParams);

    // ── Totales generales ──
    let totalsQuery = `
      SELECT COUNT(DISTINCT s.product_id)::int as "productsWithStock",
             COALESCE(SUM(s.quantity), 0) as "grandTotal"
      FROM stock s
      WHERE s.quantity > 0`;
    const totalsParams: any[] = [];
    if (locationIds) {
      const base = totalsParams.length + 1;
      const ph = locationIds.map((_, i) => `$${base + i}`).join(', ');
      totalsQuery += ` AND s.location_id IN (${ph})`;
      totalsParams.push(...locationIds);
    }
    const totalsResult = await pool.query(totalsQuery, totalsParams);

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

// ── GET /api/reports/stock-detail — Detalle completo de stock por ubicación ──
router.get(
  '/stock-detail',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const locationIds = parseLocations(req.query);

    let query = `
      SELECT p.id_venta as "productId",
             p.description as "productDescription",
             p.id_fabrica as "factoryId",
             p.category,
             p.min_stock as "minStock",
             p.price,
             p.cost,
             s.quantity,
             l.name as "locationName",
             s.location_id as "locationId"
      FROM stock s
      JOIN products p ON s.product_id = p.id_venta
      JOIN locations l ON s.location_id = l.id
      WHERE s.quantity > 0`;
    const params: any[] = [];

    if (locationIds) {
      const base = params.length + 1;
      const ph = locationIds.map((_, i) => `$${base + i}`).join(', ');
      query += ` AND s.location_id IN (${ph})`;
      params.push(...locationIds);
    }

    query += ' ORDER BY s.quantity DESC, p.description ASC';

    const result = await pool.query(query, params);

    const items = result.rows.map((r: any) => ({
      productId: r.productId,
      productDescription: r.productDescription,
      factoryId: r.factoryId,
      category: r.category,
      minStock: Number(r.minStock),
      price: Number(r.price),
      cost: Number(r.cost),
      quantity: Number(r.quantity),
      locationName: r.locationName,
      locationId: r.locationId,
    }));

    ok(res, items);
  })
);

// ── GET /api/reports/dashboard-summary — Datos agregados para el Dashboard ──
router.get(
  '/dashboard-summary',
  requireRole('admin', 'operador', 'visita'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;

    // Totales
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products)::int as "totalProducts",
        (SELECT COALESCE(SUM(quantity), 0) FROM stock WHERE quantity > 0) as "totalStock",
        (SELECT COUNT(*)::int FROM movements WHERE type = 'SALE'
         AND timestamp::date >= CURRENT_DATE - INTERVAL '30 days') as "sales30d",
        (SELECT COALESCE(SUM(price * quantity), 0) FROM movements WHERE type = 'SALE'
         AND timestamp::date >= CURRENT_DATE - INTERVAL '30 days') as "revenue30d",
        (SELECT COALESCE(SUM(cost * quantity), 0) FROM movements WHERE type = 'SALE'
         AND timestamp::date >= CURRENT_DATE - INTERVAL '30 days') as "cost30d",
        (SELECT COUNT(*)::int FROM pending_sales WHERE status = 'pending') as "pendingCount",
        (SELECT COUNT(*)::int FROM products p
         WHERE (SELECT COALESCE(SUM(s.quantity), 0) FROM stock s WHERE s.product_id = p.id_venta) <= p.min_stock
        ) as "lowStockCount"
    `);

    // Costo del inventario actual
    const inventoryCost = await pool.query(`
      SELECT COALESCE(SUM(p.cost * s.quantity), 0) as "totalCost",
             COALESCE(SUM(p.price * s.quantity), 0) as "totalValue"
      FROM stock s
      JOIN products p ON s.product_id = p.id_venta
      WHERE s.quantity > 0
    `);

    // Distribución stock por tipo de ubicación
    const stockDistribution = await pool.query(`
      SELECT
        CASE
          WHEN l.type = 'WAREHOUSE' THEN 'Bodega'
          ELSE 'Tiendas'
        END as category,
        SUM(s.quantity)::numeric as quantity
      FROM stock s
      JOIN locations l ON s.location_id = l.id
      WHERE s.quantity > 0 AND l.is_active = true
      GROUP BY
        CASE WHEN l.type = 'WAREHOUSE' THEN 'Bodega' ELSE 'Tiendas' END
      ORDER BY quantity DESC
    `);

    // Ventas últimos 7 días
    const sales7d = await pool.query(`
      SELECT m.timestamp::date as fecha,
             COUNT(*)::int as ventas,
             SUM(m.quantity)::numeric as unidades,
             SUM(m.price * m.quantity)::numeric as ingresos
      FROM movements m
      WHERE m.type = 'SALE'
        AND m.timestamp::date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY m.timestamp::date
      ORDER BY fecha
    `);

    const t = totals.rows[0];
    const c = inventoryCost.rows[0];
    const revenue = Number(t.revenue30d);
    const cost = Number(t.cost30d);
    const revenueNeto = Math.round(revenue / 1.19);
    const marginNeto = revenueNeto - cost;

    ok(res, {
      totalProducts: t.totalProducts,
      totalStock: Number(t.totalStock),
      sales30d: t.sales30d,
      revenue30d: revenue,
      cost30d: cost,
      pendingCount: t.pendingCount,
      lowStockCount: t.lowStockCount,
      inventoryCost: Number(c.totalCost),
      inventoryValue: Number(c.totalValue),
      margin30d: revenue - cost,
      marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      revenueNeto,
      marginNeto,
      marginNetoPercent: revenueNeto > 0 ? Math.round((marginNeto / revenueNeto) * 100) : 0,
      // ── Proyecciones de venta del inventario actual SIN IVA ──
      inventoryValueNeto: Math.round(Number(c.totalValue) / 1.19),
      projected100: Math.round((Number(c.totalValue) / 1.19) - Number(c.totalCost)),
      projected95: Math.round(((Number(c.totalValue) / 1.19) - Number(c.totalCost)) * 0.95),
      projected90: Math.round(((Number(c.totalValue) / 1.19) - Number(c.totalCost)) * 0.90),
      stockDistribution: stockDistribution.rows.map((r: any) => ({
        category: r.category,
        quantity: Number(r.quantity),
      })),
      sales7d: sales7d.rows.map((r: any) => ({
        fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
        ventas: r.ventas,
        unidades: Number(r.unidades),
        ingresos: Number(r.ingresos),
      })),
    });
  })
);

export default router;
