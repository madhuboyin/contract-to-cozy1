// Governed repair of renovation project handoffs that were left partial (owner ruling D-H6; docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md).
//
// Before the handoff became one transaction (FRD v1.371), a failure after the Project was created left a Project with none of the rest: no case link, no
// lifecycle change, no handoff events, status still DRAFT. This finds those Projects and completes them with the SAME transaction-aware logic a new
// handoff uses (`completeHandoffInTx`), so the repair cannot drift from the behaviour it repairs.
//
// What cannot be reconstructed is the intake mode (planned, already started, historical): it was never stored and decides the Project's status and the
// case lifecycle. The caller states it; it is not guessed. Nothing is applied without it, and a dry run lists every intended change first.
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { withSerializableDedupe } from './projectCompliance/serializableDedupe';
import {
  completeHandoffInTx, handoffNextLifecycle, handoffProjectStatus, syncProjectWorkItem,
  type HandoffIntakeMode, type HandoffStep,
} from './renovationReadiness.service';

export type MissingHandoffPart = 'STATUS' | 'MILESTONES_BLOCKED' | 'CASE_LINK' | 'CASE_LIFECYCLE' | 'READINESS_EVENT' | 'CASE_EVENT';

export interface IncompleteHandoff {
  projectId: string;
  propertyId: string;
  renovationCaseId: string;
  projectName: string;
  projectStatus: string;
  caseLifecycle: string;
  idempotencyKey: string;
  openConditionCount: number;
  missing: MissingHandoffPart[];
}

const KEY_PREFIX = 'renovation-handoff:';
const isOpenCondition = (condition: unknown) => {
  const status = (condition as { status?: string } | null)?.status;
  return !['SATISFIED', 'WAIVED_WITH_ACKNOWLEDGMENT'].includes(String(status));
};

/** Read-only. A Project created from a renovation case is partial when any of its link, handoff event or case event is missing. */
export async function detectIncompleteHandoffs(filter: { propertyId?: string; projectId?: string } = {}): Promise<IncompleteHandoff[]> {
  const projects = await prisma.projectRecord.findMany({
    where: {
      renovationCaseId: { not: null },
      ...(filter.propertyId ? { propertyId: filter.propertyId } : {}),
      ...(filter.projectId ? { id: filter.projectId } : {}),
    },
    select: {
      id: true, propertyId: true, name: true, status: true, renovationCaseId: true, sourceActionId: true, inheritedConditions: true,
      milestones: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const found: IncompleteHandoff[] = [];
  for (const project of projects) {
    const caseId = project.renovationCaseId as string;
    const [renovationCase, links, readinessEvents, caseEvents] = await Promise.all([
      prisma.renovationCase.findFirst({ where: { id: caseId, propertyId: project.propertyId }, select: { lifecycle: true } }),
      prisma.renovationCaseLink.findMany({ where: { renovationCaseId: caseId, linkType: 'PROJECT', targetId: project.id }, select: { id: true } }),
      prisma.renovationReadinessEvent.findMany({ where: { renovationCaseId: caseId, eventType: 'PROJECT_HANDOFF' }, select: { payload: true } }),
      prisma.renovationCaseEvent.findMany({ where: { renovationCaseId: caseId, eventType: 'PROJECT_HANDOFF_STARTED' }, select: { payload: true } }),
    ]);
    if (!renovationCase) continue;
    const forProject = (rows: Array<{ payload: unknown }>) => rows.some((row) => (row.payload as { projectId?: string } | null)?.projectId === project.id);
    const missing: MissingHandoffPart[] = [];
    const hasReadinessEvent = forProject(readinessEvents);
    const hasCaseEvent = forProject(caseEvents);
    if (!links.length) missing.push('CASE_LINK');
    if (!hasReadinessEvent) missing.push('READINESS_EVENT');
    if (!hasCaseEvent) missing.push('CASE_EVENT');
    if (!missing.length) continue;
    // These two only apply to a Project that never reached the handoff's own status change, so they are listed only then.
    const openConditions = Array.isArray(project.inheritedConditions) ? (project.inheritedConditions as unknown[]).filter(isOpenCondition).length : 0;
    if (project.status === 'DRAFT') missing.unshift('STATUS');
    // Only a Project that never left its creation status can be missing the blocking; later milestone changes are real work and are not touched.
    if (project.status === 'DRAFT' && openConditions > 0 && project.milestones.some((milestone) => milestone.status === 'UPCOMING')) missing.push('MILESTONES_BLOCKED');
    if (!hasReadinessEvent || !hasCaseEvent || !links.length) {
      found.push({
        projectId: project.id,
        propertyId: project.propertyId,
        renovationCaseId: caseId,
        projectName: project.name,
        projectStatus: project.status,
        caseLifecycle: renovationCase.lifecycle,
        idempotencyKey: project.sourceActionId?.startsWith(KEY_PREFIX) ? project.sourceActionId.slice(KEY_PREFIX.length) : `repair:${project.id}`,
        openConditionCount: openConditions,
        missing,
      });
    }
  }
  return found;
}

export interface HandoffRepairPlan {
  candidate: IncompleteHandoff;
  intakeMode: HandoffIntakeMode | null;
  /** What applying would set; null until an intake mode is chosen. */
  projectStatusAfter: string | null;
  caseLifecycleAfter: string | null;
  steps: MissingHandoffPart[];
}

/** The intended changes for one candidate. Read-only, and the same output whether or not it is later applied. */
export function planHandoffRepair(candidate: IncompleteHandoff, intakeMode: HandoffIntakeMode | null): HandoffRepairPlan {
  return {
    candidate,
    intakeMode,
    projectStatusAfter: intakeMode ? handoffProjectStatus(intakeMode) : null,
    caseLifecycleAfter: intakeMode ? handoffNextLifecycle(intakeMode, candidate.caseLifecycle) : null,
    steps: candidate.missing,
  };
}

export interface HandoffRepairResult {
  projectId: string;
  outcome: 'APPLIED' | 'NOTHING_TO_REPAIR';
  applied: HandoffStep[];
  workItemSynced: boolean | null;
}

/**
 * Completes one partial handoff in one transaction. Idempotent: every step checks what exists, so a second run applies nothing. `intakeMode` is the
 * owner's statement of how the work was meant to start; a non-planned mode needs a reason of at least 20 characters, as the handoff itself requires.
 */
export async function repairIncompleteHandoff(input: { projectId: string; intakeMode: HandoffIntakeMode; historicalReason?: string | null }): Promise<HandoffRepairResult> {
  if (input.intakeMode !== 'PLANNED' && (input.historicalReason ?? '').trim().length < 20) {
    throw new APIError('An already-started or historical repair needs a reason of at least 20 characters.', 400, 'RENOVATION_HANDOFF_REPAIR_REASON_REQUIRED');
  }
  const [candidate] = await detectIncompleteHandoffs({ projectId: input.projectId });
  if (!candidate) return { projectId: input.projectId, outcome: 'NOTHING_TO_REPAIR', applied: [], workItemSynced: null };

  const project = await prisma.projectRecord.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, description: true, startDate: true, expectedEndDate: true, updatedAt: true, renovationScopeVersionId: true },
  });
  const renovationCase = await prisma.renovationCase.findFirst({
    where: { id: candidate.renovationCaseId, propertyId: candidate.propertyId },
    select: { createdByUserId: true, lifecycle: true },
  });
  if (!project?.renovationScopeVersionId || !renovationCase?.createdByUserId) {
    throw new APIError(
      'This handoff cannot be repaired automatically: the Project has no scope version or the case has no recorded owner.',
      409,
      'RENOVATION_HANDOFF_REPAIR_NOT_POSSIBLE',
    );
  }
  const actorUserId = renovationCase.createdByUserId;

  const applied = await withSerializableDedupe(async (tx) => {
    const current = await tx.renovationCase.findFirst({ where: { id: candidate.renovationCaseId, propertyId: candidate.propertyId }, select: { lifecycle: true } });
    return completeHandoffInTx(tx, {
      propertyId: candidate.propertyId,
      renovationCaseId: candidate.renovationCaseId,
      actorUserId,
      projectId: candidate.projectId,
      scopeVersionId: project.renovationScopeVersionId as string,
      intakeMode: input.intakeMode,
      historicalReason: input.historicalReason ?? null,
      idempotencyKey: candidate.idempotencyKey,
      payloadHash: null,
      // The readiness state at the original handoff was not recorded and is not re-evaluated here; the event says it was repaired.
      readinessState: 'REPAIRED',
      readinessBypassed: input.intakeMode !== 'PLANNED',
      caseLifecycle: current?.lifecycle ?? candidate.caseLifecycle,
      blockMilestones: candidate.projectStatus === 'DRAFT' && candidate.openConditionCount > 0,
      repair: true,
    });
  });
  const workItemSynced = await syncProjectWorkItem(candidate.propertyId, project, actorUserId);
  return { projectId: candidate.projectId, outcome: 'APPLIED', applied, workItemSynced };
}
