import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de purchases
router.get('/', (_req, res) => res.json({ message: 'Ruta purchases — pendiente de implementar' }));

export default router;
