import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de upload
router.get('/', (_req, res) => res.json({ message: 'Ruta upload — pendiente de implementar' }));

export default router;
