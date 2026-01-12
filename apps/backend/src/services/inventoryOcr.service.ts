// apps/backend/src/services/inventoryOcr.service.ts
import { APIError } from '../middleware/error.middleware';
import sharp from 'sharp';

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

function bestMatch(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function normText(t: string) {
  return (t || '')
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[^\S\n]+/g, ' ') // collapse spaces (preserve newlines)
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function digitsOnly(s: string) {
  return String(s || '').replace(/\D/g, '');
}

// Finds 12–14 digits even if OCR inserted spaces/newlines.
// E.g. "0 743120132 1" -> "07431201321" (then slices/prefers 12/13)
function findBarcode(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, ' ');
  const m = t.match(/(?:^|[^\d])((?:\d[ \-]?){11,14}\d)(?:[^\d]|$)/);
  if (!m?.[1]) return null;

  const d = digitsOnly(m[1]);

  // prefer UPC-A (12) or EAN-13 (13)
  if (d.length === 12 || d.length === 13) return d;

  // sometimes OCR adds noise digits
  if (d.length > 13) return d.slice(0, 13);
  if (d.length > 12) return d.slice(0, 12);

  return null;
}

function findLabeledValue(rawText: string, labelRe: RegExp): string | null {
  const m = rawText.match(labelRe);
  if (!m?.[1]) return null;
  return String(m[1]).trim().replace(/^[:\-]+/, '').trim() || null;
}

/**
 * Pragmatic label extractor:
 * - manufacturer/brand
 * - modelNumber
 * - serialNumber
 * - upc (best effort)
 *
 * Confidence:
 * - manufacturer moderate
 * - model/serial higher (explicit labels)
 * - upc high if 12/13 digits found
 */
export async function extractLabelFieldsFromImage(buffer: Buffer): Promise<OcrExtractResult> {
  if (!buffer?.length) throw new APIError('Image is required', 400, 'OCR_IMAGE_REQUIRED');

  const { createWorker } = await import('tesseract.js');

  // ✅ Preprocess image for label OCR
  const pre = await sharp(buffer)
    .rotate()                 // auto-orient
    .resize({ width: 2000, withoutEnlargement: true }) // upsample small labels
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(170)           // binarize (tune if needed)
    .toBuffer();

  const worker = await createWorker('eng');

  try {
    // ✅ Better defaults for dense label text
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // assume a block of text
      preserve_interword_spaces: '1',
    } as any);

    const { data } = await worker.recognize(pre);

    const rawText = (data?.text || '').trim();
    const text = rawText.replace(/\s+/g, ' ').trim();
    const t = normText(rawText);

    const manufacturer =
      bestMatch(text, [/manufacturer[:\s]+([a-z0-9 .&\-]+)/i, /mfg[:\s]+([a-z0-9 .&\-]+)/i]) ||
      bestMatch(text, [/brand[:\s]+([a-z0-9 .&\-]+)/i]);

    const modelNumber =
      findLabeledValue(t, /(?:\bMODEL\b|\bMODEL NO\b|\bMODEL #\b|\bM\/N\b|\bMOD\b)\s*[:#\-]?\s*([A-Z0-9\-\/]{3,})/i);

    const serialNumber =
      findLabeledValue(t, /(?:\bSERIAL\b|\bSERIAL NO\b|\bSERIAL #\b|\bS\/N\b)\s*[:#\-]?\s*([A-Z0-9\-]{3,})/i);

    const upc = findBarcode(t);

    const fields: ExtractedField[] = [];
    if (manufacturer) fields.push({ key: 'manufacturer', value: manufacturer, confidence: 0.75 });
    if (modelNumber) fields.push({ key: 'modelNumber', value: modelNumber, confidence: 0.85 });
    if (serialNumber) fields.push({ key: 'serialNumber', value: serialNumber, confidence: 0.85 });

    // ✅ IMPORTANT: push UPC too if found
    if (upc) fields.push({ key: 'upc', value: upc, confidence: 0.7 });

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

