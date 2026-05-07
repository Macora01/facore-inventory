import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';

import { initDb, getPool } from './config/database.js';
import { applySecurityMiddleware } from './middleware/security.js';
import { authenticateToken } from './middleware/auth.js';
import { globalErrorHandler } from './middleware/errorHandler.js';

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
