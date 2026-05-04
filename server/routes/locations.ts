import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── GET /api/locations — Listar ubicaciones ──
router.get('/', requireRole('vendedora', 'admin', 'operador', 'visita'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  const result = await pool.query(
    'SELECT id, name, type, address, is_active as "isActive" FROM locations WHERE is_active = true ORDER BY name'
  );
  ok(res, result.rows);
}));

export default router;
