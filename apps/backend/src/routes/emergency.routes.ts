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
 * /api/emergency/chat:
 *   post:
 *     summary: Chat with emergency troubleshooter (stateless)
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
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *                 example:
 *                   - role: user
 *                     content: "My toilet won't stop running"
 *                   - role: assistant
 *                     content: "This is likely a flapper valve issue..."
 *                   - role: user
 *                     content: "How do I fix it?"
 *               propertyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Emergency response
 */
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messages, propertyId } = req.body;
    const userId = req.user!.userId;
    
    console.log(`[REQUEST] /api/emergency/chat by user: ${userId} | Messages: ${messages?.length || 0} | Property: ${propertyId || 'N/A'}`);
    
    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error(`[REQUEST-ERROR] /api/emergency/chat | Invalid messages array`);
      return res.status(400).json({
        success: false,
        message: 'Messages array is required and must not be empty'
      });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        console.error(`[REQUEST-ERROR] /api/emergency/chat | Invalid message format`);
        return res.status(400).json({
          success: false,
          message: 'Each message must have role and content'
        });
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        console.error(`[REQUEST-ERROR] /api/emergency/chat | Invalid role: ${msg.role}`);
        return res.status(400).json({
          success: false,
          message: 'Message role must be either "user" or "assistant"'
        });
      }
    }
    
    // Get property context if propertyId provided
    let propertyContext: string | undefined;
    if (propertyId) {
      const property = await getPropertyContextForAI(propertyId, userId);
      if (property) {
        propertyContext = `${property.address}, ${property.city}, ${property.state}. Built ${property.yearBuilt || 'unknown'}`;
      }
    }
    
    const result = await emergencyService.chat(messages, propertyContext);
    
    console.log(`[RESPONSE] /api/emergency/chat successful | Severity: ${result.severity} | Resolution: ${result.resolution || 'N/A'}`);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    const userId = (req as AuthRequest).user?.userId || 'N/A';
    console.error(`[ERROR] /api/emergency/chat failed for user: ${userId}`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process emergency chat'
    });
  }
});

export default router;