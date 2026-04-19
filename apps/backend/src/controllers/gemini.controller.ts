// apps/backend/src/controllers/gemini.controller.ts

import { Response, NextFunction } from 'express';
import { geminiService } from '../services/gemini.service';
import { AuthRequest } from '../types/auth.types';
import { APIError } from '../middleware/error.middleware';

class GeminiController {
  
  /**
   * Handles sending a message to the Gemini chat service, 
   * now including an optional propertyId for context injection.
   */
  public sendMessageToChat = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { sessionId, message, propertyId } = req.body; 
      
      // FIX: Changed from (req as any).user?.id to req.user?.userId
      // The AuthUser interface uses 'userId' not 'id'
      const userId = req.user?.userId;

      // Ensure userId is present after authentication middleware
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Invalid session. Please log in again.' });
      }

      // Basic input validation check
      if (!sessionId || !message || typeof sessionId !== 'string' || typeof message !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid session or message data.' });
      }
      if (propertyId && typeof propertyId !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid propertyId format.' });
      }

      // Pass userId, sessionId, message, and propertyId to the service
      const response = await geminiService.sendMessageToChat(
        userId, 
        sessionId, 
        message, 
        propertyId
      );

      res.status(200).json({
        success: true,
        data: { text: response }, 
      });
    } catch (error) {
      if (error instanceof APIError) {
        next(error);
        return;
      }
      next(error);
    }
  };
}

export const geminiController = new GeminiController();
