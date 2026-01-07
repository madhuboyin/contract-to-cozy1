// apps/backend/src/controllers/claims.controller.ts

import { Response } from 'express';
import { ClaimsService } from '../services/claims/claims.service';
import { CustomRequest } from '../types'; // assumes you export CustomRequest as you mentioned earlier
import {
  AddClaimDocumentInput,
  AddTimelineEventInput,
  CreateClaimInput,
  UpdateChecklistItemInput,
  UpdateClaimInput,
} from '../types/claims.types';

import {
  AddClaimDocumentSchema,
  AddTimelineEventSchema,
  CreateClaimSchema,
  RegenerateChecklistSchema,
  UpdateChecklistItemSchema,
  UpdateClaimSchema,
} from '../validators/claims.validators';
function getUserId(req: CustomRequest) {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Authentication required');
  return userId;
}

export class ClaimsController {
  static async list(req: CustomRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const data = await ClaimsService.listClaims(propertyId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to list claims' });
    }
  }

  static async get(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const data = await ClaimsService.getClaim(propertyId, claimId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ message: e.message || 'Claim not found' });
    }
  }

  static async create(req: CustomRequest, res: Response) {
    try {
      
      const { propertyId } = req.params;
      const userId = getUserId(req);
      const input = CreateClaimSchema.parse(req.body);
      const data = await ClaimsService.createClaim(propertyId, userId, input);
      return res.status(201).json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to create claim' });
    }
  }

  static async update(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const userId = getUserId(req);
  
      const input = UpdateClaimSchema.parse(req.body);
      const data = await ClaimsService.updateClaim(
        propertyId,
        claimId,
        userId,
        input
      );
  
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({
        message: e.message || 'Failed to update claim',
      });
    }
  }
  

  static async addDocument(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const userId = getUserId(req);
      const input = AddClaimDocumentSchema.parse(req.body);
      const data = await ClaimsService.addClaimDocument(propertyId, claimId, userId, input);
      return res.status(201).json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to add claim document' });
    }
  }

  static async addTimelineEvent(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const userId = getUserId(req);
      const input = AddTimelineEventSchema.parse(req.body);
      const data = await ClaimsService.addTimelineEvent(propertyId, claimId, userId, input);
      return res.status(201).json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to add timeline event' });
    }
  }

  static async updateChecklistItem(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId, itemId } = req.params;
      const userId = getUserId(req);
      const input = UpdateChecklistItemSchema.parse(req.body);
      const data = await ClaimsService.updateChecklistItem(propertyId, claimId, itemId, userId, input);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to update checklist item' });
    }
  }

  static async regenerateChecklist(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const userId = getUserId(req);
      const input = RegenerateChecklistSchema.parse(req.body ?? {});
  
      const data = await ClaimsService.regenerateChecklist(propertyId, claimId, userId, {
        type: input.type,
        replaceExisting: input.replaceExisting,
      });
  
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to regenerate checklist' });
    }
  }
  
}
