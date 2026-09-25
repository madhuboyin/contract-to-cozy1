// Ask handler support: capabilityDiscovery. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { buildCapabilityCatalog, canonicalCapabilityRegistry, matchCapabilityGoal, type CapabilityCatalogItem } from '../../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../../toolDiscoveryAvailability.service';
import { getCapabilityDiscoveryReadiness, getRelatedCapabilities } from '../../capabilityRelated.service';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { capabilityCardLaunch } from '../askCapabilityCardLaunch';

export async function capabilityResult(userId: string, propertyId: string | null | undefined, message: string): Promise<AskOperationResult> {
  const exploreToolsHref = propertyId
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/tools`
    : '/dashboard/home-tools';
  const availability = createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry);
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability,
    userId,
    propertyId: propertyId ?? undefined,
    includeWorkflowContext: false,
  });
  const catalogById = new Map(catalog.capabilities.map((capability) => [capability.id, capability]));
  const availableDefinitions = availability.listAvailable({ userId, includeWorkflowOnly: false });
  const allMatches = matchCapabilityGoal({ registry: canonicalCapabilityRegistry, goal: message, limit: 5 });
  const availableMatches = matchCapabilityGoal({
    registry: canonicalCapabilityRegistry,
    goal: message,
    capabilities: availableDefinitions,
    limit: 5,
  });
  const strongest = allMatches.matches[0];
  const strongestAvailable = availableMatches.matches[0];
  const requestedUnavailable = strongest
    && !catalogById.has(strongest.capabilityId)
    && (!strongestAvailable || strongest.score - strongestAvailable.score >= 8);

  if (requestedUnavailable) {
    const capability = canonicalCapabilityRegistry.getById(strongest.capabilityId)!;
    const decision = availability.resolve(capability.id, userId);
    const workflowOnly = capability.destination.workflowOnly;
    return {
      status: 'UNAVAILABLE',
      reasonCode: workflowOnly ? 'CAPABILITY_REQUIRES_WORKFLOW_CONTEXT' : decision.reason ?? 'CAPABILITY_UNAVAILABLE',
      contextVersion: catalog.registryVersion,
      blocks: [{
        type: 'SUMMARY',
        id: 'requested-capability-unavailable',
        title: `${capability.presentation.label} is not available here`,
        body: workflowOnly
          ? 'This capability is offered only from an eligible home workflow where the required source context is present. I will not provide a stale or non-launchable shortcut.'
          : 'This capability is currently disabled, outside your rollout, or has failed a launch-readiness check. I will not recommend a tool that cannot be opened safely.',
        tone: 'CAUTION',
        actions: [{ id: 'explore-available-tools', label: 'Explore available tools', href: exploreToolsHref, style: 'SECONDARY' }],
      }],
      suggestions: ['Show me another available option', 'What can help with this goal instead?'],
    };
  }

  if (!availableMatches.matches.length) {
    return {
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'no-capability-match', title: 'Tell me what outcome you want',
        body: 'I could not identify one specific tool yet. Describe the decision, task, risk, savings goal, or major home moment you want help with.',
        tone: 'DEFAULT', actions: [{ id: 'explore-tools', label: 'Explore home tools', href: exploreToolsHref, style: 'SECONDARY' }],
      }],
      suggestions: ['Help me compare contractor quotes', 'I want to plan future replacements', 'Can you monitor refinance rates?'],
    };
  }

  const readiness = propertyId
    ? await getCapabilityDiscoveryReadiness({ propertyId, userId })
    : null;
  const ranked = availableMatches.matches
    .slice(0, availableMatches.ambiguous ? 3 : 2)
    .flatMap((match) => {
      const capability = catalogById.get(match.capabilityId);
      return capability ? [{ capability, match }] : [];
    });
  const card = (capability: CapabilityCatalogItem) => {
    const requiresProperty = capability.readinessRequirements.some((requirement) => requirement.kind === 'PROPERTY');
    const policyReadiness = readiness?.readinessByCapabilityId[capability.id];
    const state = !propertyId && requiresProperty
      ? 'NEEDS_PROPERTY' as const
      : policyReadiness ?? 'READY' as const;
    const reasons = state === 'NEEDS_PROPERTY'
      ? ['Select a home so the capability can use the correct property context.']
      : readiness?.reasonsByCapabilityId[capability.id] ?? [];
    const readinessLabel = state === 'READY'
      ? 'Ready for this home'
      : state === 'NEEDS_PROPERTY'
        ? 'Home selection required'
        : state === 'NEEDS_CONTEXT'
          ? 'More home details will improve the result'
          : 'Not ready for the current context';
    return {
      id: capability.id,
      label: capability.label,
      description: capability.shortDescription,
      expectedOutput: capability.expectedOutput,
      href: capability.href,
      ...capabilityCardLaunch(capability.id),
      readiness: state,
      readinessLabel,
      readinessReasons: reasons.slice(0, 5),
      releaseStage: capability.releaseStage,
    };
  };
  const blocks: AskPresentationBlock[] = [{
    type: 'CAPABILITY_LIST',
    id: 'capability-matches',
    title: availableMatches.ambiguous ? 'A few tools could fit—choose the closest goal' : 'Best match for your goal',
    description: availableMatches.ambiguous
      ? 'These are close matches from the live capability registry. Nothing was chosen on your behalf.'
      : 'Ranked from reviewed homeowner language, current availability, and canonical readiness policy.',
    capabilities: ranked.map(({ capability }) => card(capability)),
  }];

  if (propertyId && ranked[0]) {
    try {
      const related = await getRelatedCapabilities({
        propertyId,
        userId,
        currentCapabilityId: ranked[0].capability.id,
        limit: 3,
      });
      const selectedIds = new Set(ranked.map(({ capability }) => capability.id));
      const relatedCards = related.suggestions
        .filter((suggestion) => !selectedIds.has(suggestion.capabilityId))
        .slice(0, 3)
        .flatMap((suggestion) => {
          const capability = catalogById.get(suggestion.capabilityId);
          return capability ? [card(capability)] : [];
        });
      if (relatedCards.length) {
        blocks.push({
          type: 'CAPABILITY_LIST',
          id: 'related-capabilities',
          title: 'Related tools for what comes next',
          description: 'Related through the canonical capability lifecycle and filtered for this home.',
          capabilities: relatedCards,
        });
      }
    } catch {
      // Discovery remains useful if optional continuity context is temporarily unavailable.
    }
  }

  return {
    status: 'ANSWERED',
    contextVersion: readiness?.contextVersion ?? catalog.registryVersion,
    blocks,
    suggestions: availableMatches.ambiguous
      ? ['Help me narrow these options', 'Show only tools ready for this home']
      : ['What information does this tool need?', 'What result will I get?', 'Show another option'],
  };
}

registerCapabilityHandler('capability.discovery', async (envelope) => capabilityResult(envelope.userId, envelope.propertyId, envelope.message));
