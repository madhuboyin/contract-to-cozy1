// Home Intelligence Functional Completeness FRD Phase 3A, work item 1/6 —
// the decision-family adapter registry. Maps each registered
// DecisionDefinitionId to the adapter that can resolve/create its Decision
// Thread lineage. Validated at startup (index.ts) so a decision definition
// added to decisionDefinitionRegistry.ts without a matching adapter here
// fails fast instead of degrading silently to a "safe-next-action" response
// for every homeowner in that family.

import { DECISION_DEFINITIONS, type DecisionDefinitionId } from './decisionDefinitionRegistry';
import type { DecisionFamilyAdapter } from './decisionFamilyAdapter';
import { hvacDecisionFamilyAdapter } from './decisionThreadService';
import {
  coverageQuestionDecisionFamilyAdapter,
  homeCapitalTimelineWindowDecisionFamilyAdapter,
  ownershipCostChangeDecisionFamilyAdapter,
  refinanceOpportunityDecisionFamilyAdapter,
  savingsBenefitMatchDecisionFamilyAdapter,
} from './domainSnapshotAdapters';

const DECISION_FAMILY_ADAPTERS: Partial<Record<DecisionDefinitionId, DecisionFamilyAdapter>> = {
  HVAC_REPAIR_REPLACE: hvacDecisionFamilyAdapter,
  REFINANCE_OPPORTUNITY: refinanceOpportunityDecisionFamilyAdapter,
  HOME_CAPITAL_TIMELINE_WINDOW: homeCapitalTimelineWindowDecisionFamilyAdapter,
  OWNERSHIP_COST_CHANGE: ownershipCostChangeDecisionFamilyAdapter,
  SAVINGS_BENEFIT_MATCH: savingsBenefitMatchDecisionFamilyAdapter,
  COVERAGE_QUESTION: coverageQuestionDecisionFamilyAdapter,
};

export function getDecisionFamilyAdapter(decisionDefinitionId: DecisionDefinitionId): DecisionFamilyAdapter | null {
  return DECISION_FAMILY_ADAPTERS[decisionDefinitionId] ?? null;
}

export function validateDecisionFamilyAdapterRegistry(): string[] {
  const issues: string[] = [];
  for (const decisionDefinitionId of Object.keys(DECISION_DEFINITIONS) as DecisionDefinitionId[]) {
    const adapter = DECISION_FAMILY_ADAPTERS[decisionDefinitionId];
    if (!adapter) {
      issues.push(`decisionFamilyAdapterRegistry: no adapter registered for decision definition "${decisionDefinitionId}"`);
      continue;
    }
    if (adapter.decisionDefinitionId !== decisionDefinitionId) {
      issues.push(`decisionFamilyAdapterRegistry: adapter for "${decisionDefinitionId}" declares mismatched decisionDefinitionId "${adapter.decisionDefinitionId}"`);
    }
  }
  return issues;
}
