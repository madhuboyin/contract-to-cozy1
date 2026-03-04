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

  // Separator: colon, equals, or plain whitespace (one or more of any mix).
  // Using [\s:=]+ means "MODEL DW80R9950US", "MODEL: DW80R9950US", and
  // "MODEL = DW80R9950US" all work. Non-capturing groups keep [1] as the value.
  const model = (
    source.match(
      /\b(?:model(?:\s*(?:no\.?|number|#))?|mdl\.?|p\/?n)[\s:=]+([A-Za-z0-9\-_.]+)/i
    )?.[1]
  )?.trim() || undefined;

  const serial = (
    source.match(
      /\b(?:serial(?:\s*(?:no\.?|number|#))?|ser(?:\.?\s*(?:no\.?|#))?|s\/?n)[\s:=]+([A-Za-z0-9\-_.]+)/i
    )?.[1]
  )?.trim() || undefined;

  const manufacturer = (
    // colon/equals separator: allow multi-word brand names (e.g. "LG Electronics")
    source.match(
      /\b(?:manufacturer|mfg\.?|mfr\.?|brand|make)\s*[=:]\s*([A-Za-z0-9 &.'\-]+)/i
    )?.[1] ||
    // space separator: single word only to avoid greedy over-matching
    source.match(
      /\b(?:mfg\.?|mfr\.?)\s+([A-Za-z0-9&.'\-]+)/i
    )?.[1] ||
    undefined
  )?.trim() || undefined;

  return { modelNumber: model, serialNumber: serial, manufacturer };
}

export function hasMeaningfulLookupData(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return false;

  const keys = ['name', 'manufacturer', 'modelNumber', 'categoryHint', 'imageUrl', 'upc'];
  return keys.some((key) => String(payload[key] ?? '').trim().length > 0);
}
