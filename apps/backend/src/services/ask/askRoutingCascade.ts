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
import { fastPathRuleForOperation, isFastPathCertified } from './fastPath/fastPathCertificates';

// "Which upgrades are worth doing" says nothing about what they are for. Worth depends on the goal, so the homeowner picks one rather than Ask guessing.
const UPGRADE_OBJECTIVE_PATTERN = /\b(?:which|what)\b.{0,12}\b(?:upgrades?|improvements?|renovations?|projects?)\b.{0,30}\b(?:worth (?:doing|it|making)|best to (?:do|make))\b|\b(?:upgrades?|improvements?|renovations?)\b.{0,12}\bworth (?:doing|it|making)\b/i;
const UPGRADE_OBJECTIVE_OPERATIONS: readonly AskOperationId[] = ['SELLER_PREP_CHECKLIST', 'HOME_UPGRADE_SCENARIOS', 'APPLIANCE_FAILURE_RISK'];
const HOME_VALUE_GROWTH_PATTERN = /\b(?:increase|raise|boost|grow|improve|add to|maximi[sz]e)\b.{0,25}\b(?:home|house|property)\b.{0,12}\bvalue\b|\b(?:increase|raise|boost|grow|improve|maximi[sz]e)\b.{0,12}\bvalue\b.{0,12}\b(?:home|house|property)\b|\b(?:home|house|property)\s+value\b.{0,20}\b(?:increase|go up|rise|grow|improve)\b|\b(?:improvements?|upgrades?|renovations?|projects?)\b.{0,25}\b(?:add|increase|raise|boost)\b.{0,15}\bvalue\b|\bhow much\b.{0,12}\bvalue\b.{0,15}\b(?:does|do|will|would|can)\b.{0,40}\b(?:add|increase|bring)\b|\b(?:does|do|will|would|can)\b.{0,12}\b(?:a |an |the |new )?(?:new )?(?:roof|kitchen|bath(?:room)?s?|remodel\w*|renovat\w*|deck|pool|flooring|paint\w*|landscap\w*|windows?|garage|basement|addition|solar|fence|patio|hvac|furnace)\b.{0,25}\b(?:add|increase|raise|boost)\b.{0,12}\b(?:any |some )?(?:value|resale)\b/i;

// Small talk about the person, not the home ("how is my day going", "how are you", "thanks"). Short whole-message phrases only. The local classifier read
// "how is my day going" as the Home Record export status at 0.46; with nothing to match, it stays with the fallback, which answers honestly that the home
// record has nothing on it.
const SMALL_TALK_PATTERN = /^\s*(?:hi|hello|hey|good (?:morning|afternoon|evening|night)|thanks?|thank you(?: so much| very much)?|ok(?:ay)?|cool|great|how are you(?: doing)?(?: today)?|how'?s it going|how is my day(?: going| been| so far)?|how'?s my day(?: going| been| so far)?|how is your day(?: going)?|what'?s up|tell me a joke)\b[\s\S]{0,20}$/i;

export type AskRoutingStage = 'SAFETY' | 'DETERMINISTIC' | 'LOCAL_CLASSIFIER' | 'MODEL_CLASSIFIER' | 'CLARIFICATION' | 'REMOTE_FALLBACK';

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
} = {}): AskRoutingDecision {
  const language = options.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  // Routing reads a closed list of common misspellings and split words as their correct form ("maintainence", "neighbor hood"); nothing else changes.
  // FR-NRM-9: safety is evaluated on the raw text first, so normalisation can never remove a safety signal; everything else routes on the normalised text.
  const rawDirect = resolveAskOperation(correctKnownMisspellings(rawMessage));
  const message = isSafetyBoundary(rawDirect.operationId) ? correctKnownMisspellings(rawMessage) : normalizeForRouting(rawMessage, options.knownNames);
  const direct = isSafetyBoundary(rawDirect.operationId) ? rawDirect : resolveAskOperation(message);
  const directRule = direct.operationId === 'GROUNDED_GUIDANCE' || isSafetyBoundary(direct.operationId) ? null : fastPathRuleForOperation(direct.operationId);
  if (direct.operationId === 'EMERGENCY_BOUNDARY' || direct.operationId === 'UNSAFE_RESTRICTED_BOUNDARY' || direct.operationId === 'OUT_OF_SCOPE_BOUNDARY') {
    return { language, operation: direct, stage: 'SAFETY', candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'HIGH' }], requiresClarification: false, entityResolution: null };
  }
  if (direct.operationId !== 'GROUNDED_GUIDANCE') {
    const rule = directRule;
    if (rule && isFastPathCertified(rule.id)) {
      return { language, operation: direct, stage: 'DETERMINISTIC', candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'HIGH', reasonCodes: ['FAST_PATH_CERTIFIED'] }], requiresClarification: false, entityResolution: resolveAskEntityState({ message, operationId: direct.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: direct.requiresProperty }), fastPathLineage: { ruleId: rule.id, version: rule.version, status: 'CERTIFIED' } };
    }
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
