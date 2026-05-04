import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de stock
router.get('/', (_req, res) => res.json({ message: 'Ruta stock — pendiente de implementar' }));

export default router;
