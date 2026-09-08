export type RiskDetailLike = {
  assetName?: unknown;
  systemType?: unknown;
  actionCta?: unknown;
  riskLevel?: unknown;
};

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/[_-]+/g, ' ') : '';
}

/** Legacy control-state rows are not evidence that a home has a hazard. */
export function isInsufficientRiskDetail(detail: RiskDetailLike): boolean {
  const assetName = normalized(detail.assetName);
  const systemType = normalized(detail.systemType);
  const action = normalized(detail.actionCta);
  return assetName === 'DATA MISSING'
    || assetName === 'FATAL ERROR'
    || (systemType === 'SYSTEM' && (
      action.includes('COMPLETE PROPERTY DETAILS')
      || action.includes('CALCULATION FAILED')
    ));
}

export function hasInsufficientRiskDetails(details: unknown): boolean {
  return Array.isArray(details) && details.some((detail) =>
    Boolean(detail) && typeof detail === 'object' && isInsufficientRiskDetail(detail as RiskDetailLike),
  );
}
