// The exact guided-journey step an Ask command was started from, and the one check every connected tool makes before it reports that step.
//
// The client only names a step id (a hint). Nothing is trusted from it: this re-reads the step inside this home and requires the step's own tool,
// an open step and an open journey. A stale or incompatible step is a refusal with a reason; it never falls back to another compatible step.
// The older behaviour (completing by signal family when a command starts outside a journey) stays where a tool has it, as a compatibility path only.

import { prisma } from '../../../lib/prisma';
import { getGuidanceModels } from '../../guidanceEngine/guidanceTypes';

export type GuidanceStepBinding = {
  stepId: string;
  stepKey: string;
  journeyId: string;
  signalIntentFamily: string | null;
  inventoryItemId: string | null;
};
export type GuidanceStepRefusal = 'NOT_FOUND' | 'WRONG_TOOL' | 'WRONG_STEP' | 'STEP_DONE' | 'STEP_CLOSED' | 'JOURNEY_CLOSED';
export type GuidanceStepBindingResult = { ok: true; binding: GuidanceStepBinding } | { ok: false; reason: GuidanceStepRefusal };

export const GUIDANCE_STEP_REFUSAL_TEXT: Record<GuidanceStepRefusal, string> = {
  NOT_FOUND: 'The journey step this was started from is no longer available.',
  WRONG_TOOL: 'The journey step this was started from belongs to a different tool.',
  WRONG_STEP: 'The journey step this was started from is not one this can complete.',
  STEP_DONE: 'The journey step this was started from is already done.',
  STEP_CLOSED: 'The journey step this was started from is no longer open.',
  JOURNEY_CLOSED: 'The journey this was started from is no longer open.',
};

/** The step id a launch names: the explicit field, or the step as the launch entity (the Do-Nothing and Service Price Radar starts). */
export function launchedGuidanceStepId(launch: { guidanceStepId?: string | null; entityType?: string | null; entityId?: string | null } | null | undefined): string | null {
  if (launch?.guidanceStepId) return launch.guidanceStepId;
  return launch?.entityType === 'GUIDANCE_STEP' && launch.entityId ? launch.entityId : null;
}

/**
 * The step a source answer was opened for. A command started from a row of an answer the journey opened (a coverage comparison, a price
 * finalization) belongs to that same step. Only the same person's execution in the same home counts.
 */
export async function guidanceStepIdFromSourceExecution(userId: string, propertyId: string, sourceExecutionId: string | null | undefined): Promise<string | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId, propertyId }, select: { launchContextJson: true } });
  const launch = source?.launchContextJson && typeof source.launchContextJson === 'object' && !Array.isArray(source.launchContextJson)
    ? source.launchContextJson as { guidanceStepId?: unknown; entityType?: unknown; entityId?: unknown } : null;
  return launchedGuidanceStepId(launch ? {
    guidanceStepId: typeof launch.guidanceStepId === 'string' ? launch.guidanceStepId : null,
    entityType: typeof launch.entityType === 'string' ? launch.entityType : null,
    entityId: typeof launch.entityId === 'string' ? launch.entityId : null,
  } : null);
}

export async function resolveGuidanceStepBinding(
  propertyId: string, stepId: string, expected: { toolKey: string; stepKeys?: readonly string[] },
): Promise<GuidanceStepBindingResult> {
  const step = await getGuidanceModels().guidanceJourneyStep.findFirst({
    where: { id: stepId, journey: { propertyId } },
    select: { stepKey: true, toolKey: true, status: true, journey: { select: { id: true, status: true, inventoryItemId: true, primarySignal: { select: { signalIntentFamily: true } } } } },
  });
  if (!step) return { ok: false, reason: 'NOT_FOUND' };
  if (step.toolKey !== expected.toolKey) return { ok: false, reason: 'WRONG_TOOL' };
  if (expected.stepKeys && !expected.stepKeys.includes(step.stepKey)) return { ok: false, reason: 'WRONG_STEP' };
  if (!['ACTIVE', 'NOT_STARTED'].includes(String(step.journey.status))) return { ok: false, reason: 'JOURNEY_CLOSED' };
  if (step.status === 'COMPLETED') return { ok: false, reason: 'STEP_DONE' };
  if (!['PENDING', 'IN_PROGRESS'].includes(String(step.status))) return { ok: false, reason: 'STEP_CLOSED' };
  return { ok: true, binding: { stepId, stepKey: step.stepKey, journeyId: step.journey.id, signalIntentFamily: step.journey.primarySignal?.signalIntentFamily ?? null, inventoryItemId: step.journey.inventoryItemId ?? null } };
}
