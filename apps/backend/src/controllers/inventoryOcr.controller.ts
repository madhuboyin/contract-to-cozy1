// apps/backend/src/controllers/inventoryOcr.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { extractLabelFieldsFromImage } from '../services/inventoryOcr.service';
import { InventoryDraftService } from '../services/inventoryDraft.service';

const draftSvc = new InventoryDraftService();

function getUploadedImage(req: CustomRequest): Express.Multer.File | undefined {
  // If a single() middleware was used somewhere
  const single = (req as any).file as Express.Multer.File | undefined;
  if (single?.buffer?.length) return single;

  // With upload.fields(...)
  const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
  const img = files?.image?.[0];
  if (img?.buffer?.length) return img;

  const file = files?.file?.[0];
  if (file?.buffer?.length) return file;

  return undefined;
}

export async function ocrLabelToDraft(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const file = getUploadedImage(req);
  if (!file?.buffer?.length) {
    throw new APIError('image file is required', 400, 'OCR_IMAGE_REQUIRED');
  }

  const ocr = await extractLabelFieldsFromImage(file.buffer);

  // Create OCR session (no image stored)
  const session = await prisma.inventoryOcrSession.create({
    data: {
      propertyId,
      userId,
      status: 'COMPLETE',
      provider: ocr.provider,
      rawText: ocr.rawText,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days retention
    },
  });

  // Store fields
  if (ocr.fields.length) {
    await prisma.inventoryOcrField.createMany({
      data: ocr.fields.map((f) => ({
        sessionId: session.id,
        key: f.key,
        value: f.value,
        confidence: f.confidence,
      })),
    });
  }

  const manufacturer = ocr.fields.find((f) => f.key === 'manufacturer')?.value ?? null;
  const modelNumber = ocr.fields.find((f) => f.key === 'modelNumber')?.value ?? null;
  const serialNumber = ocr.fields.find((f) => f.key === 'serialNumber')?.value ?? null;

  const draft = await draftSvc.createDraftFromOcr({
    propertyId,
    userId,
    sessionId: session.id,
    manufacturer,
    modelNumber,
    serialNumber,
    confidenceJson: ocr.confidenceByField,
  });

  return res.json({
    sessionId: session.id,
    draftId: draft.id,
    extracted: {
      manufacturer,
      modelNumber,
      serialNumber,
    },
    confidence: ocr.confidenceByField,
    rawText: ocr.rawText,
  });
}

export async function listDrafts(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const drafts = await draftSvc.listDrafts(propertyId, userId);
  return res.json({ drafts });
}

export async function dismissDraft(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;
  const draftId = req.params.draftId;
  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const d = await draftSvc.dismissDraft(propertyId, userId, draftId);
  return res.json({ ok: true, draft: d });
}

export async function confirmDraft(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;
  const draftId = req.params.draftId;
  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const item = await draftSvc.confirmDraftToInventoryItem(propertyId, userId, draftId);
  return res.json({ item });
}
