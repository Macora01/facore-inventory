import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// TODO: Implementar rutas de products
router.get('/', (_req, res) => res.json({ message: 'Ruta products — pendiente de implementar' }));

export default router;
