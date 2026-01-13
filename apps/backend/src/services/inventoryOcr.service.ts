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
  // Optional debug payload (controller decides whether to return it)
  debug?: Record<string, any>;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function cleanValue(v: string) {
  return v
    .replace(/\u00A0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐-–—]/g, '-')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

// Extract first group from regex match
function findLabeledValue(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  const v = cleanValue(m[1]);
  return v.length ? v : null;
}

/**
 * UPC/EAN detection (12 or 13 digits)
 * Use digits-only scan across whole text (more robust than token regex on noisy OCR).
 */
function findBarcodeDigits(text: string): string | null {
  const digits = text.replace(/\D+/g, ' ');
  const parts = digits.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if ((p.length === 12 || p.length === 13) && !/^0+$/.test(p)) return p;
  }
  return null;
}

function scoreFromReasons(reason: 'labeled' | 'heuristic' | 'digit', meanConf0to100: number) {
  const base = clamp01(meanConf0to100 / 100);
  if (reason === 'labeled') return clamp01(0.15 + 0.85 * base);
  if (reason === 'digit') return clamp01(0.10 + 0.80 * base);
  return clamp01(0.05 + 0.70 * base);
}

type PassResult = {
  name: string;
  rawText: string;
  meanWordConfidence: number; // 0..100
  textLen: number; // non-space length
  debug: Record<string, any>;
};

function chooseBestPass(passes: PassResult[]) {
  // score confidence strongly, but avoid choosing extremely short junk
  const scored = passes.map((p) => {
    const conf = clamp01(p.meanWordConfidence / 100);
    const lenScore = Math.min(1, p.textLen / 350);
    const penalty = p.textLen < 25 ? 0.35 : 0;
    const score = conf * 0.75 + lenScore * 0.25 - penalty;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p || passes[0];
}

async function buildPreprocessVariants(buffer: Buffer) {
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await base.metadata();

  // If small image, upscale — OCR needs pixels.
  const w = meta.width || 0;
  const targetW = w && w < 1400 ? 2000 : w && w < 1800 ? 2200 : 2200;

  const common = base
    .resize({ width: targetW, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.0 });

  // IMPORTANT: thresholding can destroy labels under glare.
  // So we try multiple variants and pick best OCR output.
  const v1 = await common.png({ compressionLevel: 9 }).toBuffer(); // gray + normalize
  const v2 = await common.linear(1.25, -10).png({ compressionLevel: 9 }).toBuffer(); // higher contrast
  const v3 = await common.threshold(165).png({ compressionLevel: 9 }).toBuffer(); // threshold (gentler)
  const v4 = await common.threshold(190).png({ compressionLevel: 9 }).toBuffer(); // threshold (stronger)

  return {
    meta: {
      width: meta.width,
      height: meta.height,
      format: meta.format,
      inputBytes: buffer.length,
      resizedTo: targetW,
    },
    variants: [
      { name: 'gray', buf: v1 },
      { name: 'contrast', buf: v2 },
      { name: 'th165', buf: v3 },
      { name: 'th190', buf: v4 },
    ],
  };
}

async function runOcrPass(worker: any, img: Buffer, passName: string, psm: number): Promise<PassResult> {
  // Whitelist helps reduce garbage characters; labels are mostly alnum + some punctuation.
  const whitelist = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./:#()[]+&,'\" ";

  await worker.setParameters({
    // Use numeric string because tesseract.js accepts these params loosely
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    tessedit_char_whitelist: whitelist,
  });

  const res = await worker.recognize(img);
  const rawText = cleanValue(String(res?.data?.text || ''));
  const textLen = rawText.replace(/\s+/g, '').length;

  const words = Array.isArray(res?.data?.words) ? res.data.words : [];
  const wConfs = words
    .map((w: any) => Number(w?.confidence))
    .filter((n: number) => Number.isFinite(n) && n >= 0);

  const meanWordConfidence =
    wConfs.length > 0
      ? wConfs.reduce((a: number, b: number) => a + b, 0) / wConfs.length
      : typeof res?.data?.confidence === 'number'
      ? Number(res.data.confidence)
      : 0;

  return {
    name: passName,
    rawText,
    meanWordConfidence,
    textLen,
    debug: { psm, meanWordConfidence, words: wConfs.length, textLen },
  };
}

/**
 * Pragmatic label extractor:
 * - manufacturer/brand
 * - modelNumber
 * - serialNumber
 * - upc (best effort)
 *
 * Improvements vs current:
 * - multi preprocessing variants (avoid threshold destroying text)
 * - multi PSM modes
 * - best-pass selection
 * - stronger regex patterns
 * - optional debug info (returned only if controller opts in)
 */
export async function extractLabelFieldsFromImage(
  buffer: Buffer,
  opts?: { debug?: boolean }
): Promise<OcrExtractResult> {
  if (!buffer?.length) throw new APIError('Image is required', 400, 'OCR_IMAGE_REQUIRED');

  const { createWorker } = await import('tesseract.js');

  const { meta, variants } = await buildPreprocessVariants(buffer);

  const worker = await createWorker('eng');

  // PSM 6: “single block of text” (good for dense labels)
  // PSM 11: “sparse text” (good for scattered fields like MODEL/SERIAL)
  const PSM_SINGLE_BLOCK = 6;
  const PSM_SPARSE_TEXT = 11;

  const passes: PassResult[] = [];

  try {
    for (const v of variants) {
      passes.push(await runOcrPass(worker, v.buf, `${v.name}:psm6`, PSM_SINGLE_BLOCK));
      passes.push(await runOcrPass(worker, v.buf, `${v.name}:psm11`, PSM_SPARSE_TEXT));
    }

    const best = chooseBestPass(passes);
    const rawText = best.rawText;

    // Normalized matching text
    const t = rawText.replace(/\r/g, '');
    const upper = t.toUpperCase();

    // Manufacturer: try labeled first, then heuristic top-line fallback
    let manufacturerReason: 'labeled' | 'heuristic' = 'heuristic';
    let manufacturer =
      findLabeledValue(t, /\b(BRAND|MANUFACTURER|MFR|MFG|MAKE)\b\s*[:#\-]?\s*([A-Za-z0-9& .,'-]{2,})/i);

    if (manufacturer) manufacturerReason = 'labeled';

    if (!manufacturer) {
      const lines = t
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 6);

      for (const line of lines) {
        const ul = line.toUpperCase();
        if (/\b(MODEL|SERIAL|S\/N|M\/N|UPC|SKU|P\/N|PART|TYPE)\b/.test(ul)) continue;
        const letters = (line.match(/[A-Za-z]/g) || []).length;
        const total = line.replace(/\s+/g, '').length;
        if (total >= 2 && letters / Math.max(1, total) > 0.6 && total <= 32) {
          manufacturer = cleanValue(line.replace(/[^\w\s&.,'-]/g, ''));
          if (manufacturer?.length) break;
        }
      }
    }

    // Model number: stronger label patterns + vicinity fallback
    const modelNumber =
      findLabeledValue(upper, /\bMODEL(?:\s*(?:NO|NUMBER|#))?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
      findLabeledValue(upper, /\bM\/N\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
      findLabeledValue(upper, /\bMOD(?:EL)?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
      (() => {
        const compact = upper.replace(/\s+/g, ' ');
        const m = compact.match(/\bMODEL\b.{0,25}\b([A-Z0-9][A-Z0-9\-./]{3,})\b/);
        return m?.[1] ? cleanValue(m[1]) : null;
      })();

    // Serial number: stronger label patterns + vicinity fallback
    const serialNumber =
      findLabeledValue(upper, /\bSERIAL(?:\s*(?:NO|NUMBER|#))?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})\b/i) ||
      findLabeledValue(upper, /\bS\/N\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})\b/i) ||
      findLabeledValue(upper, /\bSN\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})\b/i) ||
      (() => {
        const compact = upper.replace(/\s+/g, ' ');
        const m = compact.match(/\bSERIAL\b.{0,25}\b([A-Z0-9][A-Z0-9\-./]{3,})\b/);
        return m?.[1] ? cleanValue(m[1]) : null;
      })();

    const upc = findBarcodeDigits(t);

    // SKU: best effort (rare)
    const sku =
      findLabeledValue(upper, /\bSKU\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
      findLabeledValue(upper, /\bITEM(?:\s*NO|NUMBER|#)?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
      findLabeledValue(upper, /\bPART(?:\s*NO|NUMBER|#)?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i);

    const fields: ExtractedField[] = [];

    if (manufacturer) fields.push({ key: 'manufacturer', value: manufacturer, confidence: scoreFromReasons(manufacturerReason, best.meanWordConfidence) });
    if (modelNumber) fields.push({ key: 'modelNumber', value: modelNumber, confidence: scoreFromReasons('labeled', best.meanWordConfidence) });
    if (serialNumber) fields.push({ key: 'serialNumber', value: serialNumber, confidence: scoreFromReasons('labeled', best.meanWordConfidence) });
    if (upc) fields.push({ key: 'upc', value: upc, confidence: scoreFromReasons('digit', best.meanWordConfidence) });
    if (sku) fields.push({ key: 'sku', value: sku, confidence: scoreFromReasons('labeled', best.meanWordConfidence) });

    const confidenceByField: Record<string, number> = {};
    for (const f of fields) confidenceByField[f.key] = clamp01(f.confidence);

    const debug =
      opts?.debug
        ? {
            image: meta,
            passes: passes.map((p) => ({
              name: p.name,
              meanWordConfidence: p.meanWordConfidence,
              textLen: p.textLen,
              debug: p.debug,
            })),
            best: {
              name: best.name,
              meanWordConfidence: best.meanWordConfidence,
              textLen: best.textLen,
            },
            extraction: {
              manufacturerReason,
              hasModel: !!modelNumber,
              hasSerial: !!serialNumber,
              hasUpc: !!upc,
              hasSku: !!sku,
            },
            rawTextSample: rawText.slice(0, 900),
          }
        : undefined;

    return {
      provider: 'tesseract',
      rawText,
      fields,
      confidenceByField,
      ...(debug ? { debug } : {}),
    };
  } finally {
    await worker.terminate();
  }
}
