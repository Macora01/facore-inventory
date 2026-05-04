import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper para handlers async: captura excepciones y las pasa al error handler de Express.
 * Elimina la necesidad de try/catch en cada ruta.
 *
 * Uso:
 *   router.get('/ruta', asyncHandler(async (req, res) => {
 *     // lógica que puede lanzar errores
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error handler global de Express.
 * Captura cualquier error no manejado y responde con formato consistente.
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Unhandled error:', err.message);

  // Errores conocidos de PostgreSQL
  if ((err as any).code === '23505') {
    // unique_violation
    res.status(409).json({ error: 'El recurso ya existe' });
    return;
  }

  if ((err as any).code === '23503') {
    // foreign_key_violation
    res.status(400).json({ error: 'Referencia inválida — el recurso relacionado no existe' });
    return;
  }

  res.status(500).json({ error: 'Error interno del servidor' });
}
