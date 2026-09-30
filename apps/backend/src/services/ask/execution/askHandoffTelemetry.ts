import { prisma } from '../../../lib/prisma';
import { askSkillHandoffsTotal } from '../../../lib/metrics';
import type { AskExecutionStatus } from '../../../productFramework/ask/ask.contract';
import type { AskOperationId } from '../askOperationRegistry';
import { SKILL_HANDOFF_DEFINITIONS } from '../../skills/skillHandoff';
import { getSkillForOperation } from '../../skills/skillRegistry';

/**
 * Handoff acceptance telemetry (handoff audit scope 3, step 4; FRD v1.168). Before this only SUGGESTED
 * was recorded, so there was no way to tell whether any follow-up was ever used.
 *
 * Outcomes, all with the same bounded labels (source_skill, target_skill, outcome) -- execution ids
 * never become metric labels:
 *  - OPENED: the handoff card was clicked and a new execution was created from it.
 *  - COMPLETED: that launched execution finished, and routed to the operation the handoff intended.
 *  - MISROUTED: it finished but routed somewhere else -- a regression signal for the assumption that the
 *    goal-derived prompt routes deterministically to the target.
 * There is deliberately no DISMISSED: the card has no dismiss control, and "not clicked" is not a dismissal.
 * Only the first pass is observed: a launched execution that needs a clarification, capture or confirmation
 * and completes on a later turn is counted OPENED but neither COMPLETED nor MISROUTED.
 */
export type AskHandoffOutcome = 'OPENED' | 'COMPLETED' | 'MISROUTED';

export interface AskHandoffAttribution {
  sourceExecutionId: string;
  sourceSkill: string;
  targetSkill: string;
  targetOperationId: AskOperationId;
}

const COMPLETED_STATUSES: readonly AskExecutionStatus[] = ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'];

export function readStoredHandoff(resultJson: unknown): { suggestedNextSkillId: string; suggestedGoal: string } | null {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) return null;
  const handoff = (resultJson as { skillHandoff?: unknown }).skillHandoff;
  if (!handoff || typeof handoff !== 'object') return null;
  const { suggestedNextSkillId, suggestedGoal } = handoff as Record<string, unknown>;
  return typeof suggestedNextSkillId === 'string' && typeof suggestedGoal === 'string' ? { suggestedNextSkillId, suggestedGoal } : null;
}

/**
 * The client only says which execution's card it clicked. Everything that becomes a metric label is
 * derived here from that execution's own stored handoff, and only when it belongs to the same user, so a
 * forged id can neither inject labels nor count a handoff that was never offered.
 */
export async function resolveHandoffAttribution(userId: string, handoffFromExecutionId: string): Promise<AskHandoffAttribution | null> {
  const source = await prisma.askExecution.findFirst({
    where: { id: handoffFromExecutionId, userId },
    select: { id: true, operationId: true, resultJson: true },
  });
  const stored = source ? readStoredHandoff(source.resultJson) : null;
  if (!source || !stored || !source.operationId) return null;
  const definition = SKILL_HANDOFF_DEFINITIONS.find((candidate) => candidate.sourceOperationId === source.operationId
    && candidate.suggestedGoal === stored.suggestedGoal
    && candidate.targetSkillId === stored.suggestedNextSkillId);
  const sourceSkill = getSkillForOperation(source.operationId as AskOperationId)?.id;
  if (!definition || !sourceSkill) return null;
  return { sourceExecutionId: source.id, sourceSkill, targetSkill: definition.targetSkillId, targetOperationId: definition.targetOperationId };
}

export function recordHandoffOutcome(outcome: AskHandoffOutcome, attribution: AskHandoffAttribution): void {
  askSkillHandoffsTotal.inc({ source_skill: attribution.sourceSkill, target_skill: attribution.targetSkill, outcome });
}

/** COMPLETED / MISROUTED once the launched execution reaches a completed-type status; null while it is still pending or failed. */
export function classifyLaunchedOutcome(
  attribution: AskHandoffAttribution,
  routedOperationId: AskOperationId,
  status: AskExecutionStatus,
): Exclude<AskHandoffOutcome, 'OPENED'> | null {
  if (!COMPLETED_STATUSES.includes(status)) return null;
  return routedOperationId === attribution.targetOperationId ? 'COMPLETED' : 'MISROUTED';
}
