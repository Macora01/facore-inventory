import { Response } from 'express';

/**
 * Respuesta exitosa estandarizada.
 */
export function ok<T = any>(res: Response, data: T, status: number = 200): void {
  res.status(status).json(data);
}

/**
 * Respuesta de error estandarizada.
 * Siempre devuelve { error: string } con el código HTTP indicado.
 */
export function fail(res: Response, message: string, status: number = 400): void {
  res.status(status).json({ error: message });
}

/**
 * Error 404 — recurso no encontrado.
 */
export function notFound(res: Response, message: string = 'Recurso no encontrado'): void {
  fail(res, message, 404);
}

/**
 * Error 503 — base de datos no disponible.
 */
export function dbUnavailable(res: Response): void {
  fail(res, 'Base de datos no disponible', 503);
}
