// apps/backend/src/routes/movingConcierge.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { movingConciergeService } from '../services/movingConcierge.service';

const router = Router();

/**
 * @swagger
 * /api/moving-concierge/generate-plan:
 *   post:
 *     summary: Generate AI-powered moving plan (HOME_BUYER only)
 *     tags: [Moving Concierge]
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
 *               closingDate:
 *                 type: string
 *                 format: date
 *               currentAddress:
 *                 type: string
 *               newAddress:
 *                 type: string
 *               homeSize:
 *                 type: number
 *               numberOfRooms:
 *                 type: number
 *               familySize:
 *                 type: number
 *               hasPets:
 *                 type: boolean
 *               hasValuableItems:
 *                 type: boolean
 *               movingDistance:
 *                 type: string
 *                 enum: [LOCAL, LONG_DISTANCE, CROSS_COUNTRY]
 *               specialRequirements:
 *                 type: string
 *     responses:
 *       200:
 *         description: Moving plan generated
 *       403:
 *         description: Only available for HOME_BUYER users
 */
router.post('/generate-plan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      propertyId,
      closingDate,
      currentAddress,
      newAddress,
      homeSize,
      numberOfRooms,
      familySize,
      hasPets,
      hasValuableItems,
      movingDistance,
      specialRequirements,
    } = req.body;

    if (!propertyId || !closingDate) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and closingDate are required'
      });
    }

    console.log('[MOVING-CONCIERGE] Generating moving plan for property:', propertyId);

    const plan = await movingConciergeService.generateMovingPlan(
      propertyId,
      userId,
      {
        closingDate,
        currentAddress: currentAddress || '',
        newAddress: newAddress || '',
        homeSize: parseInt(homeSize) || 2000,
        numberOfRooms: parseInt(numberOfRooms) || 3,
        familySize: parseInt(familySize) || 2,
        hasPets: hasPets === true || hasPets === 'true',
        hasValuableItems: hasValuableItems === true || hasValuableItems === 'true',
        movingDistance: movingDistance || 'LOCAL',
        specialRequirements,
      }
    );

    res.json({
      success: true,
      data: plan
    });

  } catch (error: any) {
    console.error('[MOVING-CONCIERGE] Error:', error);
    
    // Special handling for user type error
    if (error.message.includes('only available for home buyers')) {
      return res.status(403).json({
        success: false,
        message: 'Moving Concierge is only available for home buyers'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate moving plan'
    });
  }
});

export default router;