import { prisma } from '../../../lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
  OperationalObligationType,
  OperationalWorkActorType,
  OperationalWorkEventType,
  OperationalWorkEvidenceType,
  OperationalWorkEvidenceVerificationStatus,
  OperationalWorkExecutionRole,
  OperationalWorkExecutionType,
  OperationalWorkItemAcceptanceState,
  OperationalWorkItemDisposition,
  OperationalWorkItemPriority,
  OperationalWorkItemState,
  OperationalWorkResponsibleParty,
  OperationalWorkSourceRole,
  OperationalWorkSourceType,
  OperationalWorkSubjectType,
  RecommendationSafetyTier,
} from '@prisma/client';

export interface CreateWorkItemInput {
  propertyId: string;
  workKey: string;
  subjectType: OperationalWorkSubjectType;
  subjectId: string;
  obligationType: OperationalObligationType;
  priority: OperationalWorkItemPriority;
  safetyTier: RecommendationSafetyTier;
  title: string;
  homeownerReason: string;
  expectedOutcome: string;
  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
  confidence?: number | null;
  missingContext?: string[];
  sourceVersion?: string | null;
  recurrenceTemplateKey?: string | null;
  occurrenceKey?: string | null;
}

export interface RefreshWorkItemPresentationInput {
  priority: OperationalWorkItemPriority;
  safetyTier: RecommendationSafetyTier;
  title: string;
  homeownerReason: string;
  expectedOutcome: string;
  confidence?: number | null;
  missingContext?: string[];
  sourceVersion?: string | null;
}

export interface UpsertSourceInput {
  workItemId: string;
  sourceType: OperationalWorkSourceType;
  sourceEntityId: string;
  sourceVersion: string | null;
  sourceRole: OperationalWorkSourceRole;
  active?: boolean;
}

export interface RecordEventInput {
  workItemId: string;
  eventType: OperationalWorkEventType;
  actorType: OperationalWorkActorType;
  actorUserId?: string | null;
  idempotencyKey: string;
  payload?: Prisma.InputJsonValue | null;
  occurredAt?: Date;
}

export function findWorkItemByWorkKey(propertyId: string, workKey: string) {
  return prisma.operationalWorkItem.findUnique({
    where: { propertyId_workKey: { propertyId, workKey } },
  });
}

export function findWorkItemById(workItemId: string) {
  return prisma.operationalWorkItem.findUnique({ where: { id: workItemId } });
}

/**
 * Home Operations Slice 7: read-only lookup used by Status Board to link to
 * an already-resolved work item for a subject (e.g. an inventory item) —
 * Status Board never proposes or creates one itself, it only asks "does
 * something already track this?" CLOSED items are excluded since a closed
 * item is no longer the active obligation for its subject.
 */
export function findActiveWorkItemsForSubject(subjectType: OperationalWorkSubjectType, subjectId: string) {
  return prisma.operationalWorkItem.findMany({
    where: { subjectType, subjectId, state: { not: 'CLOSED' } },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Home Operations Item #12 (§5.16): acceptanceState is monotonic — it moves
 * PROPOSED -> ACCEPTED once and is preserved through every later transition
 * (see domain/transitions.ts) — so a count > 0 here is a correct "has this
 * property ever had work accepted" signal, not just "currently accepted."
 */
export function countAcceptedWorkItemsForProperty(propertyId: string) {
  return prisma.operationalWorkItem.count({
    where: { propertyId, acceptanceState: 'ACCEPTED' },
  });
}

/**
 * Two candidates resolving to the same workKey can race to create it — both
 * see no existing row via findUnique, both call create. Postgres's
 * @@unique([propertyId, workKey]) constraint lets only one insert win; the
 * loser re-fetches and returns the winner's row instead of failing the
 * whole resolution, matching the P2002-catch-and-refetch idiom already used
 * by PropertyMaintenanceTaskService.createFromActionCenter.
 */
export async function createWorkItem(input: CreateWorkItemInput) {
  try {
    return await prisma.operationalWorkItem.create({
      data: {
        propertyId: input.propertyId,
        workKey: input.workKey,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        obligationType: input.obligationType,
        priority: input.priority,
        safetyTier: input.safetyTier,
        title: input.title,
        homeownerReason: input.homeownerReason,
        expectedOutcome: input.expectedOutcome,
        dueWindowStart: input.dueWindowStart ?? null,
        dueAt: input.dueAt ?? null,
        dueWindowEnd: input.dueWindowEnd ?? null,
        confidence: input.confidence ?? null,
        missingContext: input.missingContext ?? [],
        sourceVersion: input.sourceVersion ?? null,
        recurrenceTemplateKey: input.recurrenceTemplateKey ?? null,
        occurrenceKey: input.occurrenceKey ?? null,
        materialApprovalRequired: input.safetyTier !== 'LOW_CONSEQUENCE',
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const existing = await findWorkItemByWorkKey(input.propertyId, input.workKey);
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Item #19 (§5.15) Slice 2: presentation fields only now — due-window
 * fields have their own gate/update path (canRefreshDueFieldsFromSource /
 * updateWorkItemDueFields) since they refresh on a different, wider
 * schedule. Only ever called when the item is still CANDIDATE (see
 * canRefreshPresentationFromSource).
 */
export function refreshWorkItemPresentation(workItemId: string, input: RefreshWorkItemPresentationInput) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: {
      priority: input.priority,
      safetyTier: input.safetyTier,
      materialApprovalRequired: input.safetyTier !== 'LOW_CONSEQUENCE',
      title: input.title,
      homeownerReason: input.homeownerReason,
      expectedOutcome: input.expectedOutcome,
      confidence: input.confidence ?? null,
      missingContext: input.missingContext ?? [],
      sourceVersion: input.sourceVersion ?? null,
    },
  });
}

export function upsertWorkSource(input: UpsertSourceInput) {
  return prisma.operationalWorkSource.upsert({
    where: {
      workItemId_sourceType_sourceEntityId_sourceRole: {
        workItemId: input.workItemId,
        sourceType: input.sourceType,
        sourceEntityId: input.sourceEntityId,
        sourceRole: input.sourceRole,
      },
    },
    create: {
      workItemId: input.workItemId,
      sourceType: input.sourceType,
      sourceEntityId: input.sourceEntityId,
      sourceVersion: input.sourceVersion,
      sourceRole: input.sourceRole,
      active: input.active ?? true,
      lastObservedAt: new Date(),
      reconciledAt: (input.active ?? true) ? null : new Date(),
    },
    update: {
      sourceVersion: input.sourceVersion,
      active: input.active ?? true,
      lastObservedAt: new Date(),
      reconciledAt: (input.active ?? true) ? null : new Date(),
    },
  });
}

export function findWorkSource(input: Pick<UpsertSourceInput, 'workItemId' | 'sourceType' | 'sourceEntityId' | 'sourceRole'>) {
  return prisma.operationalWorkSource.findUnique({
    where: {
      workItemId_sourceType_sourceEntityId_sourceRole: input,
    },
  });
}

/**
 * Idempotent on [workItemId, idempotencyKey]. A retried event (same key) is
 * a no-op, not an error — callers should not have to special-case retries.
 */
export async function recordWorkEvent(input: RecordEventInput) {
  try {
    return await prisma.operationalWorkEvent.create({
      data: {
        workItemId: input.workItemId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload ?? undefined,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return prisma.operationalWorkEvent.findUnique({
        where: { workItemId_idempotencyKey: { workItemId: input.workItemId, idempotencyKey: input.idempotencyKey } },
      });
    }
    throw err;
  }
}

export interface UpdateStateInput {
  state: OperationalWorkItemState;
  acceptanceState: OperationalWorkItemAcceptanceState;
  disposition: OperationalWorkItemDisposition | null;
  timestampField: 'acceptedAt' | 'startedAt' | 'reportedCompletedAt' | 'verifiedAt' | 'deferredUntil' | 'dismissedAt' | 'closedAt' | 'nextReviewAt' | null;
  timestampValue?: Date;
}

export function updateWorkItemState(workItemId: string, input: UpdateStateInput) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: {
      state: input.state,
      acceptanceState: input.acceptanceState,
      disposition: input.disposition,
      ...(input.timestampField ? { [input.timestampField]: input.timestampValue ?? new Date() } : {}),
    },
  });
}

/**
 * Item #19 (§5.15) Slice 1: snooze never touches state or the due fields —
 * it is purely a reminders/visibility suppression, fully reversible by
 * passing null to clear it early (same nullable-clear convention as
 * assignWorkItemOwner).
 */
export function updateWorkItemSnooze(workItemId: string, snoozedUntil: Date | null) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { snoozedUntil },
  });
}

export interface UpdateDueFieldsInput {
  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
}

/**
 * Item #19 (§5.15) Slice 1: reschedule deliberately overwrites the
 * commitment itself — unlike snooze, this changes what "due" means for the
 * item. Only the fields explicitly passed are updated (a caller rescheduling
 * just dueAt shouldn't accidentally null out an existing window).
 */
export function updateWorkItemDueFields(
  workItemId: string,
  input: UpdateDueFieldsInput,
  options: { userOverride?: boolean; clearOverride?: boolean } = {},
) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: {
      ...('dueWindowStart' in input ? { dueWindowStart: input.dueWindowStart } : {}),
      ...('dueAt' in input ? { dueAt: input.dueAt } : {}),
      ...('dueWindowEnd' in input ? { dueWindowEnd: input.dueWindowEnd } : {}),
      ...(options.userOverride ? { scheduleOverrideAt: new Date() } : {}),
      ...(options.clearOverride ? { scheduleOverrideAt: null } : {}),
    },
  });
}

export function markWorkItemUnderstood(workItemId: string, understoodAt = new Date()) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { understoodAt },
  });
}

export function approveMaterialWorkItem(workItemId: string, approvedByUserId: string) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { materialApprovedAt: new Date(), materialApprovedByUserId: approvedByUserId },
  });
}

export function updateWorkItemOccurrence(
  workItemId: string,
  recurrenceTemplateKey: string | null,
  occurrenceKey: string | null,
) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { recurrenceTemplateKey, occurrenceKey },
  });
}

/**
 * Home Operations Item #15: responsibleParty is deliberately NOT reset to
 * UNKNOWN on every re-link the way role always resets to its default — a
 * later event (e.g. VERIFIED/CANCELLED reconciliation) that doesn't have a
 * fresh signal to pass must not clobber a value an earlier call (e.g.
 * HANDOFF, which had project.fulfillmentMode in scope) already established.
 * Only overwritten when a caller explicitly passes one.
 */
export function linkWorkExecution(input: {
  workItemId: string;
  executionType: OperationalWorkExecutionType;
  executionEntityId: string;
  role?: OperationalWorkExecutionRole;
  responsibleParty?: OperationalWorkResponsibleParty;
}) {
  return prisma.operationalWorkExecution.upsert({
    where: {
      workItemId_executionType_executionEntityId: {
        workItemId: input.workItemId,
        executionType: input.executionType,
        executionEntityId: input.executionEntityId,
      },
    },
    create: {
      workItemId: input.workItemId,
      executionType: input.executionType,
      executionEntityId: input.executionEntityId,
      role: input.role ?? 'PRIMARY',
      responsibleParty: input.responsibleParty ?? 'UNKNOWN',
    },
    update: {
      role: input.role ?? 'PRIMARY',
      ...(input.responsibleParty ? { responsibleParty: input.responsibleParty } : {}),
    },
  });
}

/**
 * Home Operations Slice 5: reverse lookup used by resolution propagation —
 * given a downstream execution record (a MAINTENANCE_TASK or GUIDANCE
 * journey that was created to resolve an Inspection Finding), find any
 * FINDING-subject work item(s) linked to it via linkWorkExecution, so a
 * VERIFIED completion on that execution can also verify the finding's own
 * work item. Scoped to subjectType FINDING since that's the only case this
 * slice needs (a maintenance task or guidance journey may link back to at
 * most the finding that spawned it).
 */
export function findWorkItemsLinkedToExecution(
  executionType: OperationalWorkExecutionType,
  executionEntityId: string,
) {
  return prisma.operationalWorkExecution.findMany({
    where: { executionType, executionEntityId, workItem: { subjectType: 'FINDING' } },
    include: { workItem: true },
  });
}

/** Reverse lookup for lifecycle handoffs that must preserve any originating
 * subject (for example FINDING -> GUIDANCE -> PROJECT), not just a workKey
 * re-derived from the child execution record. */
export function findAllWorkItemsLinkedToExecution(
  executionType: OperationalWorkExecutionType,
  executionEntityId: string,
) {
  if (typeof prisma.operationalWorkExecution.findMany !== 'function') return Promise.resolve([]);
  return prisma.operationalWorkExecution.findMany({
    where: { executionType, executionEntityId },
    include: { workItem: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Home Operations Item #14 (Gap 1): once a maintenance task has been
 * reconciled onto a recommendation-stage work item (see
 * PropertyMaintenanceTask.service.ts's resolveTaskWorkItem), that work
 * item's own workKey no longer matches the task-stage key
 * resolveMaintenanceTaskWorkKey would compute — this execution link is the
 * only durable pointer back to it for every later sync call.
 */
export function findWorkItemsLinkedToMaintenanceTaskExecution(taskId: string) {
  return prisma.operationalWorkExecution.findMany({
    where: { executionType: 'MAINTENANCE_TASK', executionEntityId: taskId },
    include: { workItem: true },
  });
}

export function recordWorkEvidence(input: {
  workItemId: string;
  evidenceType: OperationalWorkEvidenceType;
  evidenceEntityId: string;
  verificationStatus?: OperationalWorkEvidenceVerificationStatus;
  observedAt: Date;
}) {
  return prisma.operationalWorkEvidence.create({
    data: {
      workItemId: input.workItemId,
      evidenceType: input.evidenceType,
      evidenceEntityId: input.evidenceEntityId,
      verificationStatus: input.verificationStatus ?? 'PENDING',
      observedAt: input.observedAt,
    },
  });
}

/** Durable, reversible — see recordDuplicateDecision.usecase.ts. */
export function setSupersededBy(workItemId: string, supersededByWorkItemId: string | null) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { supersededByWorkItemId },
  });
}

export function setWorkItemOwner(workItemId: string, ownerUserId: string | null) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { ownerUserId },
  });
}

export function addWorkItemWatcher(workItemId: string, userId: string, addedByUserId?: string | null) {
  return prisma.operationalWorkItemWatcher.upsert({
    where: { workItemId_userId: { workItemId, userId } },
    create: { workItemId, userId, addedByUserId: addedByUserId ?? null },
    update: {},
  });
}

export function removeWorkItemWatcher(workItemId: string, userId: string) {
  return prisma.operationalWorkItemWatcher.deleteMany({ where: { workItemId, userId } });
}

export interface ListWorkItemsFilter {
  propertyId: string;
  state?: OperationalWorkItemState;
  obligationType?: OperationalObligationType;
  ownerUserId?: string;
  subjectType?: OperationalWorkSubjectType;
  subjectId?: string;
}

export function listWorkItemsForProperty(filter: ListWorkItemsFilter) {
  return prisma.operationalWorkItem.findMany({
    where: {
      propertyId: filter.propertyId,
      state: filter.state,
      obligationType: filter.obligationType,
      ownerUserId: filter.ownerUserId,
      subjectType: filter.subjectType,
      subjectId: filter.subjectId,
    },
    include: { executions: true },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
  });
}

export function getWorkItemGraph(workItemId: string) {
  return prisma.operationalWorkItem.findUnique({
    where: { id: workItemId },
    include: {
      sources: true,
      executions: true,
      evidence: true,
      watchers: true,
    },
  });
}

/**
 * Item #24 (§15 "Admin tooling can inspect one work item's full source/
 * execution/outcome graph"). Separate from getWorkItemGraph rather than
 * adding events there, so the household-facing route's payload shape
 * doesn't change as a side effect — raw event payloads/actor internals
 * aren't necessarily meant for homeowner eyes.
 */
export function getWorkItemGraphForAdmin(workItemId: string) {
  return prisma.operationalWorkItem.findUnique({
    where: { id: workItemId },
    include: {
      sources: true,
      executions: true,
      evidence: true,
      watchers: true,
      events: { orderBy: { occurredAt: 'asc' } },
    },
  });
}
