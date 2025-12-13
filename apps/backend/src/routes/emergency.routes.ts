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
    console.log(`[REQUEST] /api/emergency/start by user: ${userId} for property: ${propertyId || 'N/A'}`);
    
    if (!issue || typeof issue !== 'string' || issue.trim().length === 0) {
      console.error(`[REQUEST-ERROR] /api/emergency/start | Invalid issue: ${issue}`);
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
    console.log(`[RESPONSE] /api/emergency/start successful. Session: ${sessionId} | Severity: ${result.severity}`);
    res.json({
      success: true,
      data: {
        sessionId,
        ...result
      }
    });
  } catch (error: any) {
    const userId = (req as AuthRequest).user?.userId || 'N/A';
    console.error(`[ERROR] /api/emergency/start failed for user: ${userId}.`, error);
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
    const userId = req.user!.userId;
    console.log(`[REQUEST] /api/emergency/continue by user: ${userId} for session: ${sessionId}`);
    if (!sessionId || !message) {
      console.error(`[REQUEST-ERROR] /api/emergency/continue | Missing required fields. Session: ${sessionId} | Message: ${message}`);
      return res.status(400).json({
        success: false,
        message: 'Session ID and message are required'
      });
    }
    
    const result = await emergencyService.continueSession(sessionId, message.trim());
    console.log(`[RESPONSE] /api/emergency/continue successful. Session: ${sessionId} | Resolution: ${result.resolution}`);    
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    const userId = (req as AuthRequest).user?.userId || 'N/A';
    console.error(`[ERROR] /api/emergency/continue failed for user: ${userId} and session: ${req.body.sessionId}.`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to continue session'
    });
  }
});

export default router;