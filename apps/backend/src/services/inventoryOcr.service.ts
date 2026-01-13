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
function tokenLooksLikeLotOrSerial(tok: string) {
  const t = tok.trim();
  if (t.length < 6 || t.length > 24) return false;

  // must include at least one digit
  if (!/\d/.test(t)) return false;

  // allow alnum plus a few safe separators
  if (!/^[A-Z0-9\-./]+$/i.test(t)) return false;

  // avoid date-like tokens
  if (/^\d{1,2}\/\d{2,4}$/.test(t)) return false;

  return true;
}

function extractSerialFromExpLotLine(rawText: string): { value: string | null; reason: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const upper = line.toUpperCase();

    // look for EXP / LOT / BATCH cues
    if (!/\b(EXP|EXPIR|EXPIRATION|LOT|BATCH)\b/.test(upper)) continue;

    // tokenize: keep alnum-ish tokens
    const toks = upper
      .replace(/[^A-Z0-9\-./\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    // Prefer a token immediately before EXP/LOT/BATCH
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      if (w === 'EXP' || w === 'EXPIR' || w === 'EXPIRATION' || w === 'LOT' || w === 'BATCH') {
        const prev = toks[i - 1];
        if (prev && tokenLooksLikeLotOrSerial(prev)) return { value: prev, reason: 'exp_lot_prev_token' };

        const next = toks[i + 1];
        if (next && tokenLooksLikeLotOrSerial(next)) return { value: next, reason: 'exp_lot_next_token' };
      }
    }

    // If not adjacent, pick the best-looking token on that line
    const candidates = toks.filter(tokenLooksLikeLotOrSerial);
    if (candidates.length) return { value: candidates[0], reason: 'exp_lot_line_candidate' };
  }

  return { value: null, reason: 'none' };
}

function looksLikeOcrGarbageBrand(s: string) {
  const t = s.trim();
  if (t.length < 2) return true;

  // Too many repeated characters (e.g., "HHH", "IIII", etc.)
  const lettersOnly = t.replace(/[^A-Za-z]/g, '');
  if (lettersOnly.length >= 4) {
    const freq: Record<string, number> = {};
    for (const ch of lettersOnly.toUpperCase()) freq[ch] = (freq[ch] || 0) + 1;
    const max = Math.max(...Object.values(freq));
    if (max / lettersOnly.length > 0.55) return true; // very low diversity
  }

  // Weird quote/backslash artifacts
  if (/[\\"]/.test(t)) return true;

  // Looks like random OCR fragments (many 1-letter "words")
  const words = t.split(/\s+/).filter(Boolean);
  const oneCharWords = words.filter(w => w.length === 1).length;
  if (words.length >= 3 && oneCharWords / words.length > 0.45) return true;

  return false;
}

function tryRecoverUpcFromFragments(rawText: string): string | null {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  // Look for sequences of digit chunks that could form a 12-digit UPC.
  // Example fragments: "74", "312", "67906" etc.
  const digitChunks: string[] = [];
  for (const l of lines) {
    const chunks = l.replace(/[^\d]/g, ' ').split(/\s+/).filter(Boolean);
    for (const c of chunks) digitChunks.push(c);
  }

  // sliding window concat with bounds to avoid huge false positives
  for (let i = 0; i < digitChunks.length; i++) {
    let s = '';
    for (let j = i; j < Math.min(i + 6, digitChunks.length); j++) {
      s += digitChunks[j];
      if (s.length === 12 && !/^0+$/.test(s)) return s;
      if (s.length > 12) break;
    }
  }
  return null;
}

function normalizeLotSerialToken(token: string) {
  // Uppercase and remove obvious noise
  let t = token.toUpperCase().trim();

  // Replace common OCR confusions, but carefully:
  // - Only fix letters that are often misread in alnum codes
  // - Do NOT blindly convert everything (can create new errors)
  t = t.replace(/O/g, '0'); // O -> 0 (common in codes)
  t = t.replace(/I/g, '1'); // I -> 1
  t = t.replace(/S/g, '5'); // S -> 5

  // IMPORTANT: don't globally map R->M or M->R; that's too destructive.
  // But we can fix a very common pattern: "U R 0" should often be "U M 0"?
  // Your real token is "4092UM0723": pattern "...U M 0..."
  // OCR sometimes reads "M" as "R" when followed by 0.
  t = t.replace(/UR0/g, 'UM0');

  return t;
}
function isValidUpcA(upc12: string) {
  if (!/^\d{12}$/.test(upc12)) return false;

  const digits = upc12.split('').map((d) => Number(d));
  const check = digits[11];

  let oddSum = 0;  // positions 1,3,5,7,9,11 (0-based even indexes 0,2,...,10)
  let evenSum = 0; // positions 2,4,6,8,10 (0-based odd indexes 1,3,...,9)

  for (let i = 0; i < 11; i++) {
    if (i % 2 === 0) oddSum += digits[i];
    else evenSum += digits[i];
  }

  const total = oddSum * 3 + evenSum;
  const calcCheck = (10 - (total % 10)) % 10;
  return calcCheck === check;
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
    let serialNumber =
      findLabeledValue(upper, /\bSERIAL(?:\s*(?:NO|NUMBER|#))?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})\b/i) ||
      findLabeledValue(upper, /\bS\/N\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})\b/i) ||
      findLabeledValue(upper, /\bSN\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})\b/i) ||
      (() => {
        const compact = upper.replace(/\s+/g, ' ');
        const m = compact.match(/\bSERIAL\b.{0,25}\b([A-Z0-9][A-Z0-9\-./]{3,})\b/);
        return m?.[1] ? cleanValue(m[1]) : null;
      })();

    
      // ✅ NEW fallback: detect lot/serial around EXP/LOT/BATCH lines
      let serialReason = serialNumber ? 'labeled' : 'none';
      
      if (!serialNumber) {
        const fallback = extractSerialFromExpLotLine(rawText);
        if (fallback.value) {
          serialNumber = fallback.value;
          serialReason = fallback.reason;
          serialNumber = normalizeLotSerialToken(serialNumber);
        }
      }
    
      let upc = findBarcodeDigits(t);

      // Reject if it appears on EXP/LOT line (likely not UPC)
      if (upc) {
        const expLineHasUpc = rawText
          .split(/\r?\n/)
          .some((l) => upc && /\b(EXP|EXPIR|EXPIRATION|LOT|BATCH)\b/i.test(l) && l.replace(/\D/g, '').includes(upc));
        if (expLineHasUpc) upc = null;
      }

      // If UPC-A (12 digits), validate check digit. If invalid, drop it.
      if (upc && upc.length === 12 && !isValidUpcA(upc)) {
        upc = null;
      }

      // SKU: best effort (rare)
      const sku =
        findLabeledValue(upper, /\bSKU\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
        findLabeledValue(upper, /\bITEM(?:\s*NO|NUMBER|#)?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i) ||
        findLabeledValue(upper, /\bPART(?:\s*NO|NUMBER|#)?\b\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,})\b/i);

      const fields: ExtractedField[] = [];

      // ✅ Sanitize manufacturer BEFORE pushing to fields
      if (manufacturer) {
        const meanConf = best.meanWordConfidence; // 0..100
        const conf = scoreFromReasons(manufacturerReason, meanConf);
      
        if (manufacturerReason !== 'labeled') {
          const upperBrand = manufacturer.toUpperCase();
          const words = upperBrand.split(/\s+/).filter(Boolean);
      
          // "STI EAL" / "ABC DEF" style OCR junk: multiple short chunks
          const allShort = words.length >= 2 && words.every((w) => w.length <= 3);
      
          // Extra strictness for non-labeled manufacturer guesses
          if (
            allShort ||
            /\d/.test(upperBrand) ||
            meanConf < 45 ||
            conf < 0.45 ||
            looksLikeOcrGarbageBrand(manufacturer)
          ) {
            manufacturer = null;
          }
        } else {
          // even labeled values can be garbage sometimes
          if (conf < 0.35 || looksLikeOcrGarbageBrand(manufacturer)) {
            manufacturer = null;
          }
        }
      
        if (manufacturer) {
          fields.push({
            key: 'manufacturer',
            value: manufacturer,
            confidence: scoreFromReasons(manufacturerReason, meanConf),
          });
        }
      }
         
    if (modelNumber) fields.push({ key: 'modelNumber', value: modelNumber, confidence: scoreFromReasons('labeled', best.meanWordConfidence) });
    if (upc) fields.push({ key: 'upc', value: upc, confidence: scoreFromReasons('digit', best.meanWordConfidence) });
    if (sku) fields.push({ key: 'sku', value: sku, confidence: scoreFromReasons('labeled', best.meanWordConfidence) });
    if (serialNumber) {
      const base = clamp01(best.meanWordConfidence / 100);
    
      // ✅ EXP/LOT/BATCH-derived serials are semantically strong
      const serialConf =
        serialReason.startsWith('exp_lot_')
          ? clamp01(0.55 + 0.40 * base) // ~0.55..0.95
          : scoreFromReasons(serialReason === 'labeled' ? 'labeled' : 'heuristic', best.meanWordConfidence);
    
      fields.push({
        key: 'serialNumber',
        value: serialNumber,
        confidence: serialConf,
      });
    }    
    
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
