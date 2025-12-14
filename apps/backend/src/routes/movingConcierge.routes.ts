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

/**
 * @swagger
 * /api/moving-concierge/save-plan:
 *   post:
 *     summary: Save moving plan
 *     tags: [Moving Concierge]
 *     security:
 *       - bearerAuth: []
 */
router.post('/save-plan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId, planData } = req.body;

    if (!propertyId || !planData) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and planData are required'
      });
    }

    await movingConciergeService.saveMovingPlan(propertyId, userId, planData);

    res.json({
      success: true,
      message: 'Moving plan saved successfully'
    });

  } catch (error: any) {
    console.error('[MOVING-CONCIERGE] Save error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save moving plan'
    });
  }
});

/**
 * @swagger
 * /api/moving-concierge/get-plan/{propertyId}:
 *   get:
 *     summary: Get saved moving plan
 *     tags: [Moving Concierge]
 *     security:
 *       - bearerAuth: []
 */
router.get('/get-plan/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    const plan = await movingConciergeService.getMovingPlan(propertyId, userId);

    res.json({
      success: true,
      data: plan
    });

  } catch (error: any) {
    console.error('[MOVING-CONCIERGE] Get plan error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get moving plan'
    });
  }
});

/**
 * @swagger
 * /api/moving-concierge/update-tasks:
 *   post:
 *     summary: Update completed tasks
 *     tags: [Moving Concierge]
 *     security:
 *       - bearerAuth: []
 */
router.post('/update-tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId, completedTaskIds } = req.body;

    if (!propertyId || !Array.isArray(completedTaskIds)) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and completedTaskIds array are required'
      });
    }

    await movingConciergeService.updateCompletedTasks(
      propertyId,
      userId,
      completedTaskIds
    );

    res.json({
      success: true,
      message: 'Completed tasks updated successfully'
    });

  } catch (error: any) {
    console.error('[MOVING-CONCIERGE] Update tasks error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update completed tasks'
    });
  }
});

/**
 * @swagger
 * /api/moving-concierge/delete-plan/{propertyId}:
 *   delete:
 *     summary: Delete moving plan
 *     tags: [Moving Concierge]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/delete-plan/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    await movingConciergeService.deleteMovingPlan(propertyId, userId);

    res.json({
      success: true,
      message: 'Moving plan deleted successfully'
    });

  } catch (error: any) {
    console.error('[MOVING-CONCIERGE] Delete error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete moving plan'
    });
  }
});

export default router;