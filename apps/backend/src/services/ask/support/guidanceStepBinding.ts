// The exact guided-journey step an Ask command was started from, and the one check every connected tool makes before it reports that step.
//
// The client only names a step id (a hint). Nothing is trusted from it: this re-reads the step inside this home and requires the step's own tool,
// an open step and an open journey. A stale or incompatible step is a refusal with a reason; it never falls back to another compatible step.
// The older behaviour (completing by signal family when a command starts outside a journey) stays where a tool has it, as a compatibility path only.

import { prisma } from '../../../lib/prisma';
import { resolveGuidanceStepBinding, type GuidanceStepBinding, type GuidanceStepBindingResult } from '../../guidanceEngine/guidanceStepBinding';

export * from '../../guidanceEngine/guidanceStepBinding';

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

/**
 * Whether a journey step may be completed by this recall action on this match: the step is the recalls tool's open step the action can complete (confirming is the safety alert,
 * dismissing or resolving is the recall resolution) and the journey is about the very item the match is for, so confirming one recall can never advance another recall's journey.
 */
export async function resolveGuidanceRecallStep(propertyId: string, stepId: string, action: 'CONFIRM' | 'DISMISS' | 'RESOLVE', matchInventoryItemId: string | null): Promise<GuidanceStepBindingResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: 'recalls', stepKeys: [action === 'CONFIRM' ? 'safety_alert' : 'recall_resolution'] });
  if (!bound.ok) return bound;
  if (!matchInventoryItemId || bound.binding.inventoryItemId !== matchInventoryItemId) return { ok: false, reason: 'WRONG_SUBJECT' };
  return bound;
}
