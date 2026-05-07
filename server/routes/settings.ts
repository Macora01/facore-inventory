import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../config/database.js';
import bcrypt from 'bcrypt';

const router = Router();
router.use(requireDb);

// ── Config general ──
router.get('/', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const result = await req.db!.query('SELECT key, value FROM settings ORDER BY key');
  const s: Record<string, string> = {};
  result.rows.forEach((r: any) => { s[r.key] = r.value; });
  ok(res, s);
}));
router.put('/', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  for (const [k, v] of Object.entries(req.body as Record<string, string>)) {
    await req.db!.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [k, v]);
  }
  ok(res, { success: true });
}));

// ═══ CRUD Usuarios ═══
router.get('/users', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  ok(res, (await req.db!.query('SELECT id,username,role,display_name,location_id,created_at FROM users ORDER BY username')).rows);
}));
router.post('/users', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { username, password, role, displayName, locationId } = req.body;
  if (!username || !password || !role) { fail(res, 'username, password, role requeridos'); return; }
  const hash = await bcrypt.hash(password, 12);
  await req.db!.query('INSERT INTO users(id,username,password,role,display_name,location_id) VALUES($1,$2,$3,$4,$5,$6)', [`usr-${Date.now()}`, username, hash, role, displayName||null, locationId||null]);
  ok(res, { username, role }, 201);
}));
router.put('/users/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { username, password, role, displayName, locationId } = req.body;
  if (password) {
    const hash = await bcrypt.hash(password, 12);
    await req.db!.query('UPDATE users SET username=$1,password=$2,role=$3,display_name=$4,location_id=$5 WHERE id=$6', [username,hash,role,displayName||null,locationId||null,req.params.id]);
  } else {
    await req.db!.query('UPDATE users SET username=$1,role=$2,display_name=$3,location_id=$4 WHERE id=$5', [username,role,displayName||null,locationId||null,req.params.id]);
  }
  ok(res, { id: req.params.id });
}));
router.delete('/users/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === 'usr-admin') { fail(res, 'No se puede eliminar al admin', 403); return; }
  await req.db!.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  ok(res, { deleted: req.params.id });
}));

// ═══ CRUD Ubicaciones ═══
router.post('/locations', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id, name, type, address } = req.body;
  if (!id || !name || !type) { fail(res, 'id,name,type requeridos'); return; }
  await req.db!.query('INSERT INTO locations(id,name,type,address) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=$2,type=$3,address=$4', [id,name,type,address||null]);
  ok(res, { id, name }, 201);
}));
router.put('/locations/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { name, type, address, isActive } = req.body;
  await req.db!.query('UPDATE locations SET name=$1,type=$2,address=$3,is_active=$4 WHERE id=$5', [name,type,address||null,isActive!==false,req.params.id]);
  ok(res, { id: req.params.id });
}));
router.delete('/locations/:id', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === 'BODCENT') { fail(res, 'No se puede eliminar BODCENT', 403); return; }
  await req.db!.query('DELETE FROM locations WHERE id=$1', [req.params.id]);
  ok(res, { deleted: req.params.id });
}));

// ═══ Backup / Restore / Clean ═══
const TABLES = ['products','stock','locations','users','movements','pending_sales','purchase_orders','purchase_order_items','settings','audit_logs','factory_images'];

router.post('/backup', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const data: Record<string, any[]> = {};
  for (const t of TABLES) {
    try { data[t] = (await req.db!.query(`SELECT * FROM ${t}`)).rows; } catch { data[t] = []; }
  }
  await logAudit('INFO', 'backup', 'Backup realizado');
  ok(res, { backup: data, timestamp: new Date().toISOString() });
}));

router.post('/restore', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { backup, adminPassword } = req.body;
  if (!adminPassword) { fail(res, 'Password de admin requerido'); return; }
  const user = await req.db!.query("SELECT password FROM users WHERE username='admin'");
  if (!user.rows[0] || !(await bcrypt.compare(adminPassword, user.rows[0].password))) {
    fail(res, 'Password incorrecto', 403); return;
  }
  if (!backup || typeof backup !== 'object') { fail(res, 'backup requerido'); return; }
  for (const t of [...TABLES].reverse()) {
    try { await req.db!.query(`TRUNCATE TABLE ${t} CASCADE`); } catch {}
  }
  for (const t of TABLES) {
    const rows = backup[t];
    if (!rows || !rows.length) continue;
    const cols = Object.keys(rows[0]);
    for (const row of rows) {
      const vals = cols.map(c => row[c]);
      const ph = cols.map((_, i) => `$${i+1}`).join(',');
      try { await req.db!.query(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph})`, vals); } catch {}
    }
  }
  await logAudit('INFO', 'backup', 'Restauración completada');
  ok(res, { message: 'Base de datos restaurada' });
}));

router.post('/clean', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { adminPassword } = req.body;
  if (!adminPassword) { fail(res, 'Password de admin requerido'); return; }
  const username = req.user!.username;
  const user = await req.db!.query('SELECT password FROM users WHERE username = $1', [username]);
  if (!user.rows[0] || !(await bcrypt.compare(adminPassword, user.rows[0].password))) {
    fail(res, 'Password de administrador incorrecto', 403); return;
  }

  const errors: string[] = [];
  for (const t of [...TABLES].reverse()) {
    try { await req.db!.query(`TRUNCATE TABLE ${t} CASCADE`); }
    catch (err: any) { errors.push(`${t}: ${err.message}`); }
  }

  // Recrear lo mínimo indispensable
  await req.db!.query("INSERT INTO locations (id, name, type, is_active) VALUES ('BODCENT','Bodega Central','WAREHOUSE',true)");
  await req.db!.query("INSERT INTO users (id, username, password, role, display_name) VALUES ('usr-admin','admin','$2b$12$YRab5KSThy1/NsRNVnO0/.SYQBl480HYmcWBx2V0QFNFfjNCmK3ZW','admin','Administrador')");

  await logAudit('INFO', 'backup', 'Base de datos limpiada');
  if (errors.length > 0) {
    ok(res, { message: 'Base de datos limpiada con advertencias', warnings: errors });
  } else {
    ok(res, { message: 'Base de datos limpiada completamente' });
  }
}));

export default router;
