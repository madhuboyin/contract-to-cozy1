// apps/backend/src/routes/climateRisk.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';

const router = Router();
const ENVIRONMENT_REPORT_ROUTE = '/dashboard/properties/[propertyId]/environment-report';

/**
 * @swagger
 * /api/climate/analyze/{propertyId}:
 *   get:
 *     summary: Retired climate-risk analysis endpoint
 *     tags: [Climate Risk]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       410:
 *         description: Standalone climate-risk analysis has been retired
 */
router.get('/analyze/:propertyId', authenticate, propertyAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { propertyId } = req.params;
  const redirectTo = ENVIRONMENT_REPORT_ROUTE.replace('[propertyId]', propertyId);

  logger.warn(
    { propertyId, userId: req.user!.userId, redirectTo },
    '[CLIMATE-RISK] Blocked retired standalone climate-risk output',
  );

  res.status(410).json({
    success: false,
    code: 'CLIMATE_RISK_RETIRED',
    message:
      'Standalone climate-risk scoring is unavailable because the prior estimates were not grounded in reviewed property-appropriate sources.',
    redirectTo,
  });
});

export default router;
