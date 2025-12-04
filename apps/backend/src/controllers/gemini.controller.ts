// apps/backend/src/controllers/gemini.controller.ts

import { Request, Response, NextFunction } from 'express';
import { geminiService } from '../services/gemini.service';

// --- FEATURE FLAG CHECK ---
const isChatEnabled = process.env.GEMINI_CHAT_ENABLED === 'true';
// --------------------------

export const geminiController = {
  /**
   * Secure proxy to send a message to the Gemini API.
   */
  handleChatMessage: async (req: Request, res: Response, next: NextFunction) => {
    // 1. Feature Flag Enforcement
    if (!isChatEnabled) {
      // Return 404 (Not Found) or 403 (Forbidden). 403 is more explicit.
      console.log('AI chat access attempted but is disabled.');
      return res.status(403).json({ 
        message: 'AI chat feature is currently disabled by configuration.' 
      });
    }
    
    // 2. Input Validation (Basic)
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ message: 'Missing sessionId or message.' });
    }

    try {
      // 3. Service Call
      const responseText = await geminiService.sendMessageToChat(sessionId, message);

      // 4. Success Response - Wrap in standard API response format
      return res.status(200).json({ success: true, data: { text: responseText } });

    } catch (error) {
      // Pass the error to the Express error handler middleware
      next(error);
    }
  },
};