import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';

function normalizeHealthInsightText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getNamedHealthInsightAssetName(
  factor: string | undefined,
  status: string | undefined,
): string | null {
  if (!factor || status !== 'Needs Warranty') return null;

  const trimmed = factor.trim();
  if (!trimmed) return null;

  const withoutSuffix = trimmed
    .replace(/\s+aging$/i, '')
    .replace(/\s+age$/i, '')
    .replace(/\s+needs coverage$/i, '')
    .replace(/\s+has partial coverage$/i, '')
    .trim();

  if (!withoutSuffix) return null;

  const normalized = normalizeHealthInsightText(withoutSuffix);
  if (
    normalized === 'appliances' ||
    normalized === 'property' ||
    normalized === 'property age' ||
    normalized === 'hvac' ||
    normalized === 'hvac age' ||
    normalized === 'water heater' ||
    normalized === 'water heater age'
  ) {
    return null;
  }

  return withoutSuffix;
}

export function buildHealthInsightResolutionHref(args: {
  propertyId: string;
  factor: string | undefined;
  status: string | undefined;
}): string | null {
  const assetName = getNamedHealthInsightAssetName(args.factor, args.status);
  if (!assetName || !args.factor) return null;

  return buildGuidanceOverviewHref({
    propertyId: args.propertyId,
    assetName,
    customIssueLabel: args.factor,
  });
}
