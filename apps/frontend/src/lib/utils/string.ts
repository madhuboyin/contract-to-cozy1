const DISPLAY_OVERRIDES: Record<string, string> = {
  HVAC: 'HVAC',
  TV: 'TV',
  SKU: 'SKU',
  UPC: 'UPC',
};

export function titleCase(str: string): string {
  if (!str) return '';

  return str
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function titleCaseCategory(str: string): string {
  const key = String(str || '').toUpperCase();
  return DISPLAY_OVERRIDES[key] ?? titleCase(str);
}

export function normalizeDisplaySegments(value: string): string {
  return String(value || '')
    .replace(/\s*-\s*/g, ' · ')
    .replace(/\s*·\s*/g, ' · ')
    .trim();
}
