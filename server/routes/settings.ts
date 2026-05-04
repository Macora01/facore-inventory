import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail, notFound } from '../lib/response.js';
import bcrypt from 'bcrypt';

const router = Router();
router.use(requireDb);

// ── GET /api/settings — Configuración general ──
router.get('/', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
  const settings: Record<string, string> = {};
  result.rows.forEach((r: any) => { settings[r.key] = r.value; });
  ok(res, settings);
}));

// ── PUT /api/settings ──
router.put('/', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const data = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(data)) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, value]
    );
  }
  ok(res, { success: true });
}));

// ═══════════════════════════════════════════
// CRUD Usuarios
// ═══════════════════════════════════════════

// GET /api/settings/users
router.get('/users', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const result = await pool.query(
    'SELECT id, username, role, display_name, location_id, created_at FROM users ORDER BY username'
  );
  ok(res, result.rows);
}));

// POST /api/settings/users
router.post('/users', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { username, password, role, displayName, locationId } = req.body;
  if (!username || !password || !role) {
    fail(res, 'Campos requeridos: username, password, role'); return;
  }
  const pool = req.db!;
  const hash = await bcrypt.hash(password, 12);
  const id = `usr-${Date.now()}`;
  await pool.query(
    `INSERT INTO users (id, username, password, role, display_name, location_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, username, hash, role, displayName || null, locationId || null]
  );
  ok(res, { id, username, role }, 201);
}));

// PUT /api/settings/users/:id
router.put('/users/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, password, role, displayName, locationId } = req.body;
  const pool = req.db!;

  if (password) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `UPDATE users SET username=$1, password=$2, role=$3, display_name=$4, location_id=$5 WHERE id=$6`,
      [username, hash, role, displayName || null, locationId || null, id]
    );
  } else {
    await pool.query(
      `UPDATE users SET username=$1, role=$2, display_name=$3, location_id=$4 WHERE id=$5`,
      [username, role, displayName || null, locationId || null, id]
    );
  }
  ok(res, { id, username, role });
}));

// DELETE /api/settings/users/:id
router.delete('/users/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (id === 'usr-admin') { fail(res, 'No se puede eliminar al admin principal', 403); return; }
  const pool = req.db!;
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  ok(res, { deleted: id });
}));

// ═══════════════════════════════════════════
// CRUD Ubicaciones
// ═══════════════════════════════════════════

// POST /api/settings/locations
router.post('/locations', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id, name, type, address } = req.body;
  if (!id || !name || !type) { fail(res, 'Campos requeridos: id, name, type'); return; }
  const pool = req.db!;
  await pool.query(
    `INSERT INTO locations (id, name, type, address) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name=$2, type=$3, address=$4`,
    [id, name, type, address || null]
  );
  ok(res, { id, name, type }, 201);
}));

// PUT /api/settings/locations/:id
router.put('/locations/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, type, address, isActive } = req.body;
  const pool = req.db!;
  await pool.query(
    `UPDATE locations SET name=$1, type=$2, address=$3, is_active=$4 WHERE id=$5`,
    [name, type, address || null, isActive !== false, id]
  );
  ok(res, { id, name, type });
}));

// DELETE /api/settings/locations/:id
router.delete('/locations/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (id === 'BODCENT') { fail(res, 'No se puede eliminar la bodega central', 403); return; }
  const pool = req.db!;
  await pool.query('DELETE FROM locations WHERE id = $1', [id]);
  ok(res, { deleted: id });
}));

export default router;
