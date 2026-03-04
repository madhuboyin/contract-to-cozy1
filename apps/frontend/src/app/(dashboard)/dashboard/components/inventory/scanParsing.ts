export type ModelSerialCandidate = {
  modelNumber?: string;
  serialNumber?: string;
  manufacturer?: string;
};

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function isValidGtinChecksum(digits: string): boolean {
  if (!GTIN_LENGTHS.has(digits.length)) return false;
  if (!/^\d+$/.test(digits)) return false;

  const numbers = digits.split('').map((char) => Number(char));
  const checkDigit = numbers.pop();
  if (checkDigit === undefined) return false;

  let weightedSum = 0;
  for (let i = numbers.length - 1, pos = 1; i >= 0; i -= 1, pos += 1) {
    weightedSum += numbers[i] * (pos % 2 === 1 ? 3 : 1);
  }

  const computedCheck = (10 - (weightedSum % 10)) % 10;
  return computedCheck === checkDigit;
}

function normalizeGtinCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = digitsOnly(value);
  if (!GTIN_LENGTHS.has(digits.length)) return null;
  return isValidGtinChecksum(digits) ? digits : null;
}

export function extractDigitsCandidate(text: string): string | null {
  const source = String(text || '').trim();
  if (!source) return null;

  try {
    const url = new URL(source);
    const queryCandidates = [
      url.searchParams.get('upc'),
      url.searchParams.get('gtin'),
      url.searchParams.get('ean'),
      url.searchParams.get('code'),
      url.searchParams.get('barcode'),
    ];

    for (const candidate of queryCandidates) {
      const normalized = normalizeGtinCandidate(candidate);
      if (normalized) return normalized;
    }
  } catch {
    // not a URL; continue
  }

  const explicitMatches = source.match(/(?:upc|gtin|ean|barcode)\s*[:=]\s*([0-9\- ]{8,20})/gi) || [];
  for (const entry of explicitMatches) {
    const normalized = normalizeGtinCandidate(entry);
    if (normalized) return normalized;
  }

  const numericRuns = source.match(/[0-9]{8,14}/g) || [];
  for (const run of numericRuns) {
    const normalized = normalizeGtinCandidate(run);
    if (normalized) return normalized;
  }

  return null;
}

export function extractModelSerialCandidate(text: string): ModelSerialCandidate {
  const source = String(text || '');

  const model =
    source.match(/model\s*(no\.?|number|#)?\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[2] ||
    source.match(/\bmdl\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[1] ||
    undefined;

  const serial =
    source.match(/serial\s*(no\.?|number|#)?\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[2] ||
    source.match(/\bs\/n\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[1] ||
    undefined;

  const manufacturer =
    source.match(/manufacturer\s*[:=]\s*([A-Za-z0-9 &.'\-]+)/i)?.[1] ||
    source.match(/\bmfg\s*[:=]\s*([A-Za-z0-9 &.'\-]+)/i)?.[1] ||
    undefined;

  return { modelNumber: model, serialNumber: serial, manufacturer };
}

export function hasMeaningfulLookupData(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return false;

  const keys = ['name', 'manufacturer', 'modelNumber', 'categoryHint', 'imageUrl'];
  return keys.some((key) => String(payload[key] ?? '').trim().length > 0);
}
