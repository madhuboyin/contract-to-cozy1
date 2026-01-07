// apps/backend/src/controllers/claims.controller.ts

import type { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { ClaimDocumentType } from '@prisma/client';
import { ClaimsService, uploadAndAttachChecklistItemDocument } from '../services/claims/claims.service';
import { CustomRequest } from '../types';
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

// ✅ Multer helper (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Exported middleware factory used in routes
export function uploadSingleFile(fieldName: string) {
  return upload.single(fieldName);
}

export function uploadMultipleFiles(fieldName: string, maxCount = 10) {
  return upload.array(fieldName, maxCount);
}

// Optional metadata schema
const UploadChecklistItemDocSchema = z.object({
  claimDocumentType: z.nativeEnum(ClaimDocumentType).optional(),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function uploadChecklistItemDocument(req: Request, res: Response) {
  const { propertyId, claimId, itemId } = req.params;
  const userId = (req as any).user?.userId;

  const parsed = UploadChecklistItemDocSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: 'Missing file upload (field "file")' });

  const result = await uploadAndAttachChecklistItemDocument({
    propertyId,
    claimId,
    itemId,
    userId,
    file,
    claimDocumentType: parsed.data.claimDocumentType,
    title: parsed.data.title ?? null,
    notes: parsed.data.notes ?? null,
  });

  return res.status(201).json(result);
}

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
      const data = await ClaimsService.updateClaim(propertyId, claimId, userId, input);

      return res.json({ success: true, data });
    } catch (e: any) {
      // ✅ NEW: Submit gating error (checklist requirements not met)
      if (e?.statusCode === 409 && e?.code === 'CLAIM_SUBMIT_BLOCKED') {
        return res.status(409).json({
          code: e.code,
          message: e.message,
          ...e.details, // includes { blocking: [...] }
        });
      }

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
  static async getInsights(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const data = await ClaimsService.getClaimInsights(propertyId, claimId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Failed to fetch claim insights' });
    }
  }
  
  static async bulkUploadClaimDocuments(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId } = req.params;
      const userId = getUserId(req);
  
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return res.status(400).json({ message: 'Missing files (field "files")' });
  
      const parsed = UploadChecklistItemDocSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
  
      const inputs = files.map((file) => ({
        file,
        claimDocumentType: parsed.data.claimDocumentType,
        title: parsed.data.title ?? null,
        notes: parsed.data.notes ?? null,
      }));
  
      const data = await ClaimsService.bulkUploadClaimDocuments(propertyId, claimId, userId, inputs);
  
      return res.status(201).json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Bulk upload failed' });
    }
  }
  static async bulkUploadChecklistItemDocuments(req: CustomRequest, res: Response) {
    try {
      const { propertyId, claimId, itemId } = req.params;
      const userId = getUserId(req);
  
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return res.status(400).json({ message: 'Missing files (field "files")' });
  
      const parsed = UploadChecklistItemDocSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
  
      const inputs = files.map((file) => ({
        itemId,
        file,
        claimDocumentType: parsed.data.claimDocumentType,
        title: parsed.data.title ?? null,
        notes: parsed.data.notes ?? null,
      }));
  
      const data = await ClaimsService.bulkUploadChecklistItemDocuments(propertyId, claimId, userId, inputs);
  
      return res.status(201).json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Bulk upload failed' });
    }
  }  
  
  static async exportClaimsCsv(req: CustomRequest, res: Response) {
    try {
      const { propertyId } = req.params;
  
      const csv = await ClaimsService.exportClaimsCsv(propertyId);
  
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="claims-${propertyId}.csv"`);
      return res.status(200).send(csv);
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Export failed' });
    }
  }
  

}
