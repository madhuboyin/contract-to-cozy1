import { Router, type Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types/auth.types';
import { getToolDiscoveryAvailability } from '../services/toolDiscoveryAvailability.service';

const router = Router();

router.get('/tool-discovery/availability', authenticate, (req: AuthRequest, res: Response): void => {
  res.status(200).json({
    success: true,
    data: getToolDiscoveryAvailability(req.user?.userId),
  });
});

export default router;
