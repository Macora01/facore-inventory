import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de locations
router.get('/', (_req, res) => res.json({ message: 'Ruta locations — pendiente de implementar' }));

export default router;
