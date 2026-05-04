import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de sales
router.get('/', (_req, res) => res.json({ message: 'Ruta sales — pendiente de implementar' }));

export default router;
