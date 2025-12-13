// apps/backend/src/routes/budgetForecaster.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { budgetForecasterService } from '../services/budgetForecaster.service';

const router = Router();

/**
 * @swagger
 * /api/budget/forecast/{propertyId}:
 *   get:
 *     summary: Generate 12-month maintenance budget forecast
 *     tags: [Budget Forecaster]
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
 *         description: Budget forecast generated
 */
router.get('/forecast/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    console.log('[BUDGET-FORECASTER] Generating forecast for property:', propertyId);

    const forecast = await budgetForecasterService.generateBudgetForecast(propertyId, userId);

    res.json({
      success: true,
      data: forecast
    });

  } catch (error: any) {
    console.error('[BUDGET-FORECASTER] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate forecast'
    });
  }
});

export default router;