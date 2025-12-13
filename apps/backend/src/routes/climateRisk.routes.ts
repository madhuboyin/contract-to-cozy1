// apps/backend/src/routes/climateRisk.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { climateRiskPredictorService } from '../services/climateRiskPredictor.service';

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
router.get('/analyze/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    console.log('[CLIMATE-RISK] Generating report for property:', propertyId);

    const report = await climateRiskPredictorService.generateClimateReport(propertyId, userId);

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('[CLIMATE-RISK] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate climate risk report'
    });
  }
});

export default router;