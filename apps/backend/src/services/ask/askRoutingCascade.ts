import {
  getAskOperationDefinition,
  resolveAskOperation,
  type AskOperationId,
  type AskOperationResolution,
} from './askOperationRegistry';
import { classifyAskCandidates, normalizeAskMessage, retrieveAskOperationCandidates } from './askSemanticRouter';

export type AskRoutingStage = 'SAFETY' | 'DETERMINISTIC' | 'LOCAL_CLASSIFIER' | 'CLARIFICATION' | 'REMOTE_FALLBACK';

export interface AskRoutingCandidate {
  operationId: AskOperationId;
  confidence: number;
  semanticVersion?: string;
  reasonCodes?: string[];
}

export interface AskRoutingDecision {
  operation: AskOperationResolution;
  stage: AskRoutingStage;
  candidates: AskRoutingCandidate[];
  requiresClarification: boolean;
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
} = {}): AskRoutingDecision {
  const direct = resolveAskOperation(message);
  if (direct.operationId === 'EMERGENCY_BOUNDARY' || direct.operationId === 'UNSAFE_RESTRICTED_BOUNDARY' || direct.operationId === 'OUT_OF_SCOPE_BOUNDARY') {
    return { operation: direct, stage: 'SAFETY', candidates: [{ operationId: direct.operationId, confidence: direct.confidence }], requiresClarification: false };
  }
  if (direct.operationId !== 'GROUNDED_GUIDANCE') {
    return { operation: direct, stage: 'DETERMINISTIC', candidates: [{ operationId: direct.operationId, confidence: direct.confidence }], requiresClarification: false };
  }
  if (options.localRoutingEnabled === false) {
    return { operation: direct, stage: 'REMOTE_FALLBACK', candidates: [], requiresClarification: false };
  }

  const normalized = normalizeAskMessage(message);
  const retrieved = retrieveAskOperationCandidates(normalized.normalized, {
    eligibleOperationIds: options.eligibleOperationIds,
    topK: 3,
  });
  const classification = classifyAskCandidates(retrieved, {
    minimumConfidence: options.localMinimumConfidence ?? 0.3,
    ambiguityMargin: options.ambiguityMargin ?? 0.1,
    normalizedMessage: normalized.normalized,
  });
  const candidates: AskRoutingCandidate[] = retrieved.map((candidate) => ({
    operationId: candidate.operationId,
    confidence: candidate.score,
    semanticVersion: candidate.semanticVersion,
    reasonCodes: candidate.reasonCodes,
  }));
  if (options.classifierEnabled === false && candidates.length) {
    return { operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true };
  }
  if (classification.outcome === 'AMBIGUOUS' || classification.outcome === 'MULTI_INTENT') {
    return { operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true };
  }
  if (classification.outcome === 'RESOLVED' && classification.selectedOperationId) {
    const selected = retrieved.find((candidate) => candidate.operationId === classification.selectedOperationId)!;
    const definition = getAskOperationDefinition(selected.operationId);
    if (selected.confidenceBand !== 'HIGH' && (definition.semantic.materiality === 'HIGH' || definition.semantic.effect === 'WRITE')) {
      return { operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true };
    }
    return { operation: resolution(selected.operationId, selected.score), stage: 'LOCAL_CLASSIFIER', candidates, requiresClarification: false };
  }
  return { operation: direct, stage: 'REMOTE_FALLBACK', candidates, requiresClarification: false };
}
