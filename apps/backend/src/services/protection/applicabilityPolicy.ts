import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface ProtectionContextDecisions {
  riskAssessment: FeatureDecision;
  currentRiskOutput: FeatureDecision;
  inspectionEvidence: FeatureDecision;
  coverageEvidence: FeatureDecision;
  recallEvidence: FeatureDecision;
  guidanceState: FeatureDecision;
  riskPremiumOptimizer: FeatureDecision;
  applianceOracle: FeatureDecision;
  visualInspector: FeatureDecision;
  climateRisk: FeatureDecision;
  eventRadar: FeatureDecision;
  riskReplay: FeatureDecision;
  roofActions: FeatureDecision;
  exteriorActions: FeatureDecision;
  plumbingActions: FeatureDecision;
  hvacActions: FeatureDecision;
  commonSafetyActions: FeatureDecision;
  incidentNotifications: FeatureDecision;
}

type ResponsibleParty = 'OWNER' | 'ASSOCIATION' | 'LANDLORD' | 'SHARED' | 'UNKNOWN';

function responsibilityDecision(context: PropertyContextSnapshot, key: string): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  const party = facts.read<ResponsibleParty>(key);
  if (!party || party === 'UNKNOWN') return facts.unknown('RESPONSIBILITY_UNKNOWN');
  if (party === 'OWNER' || party === 'SHARED') {
    return facts.decision('APPLICABLE', [party === 'SHARED' ? 'SHARED_RESPONSIBILITY' : 'OWNER_RESPONSIBILITY']);
  }
  return facts.decision('NOT_APPLICABLE', [party === 'ASSOCIATION' ? 'ASSOCIATION_RESPONSIBILITY' : 'LANDLORD_RESPONSIBILITY']);
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

  const coverageFacts = new PropertyContextDecisionBuilder(context);
  const policies = coverageFacts.read<Array<{ startDate?: string; expiryDate?: string }>>('coverage.insurancePolicies');
  const now = new Date(context.generatedAt).getTime();
  const hasActivePolicy = policies?.some((policy) => {
    const start = policy.startDate ? new Date(policy.startDate).getTime() : Number.NaN;
    const expiry = policy.expiryDate ? new Date(policy.expiryDate).getTime() : Number.NaN;
    return Number.isFinite(start) && Number.isFinite(expiry) && start <= now && expiry > now;
  });
  const riskPremiumOptimizer = policies === undefined
    ? coverageFacts.unknown('COVERAGE_STATE_UNAVAILABLE')
    : hasActivePolicy
      ? coverageFacts.decision('APPLICABLE', ['ACTIVE_POLICY_AVAILABLE'])
      : coverageFacts.decision('NOT_APPLICABLE', ['NO_ACTIVE_POLICY']);

  const applianceFacts = new PropertyContextDecisionBuilder(context);
  const inventoryItems = applianceFacts.read<Array<{ category?: string }>>('inventory.items');
  const installedAppliances = inventoryItems?.filter((item) => item.category === 'APPLIANCE');
  const applianceOracle = inventoryItems === undefined
    ? applianceFacts.unknown('INVENTORY_STATE_UNAVAILABLE')
    : installedAppliances && installedAppliances.length > 0
      ? applianceFacts.decision('APPLICABLE', ['INSTALLED_INVENTORY_AVAILABLE'])
      : applianceFacts.decision('NOT_APPLICABLE', ['NO_INSTALLED_APPLIANCES']);

  const climateFacts = new PropertyContextDecisionBuilder(context);
  const state = climateFacts.read<string>('location.state');
  const zipCode = climateFacts.read<string>('location.zipCode');
  const climateRisk = !state || !zipCode
    ? climateFacts.unknown('CLIMATE_LOCATION_UNKNOWN')
    : climateFacts.decision('APPLICABLE', ['CLIMATE_LOCATION_AVAILABLE']);

  const eventFacts = new PropertyContextDecisionBuilder(context);
  const activeRadarMatches = eventFacts.read<unknown[]>('events.activeRadarMatches');
  const eventRadar = activeRadarMatches === undefined
    ? eventFacts.unknown('EVENT_STATE_UNAVAILABLE')
    : eventFacts.decision('APPLICABLE', ['EVENT_STATE_AVAILABLE']);

  const replayFacts = new PropertyContextDecisionBuilder(context);
  const recentHomeEvents = replayFacts.read<unknown[]>('events.recentHomeEvents');
  const riskReplay = recentHomeEvents === undefined
    ? replayFacts.unknown('EVENT_HISTORY_UNAVAILABLE')
    : replayFacts.decision('APPLICABLE', ['EVENT_HISTORY_AVAILABLE']);

  const visualFacts = new PropertyContextDecisionBuilder(context);
  const visualInspector = visualFacts.decision('APPLICABLE', ['VISUAL_OUTPUT_PROVISIONAL']);

  const incidentFacts = new PropertyContextDecisionBuilder(context);
  const activeIncidents = incidentFacts.read<unknown[]>('risk.activeIncidents');
  const incidentNotifications = activeIncidents === undefined
    ? incidentFacts.unknown('INCIDENT_STATE_UNAVAILABLE')
    : activeIncidents.length > 0
      ? incidentFacts.decision('APPLICABLE', ['ACTIVE_INCIDENT_PRESENT'])
      : incidentFacts.decision('NOT_APPLICABLE', ['NO_ACTIVE_INCIDENT']);

  return {
    riskAssessment,
    currentRiskOutput: outputDecision(context, 'risk.report', 'CURRENT_RISK_REPORT_AVAILABLE', 'CURRENT_RISK_REPORT_UNAVAILABLE'),
    inspectionEvidence: outputDecision(context, 'inspection.openFindings', 'INSPECTION_STATE_AVAILABLE', 'INSPECTION_STATE_UNAVAILABLE'),
    coverageEvidence: outputDecision(context, 'coverage.insurancePolicies', 'COVERAGE_STATE_AVAILABLE', 'COVERAGE_STATE_UNAVAILABLE'),
    recallEvidence: outputDecision(context, 'recalls.unresolvedMatches', 'RECALL_STATE_AVAILABLE', 'RECALL_STATE_UNAVAILABLE'),
    guidanceState: outputDecision(context, 'guidance.activeSignals', 'GUIDANCE_STATE_AVAILABLE', 'GUIDANCE_STATE_UNAVAILABLE'),
    riskPremiumOptimizer,
    applianceOracle,
    visualInspector,
    climateRisk,
    eventRadar,
    riskReplay,
    roofActions: responsibilityDecision(context, 'responsibility.roof'),
    exteriorActions: responsibilityDecision(context, 'responsibility.buildingExterior'),
    plumbingActions: responsibilityDecision(context, 'responsibility.plumbing'),
    hvacActions: responsibilityDecision(context, 'responsibility.hvac'),
    commonSafetyActions: responsibilityDecision(context, 'responsibility.commonSafety'),
    incidentNotifications,
  };
}
