// apps/backend/src/controllers/gemini.controller.ts

import { Request, Response, NextFunction } from 'express';
import { geminiService } from '../services/gemini.service';
import { APIError } from '../types'; // Assuming APIError is imported or defined

class GeminiController {
  
  /**
   * Handles sending a message to the Gemini chat service, 
   * now including an optional propertyId for context injection.
   */
  public sendMessageToChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, message, propertyId } = req.body; 
      
      // [FIX] Robustly extract the authenticated user's ID
      // NOTE: We rely on Express typings augmentation from the project, casting to 'any' for safety here.
      const userId = (req as any).user?.id; 

      // [CRITICAL FIX] Ensure userId is present after authentication middleware.
      if (!userId) {
        // If the authentication middleware ran but failed to set the ID, or req.user is missing/malformed.
        // This causes the "User undefined" error.
        throw new Error('Authentication failure: User ID not found in request.');
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
        data: response, 
      });
    } catch (error) {
      // Catch the explicit error from geminiService and return a structured response
      if (error instanceof Error && error.message.includes('Property data does not exist')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      // Catch the Critical Fix error above
      if (error instanceof Error && error.message.includes('Authentication failure')) {
         return res.status(401).json({ success: false, message: 'Invalid session. Please log in again.' });
      }
      // Pass other errors (like Gemini API errors) to the general error handler
      next(error);
    }
  };
}

export const geminiController = new GeminiController();