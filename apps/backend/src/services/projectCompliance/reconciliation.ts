import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';

type ProjectDecisionSet = {
  ownerProjectExecution: FeatureDecision;
};

const OPEN_OUTPUT_FACTS = [
  ['projects.activeProjects', 'ACTIVE_PROJECTS'],
  ['projects.openQuoteWorkspaces', 'OPEN_QUOTE_WORKSPACES'],
  ['projects.openPriceFinalizations', 'OPEN_PRICE_FINALIZATIONS'],
  ['projects.openNegotiations', 'OPEN_NEGOTIATIONS'],
  ['projects.activeBookings', 'ACTIVE_BOOKINGS'],
] as const;

export interface ProjectComplianceReconciliation {
  status: 'CURRENT' | 'REVIEW_REQUIRED';
  requiresReview: boolean;
  contextVersion: string;
  reasonCodes: string[];
  affectedOutputs: Array<{
    factKey: typeof OPEN_OUTPUT_FACTS[number][0];
    outputType: typeof OPEN_OUTPUT_FACTS[number][1];
    count: number;
  }>;
}

export function reconcileProjectComplianceOutputs(
  context: PropertyContextSnapshot,
  decisions: ProjectDecisionSet,
): ProjectComplianceReconciliation {
  const affectedOutputs = OPEN_OUTPUT_FACTS.flatMap(([factKey, outputType]) => {
    const fact = context.facts[factKey];
    const count = fact?.state === 'KNOWN' && Array.isArray(fact.value) ? fact.value.length : 0;
    return count > 0 ? [{ factKey, outputType, count }] : [];
  });
  const responsibilityNeedsReview = decisions.ownerProjectExecution.status !== 'APPLICABLE';
  const requiresReview = responsibilityNeedsReview && affectedOutputs.length > 0;

  return {
    status: requiresReview ? 'REVIEW_REQUIRED' : 'CURRENT',
    requiresReview,
    contextVersion: context.contextVersion,
    reasonCodes: requiresReview
      ? ['OPEN_PHASE4_OUTPUTS_REQUIRE_CONTEXT_REVIEW', ...decisions.ownerProjectExecution.reasonCodes]
      : ['PHASE4_OUTPUTS_MATCH_CURRENT_CONTEXT'],
    affectedOutputs,
  };
}
