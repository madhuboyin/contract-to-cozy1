// apps/backend/src/controllers/gemini.controller.ts

import { Request, Response, NextFunction } from 'express';
import { geminiService } from '../services/gemini.service';
// Note: Assuming Request has been augmented in the project's types 
// (e.g., in a @types/express declaration file) to include `req.user.id` 
// from the authentication middleware.

class GeminiController {
  
  /**
   * Handles sending a message to the Gemini chat service, 
   * now including an optional propertyId for context injection.
   */
  public sendMessageToChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Extract sessionId, message, and the new optional propertyId from req.body
      const { sessionId, message, propertyId } = req.body; 
      
      // 2. Access the authenticated user's ID
      // Assuming req.user exists and has an id property populated by middleware
      const userId = (req as any).user.id; 

      // Basic input validation check (a proper solution would use validation middleware)
      if (!sessionId || !message || typeof sessionId !== 'string' || typeof message !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid session or message data.' });
      }
      if (propertyId && typeof propertyId !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid propertyId format.' });
      }

      // 3. Update the service call: pass userId, sessionId, message, and propertyId
      const response = await geminiService.sendMessageToChat(
        userId, 
        sessionId, 
        message, 
        propertyId
      );

      res.status(200).json({
        success: true,
        data: response, 
      });
    } catch (error) {
      next(error);
    }
  };
}

export const geminiController = new GeminiController();