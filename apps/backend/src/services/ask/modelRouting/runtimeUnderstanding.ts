import type { AskOperationId } from '../askOperationRegistry';
import type { ComposedClause, DeferredClause } from '../composition/decompose';
import { guardedPlan, type UnderstandingProvider } from './understandingProvider';
import { isUnderstandingStratumCertified } from './calibration';
import type { KnownName } from '../privacy/promptMinimizer';

export interface RuntimeUnderstandingControls {
  enabled: boolean;
  providerTermsRecorded: boolean;
  homeownerTextApproved: boolean;
}
export type RuntimeUnderstandingOutcome =
  | { kind: 'DISABLED'; reason: 'FEATURE_OFF' | 'PROVIDER_TERMS_NOT_RECORDED' | 'HOMEOWNER_TEXT_NOT_APPROVED' | 'STRATUM_NOT_CERTIFIED' }
  | { kind: 'UNAVAILABLE'; reason: string }
  | { kind: 'PLAN'; clauses: ComposedClause[]; deferred: DeferredClause[] };

/** Runtime bridge from a deterministically validated request plan. */
export async function planRuntimeUnderstanding(input: {
  message: string;
  eligibleOperationIds: ReadonlySet<AskOperationId>;
  eligibleDataPointIds: ReadonlySet<string>;
  controls: RuntimeUnderstandingControls;
  provider: UnderstandingProvider;
  /** The authorised property's own names, protected by the minimiser before anything is sent (FR-PRV-1). */
  knownNames?: ReadonlyArray<KnownName>;
}): Promise<RuntimeUnderstandingOutcome> {
  if (!input.controls.enabled) return { kind: 'DISABLED', reason: 'FEATURE_OFF' };
  if (!input.controls.providerTermsRecorded) return { kind: 'DISABLED', reason: 'PROVIDER_TERMS_NOT_RECORDED' };
  if (!input.controls.homeownerTextApproved) return { kind: 'DISABLED', reason: 'HOMEOWNER_TEXT_NOT_APPROVED' };
  if (!isUnderstandingStratumCertified('SINGLE_STAGE_READ_PLAN')) return { kind: 'DISABLED', reason: 'STRATUM_NOT_CERTIFIED' };
  const outcome = await guardedPlan({
    message: input.message, provider: input.provider, providerTermsRecorded: true, knownNames: input.knownNames,
    planContext: { eligibleOperationIds: input.eligibleOperationIds, eligibleDataPointIds: input.eligibleDataPointIds },
  });
  if (outcome.kind !== 'PLANNED') return { kind: 'UNAVAILABLE', reason: outcome.reason };
  const accepted = outcome.validation.accepted;
  const clauses: ComposedClause[] = accepted.map((facet) => ({
    clause: facet.span,
    operationId: facet.target.kind === 'OPERATION' ? facet.target.operationId : 'DATA_POINT_READ',
    confidence: facet.confidence,
    facetId: facet.id,
    dependsOn: facet.dependsOn,
    ...(facet.target.kind === 'DATA_POINT' ? { dataPointId: facet.target.dataPointId } : {}),
  }));
  const deferred: DeferredClause[] = [
    ...outcome.validation.dropped.map((facet) => ({ clause: facet.span, reason: facet.reason === 'OVER_LIMIT' ? 'OVER_LIMIT' as const : 'NOT_ROUTED' as const, operationId: null })),
  ];
  return clauses.length ? { kind: 'PLAN', clauses, deferred } : { kind: 'UNAVAILABLE', reason: 'NO_EXECUTABLE_PLAN' };
}
