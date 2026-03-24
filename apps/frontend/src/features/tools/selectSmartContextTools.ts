import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import type { GuidanceIssueDomain } from '@/lib/api/guidanceApi';
import type { ToolId } from './toolRegistry';

export type SmartToolRecommendation = {
  toolId: ToolId;
  trigger: string;
  value: string;
  score: number;
  confidence: 'HIGH' | 'MEDIUM';
};

type RuleCandidate = Omit<SmartToolRecommendation, 'confidence'>;

function byDomain(actions: GuidanceActionModel[], domain: GuidanceIssueDomain): GuidanceActionModel[] {
  return actions.filter((action) => action.issueDomain === domain);
}

function byHighSeverity(actions: GuidanceActionModel[]): GuidanceActionModel[] {
  return actions.filter((action) => action.severity === 'HIGH' || action.severity === 'CRITICAL');
}

function byImmediate(actions: GuidanceActionModel[]): GuidanceActionModel[] {
  return actions.filter((action) => action.priorityGroup === 'IMMEDIATE');
}

function hasCoverageGap(action: GuidanceActionModel): boolean {
  return action.coverageImpact === 'NOT_COVERED' || action.coverageImpact === 'PARTIAL';
}

function isMaintenancePressure(action: GuidanceActionModel): boolean {
  if (action.issueDomain !== 'MAINTENANCE') return false;
  if (action.priorityGroup === 'IMMEDIATE') return true;
  if (action.priorityBucket === 'HIGH') return true;
  return action.severity === 'HIGH' || action.severity === 'CRITICAL';
}

function isFinancialPressure(action: GuidanceActionModel): boolean {
  if (action.issueDomain !== 'FINANCIAL') return false;
  if (action.fundingGapFlag) return true;
  if (action.priorityBucket === 'HIGH') return true;
  return (action.costOfDelay ?? 0) >= 300;
}

function withConfidence(score: number): 'HIGH' | 'MEDIUM' {
  return score >= 82 ? 'HIGH' : 'MEDIUM';
}

/**
 * Deterministic selector for homepage Smart Context Tools.
 * Uses existing guidance actions only (no ML, no randomization).
 */
export function selectSmartContextTools(
  actions: GuidanceActionModel[],
  maxItems = 3,
): SmartToolRecommendation[] {
  const candidates: RuleCandidate[] = [];
  const added = new Set<ToolId>();

  const insuranceActions = byDomain(actions, 'INSURANCE');
  const insuranceHigh = byHighSeverity(insuranceActions);
  const coverageGapCount = actions.filter(hasCoverageGap).length;

  const maintenancePressure = actions.filter(isMaintenancePressure);
  const maintenanceHigh = byHighSeverity(maintenancePressure);

  const safetyActions = byDomain(actions, 'SAFETY');
  const safetyHigh = byHighSeverity(safetyActions);
  const weatherActions = byDomain(actions, 'WEATHER');
  const neighborhoodActions = byDomain(actions, 'NEIGHBORHOOD');
  const financialPressure = actions.filter(isFinancialPressure);
  const assetLifecycleActions = byDomain(actions, 'ASSET_LIFECYCLE');
  const marketValueActions = byDomain(actions, 'MARKET_VALUE');

  const urgentCount = actions.filter(
    (action) => action.priorityGroup === 'IMMEDIATE' || action.priorityBucket === 'HIGH',
  ).length;
  const immediateCount = byImmediate(actions).length;

  const add = (candidate: RuleCandidate) => {
    if (added.has(candidate.toolId)) return;
    added.add(candidate.toolId);
    candidates.push(candidate);
  };

  if (insuranceHigh.length > 0 || coverageGapCount > 0) {
    add({
      toolId: 'insurance-trend',
      score: insuranceHigh.length > 0 ? 93 : 88,
      trigger:
        insuranceHigh.length > 0
          ? 'Insurance risk signals are elevated.'
          : `${coverageGapCount} coverage gap${coverageGapCount === 1 ? '' : 's'} detected.`,
      value: 'Forecast premium pressure and compare protection options before renewal.',
    });
  }

  if (maintenanceHigh.length > 0) {
    add({
      toolId: 'service-price-radar',
      score: 87,
      trigger: `${maintenanceHigh.length} near-term maintenance signal${maintenanceHigh.length === 1 ? '' : 's'} surfaced.`,
      value: 'Benchmark quotes now to avoid overpaying on urgent work.',
    });
  }

  if (safetyHigh.length > 0) {
    add({
      toolId: 'home-risk-replay',
      score: 89,
      trigger: `${safetyHigh.length} high-severity safety signal${safetyHigh.length === 1 ? '' : 's'} active.`,
      value: 'Replay recent risk context so you can prioritize mitigation steps.',
    });
  }

  if (weatherActions.length > 0) {
    add({
      toolId: 'home-event-radar',
      score: 83,
      trigger: `${weatherActions.length} weather-linked signal${weatherActions.length === 1 ? '' : 's'} detected.`,
      value: 'Track active local events and check if your property may be affected.',
    });
  }

  if (financialPressure.length > 0) {
    add({
      toolId: 'break-even',
      score: 81,
      trigger: `${financialPressure.length} ownership-cost pressure signal${financialPressure.length === 1 ? '' : 's'} is emerging.`,
      value: 'Estimate how long to hold before costs are offset by projected value.',
    });

    add({
      toolId: 'cost-growth',
      score: 78,
      trigger: 'Financial movement indicates cost pressure may rise.',
      value: 'Model tax, insurance, and upkeep growth before they compound.',
    });
  }

  if (assetLifecycleActions.length > 0) {
    add({
      toolId: 'capital-timeline',
      score: 76,
      trigger: `${assetLifecycleActions.length} system lifecycle signal${assetLifecycleActions.length === 1 ? '' : 's'} identified.`,
      value: 'Plan replacement timing to smooth major capital spend.',
    });
  }

  if (neighborhoodActions.length > 0) {
    add({
      toolId: 'neighborhood-change-radar',
      score: 74,
      trigger: `${neighborhoodActions.length} neighborhood change signal${neighborhoodActions.length === 1 ? '' : 's'} active.`,
      value: 'Monitor external changes that could affect value and livability.',
    });
  }

  if (marketValueActions.length > 0) {
    add({
      toolId: 'sell-hold-rent',
      score: 73,
      trigger: 'Ownership outlook signals are shifting.',
      value: 'Compare hold/sell/rent paths with projected tradeoffs.',
    });
  }

  if (urgentCount >= 3 || immediateCount >= 2) {
    add({
      toolId: 'status-board',
      score: 85,
      trigger: `${urgentCount} high-priority signals are active right now.`,
      value: 'Track readiness in one place and sequence actions with less context switching.',
    });
  }

  if (urgentCount >= 2) {
    add({
      toolId: 'home-habit-coach',
      score: 72,
      trigger: 'Multiple active signals suggest routine drift.',
      value: 'Set a lightweight habit plan to reduce repeat issues.',
    });
  }

  const strong = candidates
    .filter((candidate) => candidate.score >= 70)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.toolId.localeCompare(b.toolId);
    });

  if (strong.length === 0) {
    return [
      {
        toolId: 'status-board',
        trigger: 'No concentrated risk cluster detected right now.',
        value: 'Run a quick readiness check before exploring deeper tools.',
        score: 58,
        confidence: 'MEDIUM',
      },
    ];
  }

  return strong.slice(0, Math.max(1, maxItems)).map((candidate) => ({
    ...candidate,
    confidence: withConfidence(candidate.score),
  }));
}
