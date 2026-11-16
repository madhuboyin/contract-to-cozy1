import type { AskOperationId } from '../askOperationRegistry';
import type { AskRoutingStage } from '../askRoutingCascade';
import { parseDeterministicSemanticRequest } from './deterministicSemanticParser';
import { evaluateLegacyVsSemanticGrammarAgreement } from './legacyGrammarAgreement';
import type { DynamicPlaceholderEntityCandidate } from './slice/placeholderSpanMap';
import {
  mayNeedDynamicQuoteResolution,
  parseCrossDomainSemanticRequest,
  type DynamicQuoteCandidate,
} from './crossDomain/crossDomainPlanBuilder';
import { normalizeToCanonicalSection5Domain } from './crossDomain/domainRolloutManifest';

export interface SemanticEntryRoutingInput {
  readonly rawMessage: string;
  readonly routingStage: AskRoutingStage;
  readonly routingOperationId: AskOperationId;
  readonly requiresClarification: boolean;
  readonly forcedOperationId?: AskOperationId | null;
  readonly hasSemanticProvider?: boolean;
  readonly dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[];
  readonly dynamicQuotes?: readonly DynamicQuoteCandidate[];
}

export type SemanticEntryDispatchReasonCode =
  | 'SAFETY_BOUNDARY'
  | 'PHASE2A_STRUCTURED_MATCH'
  | 'CROSS_DOMAIN_PLAN_MATCH'
  | 'CROSS_DOMAIN_CLARIFICATION'
  | 'APPROVED_PROVIDER_RESCUE'
  | 'KEEP_LEGACY_ROUTE';

export interface SemanticEntryDispatchDecision {
  readonly shouldDispatchToSemanticEntry: boolean;
  readonly reasonCode: SemanticEntryDispatchReasonCode;
}

const SLICE_ENTRY_JOBS = new Set<string>([
  'query.inventory_item.relation_boolean',
  'job.inventory.replacement_guidance',
  'job.maintenance.create',
]);

/**
 * Coordinates unified semantic entry promotion upstream of legacy GROUNDED_GUIDANCE
 * fallbacks and misrouted prompts so Phase 2A, Cross-Domain Wave 1-5, and Phase 6
 * provider orchestration operate at the real Ask routing boundary (FR-UND-7 / §18).
 */
export function resolveAskSemanticEntryDecision(
  input: SemanticEntryRoutingInput,
): SemanticEntryDispatchDecision {
  const slicePlan = parseDeterministicSemanticRequest(
    input.rawMessage,
    input.dynamicEntities ? { dynamicEntities: input.dynamicEntities } : undefined,
  );
  const crossDomainParsed = parseCrossDomainSemanticRequest(
    input.rawMessage,
    input.dynamicQuotes ? { dynamicQuotes: input.dynamicQuotes } : undefined,
  );

  // Stage 0 safety & ambiguous negative coordination pre-filter always overrides fallback routing.
  if (
    (slicePlan.outcome === 'BOUNDARY' || crossDomainParsed.plan.outcome === 'BOUNDARY')
    && input.routingOperationId !== 'EMERGENCY_BOUNDARY'
    && input.routingOperationId !== 'UNSAFE_RESTRICTED_BOUNDARY'
  ) {
    return { shouldDispatchToSemanticEntry: true, reasonCode: 'SAFETY_BOUNDARY' };
  }

  // Respect explicit user/UI-selected operations (chip actions, launch capabilities, follow-up anchors).
  if (input.forcedOperationId) {
    return { shouldDispatchToSemanticEntry: false, reasonCode: 'KEEP_LEGACY_ROUTE' };
  }

  const sliceJob = slicePlan.outcome === 'MATCH' ? slicePlan.facets[0]?.evidence.jobMatch ?? null : null;
  if (sliceJob && SLICE_ENTRY_JOBS.has(sliceJob)) {
    return { shouldDispatchToSemanticEntry: true, reasonCode: 'PHASE2A_STRUCTURED_MATCH' };
  }

  const onFallbackOrDataPoint =
    input.routingOperationId === 'GROUNDED_GUIDANCE'
    || input.routingOperationId === 'DATA_POINT_READ'
    || input.routingStage === 'REMOTE_FALLBACK';

  if (crossDomainParsed.clarification && onFallbackOrDataPoint) {
    return { shouldDispatchToSemanticEntry: true, reasonCode: 'CROSS_DOMAIN_CLARIFICATION' };
  }

  let hasNonDeterministicLegacyCollision = false;
  if (crossDomainParsed.plan.outcome === 'MATCH' && input.routingStage !== 'DETERMINISTIC' && !onFallbackOrDataPoint) {
    const firstFacet = crossDomainParsed.plan.facets[0] ?? null;
    const rawDomain = firstFacet?.domainCandidates[0]?.id ?? null;
    const comparison = evaluateLegacyVsSemanticGrammarAgreement({
      prompt: input.rawMessage,
      legacyOperationId: input.routingOperationId,
      typedMatched: true,
      typedDomainId: rawDomain ? normalizeToCanonicalSection5Domain(rawDomain) : null,
      typedRequestClass: firstFacet?.requestClass ?? null,
      typedSubjectEntityIds: firstFacet?.subject ? [firstFacet.subject.entityId] : [],
      typedSemanticRelationIds: firstFacet?.relations.map((r) => r.semanticRelationId) ?? [],
      typedJobMatch: firstFacet?.evidence.jobMatch ?? null,
      typedPolarity: firstFacet?.polarity ?? null,
      typedProjection: firstFacet?.projection ?? null,
      typedMaterialFilterIds: [
        ...(firstFacet?.fields.map((f) => f.fieldId) ?? []),
        ...(firstFacet?.relations.map((r) => r.predicateId) ?? []),
      ],
      typedRequiredSlots: firstFacet?.requiredSlots.map((s) => s.slotId) ?? [],
    });
    hasNonDeterministicLegacyCollision = comparison.status === 'DISAGREED_COLLISION';
  }

  if (
    crossDomainParsed.plan.outcome === 'MATCH'
    && (onFallbackOrDataPoint || crossDomainParsed.plan.facets.length > 1 || hasNonDeterministicLegacyCollision)
  ) {
    return { shouldDispatchToSemanticEntry: true, reasonCode: 'CROSS_DOMAIN_PLAN_MATCH' };
  }

  if (onFallbackOrDataPoint && mayNeedDynamicQuoteResolution(input.rawMessage)) {
    return { shouldDispatchToSemanticEntry: true, reasonCode: 'CROSS_DOMAIN_PLAN_MATCH' };
  }

  // When an approved semantic provider is active, rescue REMOTE_FALLBACK / ambiguous GROUNDED_GUIDANCE
  // turns at the routing entry boundary ahead of remote text generation or spurious clarification.
  if (
    input.hasSemanticProvider
    && (input.routingOperationId === 'GROUNDED_GUIDANCE' || input.routingStage === 'REMOTE_FALLBACK')
  ) {
    return { shouldDispatchToSemanticEntry: true, reasonCode: 'APPROVED_PROVIDER_RESCUE' };
  }

  return { shouldDispatchToSemanticEntry: false, reasonCode: 'KEEP_LEGACY_ROUTE' };
}
