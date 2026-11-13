// Model-assisted routing (Ask natural-language routing review, step 7).
//
// The local router (regex rules, then a hashed-feature classifier) is certain for the phrasings it was written for and silent for the rest:
// roughly a third of varied homeowner wording ends in the generic fallback. This module lets a model choose, and only choose, between
// operations the product already registers, for exactly the messages the local router could not place.
//
// What it can do:   pick ONE of at most ten READ operations the local retrieval already ranked highest, or say none fits.
// What it cannot:   write an answer, see any home data, pick a write/monitor/boundary operation, pick the generic fallback, or pick an
//                   operation outside the candidate list (the response schema is an enum of the candidate ids, and the result is re-checked here).
// Safety nets kept: safety and deterministic routes never reach it; the chosen operation's answer still goes through the answer-trust and
//                   semantic relevance checks; any failure leaves the local decision exactly as it was.
import { z } from 'zod';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, isReadOnlyOperation, messageNamesOnlyNonHvacItem, type AskOperationId } from './askOperationRegistry';
import { retrieveAskOperationCandidates } from './askSemanticRouter';
import { resolveAskEntityState } from './askEntityResolution';
import { ASK_DEFAULT_LANGUAGE } from './askLanguageRegistry';
import type { AskRoutingCandidate, AskRoutingDecision } from './askRoutingCascade';

export const ASK_MODEL_ROUTER_CANDIDATE_LIMIT = 10;
export const ASK_MODEL_ROUTER_NONE = 'NONE';
/** The confidence an operation chosen with HIGH model confidence is recorded with; a MEDIUM choice is offered as a clarification at 0.6. */
const ROUTED_CONFIDENCE = 0.9;
const CLARIFY_CONFIDENCE = 0.6;

export interface AskModelRouterCandidate { operationId: AskOperationId; description: string }

export interface AskModelRouterProvider {
  select(input: { purpose: 'ASK_COZY_OPERATION_ROUTING'; question: string; candidates: readonly AskModelRouterCandidate[] }): Promise<unknown>;
}

const ProviderOutputSchema = z.object({
  operationId: z.string().trim().min(1),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
}).strict();

export type AskModelRouteOutcome = 'ROUTED' | 'CLARIFY' | 'NONE' | 'REJECTED' | 'UNAVAILABLE' | 'SKIPPED_URGENT';

// Wording that may describe something happening right now. The safety gate (askOperationRegistry emergencyPattern) recognises only a few of these, so a model
// must not be given the chance to route such a message to a lookup either: it stays with the local decision, as before. Deliberately broad ("gas bill" and
// "fireplace" are skipped too): skipping costs only the routing help.
const URGENT_SIGNAL = /\b(?:fire|smoke|smoking|burning|flood(?:ed|ing)?|burst|collaps\w*|gas|sparks?|sparking|electrocut\w*|carbon monoxide|911|emergency|break[- ]?in|broke into|intruder)\b/i;

/** Operations a model may choose for a homeowner: read-only, routable by message, never a boundary, never the generic fallback. */
export function isAskModelRoutableOperation(operationId: AskOperationId): boolean {
  const definition = ASK_OPERATION_DEFINITIONS[operationId];
  return Boolean(definition)
    && definition.messageRoutable
    && isReadOnlyOperation(operationId)
    && !definition.safetyClass.endsWith('_BOUNDARY')
    && operationId !== 'GROUNDED_GUIDANCE';
}

function describe(operationId: AskOperationId, language: string): string {
  const pack = getAskOperationDefinition(operationId).semantic.languagePacks[language as 'en'];
  const job = pack?.supportedJobs?.[0] ?? operationId;
  const intent = (pack?.intentDescription ?? '').trim();
  return (intent && intent !== job ? `${job} — ${intent}` : job).slice(0, 220);
}

/** The few operations a model chooses between: local retrieval's top read-only matches, plus any the local router was already weighing. */
export function buildAskModelRouterCandidates(message: string, options: {
  eligibleOperationIds: Iterable<AskOperationId>;
  language?: string;
  alreadyWeighed?: readonly AskOperationId[];
}): AskModelRouterCandidate[] {
  const language = (options.language ?? ASK_DEFAULT_LANGUAGE) as typeof ASK_DEFAULT_LANGUAGE;
  const eligible = new Set([...options.eligibleOperationIds].filter(isAskModelRoutableOperation));
  // The local router never offers an HVAC decision for a message about a microwave, fridge or water heater; the model must not be offered one either.
  if (messageNamesOnlyNonHvacItem(message)) for (const id of [...eligible]) if (id.startsWith('HVAC_')) eligible.delete(id);
  const retrieved = eligible.size
    ? retrieveAskOperationCandidates(message, { eligibleOperationIds: eligible, topK: ASK_MODEL_ROUTER_CANDIDATE_LIMIT, language, minimumConfidence: 0 }).map((candidate) => candidate.operationId)
    : [];
  const ids = [...new Set([...(options.alreadyWeighed ?? []).filter((id) => eligible.has(id)), ...retrieved])].slice(0, ASK_MODEL_ROUTER_CANDIDATE_LIMIT);
  return ids.map((operationId) => ({ operationId, description: describe(operationId, language) }));
}

/**
 * For a message the local router could not place (generic fallback, or a clarification between candidates), ask the model which registered
 * operation it is about. HIGH confidence routes to it; MEDIUM offers it as a clarification; anything else, and every failure, returns the
 * local decision unchanged.
 */
export async function refineAskRoutingWithModel(decision: AskRoutingDecision, options: {
  enabled: boolean;
  message: string;
  provider: AskModelRouterProvider;
  eligibleOperationIds: Iterable<AskOperationId>;
  propertyId?: string | null;
  launchEntityId?: string | null;
  onOutcome?: (outcome: AskModelRouteOutcome) => void;
}): Promise<AskRoutingDecision> {
  if (!options.enabled || (decision.stage !== 'REMOTE_FALLBACK' && decision.stage !== 'CLARIFICATION')) return decision;
  const finish = (outcome: AskModelRouteOutcome, result: AskRoutingDecision = decision): AskRoutingDecision => { options.onOutcome?.(outcome); return result; };
  if (URGENT_SIGNAL.test(options.message)) return finish('SKIPPED_URGENT');

  const candidates = buildAskModelRouterCandidates(options.message, {
    eligibleOperationIds: options.eligibleOperationIds,
    language: decision.language,
    alreadyWeighed: decision.stage === 'CLARIFICATION' ? decision.candidates.map((candidate) => candidate.operationId) : [],
  });
  if (!candidates.length) return finish('NONE');

  let parsed: z.infer<typeof ProviderOutputSchema>;
  try {
    parsed = ProviderOutputSchema.parse(await options.provider.select({ purpose: 'ASK_COZY_OPERATION_ROUTING', question: options.message, candidates }));
  } catch (error) {
    // A transport failure, a timeout and an off-schema reply all mean the same thing here: the local decision stands.
    return finish(error instanceof z.ZodError ? 'REJECTED' : 'UNAVAILABLE');
  }
  if (parsed.operationId === ASK_MODEL_ROUTER_NONE || parsed.confidence === 'LOW') return finish('NONE');
  const chosen = candidates.find((candidate) => candidate.operationId === parsed.operationId);
  if (!chosen) return finish('REJECTED');

  const others = candidates.filter((candidate) => candidate.operationId !== chosen.operationId);
  if (parsed.confidence === 'MEDIUM') {
    const offered: AskRoutingCandidate[] = [
      { operationId: chosen.operationId, language: decision.language, confidence: CLARIFY_CONFIDENCE, reasonCodes: ['MODEL_ROUTER_SUGGESTED'] },
      ...decision.candidates.filter((candidate) => candidate.operationId !== chosen.operationId && isAskModelRoutableOperation(candidate.operationId)).slice(0, 2),
    ].slice(0, 3);
    return finish('CLARIFY', { language: decision.language, operation: decision.operation, stage: 'CLARIFICATION', candidates: offered, requiresClarification: true, entityResolution: null });
  }

  const definition = getAskOperationDefinition(chosen.operationId);
  return finish('ROUTED', {
    language: decision.language,
    operation: { ...definition, confidence: ROUTED_CONFIDENCE },
    stage: 'MODEL_CLASSIFIER',
    candidates: [
      { operationId: chosen.operationId, language: decision.language, confidence: ROUTED_CONFIDENCE, reasonCodes: ['MODEL_ROUTER_SELECTED'] },
      ...others.slice(0, 2).map((candidate) => ({ operationId: candidate.operationId, language: decision.language, confidence: 0 })),
    ],
    requiresClarification: false,
    entityResolution: resolveAskEntityState({ message: options.message, operationId: chosen.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: definition.requiresProperty }),
  });
}
