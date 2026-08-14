import type { AskOperationId } from '../../ask/askOperationRegistry';

export type SkillAdapterEffect = 'READ' | 'MUTATION_PREPARATION';
export type SkillAdapterRetrySafety = 'SAFE' | 'CLAIM_GUARDED' | 'NOT_RETRYABLE';
export type SkillAdapterIdempotencyPolicy = 'NOT_APPLICABLE' | 'CONFIRMATION_RECEIPT';

export interface SkillAdapterDefinition {
  id: string;
  version: string;
  canonicalOwner: string;
  allowedOperations: AskOperationId[];
  inputContract: string;
  outputContract: string;
  effect: SkillAdapterEffect;
  authorizationBehavior: 'PROPAGATE_EFFECTIVE_POLICY';
  timeoutMs: number;
  retrySafety: SkillAdapterRetrySafety;
  idempotencyPolicy: SkillAdapterIdempotencyPolicy;
  errorContract: 'ASK_TYPED_RESULT';
  healthContract: 'IN_PROCESS';
}
