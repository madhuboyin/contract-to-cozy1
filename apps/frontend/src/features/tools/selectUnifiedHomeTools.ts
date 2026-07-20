import type { RankedHomeActionDTO, UnifiedHomeDTO } from '@/types';
import type { ToolId } from './toolRegistry';

export type UnifiedHomeToolRecommendation = {
  toolId: ToolId;
  whyNow: string;
  outcome: string;
  readiness: string;
  score: number;
};

type Candidate = UnifiedHomeToolRecommendation;

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

function actionAlreadyLaunchesTool(action: RankedHomeActionDTO, toolId: ToolId): boolean {
  const hrefs = [action.primaryCta.href, ...action.secondaryCtas.map((cta) => cta.href)];
  return hrefs.some((href) => href.includes(`/tools/${toolId}`) || href.includes(`/dashboard/${toolId}`));
}

/**
 * Deterministic Unified Home tool selection. The canonical ranked action feed and
 * Property Context summary are the only inputs; no generative model is involved.
 */
export function selectUnifiedHomeTools(home: UnifiedHomeDTO, maxItems = 3): UnifiedHomeToolRecommendation[] {
  const actions = home.attention.actions;
  const texts = actions.map(actionText);
  const candidates: Candidate[] = [];
  const added = new Set<ToolId>();

  const add = (candidate: Candidate) => {
    if (added.has(candidate.toolId)) return;
    if (actions.some((action) => actionAlreadyLaunchesTool(action, candidate.toolId))) return;
    added.add(candidate.toolId);
    candidates.push(candidate);
  };

  const coverageCount = home.glance.coverageGapCount;
  if (coverageCount > 0) {
    add({
      toolId: 'coverage-options',
      whyNow: `${coverageCount} home item${coverageCount === 1 ? '' : 's'} currently lack confirmed coverage.`,
      outcome: 'Compare coverage paths for the gaps already identified in your Home Record.',
      readiness: 'Uses your current systems and coverage records.',
      score: 96,
    });
  }

  const weatherCount = texts.filter((text) => /weather|storm|flood|wind|hail|climate/.test(text)).length;
  if (weatherCount > 0) {
    add({
      toolId: 'home-event-radar',
      whyNow: `${weatherCount} active action${weatherCount === 1 ? '' : 's'} reference weather or local conditions.`,
      outcome: 'See the property-specific events and signals behind those actions.',
      readiness: 'Uses this property’s location and active Home signals.',
      score: 94,
    });
  }

  const serviceCount = texts.filter((text) => /repair|service|contractor|quote|maintenance|replace/.test(text)).length;
  if (serviceCount > 0) {
    add({
      toolId: 'service-price-radar',
      whyNow: `${serviceCount} ranked action${serviceCount === 1 ? '' : 's'} may lead to maintenance, repair, or professional service.`,
      outcome: 'Benchmark likely service pricing before reviewing or accepting a quote.',
      readiness: 'Works best when you add the service type or a contractor quote.',
      score: 90,
    });
  }

  const lifecycleCount = texts.filter((text) => /system|lifecycle|replacement|aging|end of life|capital/.test(text)).length;
  if (lifecycleCount > 0 || home.glance.trackedSystems > 0) {
    add({
      toolId: 'capital-timeline',
      whyNow: `${home.glance.trackedSystems} home system${home.glance.trackedSystems === 1 ? ' is' : 's are'} currently tracked.`,
      outcome: 'Place likely replacements and major costs on a longer-range timeline.',
      readiness: 'Accuracy improves with system age, condition, and service history.',
      score: lifecycleCount > 0 ? 88 : 72,
    });
  }

  const materialDecisionCount = actions.filter((action) => action.governance.safetyTier === 'MATERIAL_FINANCIAL').length;
  if (materialDecisionCount > 0) {
    add({
      toolId: 'break-even',
      whyNow: `${materialDecisionCount} material financial decision${materialDecisionCount === 1 ? '' : 's'} ${materialDecisionCount === 1 ? 'is' : 'are'} active.`,
      outcome: 'Compare timing and cumulative cost before committing to a major expense.',
      readiness: 'Add expected cost and timing for a more useful comparison.',
      score: 84,
    });
  }

  const contextIssueCount = home.propertyContext.missingFactCount + home.propertyContext.conflictedFactCount + home.propertyContext.staleFactCount;
  if (contextIssueCount > 0) {
    add({
      toolId: 'home-digital-twin',
      whyNow: `${contextIssueCount} Home Record fact${contextIssueCount === 1 ? '' : 's'} are missing, stale, or conflicting.`,
      outcome: 'See how the known systems, condition, and risk context fit together.',
      readiness: 'You can explore now and improve the model by correcting Home Record facts.',
      score: 78,
    });
  }

  if (candidates.length < maxItems) {
    add({
      toolId: 'hidden-asset-finder',
      whyNow: 'Your existing property and system records can be checked for ownership benefits.',
      outcome: 'Look for rebates, credits, and programs that may apply to this home.',
      readiness: 'Results improve when system and improvement details are current.',
      score: 64,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.toolId.localeCompare(b.toolId))
    .slice(0, Math.max(0, maxItems));
}
