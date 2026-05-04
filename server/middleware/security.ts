import { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

export function applySecurityMiddleware(app: Express): void {
  // Helmet (headers de seguridad)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite lo maneja en dev
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS restrictivo
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS no permitido'));
        }
      },
      credentials: true,
    })
  );

  // Rate limiting en login
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 5,
    message: { error: 'Demasiados intentos. Espera un minuto.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/login', loginLimiter);

  // Rate limiting general en API
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);
}
