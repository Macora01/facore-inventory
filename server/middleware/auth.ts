import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'facore-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface JwtPayload {
  userId: string;
  username: string;
  role: 'admin' | 'vendedora';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Genera un token JWT */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(
    payload as object,
    JWT_SECRET,
    { expiresIn: 86400 }
  );
}

/** Middleware: valida el JWT desde cookie o header */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'No autorizado — token requerido' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Middleware: requiere rol específico */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'No tienes permiso para esta acción' });
      return;
    }
    next();
  };
}
