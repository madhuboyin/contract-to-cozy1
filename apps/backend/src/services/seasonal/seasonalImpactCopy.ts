export function seasonalImpactCopy(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  const copy = value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\binsurance\b|\brequired\b/i.test(sentence))
    .join(' ')
    .replace(/^Prevents\b/i, 'Can help prevent')
    .trim();

  return copy || null;
}

export function seasonalDisplayLabel(season: string): string {
  const normalized = season.trim().toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : 'Seasonal';
}
