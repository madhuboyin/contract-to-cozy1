type GuidanceOverviewHrefOptions = {
  propertyId: string;
  journeyId?: string | null;
  stepKey?: string | null;
  scopeCategory?: 'ITEM' | 'SERVICE' | null;
  inventoryItemId?: string | null;
  assetName?: string | null;
  issueType?: string | null;
  customIssueLabel?: string | null;
  backTo?: string | null;
};

export function normalizeGuidanceOverviewSearchParams(
  input: URLSearchParams
): URLSearchParams {
  const normalized = new URLSearchParams(input.toString());

  const guidanceJourneyId = normalized.get('guidanceJourneyId');
  const guidanceStepKey = normalized.get('guidanceStepKey');

  if (!normalized.get('journeyId') && guidanceJourneyId) {
    normalized.set('journeyId', guidanceJourneyId);
  }
  if (!normalized.get('stepKey') && guidanceStepKey) {
    normalized.set('stepKey', guidanceStepKey);
  }

  normalized.delete('guidanceJourneyId');
  normalized.delete('guidanceStepKey');

  return normalized;
}

export function normalizeGuidanceIssueTypeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildGuidanceOverviewHref({
  propertyId,
  journeyId,
  stepKey,
  scopeCategory,
  inventoryItemId,
  assetName,
  issueType,
  customIssueLabel,
  backTo,
}: GuidanceOverviewHrefOptions): string {
  const params = new URLSearchParams();

  if (journeyId) params.set('journeyId', journeyId);
  if (stepKey) params.set('stepKey', stepKey);

  if (inventoryItemId) {
    params.set('scopeCategory', 'ITEM');
    params.set('itemId', inventoryItemId);
    params.set('inventoryItemId', inventoryItemId);
  } else if (scopeCategory) {
    params.set('scopeCategory', scopeCategory);
  }

  const trimmedAssetName = assetName?.trim();
  if (trimmedAssetName) params.set('assetName', trimmedAssetName);

  const trimmedCustomIssueLabel = customIssueLabel?.trim();
  const normalizedIssueType =
    issueType?.trim() || (trimmedCustomIssueLabel ? normalizeGuidanceIssueTypeKey(trimmedCustomIssueLabel) : '');
  if (normalizedIssueType) params.set('issueType', normalizedIssueType);
  if (trimmedCustomIssueLabel) params.set('customIssueLabel', trimmedCustomIssueLabel);
  if (backTo) params.set('backTo', backTo);

  const query = params.toString();
  const baseHref = `/dashboard/properties/${propertyId}/tools/guidance-overview`;
  return query ? `${baseHref}?${query}` : baseHref;
}
