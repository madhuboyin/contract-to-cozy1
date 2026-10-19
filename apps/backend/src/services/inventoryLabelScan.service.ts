// apps/backend/src/services/inventoryLabelScan.service.ts
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { extractLabelFieldsFromImage } from './inventoryOcr.service';
import { inventoryOcrToExtractionEnvelope } from './inventoryOcrExtractionEnvelope.adapter';
import { InventoryDraftService } from './inventoryDraft.service';

const draftSvc = new InventoryDraftService();

type OcrField = { key: string; value: string | null; confidence: number };

/** If providers return duplicate keys, keep the best-confidence value. */
function dedupeFields(fields: OcrField[]): OcrField[] {
  const best = new Map<string, OcrField>();
  for (const f of fields || []) {
    if (!f?.key) continue;
    const prev = best.get(f.key);
    if (!prev) { best.set(f.key, f); continue; }
    const prevScore = typeof prev.confidence === 'number' ? prev.confidence : 0;
    const nextScore = typeof f.confidence === 'number' ? f.confidence : 0;
    const prevVal = (prev.value || '').trim();
    const nextVal = (f.value || '').trim();
    if (nextScore > prevScore) best.set(f.key, f);
    else if (nextScore === prevScore && !prevVal && nextVal) best.set(f.key, f);
  }
  return Array.from(best.values());
}

/**
 * Reads an appliance or product label photo on this server (local OCR, no external model) into an OCR session and ONE draft inventory item.
 * The draft is not an inventory item: nothing canonical exists until the draft is confirmed, and a dismissed draft writes nothing. No image is stored here.
 * Shared by the inventory label scan and the Ask file intake so both produce the identical draft.
 */
export async function scanLabelToDraft(input: { propertyId: string; userId: string; buffer: Buffer; debug?: boolean }) {
  const { propertyId, userId } = input;
  const ocr = await extractLabelFieldsFromImage(input.buffer, { debug: Boolean(input.debug) });

  // HI-DOC-001 (Home Intelligence FRD §8.7, Phase 5 remediation item d): additive observability only. It surfaces a genuinely unreadable label
  // (FALLBACK_UNSTRUCTURED) versus a clean extraction without changing which fields become the draft.
  const envelope = inventoryOcrToExtractionEnvelope(ocr);
  if (envelope.warnings.length > 0) {
    logger.warn({ propertyId, warnings: envelope.warnings }, '[inventoryOcr] Extraction envelope reported warnings');
  }

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

  const fields: OcrField[] = dedupeFields((ocr.fields || []) as OcrField[]);
  const persistable = fields
    .filter((f) => typeof f.value === 'string' && f.value.trim().length > 0)
    .map((f) => ({ sessionId: session.id, key: f.key, value: f.value!.trim(), confidence: f.confidence }));
  if (persistable.length) {
    await prisma.inventoryOcrField.createMany({ data: persistable });
  }

  const envelopeValues = new Map(envelope.fields.map((field) => [field.fieldKey, field.value]));
  const envelopeString = (key: string) => {
    const value = envelopeValues.get(key);
    return typeof value === 'string' && value.trim() ? value : null;
  };
  const extracted = {
    manufacturer: envelopeString('manufacturer'),
    modelNumber: envelopeString('modelNumber'),
    serialNumber: envelopeString('serialNumber'),
    upc: envelopeString('upc'),
    sku: envelopeString('sku'),
  };

  const draft = await draftSvc.createDraftFromOcr({
    propertyId,
    userId,
    ocrSessionId: session.id,
    ...extracted,
    confidenceJson: Object.fromEntries(envelope.fields.map((field) => [field.fieldKey, field.confidence])),
  });

  return { session, draft, ocr, envelope, fields, extracted };
}
