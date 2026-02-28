const DISPLAY_OVERRIDES: Record<string, string> = {
  HVAC: 'HVAC',
  TV: 'TV',
  SKU: 'SKU',
  UPC: 'UPC',
  AC: 'AC',
  CO: 'CO',
  GFCI: 'GFCI',
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

export function humanizeLabel(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const key = raw.toUpperCase();
  const override = DISPLAY_OVERRIDES[key];
  if (override) return override;

  return key
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeDisplaySegments(value: string): string {
  return String(value || '')
    .replace(/\s*-\s*/g, ' · ')
    .replace(/\s*·\s*/g, ' · ')
    .trim();
}
