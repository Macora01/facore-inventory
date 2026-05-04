import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de movements
router.get('/', (_req, res) => res.json({ message: 'Ruta movements — pendiente de implementar' }));

export default router;
