import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de settings
router.get('/', (_req, res) => res.json({ message: 'Ruta settings — pendiente de implementar' }));

export default router;
