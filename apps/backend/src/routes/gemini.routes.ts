// apps/backend/src/routes/gemini.routes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware'; // Existing middleware
import { geminiController } from '../controllers/gemini.controller';

const router = Router();

/**
 * @route   POST /api/gemini/chat
 * @desc    Secure proxy to send a message to the Gemini API and maintain chat history.
 * @access  Private (Requires authentication)
 * @body    { sessionId: string, message: string }
 */
router.post('/chat', authenticate, geminiController.sendMessageToChat);

export default router;