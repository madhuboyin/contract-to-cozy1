// apps/backend/src/controllers/inventoryOcr.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { extractLabelFieldsFromImage } from '../services/inventoryOcr.service';
import { InventoryDraftService } from '../services/inventoryDraft.service';

const draftSvc = new InventoryDraftService();

type OcrField = {
  key: string;
  value: string | null;
  confidence: number;
};

function pickUploadedFile(req: CustomRequest): Express.Multer.File | undefined {
  // upload.single(...) -> req.file
  const direct = (req as any).file as Express.Multer.File | undefined;
  if (direct?.buffer?.length) return direct;

  // upload.fields(...) -> req.files
  const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
  const fromImage = files?.image?.[0];
  if (fromImage?.buffer?.length) return fromImage;

  const fromFile = files?.file?.[0];
  if (fromFile?.buffer?.length) return fromFile;

  return undefined;
}

/**
 * If providers return duplicate keys, keep the best-confidence value.
 */
function dedupeFields(fields: OcrField[]): OcrField[] {
  const best = new Map<string, OcrField>();

  for (const f of fields || []) {
    if (!f?.key) continue;

    const prev = best.get(f.key);
    if (!prev) {
      best.set(f.key, f);
      continue;
    }

    const prevScore = typeof prev.confidence === 'number' ? prev.confidence : 0;
    const nextScore = typeof f.confidence === 'number' ? f.confidence : 0;

    // prefer higher confidence; on tie prefer non-empty value
    const prevVal = (prev.value || '').trim();
    const nextVal = (f.value || '').trim();

    if (nextScore > prevScore) best.set(f.key, f);
    else if (nextScore === prevScore && !prevVal && nextVal) best.set(f.key, f);
  }

  return Array.from(best.values());
}

export async function ocrLabelToDraft(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const file = pickUploadedFile(req);
  if (!file?.buffer?.length) throw new APIError('image file is required', 400, 'OCR_IMAGE_REQUIRED');

  const ocr = await extractLabelFieldsFromImage(file.buffer);

  // 1) Create OCR session (no image stored)
  const session = await prisma.inventoryOcrSession.create({
    data: {
      propertyId,
      userId,
      status: 'COMPLETE',
      provider: ocr.provider,
      rawText: ocr.rawText,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days retention
    },
    select: { id: true },
  });

  // 2) Store fields (Prisma schema expects value: string (non-null))
  const fields: OcrField[] = dedupeFields((ocr.fields || []) as OcrField[]);

  const persistable = fields
    .filter((f) => typeof f.value === 'string' && f.value.trim().length > 0)
    .map((f) => ({
      sessionId: session.id,
      key: f.key,
      value: f.value!.trim(), // guaranteed string
      confidence: f.confidence,
    }));

  if (persistable.length) {
    await prisma.inventoryOcrField.createMany({
      data: persistable,
    });
  }

  console.log('[inventoryOcr] upload', {
    mimetype: file.mimetype,
    size: file.size,
    hasBuffer: !!file.buffer?.length,
  });
  // 3) Extract canonical values
  const manufacturer = fields.find((f) => f.key === 'manufacturer')?.value ?? null;
  const modelNumber = fields.find((f) => f.key === 'modelNumber')?.value ?? null;
  const serialNumber = fields.find((f) => f.key === 'serialNumber')?.value ?? null;
  const upc = fields.find((f) => f.key === 'upc')?.value ?? null;
  const sku = fields.find((f) => f.key === 'sku')?.value ?? null;
  console.log('manufacturer', manufacturer);
  console.log('modelNumber', modelNumber);
  console.log('serialNumber', serialNumber);
  console.log('upc', upc);
  console.log('sku', sku);
  // 4) Create draft tied to session
  const draft = await draftSvc.createDraftFromOcr({
    propertyId,
    userId,
    sessionId: session.id,
    manufacturer,
    modelNumber,
    serialNumber,
    upc,
    sku,
    confidenceJson: ocr.confidenceByField,
  });
  
  console.log('draft', draft);
  return res.json({
    sessionId: session.id,
    draftId: draft.id,
    extracted: {
      manufacturer,
      modelNumber,
      serialNumber,
      upc,
      sku,
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

