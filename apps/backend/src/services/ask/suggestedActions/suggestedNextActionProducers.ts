// Plan §5.1: producers nominate candidates; they never decide visibility. The registry is a static, ordered list so the
// documentation-parity script (Phase 5 / §13) can read it. Phase 2 ships the two producers that exist before any domain
// migrates; every Phase 3/4 domain adds its own entry here.
//
// A producer failure is isolated by the finalizer (its nominations are dropped and counted); it can never crash startup or
// invalidate an otherwise safe answer, so producers may throw.
import type { AskOperationResult } from '../askOperationRegistry';
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { mapExplicitSuggestionStrings } from './suggestedNextActionCompatibility';
import { DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';

export interface ProducerContext {
  result: AskOperationResult;
  executionId: string;
  sourceOperationId: string | null;
  propertyId: string | null;
  message: string;
}

export interface SuggestedNextActionProducer {
  /** Registered, stable id; also the bounded metrics label. */
  id: string;
  source: SuggestedNextAction['provenance']['source'];
  /** Nonessential producers are the first dropped when the pipeline budget is exceeded. */
  essential: boolean;
  nominate(context: ProducerContext): readonly unknown[] | Promise<readonly unknown[]>;
}

/** Handler-attached typed candidates (the migration path for every Phase 3 domain). */
export const resultCandidatesProducer: SuggestedNextActionProducer = {
  id: 'operation-result.candidates',
  source: 'OPERATION_RESULT',
  essential: true,
  nominate: ({ result }) => result.suggestedNextActionCandidates ?? [],
};

/**
 * The string-compatibility boundary (plan §9 Phase 1): a result's legacy strings become typed candidates only when EVERY string
 * has an explicit mapping entry. All-or-nothing, because the frontend renders typed actions *instead of* strings; a partially
 * mapped result would otherwise silently lose its unmapped chips. The shipped mapping table is empty, so this nominates nothing.
 */
export const stringCompatibilityProducer: SuggestedNextActionProducer = {
  id: 'compat.explicit-strings',
  source: 'OPERATION_RESULT',
  essential: false,
  nominate: ({ result, sourceOperationId, propertyId }): SuggestedNextActionCandidate[] => {
    if (result.suggestions.length === 0 || (result.suggestedNextActionCandidates?.length ?? 0) > 0) return [];
    const { mapped, unmapped } = mapExplicitSuggestionStrings(result.suggestions);
    if (mapped.length === 0 || unmapped.length > 0) return [];
    return mapped.map((mapping): SuggestedNextActionCandidate => ({
      producerId: 'compat.explicit-strings', source: 'OPERATION_RESULT', sourceOperationId,
      label: mapping.text.trim().slice(0, 80), message: mapping.text.trim().slice(0, 300),
      operationId: mapping.operationId, interactionType: mapping.interactionType, outcomeKey: mapping.outcomeKey,
      entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null },
      tier: 'RELATED', requiredFacts: [], reasonCodes: ['LEGACY_STRING_MAPPED'],
      signals: { ...DEFAULT_CANDIDATE_SIGNALS }, traits: { ...DEFAULT_CANDIDATE_TRAITS },
    }));
  },
};

export const SUGGESTED_NEXT_ACTION_PRODUCERS: readonly SuggestedNextActionProducer[] = [resultCandidatesProducer, stringCompatibilityProducer];
