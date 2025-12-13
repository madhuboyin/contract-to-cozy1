// apps/backend/src/routes/emergency.routes.ts
import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { emergencyService } from '../services/emergencyTroubleshooter.service';
import { getPropertyContextForAI } from '../services/property.service';

const router = Router();

/**
 * @swagger
 * /api/emergency/start:
 *   post:
 *     summary: Start emergency troubleshooting session
 *     tags: [Emergency]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issue
 *             properties:
 *               issue:
 *                 type: string
 *                 example: "My toilet won't stop running"
 *               propertyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Emergency response
 */
router.post('/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { issue, propertyId } = req.body;
    const userId = req.user!.userId;
    
    if (!issue || typeof issue !== 'string' || issue.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Issue description is required'
      });
    }

    const sessionId = `emergency-${userId}-${Date.now()}`;
    
    // Get property context if propertyId provided
    let propertyContext: string | undefined;
    if (propertyId) {
      const property = await getPropertyContextForAI(propertyId, userId);
      if (property) {
        propertyContext = `${property.address}, ${property.city}, ${property.state}. Built ${property.yearBuilt || 'unknown'}`;
      }
    }
    
    const result = await emergencyService.startEmergency(
      sessionId, 
      issue.trim(), 
      propertyContext
    );
    
    res.json({
      success: true,
      data: {
        sessionId,
        ...result
      }
    });
  } catch (error: any) {
    console.error('Emergency start error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start emergency session'
    });
  }
});

/**
 * @swagger
 * /api/emergency/continue:
 *   post:
 *     summary: Continue emergency troubleshooting session
 *     tags: [Emergency]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - message
 *             properties:
 *               sessionId:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Emergency response
 */
router.post('/continue', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and message are required'
      });
    }
    
    const result = await emergencyService.continueSession(sessionId, message.trim());
    
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Emergency continue error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to continue session'
    });
  }
});

export default router;