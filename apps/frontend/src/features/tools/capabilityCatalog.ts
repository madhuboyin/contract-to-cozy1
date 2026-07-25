import type {
  CapabilityCatalogItem,
  CapabilityOutcomeCategory,
} from './capabilityTypes';
import type {
  ToolDiscoveryContext,
  ToolLaunchContext,
  ToolReadiness,
} from './toolDiscoveryRegistry';

export const CAPABILITY_OUTCOME_CATEGORIES: Array<{
  key: CapabilityOutcomeCategory;
  title: string;
  summary: string;
}> = [
  { key: 'DECIDE_COMPARE', title: 'Decide and compare', summary: 'Evaluate options, quotes, and consequential choices.' },
  { key: 'PROTECT_MONITOR', title: 'Protect and monitor', summary: 'Watch risks, coverage, and changes affecting this home.' },
  { key: 'MAINTAIN_PREVENT', title: 'Maintain and prevent', summary: 'Build routines that reduce avoidable issues.' },
  { key: 'PLAN_BUDGET', title: 'Plan and budget', summary: 'Prepare for projects, replacements, and future costs.' },
  { key: 'SAVE_OPTIMIZE', title: 'Save and optimize', summary: 'Find savings, benefits, and better ownership economics.' },
  { key: 'UNDERSTAND_HOME', title: 'Understand your home', summary: 'Explore the records, history, and systems behind decisions.' },
];

export function capabilitySearchTerms(capability: CapabilityCatalogItem): string[] {
  return [
    capability.label,
    capability.shortDescription,
    capability.longDescription,
    ...capability.intentAliases,
    capability.outcomeCategory.replace(/_/g, ' '),
    capability.primaryJob.replace(/_/g, ' '),
    capability.primaryDestination.replace(/_/g, ' '),
    ...capability.supportedContext.map((context) => context.replace(/_/g, ' ')),
  ];
}

export function appendCapabilityLaunchContext(
  href: string,
  context: ToolLaunchContext,
): string {
  const params = new URLSearchParams();
  params.set('launchSurface', context.launchSurface);
  if (context.sourceActionId) params.set('sourceActionId', context.sourceActionId);
  if (context.sourceEntityType) params.set('sourceEntityType', context.sourceEntityType);
  if (context.sourceEntityId) params.set('sourceEntityId', context.sourceEntityId);
  if (context.contextVersion) params.set('contextVersion', context.contextVersion);
  if (context.recommendationReason) params.set('recommendationReason', context.recommendationReason);
  if (context.recommendationVersion) params.set('recommendationVersion', context.recommendationVersion);
  if (context.journeyId) params.set('journeyId', context.journeyId);
  if (context.guidanceStepKey) params.set('guidanceStepKey', context.guidanceStepKey);
  if (context.guidanceSignalIntentFamily) {
    params.set('guidanceSignalIntentFamily', context.guidanceSignalIntentFamily);
  }
  if (context.itemId) params.set('itemId', context.itemId);
  const suffix = params.toString();
  return suffix ? `${href}${href.includes('?') ? '&' : '?'}${suffix}` : href;
}

export function evaluateCapabilityReadiness(
  capability: CapabilityCatalogItem,
  context: ToolDiscoveryContext = {},
): ToolReadiness {
  const reasons: string[] = [];
  for (const requirement of capability.readinessRequirements) {
    if (requirement.kind === 'PROPERTY' && !context.propertyId) reasons.push(requirement.reason);
    if (
      requirement.kind === 'KNOWN_FACTS'
      && (context.knownFactCount ?? 0) < (requirement.minimum ?? 0)
    ) reasons.push(requirement.reason);
    if (
      requirement.kind === 'TRACKED_SYSTEMS'
      && (context.trackedSystems ?? 0) < (requirement.minimum ?? 0)
    ) reasons.push(requirement.reason);
    if (
      requirement.kind === 'COVERAGE_GAPS'
      && (context.coverageGapCount ?? 0) < (requirement.minimum ?? 0)
    ) reasons.push(requirement.reason);
    if (requirement.kind === 'SOURCE_CONTEXT') reasons.push(requirement.reason);
  }
  return reasons.length > 0
    ? { state: 'NEEDS_CONTEXT', reasons: [...new Set(reasons)] }
    : { state: 'READY', reasons: [] };
}
