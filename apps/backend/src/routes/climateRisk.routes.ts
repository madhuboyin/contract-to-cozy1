// apps/backend/src/routes/climateRisk.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { AuthRequest } from '../types/auth.types';
import { climateRiskPredictorService } from '../services/climateRiskPredictor.service';
import { logger } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/climate/analyze/{propertyId}:
 *   get:
 *     summary: Generate AI-powered climate risk analysis
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
 *       200:
 *         description: Climate risk report generated
 */
router.get('/analyze/:propertyId', authenticate, propertyAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    logger.info('[CLIMATE-RISK] Generating report for property:', propertyId);

    const report = await climateRiskPredictorService.generateClimateReport(propertyId, userId);

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    logger.error('[CLIMATE-RISK] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate climate risk report'
    });
  }
});

export default router;