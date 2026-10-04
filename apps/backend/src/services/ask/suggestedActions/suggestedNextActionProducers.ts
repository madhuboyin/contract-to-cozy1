// Plan §5.1: producers nominate candidates; they never decide visibility. The registry is a static, ordered list so the
// documentation-parity script (§13) can read it. Handlers attach typed candidates to their result and the one producer below passes them
// to the policy; there is no string-compatibility layer (no real customers, so unconverted handlers simply keep plain-text chips).
//
// A producer failure is isolated by the finalizer (its nominations are dropped and counted); it can never crash startup or
// invalidate an otherwise safe answer, so producers may throw.
import type { AskOperationResult } from '../askOperationRegistry';
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';

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

export const SUGGESTED_NEXT_ACTION_PRODUCERS: readonly SuggestedNextActionProducer[] = [resultCandidatesProducer];
