import type { AskOperationId } from '../askOperationRegistry';
import type { ComposedClause, DeferredClause } from '../composition/decompose';
import { guardedPlan, type UnderstandingProvider } from './understandingProvider';
import { isUnderstandingStratumCertified } from './calibration';
import type { KnownName } from '../privacy/promptMinimizer';
import type { RecoveryCode } from '../recovery/recoveryOutcomes';

export interface RuntimeUnderstandingControls {
  enabled: boolean;
  providerTermsRecorded: boolean;
  homeownerTextApproved: boolean;
}
export type RuntimeUnderstandingOutcome =
  | { kind: 'DISABLED'; reason: 'FEATURE_OFF' | 'PROVIDER_TERMS_NOT_RECORDED' | 'HOMEOWNER_TEXT_NOT_APPROVED' | 'STRATUM_NOT_CERTIFIED' }
  /** `recovery` (FR-UND-12) names which outcome this is, so it is reported and answered under its own code: none-fits, insufficient text, uninterpretable, schema-invalid or an outage by stage. Absent when no model outcome applies. */
  | { kind: 'UNAVAILABLE'; reason: string; recovery?: RecoveryCode }
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
  if (outcome.kind === 'NO_MATCH') return { kind: 'UNAVAILABLE', reason: outcome.disposition, recovery: outcome.disposition === 'NONE_FITS' ? 'MODEL_NONE_FITS' : 'MODEL_INSUFFICIENT_TEXT' };
  if (outcome.kind === 'REFUSED') return { kind: 'UNAVAILABLE', reason: outcome.reason, recovery: 'UNINTERPRETABLE_AFTER_MINIMISATION' };
  if (outcome.kind === 'UNAVAILABLE') return { kind: 'UNAVAILABLE', reason: outcome.reason, recovery: outcome.reason === 'SCHEMA_FAILURE' ? 'MODEL_SCHEMA_INVALID' : outcome.stage === 'STAGE1' ? 'STAGE1_UNAVAILABLE' : outcome.stage === 'STAGE2' ? 'STAGE2_UNAVAILABLE' : 'MODEL_UNAVAILABLE' };
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
