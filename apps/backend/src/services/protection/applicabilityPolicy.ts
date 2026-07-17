import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface ProtectionContextDecisions {
  riskAssessment: FeatureDecision;
  currentRiskOutput: FeatureDecision;
  inspectionEvidence: FeatureDecision;
  coverageEvidence: FeatureDecision;
  recallEvidence: FeatureDecision;
  guidanceState: FeatureDecision;
}

function outputDecision(
  context: PropertyContextSnapshot,
  key: string,
  availableReason: string,
  unavailableReason: string,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  const value = facts.read<unknown>(key);
  return value === undefined
    ? facts.unknown(unavailableReason)
    : facts.decision('APPLICABLE', [availableReason]);
}

export function evaluateProtectionContext(context: PropertyContextSnapshot): ProtectionContextDecisions {
  const riskFacts = new PropertyContextDecisionBuilder(context);
  const squareFeet = riskFacts.read<number>('core.propertySizeSqFt');
  const yearBuilt = riskFacts.read<number>('core.yearBuilt');
  const riskAssessment = !squareFeet || !yearBuilt
    ? riskFacts.unknown('RISK_BASELINE_FACTS_UNKNOWN')
    : riskFacts.decision('APPLICABLE', ['RISK_BASELINE_AVAILABLE']);

  return {
    riskAssessment,
    currentRiskOutput: outputDecision(context, 'risk.report', 'CURRENT_RISK_REPORT_AVAILABLE', 'CURRENT_RISK_REPORT_UNAVAILABLE'),
    inspectionEvidence: outputDecision(context, 'inspection.openFindings', 'INSPECTION_STATE_AVAILABLE', 'INSPECTION_STATE_UNAVAILABLE'),
    coverageEvidence: outputDecision(context, 'coverage.insurancePolicies', 'COVERAGE_STATE_AVAILABLE', 'COVERAGE_STATE_UNAVAILABLE'),
    recallEvidence: outputDecision(context, 'recalls.unresolvedMatches', 'RECALL_STATE_AVAILABLE', 'RECALL_STATE_UNAVAILABLE'),
    guidanceState: outputDecision(context, 'guidance.activeSignals', 'GUIDANCE_STATE_AVAILABLE', 'GUIDANCE_STATE_UNAVAILABLE'),
  };
}
