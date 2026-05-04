import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/settings — Obtener todas las configuraciones ──
router.get('/', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
  const settings: Record<string, string> = {};
  result.rows.forEach((r: any) => { settings[r.key] = r.value; });
  ok(res, settings);
}));

// ── PUT /api/settings — Guardar configuraciones ──
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

export default router;
