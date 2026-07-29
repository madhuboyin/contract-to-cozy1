// apps/backend/src/routes/homeModification.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { PropertyContextAccessDeniedError } from '../modules/propertyContext';
import { createExploration } from '../services/renovationExplore.service';

const router = Router();

/**
 * @swagger
 * /api/modifications/recommend:
 *   post:
 *     summary: Generate AI home modification recommendations
 *     tags: [Home Modifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: string
 *               userNeeds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Modification recommendations generated
 */
router.post('/recommend', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId, userNeeds } = req.body;

    if (!propertyId || !userNeeds || !Array.isArray(userNeeds)) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and userNeeds array are required'
      });
    }

    logger.info({ propertyId }, '[HOME-MODIFICATION] Redirecting legacy recommendation request to durable exploration');
    const report = await createExploration(propertyId, userId, {
      goals: userNeeds,
      responsibilityContext: 'UNKNOWN',
      spacesAffected: [],
      systemsAffected: [],
      accessibilityPreferences: [],
      resiliencePreferences: [],
      efficiencyPreferences: [],
      maintenancePreferences: [],
    });

    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `</api/properties/${propertyId}/renovation-explorations>; rel="successor-version"`);
    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    logger.error({ err: error }, '[HOME-MODIFICATION] Error');
    res.status(error instanceof PropertyContextAccessDeniedError ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to generate recommendations'
    });
  }
});

export default router;
