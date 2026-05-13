import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';

import { initDb, getPool } from './config/database.js';
import { applySecurityMiddleware } from './middleware/security.js';
import { authenticateToken } from './middleware/auth.js';
import { globalErrorHandler, asyncHandler } from './middleware/errorHandler.js';
import { ok, fail } from './lib/response.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import stockRoutes from './routes/stock.js';
import movementRoutes from './routes/movements.js';
import salesRoutes from './routes/sales.js';
import purchaseRoutes from './routes/purchases.js';
import locationRoutes from './routes/locations.js';
import reportRoutes from './routes/reports.js';
import traceabilityRoutes from './routes/traceability.js';
import aiRoutes from './routes/ai.js';
import uploadRoutes from './routes/upload.js';
import settingsRoutes from './routes/settings.js';
import seedRoutes from './routes/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const dbOk = await initDb();
  if (!dbOk) {
    console.warn('⚠️  PostgreSQL no disponible — usando modo fallback JSON');
  }

  const app = express();

  // ── Confiar en proxy (Coolify/Nginx termina SSL) ──
  app.set('trust proxy', 1);

  // ── Seguridad ──
  applySecurityMiddleware(app);

  // ── Parsing ──
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // ── Directorios ──
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const productsDir = path.join(uploadsDir, 'products');
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(productsDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
  app.use('/uploads/products', express.static(productsDir));

  // ── Rutas públicas ──
  app.get('/api/health', async (_req, res) => {
    const pool = getPool();
    let dbStatus = 'disconnected';
    if (pool) {
      try { await pool.query('SELECT 1'); dbStatus = 'connected'; }
      catch { dbStatus = 'error'; }
    }
    res.json({ status: 'ok', database: dbStatus, version: '2.0.0' });
  });

  app.use('/api/auth', authRoutes);

  // ── Rutas protegidas ──
  app.use('/api/products', authenticateToken, productRoutes);
  app.use('/api/stock', authenticateToken, stockRoutes);
  app.use('/api/movements', authenticateToken, movementRoutes);
  app.use('/api/sales', authenticateToken, salesRoutes);
  app.use('/api/purchases', authenticateToken, purchaseRoutes);
  app.use('/api/locations', authenticateToken, locationRoutes);
  app.use('/api/reports', authenticateToken, reportRoutes);
  app.use('/api/traceability', authenticateToken, traceabilityRoutes);
  app.use('/api/ai', authenticateToken, aiRoutes);
  app.use('/api/upload', authenticateToken, uploadRoutes);
  app.use('/api/settings', authenticateToken, settingsRoutes);
  app.use('/api/seed', authenticateToken, seedRoutes);

  // ── POST /api/emergency/init-db — recrear DB desde cero ──
  app.post('/api/emergency/init-db', asyncHandler(async (req: Request, res: Response) => {
    const p = getPool();
    if (!p) return fail(res, 'DB no disponible', 503);
    await p.query('BEGIN');
    try {
      await p.query('TRUNCATE TABLE stock, movements, pending_sales, purchase_order_items, purchase_orders, products, users, locations CASCADE');
      await p.query(`INSERT INTO locations (id, name, type, is_active) VALUES 
        ('BODCENT','Bodega Central','WAREHOUSE',true),
        ('TIENDA1','Tienda Principal','FIXED_STORE_PERMANENT',true),
        ('TIENDA2','Tienda Secundaria','FIXED_STORE_PERMANENT',true),
        ('TEMP1','Tienda Temporal','FIXED_STORE_TEMPORARY',true),
        ('IND1','Tienda Indirecta','INDIRECT_STORE',true),
        ('WEB','Tienda Web','ONLINE_STORE',true),
        ('CASA','Casa','HOME_STORE',true)`);
      const bcrypt = (await import('bcrypt')).default;
      const hash = await bcrypt.hash('Fac0re2026!', 12);
      await p.query("INSERT INTO users (id, username, password, role, display_name) VALUES ('usr-admin','admin',$1,'admin','Administrador')", [hash]);
      await p.query('COMMIT');
      ok(res, { message: 'DB recreada: 7 ubicaciones + admin. Pass: Fac0re2026!' });
    } catch (err: any) {
      await p.query('ROLLBACK');
      fail(res, err.message, 500);
    }
  }));

  // ── POST /api/emergency/delete-bazvlt-sales ──
  app.post('/api/emergency/delete-bazvlt-sales', asyncHandler(async (req: Request, res: Response) => {
    const p = getPool();
    if (!p) return fail(res, 'DB no disponible', 503);
    const r1 = await p.query("DELETE FROM movements WHERE type='SALE' AND from_location_id='BAZVLT'");
    const r2 = await p.query("DELETE FROM pending_sales WHERE location_id='BAZVLT'");
    ok(res, { movementsDeleted: r1.rowCount, pendingSalesDeleted: r2.rowCount });
  }));

  // ── POST /api/emergency/restore-bazvlt-stock ──
  app.post('/api/emergency/restore-bazvlt-stock', asyncHandler(async (req: Request, res: Response) => {
    const p = getPool();
    if (!p) return fail(res, 'DB no disponible', 503);
    const ids = [
      'BI6692MG','BI6675CL','BI6639BD','BI6639BL','BI6639MG','BI6638MG','BI6638MR',
      'BI6635BG','BI6658BG','BI6627BD','BI6619NG','BI6618MG','BI6665BG','BI6622CL',
      'BI6615BD','BI6630BG','BI6628MG','BI6628FG','BI6644FG','BI6646BL','BI6646MG',
      'BI6666NG','BI6713MG'
    ];

    // Una sola query: insertar todo, solo los IDs que existen en products
    const r = await p.query(`
      INSERT INTO stock (product_id, location_id, quantity)
      SELECT id_venta, 'BAZVLT', 1
      FROM products
      WHERE id_venta = ANY($1)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock.quantity + 1, updated_at = NOW()
      RETURNING product_id
    `, [ids]);

    // Verificar
    const v = await p.query(`SELECT COUNT(*)::int as c FROM stock WHERE location_id='BAZVLT' AND quantity > 0`);
    ok(res, {
      inserted: r.rowCount,
      totalInBAZVLT: v.rows[0].c,
      ids: r.rows.map((row: any) => row.product_id)
    });
  }));

  // ── POST /api/emergency/check-bazvlt ──
  app.post('/api/emergency/check-bazvlt', asyncHandler(async (req: Request, res: Response) => {
    const p = getPool();
    if (!p) return fail(res, 'DB no disponible', 503);
    // Insertar un producto de prueba y verificar
    const testId = 'BI6692MG';
    const before = await p.query(`SELECT * FROM stock WHERE product_id=$1 AND location_id='BAZVLT'`, [testId]);
    await p.query(`INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, 'BAZVLT', 1) ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock.quantity + 1, updated_at = NOW()`, [testId]);
    const after = await p.query(`SELECT * FROM stock WHERE product_id=$1 AND location_id='BAZVLT'`, [testId]);
    const all = await p.query(`SELECT product_id, quantity FROM stock WHERE location_id='BAZVLT' LIMIT 5`);
    ok(res, {
      testProduct: testId,
      before: before.rows[0] || null,
      after: after.rows[0] || null,
      first5: all.rows,
      totalRows: (await p.query(`SELECT COUNT(*)::int as c FROM stock WHERE location_id='BAZVLT'`)).rows[0].c
    });
  }));

  // ── Error handler global (debe ir después de las rutas) ──
  app.use(globalErrorHandler);

  // ── Frontend ──
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🧥 Facore Inventory v2.0`);
    console.log(`  ─────────────────────────`);
    console.log(`  Servidor    http://0.0.0.0:${PORT}`);
    console.log(`  Base datos  ${dbOk ? 'PostgreSQL ✓' : 'JSON fallback'}`);
    console.log(`  Entorno     ${process.env.NODE_ENV || 'development'}\n`);
  });
}

startServer().catch(console.error);
