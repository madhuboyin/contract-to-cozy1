// apps/backend/src/services/insuranceOcr.service.ts
import sharp from 'sharp';
import { APIError } from '../middleware/error.middleware';

export type InsuranceOcrExtractResult = {
  provider: string;
  rawText: string;
  personalPropertyLimitCents: number | null;
  deductibleCents: number | null;
  signals: {
    personalPropertyLabel: string | null;
    deductibleLabel: string | null;
  };
};

function cleanText(value: string) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐-–—]/g, '-')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

function parseMoneyToCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = String(value).replace(/[$,\s]/g, '');
  if (!normalized.length) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function extractLabeledAmount(rawText: string, labels: string[]): { cents: number | null; label: string | null } {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);

  for (const line of lines) {
    const upper = line.toUpperCase();
    const matchedLabel = labels.find((label) => upper.includes(label));
    if (!matchedLabel) continue;

    const amountMatch = line.match(/([$]?\s*[\d,]+(?:\.\d{2})?)/);
    const cents = parseMoneyToCents(amountMatch?.[1]);
    if (cents !== null) {
      return { cents, label: matchedLabel };
    }
  }

  return { cents: null, label: null };
}

export async function extractInsuranceFieldsFromImage(buffer: Buffer): Promise<InsuranceOcrExtractResult> {
  if (!buffer?.length) {
    throw new APIError('Image is required', 400, 'OCR_IMAGE_REQUIRED');
  }

  const preprocessed = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 2200, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.0 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const { createWorker } = await import('tesseract.js');
  const worker: any = await createWorker('eng');

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });

    const result = await worker.recognize(preprocessed);
    const rawText = cleanText(String(result?.data?.text || ''));

    const personalProperty = extractLabeledAmount(rawText, [
      'PERSONAL PROPERTY LIMIT',
      'CONTENTS COVERAGE',
      'PERSONAL PROPERTY',
    ]);

    const deductible = extractLabeledAmount(rawText, ['DEDUCTIBLE']);

    return {
      provider: 'tesseract',
      rawText,
      personalPropertyLimitCents: personalProperty.cents,
      deductibleCents: deductible.cents,
      signals: {
        personalPropertyLabel: personalProperty.label,
        deductibleLabel: deductible.label,
      },
    };
  } finally {
    await worker.terminate();
  }
}
