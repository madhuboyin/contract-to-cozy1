import type { RankedHomeActionDTO, ToolDiscoveryAvailabilityDTO, UnifiedHomeDTO } from '@/types';
import {
  contextFromUnifiedHome,
  evaluateToolReadiness,
  getDiscoverableTool,
  type ToolReadiness,
} from './toolDiscoveryRegistry';

export const UNIFIED_HOME_TOOL_RULE_VERSION = 'unified-home-tools-v2';

export type UnifiedHomeToolRecommendation = {
  toolId: string;
  whyNow: string;
  outcome: string;
  readiness: string;
  readinessState: ToolReadiness['state'];
  reasonCode: string;
  score: number;
  sourceActionId?: string;
  sourceEntityId?: string;
};

type CandidateInput = Omit<UnifiedHomeToolRecommendation, 'readinessState'>;

function actionText(action: RankedHomeActionDTO): string {
  return [
    action.signal,
    action.whyItMatters,
    action.recommendedAction,
    action.expectedOutcome,
    action.source.kind,
    action.governance.safetyTier,
  ].join(' ').toLowerCase();
}

function findAction(actions: RankedHomeActionDTO[], pattern: RegExp): RankedHomeActionDTO | undefined {
  return actions.find((action) => pattern.test(actionText(action)));
}

function actionAlreadyLaunchesTool(action: RankedHomeActionDTO, toolId: string): boolean {
  const tool = getDiscoverableTool(toolId);
  if (!tool) return true;
  const hrefs = [action.primaryCta.href, ...action.secondaryCtas.map((cta) => cta.href)];
  return hrefs.some((href) => tool.matchesHref(href));
}

/**
 * Deterministic Unified Home tool selection. Canonical Home actions, decisions,
 * major moments, and Property Context are the only inputs; no generative model
 * or request-time external dependency is involved.
 */
export function selectUnifiedHomeTools(
  home: UnifiedHomeDTO,
  maxItems = 3,
  availability?: ToolDiscoveryAvailabilityDTO,
): UnifiedHomeToolRecommendation[] {
  const actions = home.attention.actions;
  const candidates: UnifiedHomeToolRecommendation[] = [];
  const added = new Set<string>();
  const discoveryContext = contextFromUnifiedHome(home);

  const add = (candidate: CandidateInput) => {
    if (added.has(candidate.toolId)) return;
    if (actions.some((action) => actionAlreadyLaunchesTool(action, candidate.toolId))) return;
    const tool = getDiscoverableTool(candidate.toolId);
    if (!tool) return;
    const readiness = evaluateToolReadiness(tool, discoveryContext, availability);
    if (readiness.state === 'UNAVAILABLE') return;
    added.add(candidate.toolId);
    candidates.push({
      ...candidate,
      readinessState: readiness.state,
      readiness: readiness.reasons[0] ?? candidate.readiness,
    });
  };

  const coverageAction = findAction(actions, /coverage|insurance|warranty|uninsured/);
  const coverageCount = home.glance.coverageGapCount;
  if (coverageCount > 0) {
    add({
      toolId: 'coverage-options',
      whyNow: `${coverageCount} home item${coverageCount === 1 ? '' : 's'} currently lack confirmed coverage.`,
      outcome: 'Compare coverage paths for the gaps already identified in your Home Record.',
      readiness: 'Uses your current systems and coverage records.',
      reasonCode: 'COVERAGE_GAPS_PRESENT',
      score: 96,
      sourceActionId: coverageAction?.id,
      sourceEntityId: coverageAction?.source.entityId,
    });
  }

  const weatherAction = findAction(actions, /weather|storm|flood|wind|hail|climate/);
  const weatherCount = actions.filter((action) => /weather|storm|flood|wind|hail|climate/.test(actionText(action))).length;
  if (weatherCount > 0) {
    add({
      toolId: 'home-event-radar',
      whyNow: `${weatherCount} active action${weatherCount === 1 ? '' : 's'} reference weather or local conditions.`,
      outcome: 'See the property-specific events and signals behind those actions.',
      readiness: 'Uses this property’s location and active Home signals.',
      reasonCode: 'WEATHER_SIGNAL_ACTIVE',
      score: 94,
      sourceActionId: weatherAction?.id,
      sourceEntityId: weatherAction?.source.entityId,
    });
  }

  const serviceAction = findAction(actions, /repair|service|contractor|quote|maintenance|replace/);
  const serviceCount = actions.filter((action) => /repair|service|contractor|quote|maintenance|replace/.test(actionText(action))).length;
  if (serviceCount > 0) {
    add({
      toolId: 'service-price-radar',
      whyNow: `${serviceCount} ranked action${serviceCount === 1 ? '' : 's'} may lead to maintenance, repair, or professional service.`,
      outcome: 'Benchmark likely service pricing before reviewing or accepting a quote.',
      readiness: 'Works best when you add the service type or a contractor quote.',
      reasonCode: 'SERVICE_DECISION_ACTIVE',
      score: 90,
      sourceActionId: serviceAction?.id,
      sourceEntityId: serviceAction?.source.entityId,
    });
  }

  const lifecycleAction = findAction(actions, /system|lifecycle|replacement|aging|end of life|capital/);
  if (lifecycleAction || home.glance.trackedSystems > 0) {
    add({
      toolId: 'capital-timeline',
      whyNow: `${home.glance.trackedSystems} home system${home.glance.trackedSystems === 1 ? ' is' : 's are'} currently tracked.`,
      outcome: 'Place likely replacements and major costs on a longer-range timeline.',
      readiness: 'Accuracy improves with system age, condition, and service history.',
      reasonCode: lifecycleAction ? 'LIFECYCLE_SIGNAL_ACTIVE' : 'TRACKED_SYSTEMS_AVAILABLE',
      score: lifecycleAction ? 88 : 72,
      sourceActionId: lifecycleAction?.id,
      sourceEntityId: lifecycleAction?.source.entityId,
    });
  }

  const materialDecision = home.decisions.find((action) => action.governance.safetyTier === 'MATERIAL_FINANCIAL')
    ?? actions.find((action) => action.governance.safetyTier === 'MATERIAL_FINANCIAL');
  const materialDecisionCount = [...home.decisions, ...actions]
    .filter((action) => action.governance.safetyTier === 'MATERIAL_FINANCIAL').length;
  if (materialDecisionCount > 0) {
    add({
      toolId: 'break-even',
      whyNow: `${materialDecisionCount} material financial decision${materialDecisionCount === 1 ? '' : 's'} ${materialDecisionCount === 1 ? 'is' : 'are'} active.`,
      outcome: 'Compare timing and cumulative cost before committing to a major expense.',
      readiness: 'Add expected cost and timing for a more useful comparison.',
      reasonCode: 'MATERIAL_DECISION_ACTIVE',
      score: 84,
      sourceActionId: materialDecision?.id,
      sourceEntityId: materialDecision?.source.entityId,
    });
  }

  if (home.activeMajorMoment?.kind === 'PROJECT') {
    add({
      toolId: 'home-renovation-risk-advisor',
      whyNow: `${home.activeMajorMoment.title} is an active project with a next milestone.`,
      outcome: 'Review permit, contractor, tax, and execution risks before the project advances.',
      readiness: 'Uses the active project and current property context.',
      reasonCode: 'ACTIVE_PROJECT_MOMENT',
      score: 86,
      sourceEntityId: home.activeMajorMoment.id,
    });
  }

  const contextIssueCount = home.propertyContext.missingFactCount + home.propertyContext.conflictedFactCount + home.propertyContext.staleFactCount;
  if (contextIssueCount > 0) {
    add({
      toolId: 'home-digital-twin',
      whyNow: `${contextIssueCount} Home Record fact${contextIssueCount === 1 ? '' : 's'} are missing, stale, or conflicting.`,
      outcome: 'See how the known systems, condition, and risk context fit together.',
      readiness: 'You can explore now and improve the model by correcting Home Record facts.',
      reasonCode: 'PROPERTY_CONTEXT_INCOMPLETE',
      score: 78,
    });
  }

  if (candidates.length < maxItems) {
    add({
      toolId: 'hidden-asset-finder',
      whyNow: 'Your existing property and system records can be checked for ownership benefits.',
      outcome: 'Look for rebates, credits, and programs that may apply to this home.',
      readiness: 'Results improve when system and improvement details are current.',
      reasonCode: 'PROPERTY_BENEFIT_EXPLORATION',
      score: 64,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.toolId.localeCompare(b.toolId))
    .slice(0, Math.max(0, maxItems));
}
