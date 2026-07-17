import type { FeatureDecision } from '../../modules/propertyContext';

export interface FinancialOutputReconciliation {
  status: 'CURRENT' | 'REVIEW_REQUIRED';
  requiresReview: boolean;
  reasonCodes: string[];
}

export function reconcileFinancialOutput(
  currentContextVersion: string,
  generatedContextVersion: string | null | undefined,
  decision: FeatureDecision,
): FinancialOutputReconciliation {
  const reasonCodes: string[] = [];
  if (decision.status !== 'APPLICABLE') {
    reasonCodes.push('FINANCIAL_OUTPUT_NO_LONGER_APPLICABLE');
  }
  if (generatedContextVersion && generatedContextVersion !== currentContextVersion) {
    reasonCodes.push('FINANCIAL_OUTPUT_CONTEXT_CHANGED');
  }
  if (!generatedContextVersion) {
    reasonCodes.push('FINANCIAL_OUTPUT_CONTEXT_VERSION_MISSING');
  }
  return {
    status: reasonCodes.length > 0 ? 'REVIEW_REQUIRED' : 'CURRENT',
    requiresReview: reasonCodes.length > 0,
    reasonCodes,
  };
}
