// apps/backend/src/routes/gemini.routes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware'; // Existing middleware
import { geminiController } from '../controllers/gemini.controller';

const router = Router();

/**
 * @swagger
 * /api/gemini/chat:
 *   post:
 *     summary: Send message to Gemini AI assistant
 *     description: Secure proxy to send a message to the Gemini API and maintain chat history
 *     tags: [AI Chat]
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
 *                 description: Chat session identifier
 *               message:
 *                 type: string
 *                 description: User message to AI
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional property ID for context
 *           example:
 *             sessionId: "session-123"
 *             message: "What maintenance tasks should I prioritize?"
 *             propertyId: "property-uuid"
 *     responses:
 *       200:
 *         description: AI response generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *       400:
 *         description: Invalid session or message data
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Property data does not exist
 */
router.post('/chat', authenticate, geminiController.sendMessageToChat);

export default router;