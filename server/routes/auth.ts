import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { logAudit } from '../config/database.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';
import type { JwtPayload } from '../middleware/auth.js';

const router = Router();

/** POST /api/auth/login */
router.post('/login', requireDb, asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    fail(res, 'Usuario y contraseña requeridos');
    return;
  }

  const pool = req.db!;
  const result = await pool.query(
    'SELECT id, username, password, role, display_name FROM users WHERE username = $1',
    [username]
  );

  if (result.rows.length === 0) {
    await logAudit('WARNING', 'AUTH', `Intento fallido: usuario ${username}`);
    fail(res, 'Credenciales incorrectas', 401);
    return;
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    await logAudit('WARNING', 'AUTH', `Contraseña incorrecta: ${username}`);
    fail(res, 'Credenciales incorrectas', 401);
    return;
  }

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  const token = generateToken(payload);

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  await logAudit('INFO', 'AUTH', `Login exitoso: ${username}`);

  ok(res, {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
    },
    token,
  });
}));

/** POST /api/auth/logout */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  ok(res, { success: true });
});

/** GET /api/auth/me — datos del usuario actual */
router.get('/me', authenticateToken, requireDb, asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;
  try {
    const result = await pool.query(
      'SELECT id, username, role, display_name, location_id FROM users WHERE id = $1',
      [req.user!.userId]
    );
    if (result.rows.length > 0) {
      const u = result.rows[0];
      ok(res, {
        user: {
          id: u.id,
          username: u.username,
          role: u.role,
          displayName: u.display_name,
          locationId: u.location_id,
        },
      });
    } else {
      ok(res, { user: req.user });
    }
  } catch {
    // Si falla la DB, devolvemos lo que tenemos del JWT
    ok(res, { user: req.user });
  }
}));

export default router;
