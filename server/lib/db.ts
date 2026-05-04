import { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { getPool } from '../config/database.js';

/**
 * Extiende Express Request con el pool de DB garantizado.
 */
declare global {
  namespace Express {
    interface Request {
      db?: Pool;
    }
  }
}

/**
 * Middleware: inyecta el pool de DB en req.db o rechaza con 503.
 * Usar en rutas que requieran base de datos.
 */
export function requireDb(req: Request, res: Response, next: NextFunction): void {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: 'Base de datos no disponible' });
    return;
  }
  req.db = pool;
  next();
}
