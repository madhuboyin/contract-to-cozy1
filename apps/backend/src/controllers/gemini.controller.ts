// apps/backend/src/controllers/gemini.controller.ts

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { APIError } from '../middleware/error.middleware';
import { getAggregationContextEnvelope } from '../services/aggregationContext/context';
import { z } from 'zod';
import { GroundedAskProposalInputSchema } from '../productFramework/groundedAsk.contract';
import {
  answerGroundedAsk,
  confirmGroundedAskProposal,
  createGroundedAskProposal,
  rejectGroundedAskProposal,
} from '../services/groundedAsk.service';

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
      const [response, propertyContext] = await Promise.all([
        answerGroundedAsk({ userId, sessionId, message, propertyId }),
        propertyId
          ? getAggregationContextEnvelope(propertyId, userId, 'SEARCH_ASSISTANT')
          : Promise.resolve(undefined),
      ]);

      res.status(200).json({
        success: true,
        data: { ...response, propertyContext },
      });
    } catch (error) {
      if (error instanceof APIError) {
        next(error);
        return;
      }
      next(error);
    }
  };

  public createProposal = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const parsed = GroundedAskProposalInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: { message: 'Invalid Ask proposal', details: parsed.error.issues } });
      const proposal = await createGroundedAskProposal(userId, parsed.data);
      return res.status(201).json({ success: true, data: { ...proposal, requiresConfirmation: true } });
    } catch (error) { next(error); }
  };

  public confirmProposal = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!id.success) return res.status(400).json({ success: false, error: { message: 'Invalid proposal id' } });
      const artifact = await confirmGroundedAskProposal(userId, id.data);
      if (!artifact) return res.status(404).json({ success: false, error: { message: 'Proposal not found' } });
      return res.json({ success: true, data: artifact });
    } catch (error) { next(error); }
  };

  public rejectProposal = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!id.success) return res.status(400).json({ success: false, error: { message: 'Invalid proposal id' } });
      const result = await rejectGroundedAskProposal(userId, id.data);
      if (result.count === 0) return res.status(404).json({ success: false, error: { message: 'Pending proposal not found' } });
      return res.json({ success: true, data: { rejected: true } });
    } catch (error) { next(error); }
  };
}

export const geminiController = new GeminiController();
