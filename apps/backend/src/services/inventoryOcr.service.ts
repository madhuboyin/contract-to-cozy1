// apps/backend/src/services/inventoryOcr.service.ts
import { APIError } from '../middleware/error.middleware';
import crypto from 'crypto';

type ExtractedField = {
  key: string;
  value: string;
  confidence: number; // 0..1
};

export type OcrExtractResult = {
  provider: string;
  rawText: string;
  fields: ExtractedField[];
  confidenceByField: Record<string, number>;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function bestMatch(text: string, patterns: RegExp[], label: string) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/**
 * Very pragmatic extractor for appliance labels:
 * - Manufacturer/Brand
 * - Model / Model No / M/N
 * - Serial / S/N
 *
 * Confidence strategy:
 * - If regex hit is "strong" (explicit prefix like "Model:"), score high.
 * - Else moderate.
 */
export async function extractLabelFieldsFromImage(buffer: Buffer): Promise<OcrExtractResult> {
  if (!buffer?.length) throw new APIError('Image is required', 400, 'OCR_IMAGE_REQUIRED');

  // Lazy import to reduce startup overhead
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('eng');

  try {
    const { data } = await worker.recognize(buffer);
    const rawText = (data?.text || '').trim();

    const text = rawText.replace(/\s+/g, ' ').trim();

    const manufacturer =
      bestMatch(text, [/manufacturer[:\s]+([a-z0-9 .&\-]+)/i, /mfg[:\s]+([a-z0-9 .&\-]+)/i], 'manufacturer') ||
      bestMatch(text, [/brand[:\s]+([a-z0-9 .&\-]+)/i], 'brand');

    const modelNumber =
      bestMatch(text, [/model(?: number| no| #)?[:\s]+([a-z0-9\-./]+)\b/i, /\bm\/n[:\s]+([a-z0-9\-./]+)\b/i], 'model') ||
      bestMatch(text, [/\bmodel\b\s+([a-z0-9\-./]+)\b/i], 'modelLoose');

    const serialNumber =
      bestMatch(text, [/serial(?: number| no| #)?[:\s]+([a-z0-9\-./]+)\b/i, /\bs\/n[:\s]+([a-z0-9\-./]+)\b/i], 'serial') ||
      bestMatch(text, [/\bserial\b\s+([a-z0-9\-./]+)\b/i], 'serialLoose');

    const fields: ExtractedField[] = [];

    // Confidence heuristics
    if (manufacturer) fields.push({ key: 'manufacturer', value: manufacturer, confidence: 0.75 });
    if (modelNumber) fields.push({ key: 'modelNumber', value: modelNumber, confidence: 0.85 });
    if (serialNumber) fields.push({ key: 'serialNumber', value: serialNumber, confidence: 0.85 });

    // If OCR engine itself is low confidence overall, scale down.
    // Tesseract provides mean confidence in data.confidence in some builds.
    const overall = typeof (data as any)?.confidence === 'number' ? (data as any).confidence / 100 : null;
    const scale = overall === null ? 1 : clamp01(0.6 + 0.4 * overall);

    const scaledFields = fields.map((f) => ({ ...f, confidence: clamp01(f.confidence * scale) }));

    const confidenceByField: Record<string, number> = {};
    for (const f of scaledFields) confidenceByField[f.key] = f.confidence;

    return {
      provider: 'tesseract',
      rawText,
      fields: scaledFields,
      confidenceByField,
    };
  } finally {
    await worker.terminate();
  }
}
