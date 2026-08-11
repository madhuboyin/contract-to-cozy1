import {
  getAskOperationDefinition,
  resolveAskOperation,
  type AskOperationId,
  type AskOperationResolution,
} from './askOperationRegistry';

export type AskRoutingStage = 'SAFETY' | 'DETERMINISTIC' | 'LOCAL_CLASSIFIER' | 'CLARIFICATION' | 'REMOTE_FALLBACK';

export interface AskRoutingCandidate {
  operationId: AskOperationId;
  confidence: number;
}

export interface AskRoutingDecision {
  operation: AskOperationResolution;
  stage: AskRoutingStage;
  candidates: AskRoutingCandidate[];
  requiresClarification: boolean;
}

const STOP_WORDS = new Set(['a', 'about', 'all', 'am', 'an', 'and', 'are', 'can', 'do', 'for', 'from', 'help', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'the', 'to', 'what', 'when', 'which', 'with']);

const ROUTING_EXEMPLARS: Partial<Record<AskOperationId, string[]>> = {
  MAINTENANCE_STATUS: ['work remaining finished completed rundown service history seasonal upkeep overdue chores'],
  COVERAGE_GAPS: ['unprotected items warranty insurance evidence protection gaps'],
  SAVINGS_OPPORTUNITIES: ['reduce household bills rebates benefits lower expenses save money'],
  INVENTORY_LOOKUP: ['appliances systems equipment living home record item details'],
  PROPERTY_SUMMARY: ['home profile record completeness property overview facts'],
  HOME_ACTIONS: ['priorities next steps urgent attention plan wait'],
  REPLACEMENT_GUIDANCE: ['lifespan end of life repair versus replace aging appliance system'],
  OWNERSHIP_COSTS: ['monthly annual housing expenses cash outflow operating cost'],
  SELL_HOLD_RENT_ANALYSIS: ['compare selling keeping renting landlord move equity'],
  REFINANCE_ANALYSIS: ['mortgage refinance interest payment break even closing cost'],
  CAPITAL_RESERVE_PLAN: ['reserve fund future replacement budget capital timeline sinking fund'],
  PROPERTY_TAX_APPEAL_READINESS: ['assessment appeal property tax exemption evidence deadline'],
  RENOVATION_PERMIT_READINESS: ['remodel project permit inspection blockers readiness'],
  QUOTE_COMPARISON_REVIEW: ['compare contractor bids estimates proposals scope price'],
  CAPABILITY_DISCOVERY: ['available feature tool workflow something to help homeowner'],
};

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function score(messageTokens: Set<string>, exemplar: string): number {
  const exemplarTokens = tokenize(exemplar);
  const matches = [...messageTokens].filter((token) => exemplarTokens.has(token)).length;
  if (matches < 2) return 0;
  return matches / Math.sqrt(messageTokens.size * exemplarTokens.size);
}

function resolution(operationId: AskOperationId, confidence: number): AskOperationResolution {
  return { ...getAskOperationDefinition(operationId), confidence };
}

export function resolveAskRoutingCascade(message: string, options: {
  localRoutingEnabled?: boolean;
  localMinimumConfidence?: number;
  ambiguityMargin?: number;
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

  const messageTokens = tokenize(message);
  const candidates = Object.entries(ROUTING_EXEMPLARS)
    .map(([operationId, exemplars]) => ({
      operationId: operationId as AskOperationId,
      confidence: Math.max(...(exemplars ?? []).map((exemplar) => score(messageTokens, exemplar))),
    }))
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
  const minimum = options.localMinimumConfidence ?? 0.42;
  const margin = options.ambiguityMargin ?? 0.1;
  const strongest = candidates[0];
  const runnerUp = candidates[1];
  if (strongest && strongest.confidence >= minimum) {
    if (runnerUp && runnerUp.confidence >= minimum && strongest.confidence - runnerUp.confidence < margin) {
      return { operation: direct, stage: 'CLARIFICATION', candidates, requiresClarification: true };
    }
    return { operation: resolution(strongest.operationId, Number(strongest.confidence.toFixed(4))), stage: 'LOCAL_CLASSIFIER', candidates, requiresClarification: false };
  }
  return { operation: direct, stage: 'REMOTE_FALLBACK', candidates, requiresClarification: false };
}
