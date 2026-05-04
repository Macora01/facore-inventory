import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de reports
router.get('/', (_req, res) => res.json({ message: 'Ruta reports — pendiente de implementar' }));

export default router;
