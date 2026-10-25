// Journey reporting for a Desktop tool action that was launched from a journey step (continuation FRD section 49).
//
// The action carries the exact `guidanceStepId`. It is re-read inside the home and must be this tool's open step; only then is the result reported to THAT step. A step that is stale, closed,
// belongs to another tool, is about another subject or belongs to another home reports nothing, and the signal family is never used instead. The domain result is already saved, so a failed
// report never fails it. An action launched outside a journey supplies no step id and keeps its family matching.

import { logger } from '../../lib/logger';
import { resolveGuidanceStepBinding, type GuidanceStepBinding, type GuidanceStepBindingResult, type GuidanceStepRefusal } from './guidanceStepBinding';

export type ExactStepReport = { supplied: boolean; reported: boolean | null; refusal: GuidanceStepRefusal | null };

/** `check` adds a subject test on top of the step (e.g. the very item a recall is for). */
export async function reportToExactStep(
  propertyId: string, stepId: string | null | undefined, scope: { toolKey: string; stepKeys: readonly string[] },
  report: (binding: GuidanceStepBinding) => Promise<boolean>,
  check?: (binding: GuidanceStepBinding) => GuidanceStepRefusal | null,
): Promise<ExactStepReport> {
  if (!stepId) return { supplied: false, reported: null, refusal: null };
  const bound: GuidanceStepBindingResult = await resolveGuidanceStepBinding(propertyId, stepId, scope);
  if (!bound.ok) return { supplied: true, reported: false, refusal: bound.reason };
  const mismatch = check?.(bound.binding) ?? null;
  if (mismatch) return { supplied: true, reported: false, refusal: mismatch };
  try {
    return { supplied: true, reported: await report(bound.binding), refusal: null };
  } catch (error) {
    logger.warn({ error, stepId }, '[GUIDANCE] exact-step report failed');
    return { supplied: true, reported: false, refusal: null };
  }
}
