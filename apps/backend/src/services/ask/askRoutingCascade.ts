import {
  getAskOperationDefinition,
  resolveAskOperation,
  type AskOperationId,
  type AskOperationResolution,
} from './askOperationRegistry';
import { classifyAskCandidates, normalizeAskMessage, retrieveAskOperationCandidates } from './askSemanticRouter';
import { ASK_DEFAULT_LANGUAGE, requireCertifiedAskLanguage, type AskLanguageCode } from './askLanguageRegistry';
import type { AskConfidenceBand } from './askTrust.contract';
import { resolveAskEntityState, type AskEntityResolutionResult } from './askEntityResolution';

export type AskRoutingStage = 'SAFETY' | 'DETERMINISTIC' | 'LOCAL_CLASSIFIER' | 'CLARIFICATION' | 'REMOTE_FALLBACK';

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
}

export function propertyScopeForAskRouting(
  decision: AskRoutingDecision,
  propertyId: string | null | undefined,
): string | null {
  return decision.stage === 'SAFETY' ? null : propertyId ?? null;
}

function resolution(operationId: AskOperationId, confidence: number): AskOperationResolution {
  return { ...getAskOperationDefinition(operationId), confidence };
}

export function resolveAskRoutingCascade(message: string, options: {
  localRoutingEnabled?: boolean;
  localMinimumConfidence?: number;
  ambiguityMargin?: number;
  eligibleOperationIds?: Iterable<AskOperationId>;
  classifierEnabled?: boolean;
  embeddingRetrievalEnabled?: boolean;
  language?: AskLanguageCode;
  propertyId?: string | null;
  launchEntityId?: string | null;
} = {}): AskRoutingDecision {
  const language = options.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  const direct = resolveAskOperation(message);
  if (direct.operationId === 'EMERGENCY_BOUNDARY' || direct.operationId === 'UNSAFE_RESTRICTED_BOUNDARY' || direct.operationId === 'OUT_OF_SCOPE_BOUNDARY') {
    return { language, operation: direct, stage: 'SAFETY', candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'HIGH' }], requiresClarification: false, entityResolution: null };
  }
  if (direct.operationId !== 'GROUNDED_GUIDANCE') {
    return { language, operation: direct, stage: 'DETERMINISTIC', candidates: [{ operationId: direct.operationId, language, confidence: direct.confidence, confidenceBand: 'HIGH' }], requiresClarification: false, entityResolution: resolveAskEntityState({ message, operationId: direct.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: direct.requiresProperty }) };
  }
  if (options.localRoutingEnabled === false) {
    return { language, operation: direct, stage: 'REMOTE_FALLBACK', candidates: [], requiresClarification: false, entityResolution: null };
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
  const eligibleSet = options.eligibleOperationIds ? new Set(options.eligibleOperationIds) : null;
  const retrievedPool = retrieveAskOperationCandidates(normalized.normalized, {
    eligibleOperationIds: eligibleSet ?? undefined,
    topK: ambiguityOperationIds.length ? 8 : 3,
    language,
    embeddingEnabled: options.embeddingRetrievalEnabled,
    minimumConfidence: options.localMinimumConfidence,
    ambiguityMargin: options.ambiguityMargin,
  });
  const focusedAmbiguityCandidates = ambiguityOperationIds.length
    ? retrieveAskOperationCandidates(normalized.normalized, {
      eligibleOperationIds: ambiguityOperationIds.filter((operationId) => !eligibleSet || eligibleSet.has(operationId)),
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
  if (options.classifierEnabled === false && candidates.length) {
    return { language, operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true, entityResolution: null };
  }
  if (classification.outcome === 'AMBIGUOUS' || classification.outcome === 'MULTI_INTENT') {
    return { language, operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true, entityResolution: null };
  }
  if (classification.outcome === 'RESOLVED' && classification.selectedOperationId) {
    const selected = retrieved.find((candidate) => candidate.operationId === classification.selectedOperationId)!;
    const definition = getAskOperationDefinition(selected.operationId);
    if (selected.confidenceBand !== 'HIGH' && (definition.semantic.materiality === 'HIGH' || definition.semantic.effect === 'WRITE')) {
      return { language, operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true, entityResolution: null };
    }
    return { language, operation: resolution(selected.operationId, selected.score), stage: 'LOCAL_CLASSIFIER', candidates, requiresClarification: false, entityResolution: resolveAskEntityState({ message, operationId: selected.operationId, propertyId: options.propertyId, launchEntityId: options.launchEntityId, requiresProperty: definition.requiresProperty }) };
  }
  return { language, operation: direct, stage: 'REMOTE_FALLBACK', candidates, requiresClarification: false, entityResolution: null };
}
