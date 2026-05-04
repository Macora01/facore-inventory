import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getPool, isDatabaseActive, logAudit } from '../config/database.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import type { JwtPayload } from '../middleware/auth.js';

const router = Router();

/** POST /api/auth/login */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    return;
  }

  const pool = getPool();
  if (!pool || !isDatabaseActive()) {
    res.status(503).json({ error: 'Base de datos no disponible' });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password, role, display_name FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      await logAudit('WARNING', 'AUTH', `Intento fallido: usuario ${username}`);
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      await logAudit('WARNING', 'AUTH', `Contraseña incorrecta: ${username}`);
      res.status(401).json({ error: 'Credenciales incorrectas' });
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
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    await logAudit('INFO', 'AUTH', `Login exitoso: ${username}`);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
      },
      token, // también en body para flexibilidad
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

/** POST /api/auth/logout */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ success: true });
});

/** GET /api/auth/me — datos del usuario actual */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.json({ user: req.user });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, username, role, display_name, location_id FROM users WHERE id = $1',
      [req.user!.userId]
    );
    if (result.rows.length > 0) {
      const u = result.rows[0];
      res.json({
        user: {
          id: u.id,
          username: u.username,
          role: u.role,
          displayName: u.display_name,
          locationId: u.location_id,
        },
      });
    } else {
      res.json({ user: req.user });
    }
  } catch {
    res.json({ user: req.user });
  }
});

export default router;
