import { correctKnownMisspellings } from './support/commonMisspellings';
import { normalizeForRouting } from './support/routingNormalization';
import type { KnownName } from './privacy/promptMinimizer';
import {
  ASK_OPERATION_DEFINITIONS,
  getAskOperationDefinition,
  messageNamesOnlyNonHvacItem,
  resolveAskOperation,
  type AskOperationId,
  type AskOperationResolution,
} from './askOperationRegistry';
import { classifyAskCandidates, normalizeAskMessage, retrieveAskOperationCandidates } from './askSemanticRouter';
import { ASK_DEFAULT_LANGUAGE, requireCertifiedAskLanguage, type AskLanguageCode } from './askLanguageRegistry';
import type { AskConfidenceBand } from './askTrust.contract';
import { resolveAskEntityState, type AskEntityResolutionResult } from './askEntityResolution';
import { fastPathRuleForResolution, isFastPathCertified, isProvisionalReadOperation, ruleLineageOfResolution } from './fastPath/fastPathCertificates';

// "Which upgrades are worth doing" says nothing about what they are for. Worth depends on the goal, so the homeowner picks one rather than Ask guessing.
const UPGRADE_OBJECTIVE_PATTERN = /\b(?:which|what)\b.{0,12}\b(?:upgrades?|improvements?|renovations?|projects?)\b.{0,30}\b(?:worth (?:doing|it|making)|best to (?:do|make))\b|\b(?:upgrades?|improvements?|renovations?)\b.{0,12}\bworth (?:doing|it|making)\b/i;
const UPGRADE_OBJECTIVE_OPERATIONS: readonly AskOperationId[] = ['SELLER_PREP_CHECKLIST', 'HOME_UPGRADE_SCENARIOS', 'APPLIANCE_FAILURE_RISK'];
const HOME_VALUE_GROWTH_PATTERN = /\b(?:increase|raise|boost|grow|improve|add to|maximi[sz]e)\b.{0,25}\b(?:home|house|property)\b.{0,12}\bvalue\b|\b(?:increase|raise|boost|grow|improve|maximi[sz]e)\b.{0,12}\bvalue\b.{0,12}\b(?:home|house|property)\b|\b(?:home|house|property)\s+value\b.{0,20}\b(?:increase|go up|rise|grow|improve)\b|\b(?:improvements?|upgrades?|renovations?|projects?)\b.{0,25}\b(?:add|increase|raise|boost)\b.{0,15}\bvalue\b|\bhow much\b.{0,12}\bvalue\b.{0,15}\b(?:does|do|will|would|can)\b.{0,40}\b(?:add|increase|bring)\b|\b(?:does|do|will|would|can)\b.{0,12}\b(?:a |an |the |new )?(?:new )?(?:roof|kitchen|bath(?:room)?s?|remodel\w*|renovat\w*|deck|pool|flooring|paint\w*|landscap\w*|windows?|garage|basement|addition|solar|fence|patio|hvac|furnace)\b.{0,25}\b(?:add|increase|raise|boost)\b.{0,12}\b(?:any |some )?(?:value|resale)\b/i;

// Small talk about the person, not the home ("how is my day going", "how are you", "thanks"). Short whole-message phrases only. The local classifier read
// "how is my day going" as the Home Record export status at 0.46; with nothing to match, it stays with the fallback, which answers honestly that the home
// record has nothing on it.
const SMALL_TALK_PATTERN = /^\s*(?:hi|hello|hey|good (?:morning|afternoon|evening|night)|thanks?|thank you(?: so much| very much)?|ok(?:ay)?|cool|great|how are you(?: doing)?(?: today)?|how'?s it going|how is my day(?: going| been| so far)?|how'?s my day(?: going| been| so far)?|how is your day(?: going)?|what'?s up|tell me a joke)\b[\s\S]{0,20}$/i;

/** PROVISIONAL: an uncertified deterministic rule matched a harmless read. The read may run, but its result must pass the full delivery gate and never gets the canonical bypass (FR-FAST, FR-GATE). */
import { classifySocialTurn, type SocialTurnKind } from './support/socialTurn';
import { classifyBuyerRequest, type BuyerGuidanceKind } from './support/buyerGuidance';
import { classifyFairHousingRequestWithHistory, type FairHousingHistoryTurn, type FairHousingKind } from './support/fairHousing';

// Whole-question forms only: a comparison or "which has the lowest/highest/cheapest..." about the person's candidate homes, in buyer mode.
const DIMENSION = '(?: (?:property tax(?:es)?|price|purchase price|payment|monthly (?:cost|payment)|cash to close|closing costs?|square (?:feet|footage)|size|age|year built|hoa(?: fee)?|insurance|one[- ]time (?:work|costs?)|repairs?|cost to own|cost))?';
const SUPERLATIVE = '(?:lowest|highest|cheapest|cheaper|most expensive|biggest|smallest|oldest|newest|largest|best)';
// Names the candidate homes outright, so no earlier turn is needed.
const BUYER_MODE_CANDIDATE_EXPLICIT = new RegExp(`^(?:(?:please )?(?:compare|rank|line up|show|list) (?:my (?:homes|houses|options|candidates|choices)|the (?:homes|houses|options|candidates))(?: side by side)?|(?:which|what) of (?:my|the) (?:homes|houses|options|candidates) (?:has|have|is|are|costs?|would be) (?:the )?${SUPERLATIVE}${DIMENSION})$`);
// Pronoun-only forms: "them", "these", "which one". Nothing in the message says what they refer to, so they count only right after a candidate-homes answer.
const BUYER_MODE_CANDIDATE_PRONOUN = new RegExp(`^(?:(?:please )?(?:compare|rank|line up|show|list) (?:them|these|those)(?: side by side)?|(?:which|what) (?:one )?(?:has|have|is|are|costs?|would be) (?:the )?${SUPERLATIVE}${DIMENSION})$`);

export type AskRoutingStage = 'SAFETY' | 'DETERMINISTIC' | 'PROVISIONAL' | 'LOCAL_CLASSIFIER' | 'MODEL_CLASSIFIER' | 'CLARIFICATION' | 'REMOTE_FALLBACK';

export interface AskRoutingCandidate {
  operationId: AskOperationId;
  language?: AskLanguageCode;
  confidence: number;
  semanticVersion?: string;
  reasonCodes?: string[];
  rawConfidence?: number;
  calibrationVersion?: string;
  retrievalPath?: string;
  confidenceBand?: AskConfidenceBand;
}

export interface AskRoutingDecision {
  language: AskLanguageCode;
  operation: AskOperationResolution;
  stage: AskRoutingStage;
  candidates: AskRoutingCandidate[];
  requiresClarification: boolean;
  entityResolution: AskEntityResolutionResult | null;
  fastPathLineage?: { ruleId: string; version: string; status: 'CERTIFIED' | 'DEMOTED' } | null;
  /** BICC-UX-010: the whole message is a social phrase (greeting, thanks, acknowledgement...). The turn gets the authored social reply and runs no tool. */
  socialTurn?: SocialTurnKind;
  /** BICC-BUY-011: the request asks for steering by protected class, who lives there, suitability for a group or neighborhood desirability; answered by the authored refusal. */
  fairHousing?: FairHousingKind;
  /** BICC-BUY-001: the whole message is a general buyer question or wish; answered by authored buyer guidance (no property, no model). */
  buyerGuidance?: BuyerGuidanceKind;
}

export function propertyScopeForAskRouting(
  decision: AskRoutingDecision,
  propertyId: string | null | undefined,
): string | null {
  return decision.stage === 'SAFETY' ? null : propertyId ?? null;
}

const isSafetyBoundary = (id: string) => id === 'EMERGENCY_BOUNDARY' || id === 'UNSAFE_RESTRICTED_BOUNDARY' || id === 'OUT_OF_SCOPE_BOUNDARY';
function resolution(operationId: AskOperationId, confidence: number): AskOperationResolution {
  return { ...getAskOperationDefinition(operationId), confidence };
}

export function resolveAskRoutingCascade(rawMessage: string, options: {
  localRoutingEnabled?: boolean;
  localMinimumConfidence?: number;
  ambiguityMargin?: number;
  eligibleOperationIds?: Iterable<AskOperationId>;
  classifierEnabled?: boolean;
  embeddingRetrievalEnabled?: boolean;
  language?: AskLanguageCode;
  propertyId?: string | null;
  launchEntityId?: string | null;
  /** The authorised property's own names (insurers, contractors, lenders, household members): protected from spelling correction (FR-NRM-1, FR-PRV-1). */
  knownNames?: ReadonlyArray<KnownName>;
  /** BICC-D42: the person explicitly turned on "Looking to buy" for this conversation (never inferred from text). */
  buyerMode?: boolean;
  /** BICC-BUY-011: the previous user turns of this conversation (newest first), so a split request or a follow-up to a refusal is still refused. */
  fairHousingHistory?: ReadonlyArray<FairHousingHistoryTurn>;
  /** BICC-D42: the previous delivered turn was the candidate-homes answer, so "them" / "which one" refers to those homes. */
  candidateContext?: boolean;
} = {}): AskRoutingDecision {
  const language = options.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  // Routing reads a closed list of common misspellings and split words as their correct form ("maintainence", "neighbor hood"); nothing else changes.
  // FR-NRM-9: safety is evaluated on the raw text first, so normalisation can never remove a safety signal; everything else routes on the normalised text.
  const rawDirect = resolveAskOperation(correctKnownMisspellings(rawMessage));
  const message = isSafetyBoundary(rawDirect.operationId) ? correctKnownMisspellings(rawMessage) : normalizeForRouting(rawMessage, options.knownNames);
  const direct = isSafetyBoundary(rawDirect.operationId) ? rawDirect : resolveAskOperation(message);
  const directRule = direct.operationId === 'GROUNDED_GUIDANCE' || isSafetyBoundary(direct.operationId) ? null : fastPathRuleForResolution(direct);
  const safetyDecision = (): AskRoutingDecision => ({ language, operation: direct, stage: 'SAFETY', candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'HIGH' }], requiresClarification: false, entityResolution: null });
  // An emergency or an unsafe/restricted request always wins. The generic out-of-scope boundary does not: it also catches multi-home questions and other languages, none of which outranks the fair-housing refusal.
  if (direct.operationId === 'EMERGENCY_BOUNDARY' || direct.operationId === 'UNSAFE_RESTRICTED_BOUNDARY') return safetyDecision();
  // BICC-BUY-011: decided on the raw text right after those two, so no rule, classifier, fallback or out-of-scope reply can answer a steering request.
  const fairHousing = classifyFairHousingRequestWithHistory(rawMessage, options.fairHousingHistory);
  if (fairHousing) {
    return { language, operation: direct, stage: 'REMOTE_FALLBACK', candidates: [], requiresClarification: false, entityResolution: null, fairHousing };
  }
  // Decided before the generic out-of-scope boundary, which also catches "my homes" as a portfolio question.
  // BICC-D42/BUY-004: with "Looking to buy" on, a question about "my homes" / "these" / "the options" is about the candidate homes. Only the read that lists and compares them is
  // chosen, and only as a PROVISIONAL read (tried, then judged by the delivery gate); nothing here reads a number or names a home, and no write is reachable.
  if (options.buyerMode && ((text) => BUYER_MODE_CANDIDATE_EXPLICIT.test(text) || (options.candidateContext === true && BUYER_MODE_CANDIDATE_PRONOUN.test(text)))(normalizeForRouting(rawMessage, options.knownNames).toLowerCase().replace(/[?!.]+$/, '').trim()) && (!options.eligibleOperationIds || [...options.eligibleOperationIds].includes('CANDIDATE_HOMES_REVIEW'))) {
    const review = resolution('CANDIDATE_HOMES_REVIEW', ASK_OPERATION_DEFINITIONS.CANDIDATE_HOMES_REVIEW.confidence);
    return {
      language, operation: review, stage: 'PROVISIONAL',
      candidates: [{ operationId: 'CANDIDATE_HOMES_REVIEW', language, confidence: review.confidence, confidenceBand: 'MEDIUM', reasonCodes: ['BUYER_MODE_CANDIDATE_COMPARE'], retrievalPath: 'DETERMINISTIC_CANDIDATE' }],
      requiresClarification: false, entityResolution: null,
    };
  }
  if (direct.operationId === 'OUT_OF_SCOPE_BOUNDARY') return safetyDecision();
  // BICC-BUY-001: a general buyer question or wish gets authored guidance before any rule can mistake it for another request.
  const buyerGuidance = classifyBuyerRequest(rawMessage, { buyerMode: options.buyerMode });
  if (buyerGuidance) {
    return { language, operation: direct, stage: 'REMOTE_FALLBACK', candidates: [], requiresClarification: false, entityResolution: null, buyerGuidance };
  }
  // BICC-UX-010: a message that is only a social phrase is answered by the authored social reply. It is decided right after safety (an emergency always wins) and before
  // any rule, so no tool, clarification or suggested-action row can attach to it; a request that merely opens with a greeting is not a social turn.
  const socialTurn = classifySocialTurn(rawMessage);
  if (socialTurn) {
    return { language, operation: direct, stage: 'REMOTE_FALLBACK', candidates: [], requiresClarification: false, entityResolution: null, socialTurn };
  }
  if (direct.operationId !== 'GROUNDED_GUIDANCE') {
    const rule = directRule;
    if (rule && isFastPathCertified(rule.id)) {
      return { language, operation: direct, stage: 'DETERMINISTIC', candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'HIGH', reasonCodes: ['FAST_PATH_CERTIFIED'] }], requiresClarification: false, entityResolution: resolveAskEntityState({ message, operationId: direct.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: direct.requiresProperty }), fastPathLineage: { ruleId: rule.id, version: rule.version, status: 'CERTIFIED' } };
    }
  }
  // Provisional read execution: the rule is not certified, so it may not CLAIM the turn, but a harmless read it matched may be tried and then judged by the delivery gate. A rule that selects a write, a decision or anything else
  // keeps the demoted behaviour below.
  if (direct.operationId !== 'GROUNDED_GUIDANCE' && isProvisionalReadOperation(direct.operationId, message) && (!options.eligibleOperationIds || [...options.eligibleOperationIds].includes(direct.operationId))) {
    const lineage = ruleLineageOfResolution(direct);
    return {
      language, operation: direct, stage: 'PROVISIONAL',
      candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'MEDIUM', reasonCodes: ['FAST_PATH_PROVISIONAL_READ'], retrievalPath: 'DETERMINISTIC_CANDIDATE' }],
      requiresClarification: false,
      entityResolution: resolveAskEntityState({ message, operationId: direct.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: direct.requiresProperty }),
      fastPathLineage: lineage,
    };
  }
  if (options.localRoutingEnabled === false) {
    const fallback = resolution('GROUNDED_GUIDANCE', ASK_OPERATION_DEFINITIONS.GROUNDED_GUIDANCE.confidence);
    return { language, operation: fallback, stage: 'REMOTE_FALLBACK', candidates: directRule ? [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'LOW', reasonCodes: ['FAST_PATH_DEMOTED'], retrievalPath: 'DETERMINISTIC_CANDIDATE' }] : [], requiresClarification: false, entityResolution: null, fastPathLineage: directRule ? { ruleId: directRule.id, version: directRule.version, status: 'DEMOTED' } : null };
  }

  if (SMALL_TALK_PATTERN.test(message.trim()) && message.trim().split(/\s+/).length <= 7) {
    return { language, operation: direct, stage: 'REMOTE_FALLBACK', candidates: [], requiresClarification: false, entityResolution: null };
  }

  // "How can I increase my home value" has no single answer: the seller-prep checklist (repairs, records and presentation work, prioritised) and the saved upgrade
  // options are the two real ways in. The local classifier offered break-even, habits and property-tax appeal, none of which is about raising value.
  if (HOME_VALUE_GROWTH_PATTERN.test(message)) {
    const eligibleForValue = options.eligibleOperationIds ? new Set(options.eligibleOperationIds) : null;
    const valueCandidates = (['SELLER_PREP_CHECKLIST', 'HOME_UPGRADE_SCENARIOS'] as AskOperationId[]).filter((operationId) => !eligibleForValue || eligibleForValue.has(operationId));
    if (valueCandidates.length) {
      return {
        language, operation: direct, stage: 'CLARIFICATION', requiresClarification: true, entityResolution: null,
        candidates: valueCandidates.map((operationId) => ({ operationId, language, confidence: 0.6, reasonCodes: ['HOME_VALUE_GROWTH_AMBIGUOUS'] })),
      };
    }
  }

  if (UPGRADE_OBJECTIVE_PATTERN.test(message)) {
    const eligibleForUpgrades = options.eligibleOperationIds ? new Set(options.eligibleOperationIds) : null;
    const upgradeCandidates = UPGRADE_OBJECTIVE_OPERATIONS.filter((operationId) => !eligibleForUpgrades || eligibleForUpgrades.has(operationId));
    if (upgradeCandidates.length > 1) {
      return {
        language, operation: direct, stage: 'CLARIFICATION', requiresClarification: true, entityResolution: null,
        candidates: upgradeCandidates.map((operationId) => ({ operationId, language, confidence: 0.6, reasonCodes: ['UPGRADE_OBJECTIVE_UNKNOWN'] })),
      };
    }
  }

  const normalized = normalizeAskMessage(message, language);
  const broadPendingScope = /\bpending\b/.test(normalized.normalized)
    && /\b(?:home|house|property)\b/.test(normalized.normalized)
    && !/\b(?:details?|information|record|maintenance|task|upkeep|coverage|quote|claim)\b/.test(normalized.normalized);
  const broadMaintenanceSchedule = /\b(?:organize|plan|schedule)\b/.test(normalized.normalized)
    && /\b(?:maintenance|upkeep)\b/.test(normalized.normalized)
    && !/\b(?:show|list|create|add|change|move|complete|finish|overdue|pending|task)\b/.test(normalized.normalized);
  const ambiguityOperationIds: AskOperationId[] = broadPendingScope
    ? ['PROPERTY_SUMMARY', 'MAINTENANCE_STATUS', 'HOME_ACTIONS']
    : broadMaintenanceSchedule
      ? ['MAINTENANCE_STATUS', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_UPDATE', 'MAINTENANCE_TASK_COMPLETE']
      : [];
  // Safety boundaries are entered only through the deterministic safety gate
  // above. Keeping them out of generic semantic retrieval prevents benign,
  // low-confidence wording from being escalated into an emergency/restricted
  // answer merely because it shares a home-system noun.
  const eligibleSet = options.eligibleOperationIds
    ? new Set(options.eligibleOperationIds)
    : new Set((Object.values(ASK_OPERATION_DEFINITIONS)
      .filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY'))
      .map((definition) => definition.operationId)));
  // A message about a microwave, fridge or water heater is never about an HVAC repair-or-replace decision. Without this, words like
  // "continue", "still good" or "how old" scored an HVAC decision operation, which then answered about the home's furnace.
  if (messageNamesOnlyNonHvacItem(message)) {
    for (const operationId of [...eligibleSet]) if (operationId.startsWith('HVAC_')) eligibleSet.delete(operationId);
  }
  // Retrieval owns normalization. Passing the already-normalized string here
  // changed concept features for punctuation-bearing phrases and meant the
  // runtime was not using the same input as its calibration evidence.
  const retrievedPool = retrieveAskOperationCandidates(message, {
    eligibleOperationIds: eligibleSet,
    topK: ambiguityOperationIds.length ? 8 : 3,
    language,
    embeddingEnabled: options.embeddingRetrievalEnabled,
    minimumConfidence: options.localMinimumConfidence,
    ambiguityMargin: options.ambiguityMargin,
  });
  const focusedAmbiguityCandidates = ambiguityOperationIds.length
    ? retrieveAskOperationCandidates(message, {
      eligibleOperationIds: ambiguityOperationIds.filter((operationId) => eligibleSet.has(operationId)),
      topK: 3,
      language,
      embeddingEnabled: options.embeddingRetrievalEnabled,
      minimumConfidence: options.localMinimumConfidence,
      ambiguityMargin: options.ambiguityMargin,
    })
    : [];
  const retrieved = ambiguityOperationIds.length
    ? [...new Map([...focusedAmbiguityCandidates, ...retrievedPool].map((candidate) => [candidate.operationId, candidate])).values()].sort((left, right) => {
      const priority = (operationId: AskOperationId): number => {
        const index = ambiguityOperationIds.indexOf(operationId);
        return index < 0 ? ambiguityOperationIds.length : index;
      };
      return priority(left.operationId) - priority(right.operationId) || right.score - left.score;
    }).slice(0, 3)
    : retrievedPool;
  const classification = classifyAskCandidates(retrieved, {
    minimumConfidence: options.localMinimumConfidence ?? 0.3,
    ambiguityMargin: options.ambiguityMargin ?? 0.1,
    normalizedMessage: normalized.normalized,
    propertyId: options.propertyId,
    launchEntityId: options.launchEntityId,
  });
  const candidates: AskRoutingCandidate[] = retrieved.map((candidate) => ({
    operationId: candidate.operationId,
    language: candidate.language,
    confidence: candidate.score,
    semanticVersion: candidate.semanticVersion,
    reasonCodes: candidate.reasonCodes,
    rawConfidence: candidate.rawScore,
    calibrationVersion: candidate.calibrationVersion,
    retrievalPath: candidate.retrievalPath,
    confidenceBand: candidate.confidenceBand,
  }));
  const demotedRule = directRule;
  if (demotedRule && !candidates.some((candidate) => candidate.operationId === direct.operationId)) candidates.push({
    operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'LOW',
    reasonCodes: ['FAST_PATH_DEMOTED'], retrievalPath: 'DETERMINISTIC_CANDIDATE',
  });
  // FR-REC-1: a clarification never has fewer than two options. With one candidate there is nothing to choose between, so the turn is not matched
  // (REMOTE_FALLBACK, the safe not-matched path) instead of asking the user to confirm the only choice.
  const fallback = resolution('GROUNDED_GUIDANCE', ASK_OPERATION_DEFINITIONS.GROUNDED_GUIDANCE.confidence);
  const lineage = demotedRule ? { ruleId: demotedRule.id, version: demotedRule.version, status: 'DEMOTED' as const } : null;
  const notMatched: AskRoutingDecision = { language, operation: fallback, stage: 'REMOTE_FALLBACK', candidates, requiresClarification: false, entityResolution: null, fastPathLineage: lineage };
  if (options.classifierEnabled === false && candidates.length) {
    return candidates.length < 2 ? notMatched : { language, operation: fallback, stage: 'CLARIFICATION', candidates, requiresClarification: true, entityResolution: null, fastPathLineage: lineage };
  }
  if (classification.outcome === 'AMBIGUOUS' || classification.outcome === 'MULTI_INTENT') {
    if (candidates.length < 2) return notMatched;
    return { language, operation: fallback, stage: 'CLARIFICATION', candidates, requiresClarification: true, entityResolution: null, fastPathLineage: lineage };
  }
  if (classification.outcome === 'RESOLVED' && classification.selectedOperationId) {
    // FR-FAST-3/7: demotion cannot be bypassed by immediately relabelling the
    // same turn as a local-classifier claim. Until the classifier's stratum is
    // independently certified it may rank/clarify, but it may not execute.
    if (demotedRule) return notMatched;
    const selected = retrieved.find((candidate) => candidate.operationId === classification.selectedOperationId)!;
    const definition = getAskOperationDefinition(selected.operationId);
    if (selected.confidenceBand !== 'HIGH' && (definition.semantic.materiality === 'HIGH' || definition.semantic.effect === 'WRITE')) {
      if (candidates.length < 2) return notMatched;
      return { language, operation: fallback, stage: 'CLARIFICATION', candidates, requiresClarification: true, entityResolution: null, fastPathLineage: lineage };
    }
    return { language, operation: resolution(selected.operationId, selected.score), stage: 'LOCAL_CLASSIFIER', candidates, requiresClarification: false, entityResolution: resolveAskEntityState({ message, operationId: selected.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: definition.requiresProperty }), fastPathLineage: lineage };
  }
  return notMatched;
}
